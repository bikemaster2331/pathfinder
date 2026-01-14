# Pathfinder — AI-powered IoT Map Board

Pathfinder is an AI-powered interactive map board that provides tourist information, smart itineraries, and location-aware answers. It combines a React frontend (kiosk / browser), a FastAPI backend, and a retrieval-augmented generation (RAG) pipeline (ChromaDB + embeddings + LLM) to answer natural-language queries and display results on maps for kiosks or web clients.

This README documents the architecture, quick start, developer guidance for tracing frontend ↔ backend calls, and maintenance tips.

---

## Table of contents
- Features
- Architecture & system flow
- Repo layout (where to look)
- Quick start (development)
- Environment variables
- Common API endpoints & examples
- Frontend ↔ Backend mapping — how to find callers
- Admin / rebuild flow
- Docker & deployment notes
- Troubleshooting
- Contributing
- License & contact
- Related projects

---

## Features
- Natural-language Q&A powered by RAG (ChromaDB + embeddings + an LLM)
- Interactive map rendering (Leaflet / react-leaflet)
- Place details and itinerary support
- Admin endpoints to rebuild dataset/index
- Background / async support for long-running LLM tasks
- Health and status endpoints for monitoring

---

## Architecture & system flow (high level)
- Client (React): UI components — Search, MapView, Results, Itinerary, Admin UI
- API client: centralized module invoking backend endpoints (e.g. `/ask`, `/places`, `/admin/*`)
- Backend (FastAPI): HTTP routes wrapping the pipeline, auth, and data access
- Pipeline: ingestion, Chroma collections, embeddings, LLM calls, dataset hash/versioning
- Storage & services: Chroma DB persistence directory, LLM provider (OpenAI/GCP), optional Redis/Sentry

Minimal request flow:
User -> React UI -> API client -> FastAPI POST /ask -> RAG (Chroma + embeddings + LLM) -> Response (answer + places) -> React UI -> Map (Leaflet) renders markers / routes

---

## Repo layout (where to look)
Typical locations (actual paths may vary in this repo — search commands below will locate exact folders):
- backend/ or server/
  - app/main.py or main.py (FastAPI entry)
  - api/ or routes/ (route definitions)
  - pipeline/ (ingest, RAG logic, rebuild)
  - models/, schemas/
- frontend/ or react-app/ or web/
  - package.json
  - src/
    - api.ts / api.js (central API client)
    - components/, pages/, App.tsx, index.tsx
- data/
  - dataset.json
- docker/ or deployment/
  - Dockerfiles, docker-compose.yml
- README.md, LICENSE, .env.example

---

## Quick start (development)
Prereqs:
- Node 18+ (npm or yarn)
- Python 3.10+
- Virtualenv / venv
- (Optional) Docker & docker-compose
- LLM credentials (OPENAI_API_KEY or GCP credentials depending on config)

1) Backend
```bash
# from repo root (adjust if backend is inside subfolder)
cd backend || cd server || cd .
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # edit .env with values below
uvicorn app.main:app --reload --port 8000
```

2) Frontend
```bash
# find the frontend folder first if unknown (see mapping section)
cd frontend || cd web || cd react-app
cp .env.example .env      # set REACT_APP_API_BASE_URL=http://localhost:8000
npm install
npm start
```

Quick test:
```bash
curl -s -X POST "http://localhost:8000/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"best cafes near the river"}'
```

---

## Environment variables (common)
Backend (.env):
- FASTAPI_HOST=0.0.0.0
- FASTAPI_PORT=8000
- CHROMA_PERSIST_DIR=./chroma_db
- DATASET_JSON=./data/dataset.json
- LLM_PROVIDER=openai|gcp
- OPENAI_API_KEY=your_openai_key
- GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-creds.json
- ADMIN_API_KEY=secret_admin_key
- LOG_LEVEL=info

Frontend (.env):
- REACT_APP_API_BASE_URL=http://localhost:8000
- REACT_APP_ADMIN_UI=true

Adjust variable names/paths to match the actual repo implementation.

---

## Common API endpoints & examples
(Confirm exact paths in backend code. These are typical endpoints used by the frontend.)

- POST /ask
  - Request: { "question": "..." }
  - Response: { "answer": "...", "places": [{ id, name, lat, lng, categories }] }

- GET /places
  - Query: ?near=lat,lng&radius=500 or ?ids=1,2,3
  - Response: array of place objects

- GET /places/{id}
  - Response: full place detail object

- POST /admin/rebuild
  - Header: x-api-key: ADMIN_API_KEY
  - Response: { "status": "rebuild_started", "job_id": "..." }

- GET /admin/hash or GET /admin/status
  - Response: dataset hash or rebuild status

- GET /health
  - Response: { "status": "ok" }

---

## Frontend ↔ Backend mapping — how to find which frontend files call the backend
If you're unsure which files call backend endpoints, run these commands from the repo root and inspect the results. Paste outputs if you want help mapping them.

1) Find any package.json (locate React app):
```bash
find . -type f -name package.json -print
```

2) Search frontend for endpoint strings:
```bash
# replace 'frontend' with the actual frontend folder if different
grep -R --line-number "/ask\|/admin\|/places\|/health" frontend || true
grep -R --line-number "axios\|fetch(" frontend || true
```

3) Find centralized API client files:
```bash
grep -R --line-number "axios.create\|export .*api\|const api" frontend/src || true
```

4) Detect map integration (Leaflet / react-leaflet):
```bash
grep -R --line-number "leaflet\|react-leaflet\|L.map" frontend || true
# or check package.json dependencies for 'leaflet' / 'react-leaflet'
```

5) Search for auth usage (admin or token):
```bash
grep -R --line-number "x-api-key\|Authorization\|localStorage.getItem('token')" frontend || true
```

How to map after locating api client:
- Open the API client file (e.g., `src/api.ts`) — it usually defines baseURL and functions like `ask()`, `getPlaces()`, `rebuild()`.
- Use grep to find each exported function's callers:
```bash
grep -R --line-number "ask(" frontend/src || true
```
- Open those components/pages to see how responses are used (e.g., render map, list).

---

## Admin / rebuild flow
- Admin UI calls POST /admin/rebuild with `x-api-key`.
- Backend validates key and starts an async rebuild (BackgroundTasks or job queue).
- Rebuild re-ingests `DATASET_JSON`, recomputes embeddings, recreates Chroma collection, and updates dataset hash.
- Admin UI polls GET /admin/status or GET /admin/hash for completion.

Protect admin endpoints (API key + network controls) for kiosk deployments.

---

## Docker & deployment notes
- Persist Chroma DB storage to a Docker volume (CHROMA_PERSIST_DIR).
- Run backend and frontend in separate containers behind NGINX (TLS).
- Avoid public exposure of admin endpoints — place behind VPN or internal network.
- Scale LLM calls using background workers and caching for heavy traffic.

---

## Troubleshooting
- Frontend cannot reach backend: check REACT_APP_API_BASE_URL and FastAPI CORS settings.
- Stale search/index results: trigger POST /admin/rebuild.
- High LLM latency or cost: use background tasks, cache results, or configure cheaper models.
- Chroma persistence issues: verify CHROMA_PERSIST_DIR exists and is writable.

---

## Contributing
- Fork → branch → PR
- Follow style & tests:
  - Frontend: eslint / prettier
  - Backend: ruff / black / pytest
- Add unit / integration tests for new features and document API changes.
- When opening PRs, include screenshots for UI changes and request review for data pipeline changes.

---

## License
This repository is licensed under the Apache-2.0 License. See LICENSE.

---

## Contact / Maintainer
Repo owner: bikemaster2331 — https://github.com/bikemaster2331  
Open issues on this repo for bugs, feature requests, or deployment questions.

---

## Related projects
- med-id — a related repository by the same maintainer: https://github.com/bikemaster2331/med-id

---

If you want, I can:
- Commit this README.md into the repository for you,
- Scan the repo and update this README with exact file paths, example code snippets, and sample frontend components that call backend endpoints,
- Generate a visual diagram (Mermaid) and add it to this README.

Tell me which you'd like next.
