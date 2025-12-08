from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pipeline import Pipeline
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import hashlib
from contextlib import asynccontextmanager
import asyncio
import time 
from fastapi.concurrency import run_in_threadpool  # ✅ Keep this

pipeline = None

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
        print(f"Failed to initialize: {e}")  # ✅ Fixed f-string
        pipeline = None

    yield

app = FastAPI(title="Pathfinder API", version="1.0.0", lifespan=lifespan)

BASE_DIR = Path(__file__).parent 
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"

itinerary_list = []

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: ["http://localhost:3000"]
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str

class ItineraryItem(BaseModel):
    place_name: str

class PlaceInfo(BaseModel):
    name: str
    lat: float
    lng: float
    type: str

class AskResponse(BaseModel):
    answer: str
    places: list[PlaceInfo]
    

# Admin endpoint
@app.get("/admin/status")
def admin_status():
    if pipeline is None:
        return{"status": "starting", "ready": False}, 503
    try:
        return {
            "status": "healthy",
            "collection_count": pipeline.collection.count(),
            "internet_available": pipeline.checkint(),
            "message": "Pathfinder is running"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    

@app.post("/admin/rebuild")
def admin_rebuild():
    try:
        pipeline.client.delete_collection(name=pipeline.config['rag']['collection_name'])

        pipeline.collection = pipeline.client.create_collection(
            name = pipeline.config['rag']['collection_name'],
            embedding_function=pipeline.embedding
        )
        pipeline.load_dataset(str(DATASET))
        with open(str(DATASET), 'rb') as f:
            current_hash = hashlib.md5(f.read()).hexdigest()
            hash_file = BASE_DIR / "chroma_storage" / pipeline.config['system']['hash_file']
            hash_file.parent.mkdir(exist_ok=True)
            with open(hash_file, 'w') as f:
                f.write(current_hash)   
            
        return{
            "message": "Database rebuilt successfully",
            "new_count": pipeline.collection.count()
        }
    except Exception as e:
        return{"error": f"Rebuild failed: {str(e)}"}


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
    """Get the current list of saved places"""
    return {"itinerary": itinerary_list}


@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):
    """Ask Pathfinder a question about Catanduanes tourism"""
    start_time = time.time()  # ✅ Added logging
    
    if pipeline is None:
        print(f"[ERROR] Pipeline not initialized")
        raise HTTPException(
            status_code=503, 
            detail="Service is starting up, please try again in a few seconds"
        )
    
    try:
        # ✅ CHANGED: Use run_in_threadpool instead of run_in_executor
        answer, place_names = await run_in_threadpool(
            pipeline.ask,
            request.question
        )
        
        # Get full place data with coordinates
        places_data = pipeline.get_place_data(place_names)
        
        # ✅ Added logging
        duration = time.time() - start_time
        print(f"[METRIC] /ask completed in {duration:.2f}s for: '{request.question[:30]}...'")
        
        return {
            "answer": answer,
            "places": places_data  
        }
    except Exception as e:
        # ✅ Added error logging
        duration = time.time() - start_time
        print(f"[ERROR] /ask failed after {duration:.2f}s: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "Pathfinder API is running"}

@app.get("/places")
def get_all_places():
    """Get all available places for the map"""
    all_places = pipeline.config['places']
    return {
        "places": [
            {
                "name": name,
                "lat": data['lat'],
                "lng": data['lng'],
                "type": data['type']
            }
            for name, data in all_places.items()
        ]
    }