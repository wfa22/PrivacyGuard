from datetime import datetime, timedelta
from jose import jwt
from core.config import settings

SECRET_KEY = "super_secret_key_123"  # хранится в .env
ALGORITHM = "HS256"

def create_access_token(data: dict, expires_minutes: int = None):
    expires_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(data: dict, expires_days: int = None):
    expires_days = expires_days or settings.REFRESH_TOKEN_EXPIRE_DAYS
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=expires_days)
    payload["type"] = "refresh"
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)