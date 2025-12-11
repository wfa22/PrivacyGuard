# PrivacyGuard project

This repository contains the full-stack PrivacyGuard application (backend + frontend). The original design is available at https://www.figma.com/design/jaPVFdHqYeGoCbbmfgSBpi/PrivacyGuard-project.

## Getting started

### Using Docker (Recommended)

1. Start all services:

   ```bash
   docker-compose up -d
   ```

2. Access the application:
   - Frontend: http://localhost:3000 (or check docker-compose for actual port)
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - MinIO Console: http://localhost:9001

### Manual Setup

#### Backend

1. Create a virtual environment and activate it.
2. Install backend dependencies: `pip install -r backend/requirements.txt`.
3. Start the FastAPI app: `uvicorn backend.main:app --reload`.

The service uses an SQLite database by default (`backend/app.db`). Adjust connection settings through environment variables exposed in `backend/core/config.py`.

#### Frontend

1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. The frontend will be available at http://localhost:3000

**Note:** Make sure the backend is running on `http://localhost:8000` or set `VITE_API_URL` environment variable.

## Authentication

- Register a user with `POST /api/auth/register` or through the frontend registration form.
- Obtain tokens via `POST /api/auth/login` or through the frontend login form.
- Refresh tokens with `POST /api/auth/refresh`.

Protected routes such as `/api/users/*` and `/api/media/*` require a valid JWT access token provided in the `Authorization: Bearer <token>` header. The frontend automatically includes the token in all API requests after login.

## API Integration

The frontend is fully integrated with the backend API:

- **AuthPage**: Handles user registration and login, stores JWT tokens in localStorage
- **CensoringPage**: Uploads media files to `/api/media/upload` endpoint
- **DashboardPage**: Lists user's media files from `/api/media/` and allows deletion via `/api/media/{id}`

All API calls are handled through the centralized API client in `src/utils/api.ts`.
