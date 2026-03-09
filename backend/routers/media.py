import io
from typing import Optional
from datetime import datetime

from fastapi import (
    APIRouter, UploadFile, File, Form,
    Depends, BackgroundTasks, Query,
)
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from core.database import get_db
from models.models import User
from models.schemas import MediaResponse, MediaUpdate, PaginatedMediaResponse
from repositories.media_repository import MediaRepository
from services.media_service import MediaService
from services.storage_service import StorageService
from services.processing_service import process_media_item
from routers.auth import get_current_user

router = APIRouter(prefix="/media", tags=["Media"])


def get_media_service(db: Session = Depends(get_db)) -> MediaService:
    return MediaService(
        media_repo=MediaRepository(db),
        storage=StorageService(),
    )


# ── Upload ──────────────────────────────────────────────────────
@router.post("/upload", response_model=MediaResponse, status_code=201)
async def upload_media(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    # Читаем файл целиком для определения размера и валидации
    file_content = await file.read()
    file_size = len(file_content)

    item, response = service.upload(
        file_obj=io.BytesIO(file_content),
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size,
        user_id=current_user.id,
        description=description,
    )
    background_tasks.add_task(process_media_item, item.id)
    return response


# ── List (с фильтрацией, поиском, сортировкой, пагинацией) ─────
@router.get("/", response_model=PaginatedMediaResponse)
def list_media(
    search: Optional[str] = Query(
        None, description="Поиск по имени файла и описанию",
    ),
    processed: Optional[bool] = Query(
        None, description="Фильтр по статусу обработки",
    ),
    file_type: Optional[str] = Query(
        None, description="Тип файла: image или video",
    ),
    date_from: Optional[datetime] = Query(
        None, description="Дата от (ISO 8601)",
    ),
    date_to: Optional[datetime] = Query(
        None, description="Дата до (ISO 8601)",
    ),
    sort_by: str = Query(
        "created_at",
        description="Поле сортировки: created_at, original_filename, file_size, id",
    ),
    sort_order: str = Query(
        "desc", description="Порядок: asc или desc",
    ),
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(10, ge=1, le=100, description="Размер страницы"),
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    return service.list_media_filtered(
        current_user=current_user,
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


# ── Get one ─────────────────────────────────────────────────────
@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    return service.get_media(media_id, current_user)


# ── Update (PATCH) ──────────────────────────────────────────────
@router.patch("/{media_id}", response_model=MediaResponse)
def update_media(
    media_id: int,
    payload: MediaUpdate,
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    return service.update_media(
        media_id=media_id,
        current_user=current_user,
        description=payload.description,
    )


# ── Delete ──────────────────────────────────────────────────────
@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    service.delete_media(media_id, current_user)
    return


# ── Download ────────────────────────────────────────────────────
@router.get("/{media_id}/download")
def download_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    file_obj, filename = service.get_download_info(media_id, current_user)
    return StreamingResponse(
        file_obj,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        background=BackgroundTask(file_obj.close),
    )