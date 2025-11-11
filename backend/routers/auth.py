from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from core.config import settings

from core.database import get_db
from models.models import User
from models.schemas import UserCreate, UserResponse, LoginRequest, TokenResponse
from services.auth_service import hash_password, verify_password
from services.jwt_service import create_access_token, create_refresh_token


SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

router = APIRouter(prefix="/auth", tags=["Auth"])

fake_users_db: list[dict] = []
user_id_counter = 1


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        return user

    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    global user_id_counter
    for u in fake_users_db:
        if u["email"] == user.email:
            raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = {
        "id": user_id_counter,
        "username": user.username,
        "email": user.email,
        "password_hash": hash_password(user.password),
    }
    fake_users_db.append(new_user)
    user_id_counter += 1

    return UserResponse(**new_user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    for u in fake_users_db:
        if u["email"] == payload.email:
            if verify_password(payload.password, u["password_hash"]):
                access_token = create_access_token({"sub": str(u["id"])})
                refresh_token = create_refresh_token({"sub": str(u["id"])})
                return TokenResponse(access_token=access_token, refresh_token=refresh_token)
            raise HTTPException(status_code=401, detail="Invalid credentials")
    raise HTTPException(status_code=404, detail="User not found")


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(refresh_token: str):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=403, detail="Invalid token type")

        user_id = payload.get("sub")
        new_access = create_access_token({"sub": user_id})
        new_refresh = create_refresh_token({"sub": user_id})
        return TokenResponse(access_token=new_access, refresh_token=new_refresh)
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid refresh token")
