import os
import re
import time
import uuid
import uvicorn
from fastapi import FastAPI, HTTPException, Response, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
try:
    from .pipeline import Pipeline
except ImportError:
    from pipeline import Pipeline
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi.concurrency import run_in_threadpool


BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent.parent
FRONTEND_DIST = PROJECT_ROOT / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"
PDF_CACHE_DIR = BASE_DIR / "pdf_cache"
PDF_CACHE_TTL_SECONDS = int(os.environ.get("PDF_CACHE_TTL_SECONDS", "86400"))

PDF_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


pipeline = None
itinerary_list = []


def _cleanup_expired_pdf_cache() -> None:
    if not PDF_CACHE_DIR.exists():
        return

    now = time.time()
    for pdf_path in PDF_CACHE_DIR.glob("*.pdf"):
        try:
            age_seconds = now - pdf_path.stat().st_mtime
            if age_seconds > PDF_CACHE_TTL_SECONDS:
                pdf_path.unlink(missing_ok=True)
        except Exception:
            # Do not block service startup/requests on cleanup issues.
            continue


def _resolve_pdf_cache_path(pdf_id: str) -> Path:
    normalized_id = str(pdf_id or "").strip()
    if not PDF_ID_PATTERN.fullmatch(normalized_id):
        raise HTTPException(status_code=400, detail="Invalid PDF cache id")

    resolved_path = (PDF_CACHE_DIR / f"{normalized_id}.pdf").resolve()
    try:
        resolved_path.relative_to(PDF_CACHE_DIR.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid PDF cache path") from exc
    return resolved_path


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("🚀 Pathfinder API is starting up...")

    try:

        pipeline = Pipeline(
            dataset_path=str(DATASET),
            config_path=str(CONFIG)
        )


        if pipeline.collection.count() == 0:
            print("⚠️ Brain is empty. Rebuilding index...")

            await run_in_threadpool(pipeline.rebuild_index)
            print(f"✅ Rebuild Complete! Loaded {pipeline.collection.count()} facts.")
        else:
            print(f"🧠 Brain loaded. Contains {pipeline.collection.count()} facts.")

    except Exception as e:
        print(f"❌ CRITICAL ERROR: Failed to start pipeline: {e}")
        pipeline = None

    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup_expired_pdf_cache()

    yield
    print("🛑 Pathfinder API is shutting down...")

app = FastAPI(title="Pathfinder API", version="1.0.0", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str
    active_pin: str | None = None

class PlaceInfo(BaseModel):
    name: str = ""
    coordinates: list[float] = [0.0, 0.0]
    type: str = "Unknown"
    municipality: str = "Unknown"

class AskResponse(BaseModel):
    answer: str
    locations: list[PlaceInfo]

class ItineraryItem(BaseModel):
    place_name: str



@app.get("/")
def home():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return {
        "status": "online",
        "message": "Pathfinder API is running, but frontend build was not found at /dist"
    }

@app.get("/health")
def health_check():
    if pipeline:
        return {"status": "healthy", "facts_loaded": pipeline.collection.count()}
    return {"status": "starting", "message": "Pipeline initializing"}

@app.get("/admin/status")
def admin_status(response: Response):
    """Check the health of the AI pipeline"""
    if pipeline is None:
        response.status_code = 503
        return {"status": "starting", "ready": False}
    try:
        return {
            "status": "healthy",
            "collection_count": pipeline.collection.count(),
            "internet_available": getattr(pipeline, "internet_status", False),
            "message": "Pathfinder is running"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/admin/rebuild")
async def admin_rebuild():
    """Manually force a brain rebuild"""
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")
    try:
        await run_in_threadpool(pipeline.rebuild_index)
        return {
            "message": "Database rebuilt successfully",
            "new_count": pipeline.collection.count()
        }
    except Exception as e:
        return {"error": f"Rebuild failed: {str(e)}"}

@app.post("/itinerary_add")
def itinerary_add(item: ItineraryItem):
    """Add an item to the temporary itinerary list"""
    if item.place_name not in itinerary_list:
        itinerary_list.append(item.place_name)
        print(f"📝 Added to itinerary: {item.place_name}")
    return {
        "message": f"Added {item.place_name}",
        "total_items": len(itinerary_list)
    }

@app.get("/itinerary")
def get_itinerary():
    """Get the current itinerary"""
    return {"itinerary": itinerary_list}

@app.get("/places")
def get_all_places():
    return {"places": []}

@app.post("/api/pdf-cache")
async def create_pdf_cache(file: UploadFile = File(...)):
    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup_expired_pdf_cache()

    content_type = (file.content_type or "").lower()
    if content_type and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    pdf_id = uuid.uuid4().hex
    target_path = _resolve_pdf_cache_path(pdf_id)

    try:
        total_bytes = 0
        with target_path.open("wb") as output_file:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                output_file.write(chunk)

        if total_bytes == 0:
            target_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Uploaded PDF is empty")

        return {
            "id": pdf_id,
            "url": f"/api/pdf-cache/{pdf_id}.pdf",
            "size": total_bytes
        }
    finally:
        await file.close()


@app.get("/api/pdf-cache/{pdf_id}.pdf")
def get_pdf_cache_file(pdf_id: str):
    _cleanup_expired_pdf_cache()
    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="PDF cache entry not found")

    headers = {
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=600"
    }
    return FileResponse(
        target_path,
        media_type="application/pdf",
        filename=f"{pdf_id}.pdf",
        headers=headers
    )


@app.delete("/api/pdf-cache/{pdf_id}")
def delete_pdf_cache_file(pdf_id: str):
    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        return {"deleted": False, "id": pdf_id}

    try:
        target_path.unlink(missing_ok=True)
        return {"deleted": True, "id": pdf_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete PDF cache entry: {exc}") from exc


@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):

    if pipeline is None:
        raise HTTPException(status_code=503, detail="System is waking up. Please try again in 10 seconds.")

    try:
        print(f"❓ Processing: {request.question}")


        result = await run_in_threadpool(pipeline.ask, request.question, request.active_pin)


        if not isinstance(result, dict):
            print(f"⚠️ Unexpected result format: {result}")
            return {
                "answer": str(result),
                "locations": []
            }

        locations = result.get('locations', [])
        answer = result.get('answer', "I found some info but couldn't process the answer properly.")

        if len(locations) > 0:
            print(f"📍 Found {len(locations)} locations.")
        else:
            print(f"⚠️ No locations found.")

        return {
            "answer": answer,
            "locations": locations
        }

    except Exception as e:
        print(f"❌ Error processing request: {e}")

        return {
            "answer": "I encountered an error processing that request. Please try asking differently.",
            "locations": []
        }

@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    """
    Serve built frontend assets from /dist and fallback to index.html for SPA routes.
    """
    if not FRONTEND_INDEX.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")

    safe_path = (FRONTEND_DIST / full_path).resolve()
    try:
        safe_path.relative_to(FRONTEND_DIST.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    if safe_path.is_file():
        return FileResponse(safe_path)

    return FileResponse(FRONTEND_INDEX)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🔌 Server listening on http://0.0.0.0:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port)
