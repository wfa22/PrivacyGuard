# PrivacyGuard project

This repository contains the backend for the PrivacyGuard project. The original design is available at https://www.figma.com/design/jaPVFdHqYeGoCbbmfgSBpi/PrivacyGuard-project.

## Getting started

- Create a virtual environment and activate it.
- Install backend dependencies: `pip install -r backend/requirements.txt`.
- Start the FastAPI app: `uvicorn backend.main:app --reload`.

The service uses an SQLite database by default (`backend/app.db`). Adjust connection settings through environment variables exposed in `backend/core/config.py`.

## Authentication

- Register a user with `POST /api/auth/register`.
- Obtain tokens via `POST /api/auth/login`.
- Refresh tokens with `POST /api/auth/refresh`.

Protected routes such as `/api/users/*` and `/api/media/*` require a valid JWT access token provided in the `Authorization: Bearer <token>` header. Without a token, these endpoints return `401 Unauthorized`.