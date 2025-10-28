# IoTinerary Fullstack Application

A full-stack application for managing IoT itineraries with React frontend and FastAPI backend.

## Project Structure

```
iotinerary-fullstack/
├── backend/          # FastAPI backend
│   ├── src/          # Source code
│   ├── venv/         # Python virtual environment
│   ├── requirements.txt
│   └── run.py        # Server entry point
└── frontend/         # React frontend
    ├── src/          # Source code
    └── package.json
```

## Prerequisites

- Python 3.8+ (for backend)
- Node.js 18+ and npm (for frontend)
- PostgreSQL (recommended) or SQLite (for development)

## Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment:**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # Linux/Mac
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create `.env` file in the `backend/` directory:**
   ```env
   # Database Configuration
   # For PostgreSQL (recommended):
   DATABASE_URL=postgresql://username:password@localhost:5432/iotinerary_db

   # For SQLite (development only):
   # DATABASE_URL=sqlite:///./iotinerary.db

   # JWT Configuration
   JWT_SECRET_KEY=your-secret-key-here-change-this-in-production
   JWT_ALGORITHM=HS256
   JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
   ```

5. **Initialize the database:**
   ```bash
   python -m src.init_db
   ```

6. **Run the backend server:**
   ```bash
   python run.py
   ```
   
   The API will be available at `http://localhost:8000`
   API documentation at `http://localhost:8000/docs`

## Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file in the `frontend/` directory (optional):**
   ```env
   VITE_API_URL=http://localhost:8000/api
   ```
   
   Note: If you don't create this file, it will default to `http://localhost:8000/api`

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   
   The frontend will be available at `http://localhost:5173`

## Environment Variables

### Backend (.env)
- `DATABASE_URL` - Database connection string (required)
- `JWT_SECRET_KEY` - Secret key for JWT token signing (required)
- `JWT_ALGORITHM` - JWT algorithm (default: HS256)
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` - Token expiration time in minutes (default: 30)

### Frontend (.env)
- `VITE_API_URL` - Backend API URL (default: http://localhost:8000/api)

## API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info (requires authentication)
- `GET /api/health` - Health check endpoint

## Development

- Backend runs on port `8000` with auto-reload enabled
- Frontend runs on port `5173` with hot module replacement
- CORS is configured to allow requests from `http://localhost:5173`

## Production Deployment

1. Set appropriate environment variables
2. Use a production-grade database (PostgreSQL recommended)
3. Generate a strong `JWT_SECRET_KEY`
4. Build the frontend: `npm run build`
5. Serve the frontend build files with a web server (nginx, etc.)
6. Use a production ASGI server like Gunicorn with Uvicorn workers

