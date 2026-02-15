import hashlib
import secrets
import binascii

from fastapi import HTTPException, status

from models.models import User
from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository
from services.jwt_service import create_access_token, create_refresh_token


# ── Хеширование паролей ──

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return f"{salt}${binascii.hexlify(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return binascii.hexlify(dk).decode() == hashed


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── Бизнес-логика аутентификации ──

class AuthService:
    """Service-слой: регистрация, логин, refresh, logout."""

    def __init__(self, user_repo: UserRepository, token_repo: TokenRepository):
        self.user_repo = user_repo
        self.token_repo = token_repo

    def register(self, username: str, email: str, password: str) -> User:
        if self.user_repo.get_by_email(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )
        if self.user_repo.get_by_username(username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this username already exists",
            )
        return self.user_repo.create(
            username=username,
            email=email,
            password_hash=hash_password(password),
        )

    def login(self, email: str, password: str, device_info: str) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        access_token = create_access_token({"sub": str(user.id)})
        refresh_token = create_refresh_token({"sub": str(user.id)})

        self.token_repo.create(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            device_info=device_info,
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
        }

    def refresh(self, raw_refresh_token: str, device_info: str) -> dict:
        from jose import jwt, JWTError
        from core.config import settings
        from datetime import datetime

        try:
            token_data = jwt.decode(
                raw_refresh_token,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
            )
            if token_data.get("type") != "refresh":
                raise HTTPException(status_code=401, detail="Invalid token type")

            user_id = token_data.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        stored = self.token_repo.get_by_hash(hash_token(raw_refresh_token))

        if not stored:
            raise HTTPException(status_code=401, detail="Token not found")

        if stored.revoked:
            self.token_repo.revoke_all_for_user(stored.user_id)
            raise HTTPException(
                status_code=401,
                detail="Token reuse detected. All sessions revoked.",
            )

        if stored.expires_at < datetime.utcnow():
            self.token_repo.revoke(stored)
            raise HTTPException(status_code=401, detail="Refresh token expired")

        # Ротация
        self.token_repo.revoke(stored)

        user = self.user_repo.get_by_id(int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        new_access = create_access_token({"sub": str(user.id)})
        new_refresh = create_refresh_token({"sub": str(user.id)})

        self.token_repo.create(
            user_id=user.id,
            token_hash=hash_token(new_refresh),
            device_info=device_info,
        )

        return {
            "access_token": new_access,
            "refresh_token": new_refresh,
            "token_type": "Bearer",
        }

    def logout(self, raw_refresh_token: str, user_id: int) -> None:
        stored = self.token_repo.get_by_hash(hash_token(raw_refresh_token))
        if stored and stored.user_id == user_id:
            self.token_repo.revoke(stored)