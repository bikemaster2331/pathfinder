from fastapi import FastAPI
from pydantic import BaseModel
from .pipeline import Pipeline   # note the dot → relative import
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # your frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = Pipeline(
    dataset_path="backend/dataset/dataset.json",
    config_path="backend/config/config.yaml"
)

class AskRequest(BaseModel):
    question: str

@app.post("/ask")
def ask_endpoint(request: AskRequest):
    user_question = request.question
    answer, places = pipeline.ask(user_question)
    response = {
        "answer": answer,
        "places": [
            {
                "name": place,
                # optionally: "coordinates": {...}, "topic": "..."
            }
            for place in places
        ]
    }
    return response
