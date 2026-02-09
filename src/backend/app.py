import os
import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
itinerary_list = []  # Restored memory for itinerary

# --- LIFESPAN (SMART STARTUP) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("🚀 Pathfinder API is starting up...")
    
    try:
        # Initialize Pipeline (This loads the brain)
        pipeline = Pipeline(
            dataset_path=str(DATASET),
            config_path=str(CONFIG)
        )
        
        # RENDER FIX: Check if brain is empty (ephemeral storage)
        if pipeline.collection.count() == 0:
            print("⚠️ Brain is empty (Render Ephemeral Storage). Rebuilding index...")
            pipeline.rebuild_index()
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
    name: str
    coordinates: list[float]
    type: str
    municipality: str

class AskResponse(BaseModel):
    answer: str
    locations: list[PlaceInfo]

class ItineraryItem(BaseModel):
    place_name: str

# --- RESTORED ENDPOINTS ---

@app.get("/")
def home():
    return {"status": "online", "message": "Pathfinder API is running"}

@app.get("/health")
def health_check():
    if pipeline:
        return {"status": "healthy", "facts_loaded": pipeline.collection.count()}
    return {"status": "starting"}

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
def admin_rebuild():
    """Manually force a brain rebuild"""
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")
    try:
        pipeline.rebuild_index() 
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
    """Legacy endpoint (returns empty list for now)"""
    return {"places": []}

@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="System is still initializing. Please wait.")
    
    try:
        # Run heavy AI task in threadpool
        result = await run_in_threadpool(pipeline.ask, request.question)
        
        # Debug Logging
        loc_count = len(result['locations'])
        if loc_count > 0:
            print(f"📍 ZOOMING TO: {[l['name'] for l in result['locations']]}")
        else:
            print(f"⚠️ NO LOCATION FOUND for: '{request.question}'")

        return {
            "answer": result['answer'],
            "locations": result['locations']
        }
    except Exception as e:
        print(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

# --- AUTO-START ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🔌 Server listening on http://0.0.0.0:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port)