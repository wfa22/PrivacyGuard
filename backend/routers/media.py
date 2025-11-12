from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from models import schemas as sch
from models import models as mdl
from services.storage_service import StorageService
from routers.auth import get_current_user
from models.models import User

router = APIRouter(prefix="/media", tags=["Media"])
storage = StorageService()

@router.post(
    "/upload",
    response_model=sch.MediaResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_media(
    description: str = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    object_name = storage.upload_fileobj(file.file, file.filename)
    original_url = storage.get_presigned_url(object_name)

    item = mdl.MediaItem(
        user_id=current_user.id,
        original_object_name=object_name,
        original_url=original_url,
        processed=False,
        processed_url=None,
        description=description
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    item.processed = True
    item.processed_url = original_url
    db.commit()
    db.refresh(item)

    return item

@router.get("/", response_model=List[sch.MediaResponse])
def list_media(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Получить список всех медиа-файлов текущего пользователя"""
    return db.query(mdl.MediaItem).filter(mdl.MediaItem.user_id == current_user.id).all()

@router.get("/{media_id}", response_model=sch.MediaResponse)
def get_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Получить конкретный медиа-файл текущего пользователя по ID"""
    item = db.query(mdl.MediaItem).filter(
        mdl.MediaItem.id == media_id, 
        mdl.MediaItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return item

@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Удалить медиа-файл текущего пользователя по ID"""
    item = db.query(mdl.MediaItem).filter(
        mdl.MediaItem.id == media_id, 
        mdl.MediaItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    db.delete(item)
    db.commit()
    return
