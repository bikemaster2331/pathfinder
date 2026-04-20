import os
import re
import socket
import time
import uuid
import uvicorn
import ipaddress
from html import escape
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, Response, UploadFile, File, Request
from fastapi.responses import FileResponse, HTMLResponse
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
PATHFINDER_HOTSPOT_HOST = str(os.environ.get("PATHFINDER_HOTSPOT_HOST", "192.168.4.1")).strip()
PATHFINDER_HOTSPOT_SSID = str(os.environ.get("PATHFINDER_HOTSPOT_SSID", "Pathfinder")).strip()
PATHFINDER_HOTSPOT_PASSWORD = str(os.environ.get("PATHFINDER_HOTSPOT_PASSWORD", "")).strip()
PATHFINDER_SHARE_POLICY = "session_until_finish"
DEFAULT_BACKEND_PORT = 8000

PDF_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SHARE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
PATHFINDER_DOWNLOAD_PREFIXES = ("Catanduanes_Itinerary_", "Itinerary_")
DEFAULT_DOWNLOAD_DIRECTORIES = (
    Path.home() / "Downloads",
    Path("/home/pi/Downloads"),
)


pipeline = None
itinerary_list = []
pdf_share_index: dict[str, dict] = {}
pdf_share_by_pdf_id: dict[str, str] = {}


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


def _is_local_hostname(hostname: str | None) -> bool:
    normalized = str(hostname or "").strip().lower()
    return normalized in {"", "localhost", "127.0.0.1", "::1"}


def _split_host_and_port(raw_host: str) -> tuple[str, int | None]:
    normalized = str(raw_host or "").strip()
    if not normalized:
        return "", None

    if normalized.startswith("[") and "]" in normalized:
        host = normalized[1:normalized.find("]")]
        rest = normalized[normalized.find("]") + 1 :]
        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])
        return host, None

    if normalized.count(":") == 1:
        host, raw_port = normalized.rsplit(":", 1)
        if raw_port.isdigit():
            return host.strip(), int(raw_port)

    return normalized, None


def _compose_base_url(scheme: str, host: str, port: int | None) -> str:
    normalized_scheme = str(scheme or "http").strip().lower() or "http"
    normalized_host = str(host or "").strip().strip("/")
    if not normalized_host:
        return ""

    default_port = 80 if normalized_scheme == "http" else 443 if normalized_scheme == "https" else None
    include_port = port is not None and (default_port is None or port != default_port)
    if include_port:
        return f"{normalized_scheme}://{normalized_host}:{port}"
    return f"{normalized_scheme}://{normalized_host}"


def _normalize_base_url(raw_value: str, *, fallback_scheme: str = "http", fallback_port: int | None = None) -> str:
    normalized = str(raw_value or "").strip()
    if not normalized:
        return ""

    parsed = urlparse(normalized)
    if parsed.scheme and parsed.netloc:
        host = parsed.hostname or ""
        port = parsed.port
        return _compose_base_url(parsed.scheme, host, port)

    host, port = _split_host_and_port(normalized.split("/", 1)[0])
    if not host:
        return ""

    return _compose_base_url(fallback_scheme, host, port if port is not None else fallback_port)


def _detect_private_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()

    try:
        host_entries = socket.gethostbyname_ex(socket.gethostname())
        for candidate in host_entries[2]:
            addresses.add(str(candidate).strip())
    except Exception:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            candidate = str(info[4][0]).strip()
            if candidate:
                addresses.add(candidate)
    except Exception:
        pass

    private_addresses: list[str] = []
    for candidate in addresses:
        try:
            parsed = ipaddress.ip_address(candidate)
            if parsed.is_private and not parsed.is_loopback and not parsed.is_link_local:
                private_addresses.append(candidate)
        except ValueError:
            continue

    return sorted(set(private_addresses))


def _resolve_share_base_urls(request: Request) -> list[str]:
    scheme = str(request.url.scheme or "http").strip().lower() or "http"
    request_host, request_port = _split_host_and_port(request.headers.get("host", ""))
    if request_port is None:
        request_port = request.url.port
    if request_port is None:
        request_port = DEFAULT_BACKEND_PORT

    base_urls: list[str] = []
    seen: set[str] = set()

    def add_base(raw_value: str) -> None:
        normalized = _normalize_base_url(
            raw_value,
            fallback_scheme=scheme,
            fallback_port=request_port
        )
        if not normalized:
            return
        if normalized in seen:
            return
        seen.add(normalized)
        base_urls.append(normalized)

    env_base = str(os.environ.get("PATHFINDER_SHARE_BASE_URL", "")).strip()
    if env_base:
        add_base(env_base)

    if request_host and not _is_local_hostname(request_host):
        add_base(_compose_base_url(scheme, request_host, request_port))
    else:
        request_url_host = str(request.url.hostname or "").strip()
        if request_url_host and not _is_local_hostname(request_url_host):
            add_base(_compose_base_url(scheme, request_url_host, request_port))

    for private_ip in _detect_private_ipv4_addresses():
        add_base(_compose_base_url(scheme, private_ip, request_port))

    if PATHFINDER_HOTSPOT_HOST:
        add_base(PATHFINDER_HOTSPOT_HOST)

    if not base_urls:
        fallback_host = request_host or str(request.url.hostname or "127.0.0.1")
        add_base(_compose_base_url(scheme, fallback_host, request_port))

    return base_urls


def _invalidate_pdf_share_id(share_id: str) -> None:
    normalized_id = str(share_id or "").strip()
    if not normalized_id:
        return

    record = pdf_share_index.pop(normalized_id, None)
    if not record:
        return

    pdf_id = str(record.get("pdf_id") or "").strip()
    if not pdf_id:
        return
    if pdf_share_by_pdf_id.get(pdf_id) == normalized_id:
        pdf_share_by_pdf_id.pop(pdf_id, None)


def _invalidate_pdf_shares_for_pdf_id(pdf_id: str) -> None:
    normalized_pdf_id = str(pdf_id or "").strip()
    if not normalized_pdf_id:
        return

    share_id = pdf_share_by_pdf_id.pop(normalized_pdf_id, None)
    if share_id:
        pdf_share_index.pop(share_id, None)
        return

    share_ids_to_remove = [
        current_share_id
        for current_share_id, record in pdf_share_index.items()
        if str(record.get("pdf_id") or "").strip() == normalized_pdf_id
    ]
    for stale_share_id in share_ids_to_remove:
        pdf_share_index.pop(stale_share_id, None)


def _clear_pdf_shares() -> None:
    pdf_share_index.clear()
    pdf_share_by_pdf_id.clear()


def _prune_stale_pdf_shares() -> None:
    stale_share_ids: list[str] = []
    for share_id, record in list(pdf_share_index.items()):
        pdf_id = str(record.get("pdf_id") or "").strip()
        if not pdf_id:
            stale_share_ids.append(share_id)
            continue

        try:
            target_path = _resolve_pdf_cache_path(pdf_id)
        except HTTPException:
            stale_share_ids.append(share_id)
            continue

        if not target_path.exists():
            stale_share_ids.append(share_id)

    for share_id in stale_share_ids:
        _invalidate_pdf_share_id(share_id)


def _get_or_create_pdf_share_id(pdf_id: str) -> str:
    _prune_stale_pdf_shares()
    normalized_pdf_id = str(pdf_id or "").strip()

    existing_share_id = pdf_share_by_pdf_id.get(normalized_pdf_id)
    if existing_share_id and existing_share_id in pdf_share_index:
        return existing_share_id

    share_id = uuid.uuid4().hex
    pdf_share_index[share_id] = {
        "pdf_id": normalized_pdf_id,
        "created_at": time.time()
    }
    pdf_share_by_pdf_id[normalized_pdf_id] = share_id
    return share_id


def _build_wifi_qr_string() -> str:
    if not PATHFINDER_HOTSPOT_SSID:
        return ""

    auth_type = "WPA" if PATHFINDER_HOTSPOT_PASSWORD else "nopass"
    escaped_ssid = PATHFINDER_HOTSPOT_SSID.replace("\\", "\\\\").replace('"', '\\"').replace(";", "\\;")
    escaped_password = PATHFINDER_HOTSPOT_PASSWORD.replace("\\", "\\\\").replace('"', '\\"').replace(";", "\\;")

    if PATHFINDER_HOTSPOT_PASSWORD:
        return f"WIFI:T:{auth_type};S:{escaped_ssid};P:{escaped_password};;"
    return f"WIFI:T:{auth_type};S:{escaped_ssid};;"


def _build_pdf_share_payload(request: Request, share_id: str) -> dict:
    base_urls = _resolve_share_base_urls(request)
    primary_base_url = base_urls[0]
    share_path = f"/s/{share_id}"
    download_path = f"/api/pdf-share/{share_id}.pdf"
    alternate_share_urls = [f"{base_url}{share_path}" for base_url in base_urls[1:]]

    return {
        "share_id": share_id,
        "share_url": f"{primary_base_url}{share_path}",
        "download_url": f"{primary_base_url}{download_path}",
        "alternate_share_urls": alternate_share_urls,
        "policy": PATHFINDER_SHARE_POLICY,
        "wifi_qr_string": _build_wifi_qr_string(),
        "wifi_ssid": PATHFINDER_HOTSPOT_SSID
    }


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


def _resolve_download_directories() -> list[Path]:
    configured_dirs = str(os.environ.get("PATHFINDER_DOWNLOADS_DIRS", "")).strip()
    candidates: list[Path] = []

    if configured_dirs:
        for raw_dir in configured_dirs.split(os.pathsep):
            normalized = raw_dir.strip()
            if normalized:
                candidates.append(Path(normalized).expanduser())

    candidates.extend(DEFAULT_DOWNLOAD_DIRECTORIES)

    deduped_dirs: list[Path] = []
    seen_dirs = set()
    for directory in candidates:
        try:
            key = str(directory.resolve(strict=False))
        except Exception:
            key = str(directory)

        if key in seen_dirs:
            continue
        seen_dirs.add(key)
        deduped_dirs.append(directory)

    return deduped_dirs


def _delete_generated_downloaded_pdfs() -> list[str]:
    deleted_paths: list[str] = []

    for download_dir in _resolve_download_directories():
        if not download_dir.exists() or not download_dir.is_dir():
            continue

        try:
            resolved_dir = download_dir.resolve(strict=True)
        except Exception:
            continue

        for pdf_path in download_dir.glob("*.pdf"):
            if not pdf_path.is_file():
                continue

            if not pdf_path.name.startswith(PATHFINDER_DOWNLOAD_PREFIXES):
                continue

            try:
                resolved_pdf = pdf_path.resolve(strict=True)
                resolved_pdf.relative_to(resolved_dir)
            except Exception:
                continue

            try:
                pdf_path.unlink(missing_ok=True)
                deleted_paths.append(str(pdf_path))
            except Exception:
                continue

    return deleted_paths


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

class FinishSessionRequest(BaseModel):
    pdf_cache_id: str | None = None


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
    _prune_stale_pdf_shares()
    _invalidate_pdf_shares_for_pdf_id(pdf_id)

    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        return {"deleted": False, "id": pdf_id}

    try:
        target_path.unlink(missing_ok=True)
        return {"deleted": True, "id": pdf_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete PDF cache entry: {exc}") from exc


@app.post("/api/pdf-cache/{pdf_id}/share")
def create_pdf_share_session(pdf_id: str, request: Request):
    _cleanup_expired_pdf_cache()
    _prune_stale_pdf_shares()

    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        _invalidate_pdf_shares_for_pdf_id(pdf_id)
        raise HTTPException(status_code=404, detail="PDF cache entry not found")

    share_id = _get_or_create_pdf_share_id(pdf_id)
    return _build_pdf_share_payload(request, share_id)


@app.get("/api/pdf-share/{share_id}.pdf")
def get_pdf_share_file(share_id: str):
    normalized_share_id = str(share_id or "").strip()
    if not SHARE_ID_PATTERN.fullmatch(normalized_share_id):
        raise HTTPException(status_code=400, detail="Invalid PDF share id")

    _cleanup_expired_pdf_cache()
    _prune_stale_pdf_shares()

    share_record = pdf_share_index.get(normalized_share_id)
    if not share_record:
        raise HTTPException(status_code=404, detail="PDF share entry not found")

    pdf_id = str(share_record.get("pdf_id") or "").strip()
    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        _invalidate_pdf_share_id(normalized_share_id)
        raise HTTPException(status_code=404, detail="PDF cache entry not found")

    headers = {
        "Cache-Control": "no-store"
    }
    return FileResponse(
        target_path,
        media_type="application/pdf",
        filename=f"Catanduanes_Itinerary_{pdf_id}.pdf",
        headers=headers
    )


@app.get("/s/{share_id}", response_class=HTMLResponse)
def open_pdf_share_short_link(share_id: str):
    normalized_share_id = str(share_id or "").strip()
    if not SHARE_ID_PATTERN.fullmatch(normalized_share_id):
        raise HTTPException(status_code=400, detail="Invalid PDF share id")

    _cleanup_expired_pdf_cache()
    _prune_stale_pdf_shares()

    share_record = pdf_share_index.get(normalized_share_id)
    if not share_record:
        return HTMLResponse(
            content=(
                "<!doctype html><html><head><meta charset='utf-8'><title>PDF Not Available</title></head>"
                "<body style='font-family:Arial,sans-serif;padding:24px;'>"
                "<h2>PDF link is no longer available.</h2>"
                "<p>Please return to the kiosk and generate a new share link.</p>"
                "</body></html>"
            ),
            status_code=404,
            headers={"Cache-Control": "no-store"}
        )

    pdf_id = str(share_record.get("pdf_id") or "").strip()
    target_path = _resolve_pdf_cache_path(pdf_id)
    if not target_path.exists():
        _invalidate_pdf_share_id(normalized_share_id)
        return HTMLResponse(
            content=(
                "<!doctype html><html><head><meta charset='utf-8'><title>PDF Not Available</title></head>"
                "<body style='font-family:Arial,sans-serif;padding:24px;'>"
                "<h2>PDF file is no longer available.</h2>"
                "<p>Please return to the kiosk and generate a new share link.</p>"
                "</body></html>"
            ),
            status_code=404,
            headers={"Cache-Control": "no-store"}
        )

    download_href = f"/api/pdf-share/{escape(normalized_share_id)}.pdf"
    html = (
        "<!doctype html>"
        "<html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Opening Itinerary PDF</title>"
        f"<meta http-equiv='refresh' content='0;url={download_href}'>"
        "</head><body style='font-family:Arial,sans-serif;padding:24px;'>"
        "<h2>Opening your itinerary PDF...</h2>"
        f"<p>If download does not start automatically, <a href='{download_href}'>tap here</a>.</p>"
        f"<script>window.location.replace('{download_href}');</script>"
        "</body></html>"
    )
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})


@app.post("/api/session/finish")
def finish_session(request: FinishSessionRequest | None = None):
    _prune_stale_pdf_shares()
    deleted_pdf_cache = False
    active_pdf_cache_id = str(request.pdf_cache_id if request else "").strip()

    if active_pdf_cache_id:
        target_path = _resolve_pdf_cache_path(active_pdf_cache_id)
        if target_path.exists():
            target_path.unlink(missing_ok=True)
            deleted_pdf_cache = True
        _invalidate_pdf_shares_for_pdf_id(active_pdf_cache_id)

    _clear_pdf_shares()

    deleted_downloads = _delete_generated_downloaded_pdfs()
    itinerary_list.clear()

    return {
        "ok": True,
        "deleted_pdf_cache": deleted_pdf_cache,
        "deleted_downloads_count": len(deleted_downloads),
        "deleted_download_paths": deleted_downloads,
        "cleared_itinerary": True
    }


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
