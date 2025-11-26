from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pipeline import Pipeline
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="Pathfinder API", version="1.0.0")

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: ["http://localhost:3000"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipeline with error handling
try:
    pipeline = Pipeline(
        dataset_path="dataset/dataset.json",
        config_path="config/config.yaml"
    )
except Exception as e:
    print(f"❌ Failed to initialize pipeline: {e}")
    raise

class AskRequest(BaseModel):
    question: str

class PlaceInfo(BaseModel):
    name: str
    lat: float
    lng: float
    type: str

class AskResponse(BaseModel):
    answer: str
    places: list[PlaceInfo]

@app.post("/ask", response_model=AskResponse)
def ask_endpoint(request: AskRequest):
    """Ask Pathfinder a question about Catanduanes tourism"""
    try:
        user_question = request.question
        answer, place_names = pipeline.ask(user_question)
        
        # Get full place data with coordinates
        places_data = pipeline.get_place_data(place_names)
        
        return {
            "answer": answer,
            "places": places_data  # Already has name, lat, lng, type
        }
    except Exception as e:
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