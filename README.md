# 🧭 Pathfinder — Catanduanes Tourism Kiosk

An AI-powered interactive tourism kiosk for Catanduanes, Philippines. Features a conversational chatbot with RAG (Retrieval-Augmented Generation), an interactive MapLibre map with marker clustering, activity-based filtering, and optional local LLM integration via Ollama.

---

## 📋 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Python** | ≥ 3.10 | [python.org](https://python.org) |
| **Git** | any | [git-scm.com](https://git-scm.com) |
| **Ollama** *(optional)* | latest | [ollama.com](https://ollama.com) — for local LLM responses |

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/bikemaster2331/pathfinder.git
cd pathfinder
git checkout nai
```

---

### 2. Frontend Setup

```bash
# Install Node dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at **http://localhost:5173** (default Vite port).

#### Environment Variables (Frontend)

Create a `.env` file in the project root if your backend runs on a different host:

```env
VITE_API_URL=http://127.0.0.1:8000
```

---

### 3. Backend Setup

```bash
# Navigate to the backend directory
cd src/backend

# Create a Python virtual environment
python -m venv venv

# Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

#### Environment Variables (Backend)

Create a `.env` file inside `src/backend/`:

```env
# Required for Gemini cloud enhancement (optional but recommended)
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama configuration (optional — app works without it)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
```

#### Ingest the Dataset

Before the chatbot can answer questions, you need to ingest the tourism dataset into ChromaDB:

```bash
# From src/backend/
python ingest.py
```

This reads `src/backend/dataset/dataset.json` and creates the vector embeddings in `src/backend/chroma_storage/`.

#### Start the Backend Server

```bash
# From src/backend/
python app.py
```

The API will be available at **http://localhost:8000**.

You can verify it's running by visiting: http://localhost:8000/health

---

### 4. Ollama Setup (Optional)

Ollama provides local LLM inference for more natural chatbot responses. Without it, the chatbot returns raw RAG facts (still functional).

```bash
# Install Ollama (see ollama.com for your platform)
# Then pull the recommended lightweight model:
ollama pull qwen2.5:1.5b

# Ollama runs automatically on http://localhost:11434
```

> **Raspberry Pi 5 users**: Ollama supports ARM64. Use `qwen2.5:1.5b` or `qwen2.5:0.5b` for best performance on edge devices.

---

## 🏗️ Production Build

```bash
# From the project root
npm run build
```

Output goes to `dist/`. Serve it with any static file server:

```bash
npm run preview
# or
npx serve dist
```

---

## 📁 Project Structure

```
pathfinder/
├── public/
│   ├── catanduanes_full.geojson    # Map data (polygons + points)
│   └── icons/                      # Map marker icons
├── src/
│   ├── frontend/
│   │   ├── components/
│   │   │   ├── ChatBot.jsx         # Chat UI with streaming & location chips
│   │   │   ├── ActivityChips.jsx   # Activity filter chips
│   │   │   ├── map.jsx             # MapLibre map with clustering
│   │   │   └── MapWrapper.jsx      # Map container with controls
│   │   ├── pages/
│   │   │   └── Itinerary.jsx       # Main page orchestrator
│   │   └── styles/
│   │       └── itinerary_page/     # CSS modules
│   └── backend/
│       ├── app.py                  # FastAPI server + /ask + /ask/stream
│       ├── pipeline.py             # RAG pipeline + Ollama integration
│       ├── controller.py           # Input validation & intent detection
│       ├── entity_extractor.py     # Place/activity entity extraction
│       ├── ingest.py               # Dataset → ChromaDB ingestion
│       ├── config/
│       │   └── config.yaml         # Keywords, prompts, model settings
│       ├── dataset/
│       │   └── dataset.json        # Tourism knowledge base
│       └── requirements.txt        # Python dependencies
├── package.json
├── vite.config.js
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ask` | Standard Q&A — returns `{ answer, locations }` |
| `POST` | `/ask/stream` | SSE streaming — streams tokens + locations in real-time |
| `GET` | `/health` | Health check — returns collection count & status |
| `POST` | `/admin/rebuild` | Force re-ingest the dataset into ChromaDB |
| `POST` | `/itinerary_add` | Add a place to the itinerary |
| `GET` | `/itinerary` | Get the current itinerary list |

### Example `/ask` Request

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the best beaches?"}'
```

---

## 🗺️ Features

- **Map Clustering** — Points auto-cluster at low zoom. Click a cluster to expand.
- **Activity Chips** — Quick-filter by Beaches, Hiking, Sightseeing, Dining, Shopping, Stay.
- **Location Chips** — Tap a suggested location in chat to fly the map there.
- **AI Chatbot** — RAG pipeline with semantic search, query expansion, and optional Ollama LLM.
- **SSE Streaming** — Token-by-token response streaming for a typewriter effect.
- **Touch Optimized** — Momentum scrolling, overscroll containment, tap-friendly UI.
- **Offline Capable** — Works without internet (uses pre-computed embeddings + local LLM).

---

## 🔧 Configuration

All AI behavior is configured in `src/backend/config/config.yaml`:

- **RAG model** — `rag.model_path` (default: `all-MiniLM-L6-v2`)
- **Keywords** — Activity-to-keyword mappings for filtering
- **Prompts** — Gemini enhancement prompt templates
- **Rate limiting** — `security.rate_limit.max_request` and `period_seconds`
- **Cache** — `cache.similarity_threshold` for semantic caching

---

## 🍓 Raspberry Pi 5 Deployment

For kiosk deployment on a Raspberry Pi 5:

```bash
# 1. Clone and setup (same as above)
git clone https://github.com/bikemaster2331/pathfinder.git
cd pathfinder && git checkout nai

# 2. Install Node.js (ARM64)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 3. Frontend
npm install && npm run build

# 4. Backend
cd src/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python ingest.py

# 5. Ollama (optional but recommended)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:1.5b

# 6. Run both services
# Terminal 1:
cd src/backend && source venv/bin/activate && python app.py

# Terminal 2 (serve frontend):
npx serve dist -l 5173

# 7. Open Chromium in kiosk mode
chromium-browser --kiosk http://localhost:5173
```

---

## 📝 License

This project is private. All rights reserved.
