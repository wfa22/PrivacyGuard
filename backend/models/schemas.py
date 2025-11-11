from pydantic import BaseModel, EmailStr
from typing import Optional


# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int


# Auth / tokens
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# Media schemas
class MediaCreate(BaseModel):
    description: Optional[str] = None


class MediaResponse(BaseModel):
    id: int
    user_id: int
    original_url: str
    processed_url: Optional[str]
    processed: bool
    description: Optional[str]

    class Config:
        orm_mode = True
