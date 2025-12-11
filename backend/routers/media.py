from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from models import schemas as sch
from models import models as mdl
from services.storage_service import StorageService
from routers.auth import get_current_user
from models.models import User

router = APIRouter(prefix="/media", tags=["Media"])
storage = StorageService()

router = APIRouter(prefix="/media", tags=["Media"])
storage = StorageService()

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/quicktime"
}

@router.post(
    "/upload",
    response_model=sch.MediaResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_media(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}"
        )

    import traceback

    try:
        object_name = storage.upload_fileobj(file.file, file.filename, current_user.id)
        presigned = storage.get_presigned_url(object_name)

        item = mdl.MediaItem(
            user_id=current_user.id,
            original_object_name=object_name,
            original_filename=file.filename,
            description=description,
            processed=True,
        )

        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    except Exception:
        print("UPLOAD ERROR:")
        traceback.print_exc()
        raise


@router.get("/", response_model=List[sch.MediaResponse])
def list_media(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(mdl.MediaItem).filter(mdl.MediaItem.user_id == current_user.id).all()


@router.get("/{media_id}", response_model=sch.MediaResponse)
def get_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(mdl.MediaItem).filter(
        mdl.MediaItem.id == media_id,
        mdl.MediaItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return item


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(mdl.MediaItem).filter(
        mdl.MediaItem.id == media_id,
        mdl.MediaItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    db.delete(item)
    db.commit()
    return


@router.get("/{media_id}/download")
def download_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(mdl.MediaItem)
        .filter(
            mdl.MediaItem.id == media_id,
            mdl.MediaItem.user_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    file_obj = storage.get_file_stream(item.original_object_name)

    filename = item.original_filename or f"file-{item.id}"

    return StreamingResponse(
        file_obj,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        background=BackgroundTask(file_obj.close),
    )