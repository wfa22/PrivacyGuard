from fastapi import APIRouter, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from core.config import settings
from core.database import get_db
from models.models import User
from models.schemas import (
    UserCreate, UserResponse, LoginRequest,
    TokenResponse, RefreshRequest,
)
from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository
from services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])

bearer_scheme = HTTPBearer()

VALID_ROLES = {"user", "admin"}


# ── DI: создание сервиса ──

def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(
        user_repo=UserRepository(db),
        token_repo=TokenRepository(db),
    )


# ── Dependency: текущий пользователь ──

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = UserRepository(db).get_by_id(int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*allowed_roles: str):
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        return current_user
    return _check


# ── Endpoints ──

@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    payload: UserCreate,
    service: AuthService = Depends(get_auth_service),
):
    return service.register(payload.username, payload.email, payload.password)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
):
    device_info = request.headers.get("User-Agent", "unknown")[:200]
    result = service.login(payload.email, payload.password, device_info)
    return TokenResponse(**result)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    payload: RefreshRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
):
    device_info = request.headers.get("User-Agent", "unknown")[:200]
    result = service.refresh(payload.refresh_token, device_info)
    return TokenResponse(**result)


@router.post("/logout", status_code=204)
def logout(
    payload: RefreshRequest,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    service.logout(payload.refresh_token, current_user.id)
    return