from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from models import schemas as sch
from models import models as mdl
from services.storage_service import StorageService
from routers.auth import get_current_user, require_role
from models.models import User

from services.processing_service import process_media_item

router = APIRouter(prefix="/media", tags=["Media"])
storage = StorageService()

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
}


def _build_response(item: mdl.MediaItem) -> sch.MediaResponse:
    """Хелпер: собирает MediaResponse с presigned-URL."""
    original_url = storage.get_presigned_url(item.original_object_name)
    processed_url = (
        storage.get_presigned_url(item.processed_object_name)
        if item.processed_object_name
        else None
    )
    return sch.MediaResponse(
        id=item.id,
        user_id=item.user_id,
        original_url=original_url,
        processed_url=processed_url,
        processed=item.processed,
        description=item.description,
    )


# ── Загрузка — любой авторизованный ──
@router.post(
    "/upload",
    response_model=sch.MediaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_media(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}",
        )

    import traceback

    try:
        object_name = storage.upload_fileobj(file.file, file.filename, current_user.id)

        item = mdl.MediaItem(
            user_id=current_user.id,
            original_object_name=object_name,
            original_filename=file.filename,
            description=description,
            processed=False,
            processed_object_name=None,
        )

        db.add(item)
        db.commit()
        db.refresh(item)

        background_tasks.add_task(process_media_item, item.id)

        return _build_response(item)

    except Exception:
        print("UPLOAD ERROR:")
        traceback.print_exc()
        raise


# ── Список медиа: user — свои, admin — все ──
@router.get("/", response_model=List[sch.MediaResponse])
def list_media(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        items = db.query(mdl.MediaItem).all()
    else:
        items = (
            db.query(mdl.MediaItem)
            .filter(mdl.MediaItem.user_id == current_user.id)
            .all()
        )

    return [_build_response(item) for item in items]


# ── Просмотр: user — только своё, admin — любое ──
@router.get("/{media_id}", response_model=sch.MediaResponse)
def get_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(mdl.MediaItem).filter(mdl.MediaItem.id == media_id).first()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    if current_user.role != "admin" and item.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _build_response(item)


# ── Удаление: user — только своё, admin — любое ──
@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(mdl.MediaItem).filter(mdl.MediaItem.id == media_id).first()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    if current_user.role != "admin" and item.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    db.delete(item)
    db.commit()
    return


# ── Скачивание: user — только своё, admin — любое ──
@router.get("/{media_id}/download")
def download_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(mdl.MediaItem).filter(mdl.MediaItem.id == media_id).first()

    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    if current_user.role != "admin" and item.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    object_name = (
        item.processed_object_name
        if item.processed and item.processed_object_name
        else item.original_object_name
    )

    file_obj = storage.get_file_stream(object_name)
    filename = item.original_filename or f"file-{item.id}"

    return StreamingResponse(
        file_obj,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        background=BackgroundTask(file_obj.close),
    )