from typing import Optional, List

from fastapi import APIRouter, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from core.database import get_db
from models.models import User
from models.schemas import MediaResponse
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


@router.post("/upload", response_model=MediaResponse, status_code=201)
async def upload_media(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    item, response = service.upload(
        file_obj=file.file,
        filename=file.filename,
        content_type=file.content_type,
        user_id=current_user.id,
        description=description,
    )
    background_tasks.add_task(process_media_item, item.id)
    return response


@router.get("/", response_model=List[MediaResponse])
def list_media(
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    return service.list_media(current_user)


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
):
    return service.get_media(media_id, current_user)


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