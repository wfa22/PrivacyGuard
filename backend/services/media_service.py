from typing import List

from fastapi import HTTPException, status

from models.models import MediaItem, User
from models.schemas import MediaResponse
from repositories.media_repository import MediaRepository
from services.storage_service import StorageService


class MediaService:
    """Бизнес-логика работы с медиа."""

    def __init__(self, media_repo: MediaRepository, storage: StorageService):
        self.media_repo = media_repo
        self.storage = storage

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
            processed_url=processed_url,
            processed=item.processed,
            description=item.description,
        )

    def list_media(self, current_user: User) -> List[MediaResponse]:
        if current_user.role == "admin":
            items = self.media_repo.get_all()
        else:
            items = self.media_repo.get_by_user(current_user.id)
        return [self._build_response(item) for item in items]

    def get_media(self, media_id: int, current_user: User) -> MediaResponse:
        item = self._get_and_check_access(media_id, current_user)
        return self._build_response(item)

    def upload(
        self,
        file_obj,
        filename: str,
        content_type: str,
        user_id: int,
        description: str = None,
    ) -> tuple[MediaItem, MediaResponse]:
        """Загрузка файла. Возвращает (item, response)."""
        allowed = {
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "video/mp4", "video/mpeg", "video/quicktime",
        }
        if content_type not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {content_type}",
            )

        object_name = self.storage.upload_fileobj(file_obj, filename, user_id)

        item = self.media_repo.create(
            user_id=user_id,
            original_object_name=object_name,
            original_filename=filename,
            description=description,
        )

        return item, self._build_response(item)

    def delete_media(self, media_id: int, current_user: User) -> None:
        item = self._get_and_check_access(media_id, current_user)
        self.media_repo.delete(item)

    def get_download_info(self, media_id: int, current_user: User) -> tuple:
        """Возвращает (file_stream, filename) для скачивания."""
        item = self._get_and_check_access(media_id, current_user)

        object_name = (
            item.processed_object_name
            if item.processed and item.processed_object_name
            else item.original_object_name
        )

        file_obj = self.storage.get_file_stream(object_name)
        filename = item.original_filename or f"file-{item.id}"
        return file_obj, filename

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