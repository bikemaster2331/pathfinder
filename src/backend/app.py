from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from pipeline import Pipeline
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import hashlib
from contextlib import asynccontextmanager
import asyncio
import time 
from fastapi.concurrency import run_in_threadpool

pipeline = None

BASE_DIR = Path(__file__).parent 
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("Initializing Pathfinder...")
    try:
        pipeline = Pipeline(
            dataset_path=str(DATASET),
            config_path=str(CONFIG)
        )
        
        # ============================================================
        # 🧠 SELF-HEALING PROTOCOL (Auto-Rebuild on Startup)
        # ============================================================
        print("⚠️ Detected Startup: Checking for Amnesia...")
        try:
            # This forces the brain to read dataset.json and refill the database immediately
            pipeline.rebuild_index()
            print(f"✅ Auto-Rebuild Complete! Brain contains {pipeline.collection.count()} facts.")
        except Exception as rebuild_error:
            print(f"❌ Auto-Rebuild Warning: {rebuild_error}")
        # ============================================================

        print("Initialized successfully!")
    except Exception as e:
        print(f"Failed to initialize: {e}")
        pipeline = None
    yield

app = FastAPI(title="Pathfinder API", version="1.0.0", lifespan=lifespan)

# --- CONFIGURATION ---
# Define allowed origins (Localhost + Live Site)
origins = [
    "http://localhost:5173",  
    "https://pathfinder-lilac.vercel.app", 
]

itinerary_list = []

# --- CRITICAL FIX: CORS SETUP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATA MODELS ---
class AskRequest(BaseModel):
    question: str

class ItineraryItem(BaseModel):
    place_name: str

class PlaceInfo(BaseModel):
    name: str
    coordinates: list[float] # GeoJSON style [lng, lat]
    type: str
    municipality: str

class AskResponse(BaseModel):
    answer: str
    locations: list[PlaceInfo]

# --- ENDPOINTS ---

@app.get("/health")
async def health_check():
    return {"status": "alive", "location": "render-cloud"}

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
    """
    WARNING: On Render Free Tier, the filesystem is ephemeral.
    Rebuilding the index works in memory, but if the server restarts,
    changes might revert to the original dataset.json.
    """
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
    if item.place_name not in itinerary_list:
        itinerary_list.append(item.place_name)
        print(f"📝 Added to itinerary: {item.place_name}")
    return {
        "message": f"Added {item.place_name}",
        "total_items": len(itinerary_list)
    }

@app.get("/itinerary")
def get_itinerary():
    return {"itinerary": itinerary_list}

@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):
    """Ask Pathfinder a question about Catanduanes tourism"""
    start_time = time.time()
    
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Service starting...")
    
    try:
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
        print(f"[ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/places")
def get_all_places():
    """Legacy support endpoint"""
    if not pipeline:
        return {"places": []}
    return {"places": []}