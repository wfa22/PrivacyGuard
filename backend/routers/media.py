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
from models.schemas import (
    MediaResponse, MediaUpdate, PaginatedMediaResponse,
    RemoveBgStatusResponse,
)
from repositories.media_repository import MediaRepository
from services.media_service import MediaService
from services.storage_service import StorageService
from services.processing_service import process_media_item
from services.removebg_service import RemoveBgService
from routers.auth import get_current_user

router = APIRouter(prefix="/media", tags=["Media"])


def get_media_service(db: Session = Depends(get_db)) -> MediaService:
    return MediaService(
        media_repo=MediaRepository(db),
        storage=StorageService(),
    )


# ══════════════════════════════════════════════════════════════════
# 5.2. Эндпоинт статуса Remove.bg
# ══════════════════════════════════════════════════════════════════

@router.get("/removebg/status", response_model=RemoveBgStatusResponse)
def removebg_status(current_user: User = Depends(get_current_user)):
    """
    Проверить доступность сервиса Remove.bg.

    Фронтенд вызывает при загрузке CensoringPage,
    чтобы показать/скрыть чекбокс "Remove Background".
    """
    service = RemoveBgService()
    if service.is_available():
        return RemoveBgStatusResponse(
            available=True,
            rate_limit_per_minute=service.max_requests_per_minute,
            message="Remove.bg service is available",
        )
    return RemoveBgStatusResponse(
        available=False,
        rate_limit_per_minute=0,
        message="Remove.bg service is not configured. Set REMOVEBG_API_KEY environment variable.",
    )


# ── Upload (обновлённый с remove_bg параметром) ─────────────────
@router.post("/upload", response_model=MediaResponse, status_code=201)
async def upload_media(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        description: Optional[str] = Form(None),
        # 5.2: Новый параметр — нужно ли удалять фон
        remove_bg: Optional[bool] = Form(False),
        current_user: User = Depends(get_current_user),
        service: MediaService = Depends(get_media_service),
):
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
    # 5.2: Передаём remove_bg в background task
    background_tasks.add_task(process_media_item, item.id, remove_bg)
    return response


# ── List ────────────────────────────────────────────────────────
@router.get("/", response_model=PaginatedMediaResponse)
def list_media(
        search: Optional[str] = Query(None),
        processed: Optional[bool] = Query(None),
        file_type: Optional[str] = Query(None),
        date_from: Optional[datetime] = Query(None),
        date_to: Optional[datetime] = Query(None),
        sort_by: str = Query("created_at"),
        sort_order: str = Query("desc"),
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=100),
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


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
        media_id: int,
        current_user: User = Depends(get_current_user),
        service: MediaService = Depends(get_media_service),
):
    return service.get_media(media_id, current_user)


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


@router.delete("/{media_id}", status_code=204)
def delete_media(
        media_id: int,
        current_user: User = Depends(get_current_user),
        service: MediaService = Depends(get_media_service),
):
    service.delete_media(media_id, current_user)
    return


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