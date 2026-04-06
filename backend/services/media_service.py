import math
from typing import List, Optional, Tuple
from datetime import datetime

from fastapi import HTTPException, status

from core.config import settings
from models.models import MediaItem, User
from models.schemas import MediaResponse, PaginatedMediaResponse
from repositories.media_repository import MediaRepository
from services.storage_service import StorageService

# ── Ограничения ──
MAX_FILE_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
}

ALLOWED_SORT_FIELDS = {"created_at", "original_filename", "file_size", "id"}
ALLOWED_SORT_ORDERS = {"asc", "desc"}
ALLOWED_FILE_TYPES = {"image", "video"}


class MediaService:
    """Бизнес-логика работы с медиа."""

    def __init__(self, media_repo: MediaRepository, storage: StorageService):
        self.media_repo = media_repo
        self.storage = storage

    # ── Построение ответа с presigned URL ──

    def _build_response(self, item: MediaItem) -> MediaResponse:
        original_url = self.storage.get_presigned_url(item.original_object_name)
        processed_url = (
            self.storage.get_presigned_url(item.processed_object_name)
            if item.processed_object_name
            else None
        )
        return MediaResponse(
            id=item.id,
            user_id=item.user_id,
            original_url=original_url,
            original_filename=item.original_filename,
            processed_url=processed_url,
            processed=item.processed,
            description=item.description,
            file_type=item.file_type,
            file_size=item.file_size,
            content_type=item.content_type,
            created_at=item.created_at,
            updated_at=item.updated_at,
            # ═══ ИСПРАВЛЕНИЕ: передаём bg_removed в ответ ═══
            bg_removed=bool(item.bg_removed) if item.bg_removed is not None else False,
        )

    # ── Список (без фильтров — обратная совместимость) ──

    def list_media(self, current_user: User) -> List[MediaResponse]:
        if current_user.role == "admin":
            items = self.media_repo.get_all()
        else:
            items = self.media_repo.get_by_user(current_user.id)
        return [self._build_response(i) for i in items]

    # ── Список с фильтрацией, сортировкой, пагинацией ──

    def list_media_filtered(
        self,
        current_user: User,
        search: Optional[str] = None,
        processed: Optional[bool] = None,
        file_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> PaginatedMediaResponse:
        if sort_by not in ALLOWED_SORT_FIELDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid sort_by. Allowed: {', '.join(sorted(ALLOWED_SORT_FIELDS))}",
            )
        if sort_order not in ALLOWED_SORT_ORDERS:
            raise HTTPException(
                status_code=400,
                detail="Invalid sort_order. Allowed: asc, desc",
            )
        if file_type and file_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file_type. Allowed: {', '.join(sorted(ALLOWED_FILE_TYPES))}",
            )
        if page < 1:
            raise HTTPException(status_code=400, detail="page must be >= 1")
        if page_size < 1 or page_size > 100:
            raise HTTPException(status_code=400, detail="page_size must be 1..100")

        user_id = None if current_user.role == "admin" else current_user.id

        items, total = self.media_repo.get_filtered(
            user_id=user_id,
            search=search,
            processed=processed,
            file_type=file_type,
            date_from=date_from,
            date_to=date_to,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            page_size=page_size,
        )

        pages = math.ceil(total / page_size) if total > 0 else 0

        return PaginatedMediaResponse(
            items=[self._build_response(i) for i in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    # ── Просмотр одного файла ──

    def get_media(self, media_id: int, current_user: User) -> MediaResponse:
        item = self._get_and_check_access(media_id, current_user)
        return self._build_response(item)

    # ── Загрузка файла ──

    def upload(
        self,
        file_obj,
        filename: str,
        content_type: str,
        file_size: int,
        user_id: int,
        description: str = None,
    ) -> Tuple[MediaItem, MediaResponse]:
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {content_type}. "
                f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
            )

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large ({file_size} bytes). "
                f"Maximum: {settings.MAX_FILE_SIZE_MB} MB",
            )

        file_type_cat = "image" if content_type.startswith("image/") else "video"

        object_name = self.storage.upload_fileobj(file_obj, filename, user_id)

        item = self.media_repo.create(
            user_id=user_id,
            original_object_name=object_name,
            original_filename=filename,
            description=description,
            file_type=file_type_cat,
            file_size=file_size,
            content_type=content_type,
        )

        return item, self._build_response(item)

    # ── Обновление описания (PATCH) ──

    def update_media(
        self,
        media_id: int,
        current_user: User,
        description: Optional[str] = None,
    ) -> MediaResponse:
        item = self._get_and_check_access(media_id, current_user)

        update_data = {}
        if description is not None:
            update_data["description"] = description

        if update_data:
            item = self.media_repo.update(item, **update_data)

        return self._build_response(item)

    # ── Удаление ──

    def delete_media(self, media_id: int, current_user: User) -> None:
        item = self._get_and_check_access(media_id, current_user)

        for obj_name in (item.original_object_name, item.processed_object_name):
            if obj_name:
                try:
                    self.storage.delete_object(obj_name)
                except Exception:
                    pass

        self.media_repo.delete(item)

    # ── Скачивание ──

    def get_download_info(self, media_id: int, current_user: User) -> tuple:
        item = self._get_and_check_access(media_id, current_user)

        object_name = (
            item.processed_object_name
            if item.processed and item.processed_object_name
            else item.original_object_name
        )

        file_obj = self.storage.get_file_stream(object_name)
        filename = item.original_filename or f"file-{item.id}"
        return file_obj, filename

    # ── Проверка доступа ──

    def _get_and_check_access(self, media_id: int, current_user: User) -> MediaItem:
        item = self.media_repo.get_by_id(media_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media not found",
            )
        if current_user.role != "admin" and item.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        return item
