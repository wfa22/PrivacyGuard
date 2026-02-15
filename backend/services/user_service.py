from fastapi import HTTPException, status

from models.models import User
from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository


VALID_ROLES = {"user", "admin"}


class UserService:
    """Бизнес-логика работы с пользователями."""

    def __init__(self, user_repo: UserRepository, token_repo: TokenRepository):
        self.user_repo = user_repo
        self.token_repo = token_repo

    def list_all(self) -> list[User]:
        return self.user_repo.get_all()

    def get_by_id(self, user_id: int) -> User:
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return user

    def change_role(self, user_id: int, new_role: str, current_user: User) -> User:
        if new_role not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Allowed: {', '.join(VALID_ROLES)}",
            )

        user = self.get_by_id(user_id)

        if user.id == current_user.id and new_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove admin role from yourself",
            )

        self.user_repo.update_role(user, new_role)

        # Отзываем все сессии — пользователь перелогинится с новой ролью
        self.token_repo.revoke_all_for_user(user.id)

        return user

    def delete_user(self, user_id: int, current_user: User) -> None:
        user = self.get_by_id(user_id)

        if user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete yourself",
            )

        self.user_repo.delete(user)