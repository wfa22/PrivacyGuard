from datetime import datetime, timedelta
from typing import Optional

from jose import jwt

from core.config import settings


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    expires_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict, expires_days: Optional[int] = None) -> str:
    expires_days = expires_days or settings.REFRESH_TOKEN_EXPIRE_DAYS
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=expires_days)
    payload["type"] = "refresh"
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
