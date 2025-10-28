from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware  # Changed: GZipMiddleware instead of GZIPMiddleware
from dotenv import load_dotenv
import os
from .routers import auth, pdf

load_dotenv()

app = FastAPI(title="IoTinerary API", version="1.0.0")

# Parse CORS origins from environment variable
def get_allowed_origins():
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in origins.split(",")]

# Response compression middleware - compress responses over 1KB (reduces bandwidth)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Changed class name

# CORS middleware - must be added before routers
app.add_middleware(
    CORSMiddleware,
allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(pdf.router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        workers=1,
        limit_concurrency=50,
        limit_max_requests=1000,
        timeout_keep_alive=5
    )
