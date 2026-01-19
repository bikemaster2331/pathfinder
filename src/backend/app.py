from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
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
        print("Initialized successfully!")
    except Exception as e:
        print(f"Failed to initialize: {e}")
        pipeline = None
    yield

app = FastAPI(title="Pathfinder API", version="1.0.0", lifespan=lifespan)

itinerary_list = []

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str

class ItineraryItem(BaseModel):
    place_name: str

# UPDATED: Matches the new Pipeline output structure
class PlaceInfo(BaseModel):
    name: str
    coordinates: list[float] # GeoJSON style [lng, lat]
    type: str
    municipality: str

class AskResponse(BaseModel):
    answer: str
    locations: list[PlaceInfo] # Renamed from 'places' to match pipeline dict

# --- ENDPOINTS ---

@app.get("/health")
async def health_check():
    return {"status": "alive", "location": "rpi-edge"}

@app.get("/admin/status")
def admin_status(response: Response):
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
    try:
        pipeline.rebuild_index() # Use the method we created in pipeline.py
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
        
        # --- NEW DEBUG LOGGING ---
        loc_count = len(result['locations'])
        if loc_count > 0:
            print(f"📍 ZOOMING TO: {[l['name'] for l in result['locations']]}")
        else:
            print(f"⚠️ NO LOCATION FOUND for: '{request.question}'")
        # -------------------------

        duration = time.time() - start_time
        return {
            "answer": result['answer'],
            "locations": result['locations']  
        }
    except Exception as e:
        print(f"[ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/places")
def get_all_places():
    """Get all available places for the map (Legacy support if needed)"""
    if not pipeline:
        return {"places": []}
        
    # Note: New pipeline uses GeoJSON, so 'pipeline.config['places']' might be outdated
    # unless you kept the old config structure. 
    # For now, returning empty or you can adapt it to read from geo_engine
    return {"places": []}

# --- STATIC FILES ---
app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")