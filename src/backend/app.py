import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
try:
    from .pipeline import Pipeline
except ImportError:
    from pipeline import Pipeline
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi.concurrency import run_in_threadpool

# --- PATH CONFIGURATION ---
BASE_DIR = Path(__file__).parent 
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"

# Global state
pipeline = None
itinerary_list = []

# --- LIFESPAN (SMART STARTUP) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("🚀 Pathfinder API is starting up...")
    
    try:
        # Initialize Pipeline
        pipeline = Pipeline(
            dataset_path=str(DATASET),
            config_path=str(CONFIG)
        )
        
        # RENDER FIX: Check if brain is empty (ephemeral storage)
        if pipeline.collection.count() == 0:
            print("⚠️ Brain is empty. Rebuilding index...")
            # Run rebuild in threadpool to avoid blocking startup
            await run_in_threadpool(pipeline.rebuild_index)
            print(f"✅ Rebuild Complete! Loaded {pipeline.collection.count()} facts.")
        else:
            print(f"🧠 Brain loaded. Contains {pipeline.collection.count()} facts.")
            
    except Exception as e:
        print(f"❌ CRITICAL ERROR: Failed to start pipeline: {e}")
        pipeline = None
    
    yield
    print("🛑 Pathfinder API is shutting down...")

app = FastAPI(title="Pathfinder API", version="1.0.0", lifespan=lifespan)

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATA MODELS ---
class AskRequest(BaseModel):
    question: str

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

# --- ENDPOINTS ---

@app.get("/")
def home():
    return {"status": "online", "message": "Pathfinder API is running"}

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

@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):
    # 1. Check if Brain is Ready
    if pipeline is None:
        raise HTTPException(status_code=503, detail="System is waking up. Please try again in 10 seconds.")
    
    try:
        print(f"❓ Processing: {request.question}")
        
        # 2. Run AI Task in separate thread (Prevents freezing)
        result = await run_in_threadpool(pipeline.ask, request.question)
        
        # 3. SAFETY CHECK: Ensure result is valid
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
        # Return a friendly error instead of crashing the server
        return {
            "answer": "I encountered an error processing that request. Please try asking differently.",
            "locations": []
        }

@app.post("/ask/stream")
async def ask_stream_endpoint(request: AskRequest):
    """Streaming endpoint — sends tokens via SSE as Ollama generates them."""
    if pipeline is None:
        raise HTTPException(status_code=503, detail="System is waking up.")

    async def event_generator():
        try:
            # Step 1: Run RAG pipeline to get facts + locations (non-streaming)
            result = await run_in_threadpool(pipeline.ask, request.question)

            locations = result.get('locations', [])
            raw_answer = result.get('answer', '')

            # Send locations as first event
            yield f"data: {json.dumps({'type': 'locations', 'locations': locations})}\n\n"

            # Step 2: Try streaming from Ollama
            ollama_response = pipeline._generate_with_ollama(
                request.question, raw_answer, stream=True
            )

            if ollama_response and hasattr(ollama_response, 'iter_lines'):
                for line in ollama_response.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            token = chunk.get('response', '')
                            if token:
                                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
                            if chunk.get('done', False):
                                break
                        except json.JSONDecodeError:
                            continue
            else:
                # Fallback: send raw answer as a single chunk
                yield f"data: {json.dumps({'type': 'token', 'token': raw_answer})}\n\n"

            # Signal completion
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            print(f"[STREAM ERROR] {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🔌 Server listening on http://0.0.0.0:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port)
