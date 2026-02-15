from typing import Optional, List

from sqlalchemy.orm import Session

from models.models import MediaItem


class MediaRepository:
    """Слой доступа к данным: таблица media_items."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, media_id: int) -> Optional[MediaItem]:
        return self.db.query(MediaItem).filter(MediaItem.id == media_id).first()

    def get_all(self) -> List[MediaItem]:
        return self.db.query(MediaItem).all()

    def get_by_user(self, user_id: int) -> List[MediaItem]:
        return (
            self.db.query(MediaItem)
            .filter(MediaItem.user_id == user_id)
            .all()
        )

    def create(
        self,
        user_id: int,
        original_object_name: str,
        original_filename: str,
        description: str = None,
    ) -> MediaItem:
        item = MediaItem(
            user_id=user_id,
            original_object_name=original_object_name,
            original_filename=original_filename,
            description=description,
            processed=False,
            processed_object_name=None,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete(self, item: MediaItem) -> None:
        self.db.delete(item)
        self.db.commit()