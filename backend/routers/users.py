from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from models.models import User
from models.schemas import UserResponse, ChangeRoleRequest
from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository
from services.user_service import UserService
from routers.auth import get_current_user, require_role

router = APIRouter(prefix="/users", tags=["Users"])


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    return UserService(
        user_repo=UserRepository(db),
        token_repo=TokenRepository(db),
    )


@router.get("/", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(require_role("admin")),
    service: UserService = Depends(get_user_service),
):
    return service.list_all()


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    service: UserService = Depends(get_user_service),
):
    return service.get_by_id(user_id)


@router.patch("/{user_id}/role", response_model=UserResponse)
def change_user_role(
    user_id: int,
    payload: ChangeRoleRequest,
    current_user: User = Depends(require_role("admin")),
    service: UserService = Depends(get_user_service),
):
    return service.change_role(user_id, payload.role, current_user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    service: UserService = Depends(get_user_service),
):
    service.delete_user(user_id, current_user)
    return