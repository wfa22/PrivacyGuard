from typing import Optional
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models.models import RefreshToken
from core.config import settings


class TokenRepository:
    """Слой доступа к данным: таблица refresh_tokens."""

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        user_id: int,
        token_hash: str,
        device_info: str,
    ) -> RefreshToken:
        stored = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            device_info=device_info,
            expires_at=datetime.utcnow() + timedelta(
                days=settings.REFRESH_TOKEN_EXPIRE_DAYS
            ),
        )
        self.db.add(stored)
        self.db.commit()
        return stored

    def get_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        return (
            self.db.query(RefreshToken)
            .filter(RefreshToken.token_hash == token_hash)
            .first()
        )

    def revoke(self, token: RefreshToken) -> None:
        token.revoked = True
        self.db.commit()

    def revoke_all_for_user(self, user_id: int) -> None:
        self.db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
        ).update({"revoked": True})
        self.db.commit()