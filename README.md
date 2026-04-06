# PrivacyGuard project

This repository contains the full-stack PrivacyGuard application (backend + frontend).

## Architecture

Services:
- `backend` — FastAPI API
- `frontend` — React production build served by Nginx
- `nginx` — reverse proxy / single entrypoint
- `minio` — object storage for uploaded and processed media

## Quick start

### 1. Prepare environment files

Create environment files from examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env