from typing import Optional, List, Tuple
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc

from models.models import MediaItem


# Допустимые поля для сортировки → маппинг на столбцы модели
ALLOWED_SORT_FIELDS = {
    "created_at": MediaItem.created_at,
    "original_filename": MediaItem.original_filename,
    "file_size": MediaItem.file_size,
    "id": MediaItem.id,
}


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

    def get_filtered(
        self,
        user_id: Optional[int] = None,
        search: Optional[str] = None,
        processed: Optional[bool] = None,
        file_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> Tuple[List[MediaItem], int]:
        """
        Фильтрованный, отсортированный, постраничный запрос.
        Возвращает (items, total_count).
        """
        query = self.db.query(MediaItem)

        # ── Фильтр по владельцу (обычный пользователь видит только своё) ──
        if user_id is not None:
            query = query.filter(MediaItem.user_id == user_id)

        # ── Поиск по описанию и имени файла ──
        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    MediaItem.description.ilike(pattern),
                    MediaItem.original_filename.ilike(pattern),
                )
            )

        # ── Фильтр по статусу обработки ──
        if processed is not None:
            query = query.filter(MediaItem.processed == processed)

        # ── Фильтр по типу файла ──
        if file_type:
            query = query.filter(MediaItem.file_type == file_type)

        # ── Фильтр по диапазону дат ──
        if date_from:
            query = query.filter(MediaItem.created_at >= date_from)
        if date_to:
            query = query.filter(MediaItem.created_at <= date_to)

        # ── Подсчёт до пагинации ──
        total = query.count()

        # ── Сортировка ──
        sort_column = ALLOWED_SORT_FIELDS.get(sort_by, MediaItem.created_at)
        order_func = asc if sort_order == "asc" else desc
        query = query.order_by(order_func(sort_column))

        # ── Пагинация ──
        offset = (page - 1) * page_size
        items = query.offset(offset).limit(page_size).all()

        return items, total

    def create(
        self,
        user_id: int,
        original_object_name: str,
        original_filename: str,
        description: str = None,
        file_type: str = None,
        file_size: int = None,
        content_type: str = None,
    ) -> MediaItem:
        item = MediaItem(
            user_id=user_id,
            original_object_name=original_object_name,
            original_filename=original_filename,
            description=description,
            processed=False,
            processed_object_name=None,
            file_type=file_type,
            file_size=file_size,
            content_type=content_type,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update(self, item: MediaItem, **kwargs) -> MediaItem:
        """Обновить произвольные поля записи."""
        for key, value in kwargs.items():
            if hasattr(item, key):
                setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete(self, item: MediaItem) -> None:
        self.db.delete(item)
        self.db.commit()