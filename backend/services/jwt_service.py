import uuid
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt

from core.config import settings


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    expires_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.utcnow()
    payload = {
        "sub": data["sub"],
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict, expires_days: Optional[int] = None) -> str:
    expires_days = expires_days or settings.REFRESH_TOKEN_EXPIRE_DAYS
    now = datetime.utcnow()
    payload = {
        "sub": data["sub"],
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(days=expires_days),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)