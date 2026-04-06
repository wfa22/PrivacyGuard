from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime


# ── User schemas ──
class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    role: str

    model_config = ConfigDict(from_attributes=True)


# ── Auth / tokens ──
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Role management ──
class ChangeRoleRequest(BaseModel):
    role: str


# ── Media schemas ──
class MediaCreate(BaseModel):
    description: Optional[str] = None


class MediaUpdate(BaseModel):
    description: Optional[str] = None


class MediaResponse(BaseModel):
    id: int
    user_id: int
    original_url: str
    original_filename: Optional[str] = None
    processed_url: Optional[str] = None
    processed: bool
    description: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    content_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # 5.1: Новое поле — статус удаления фона
    bg_removed: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True)


class PaginatedMediaResponse(BaseModel):
    items: List[MediaResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ══════════════════════════════════════════════════════════════════
# 5.5. Нормализованный ответ для фронтенда о статусе Remove.bg
# ══════════════════════════════════════════════════════════════════


class RemoveBgStatusResponse(BaseModel):
    """Статус сервиса Remove.bg."""

    available: bool
    credits_remaining: Optional[int] = None
    rate_limit_per_minute: int
    message: str
