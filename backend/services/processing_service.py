# services/processing_service.py
import io
import os
import traceback
from typing import List, Tuple

import numpy as np
from PIL import Image

from core.database import SessionLocal
from models import models as mdl
from services.storage_service import StorageService

# Попробуем загрузить YOLO, но не упадём, если пакета нет
try:
    from ultralytics import YOLO

    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

storage = StorageService()

# Какие расширения считаем картинками/видео
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mpeg"}


# ---- МОДЕЛИ ДЛЯ ДЕТЕКТА ----

_FACE_MODEL_PATH = "models/yolo_face.pt"          # подставишь свои веса
_PLATE_MODEL_PATH = "models/yolo_plate.pt"        # подставишь свои веса

_face_model = None
_plate_model = None


def _load_models():
    global _face_model, _plate_model
    if not YOLO_AVAILABLE:
        return

    if _face_model is None and os.path.exists(_FACE_MODEL_PATH):
        _face_model = YOLO(_FACE_MODEL_PATH)

    if _plate_model is None and os.path.exists(_PLATE_MODEL_PATH):
        _plate_model = YOLO(_PLATE_MODEL_PATH)


def _detect_boxes(image: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """
    Возвращает список боксов (x1, y1, x2, y2) для лиц и номеров.
    Сейчас всё очень грубо и зависит от твоих весов.
    Если моделей нет — возвращаем пустой список.
    """
    boxes: List[Tuple[int, int, int, int]] = []

    if not YOLO_AVAILABLE:
        return boxes

    _load_models()

    h, w, _ = image.shape

    def run_model(model):
        if model is None:
            return
        results = model(image, verbose=False)
        for r in results:
            if r.boxes is None:
                continue
            for b in r.boxes.xyxy.cpu().numpy():
                x1, y1, x2, y2 = b[:4]
                # квантуем и ограничиваем границами
                x1 = max(0, min(int(x1), w - 1))
                x2 = max(0, min(int(x2), w - 1))
                y1 = max(0, min(int(y1), h - 1))
                y2 = max(0, min(int(y2), h - 1))
                if x2 > x1 and y2 > y1:
                    boxes.append((x1, y1, x2, y2))

    run_model(_face_model)
    run_model(_plate_model)

    return boxes


def _blur_boxes(image: np.ndarray, boxes: List[Tuple[int, int, int, int]]) -> np.ndarray:
    out = image.copy()
    for (x1, y1, x2, y2) in boxes:
        roi = out[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        # сильное размытие
        k = max(15, ((x2 - x1) // 5) * 2 + 1)
        blurred = cv2.GaussianBlur(roi, (k, k), 0)
        out[y1:y2, x1:x2] = blurred
    return out


# OpenCV отдельно импортируем (чтобы не падало, если его нет)
try:
    import cv2

    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


def process_image_bytes(data: bytes) -> bytes:
    """Берём байты картинки → детектим → блюрим → возвращаем новые байты."""
    if not CV2_AVAILABLE:
        # Если OpenCV нет — просто возвращаем оригинал
        return data

    # читаем в numpy через PIL
    image = Image.open(io.BytesIO(data)).convert("RGB")
    np_img = np.array(image)

    boxes = _detect_boxes(np_img)
    if not boxes:
        # ничего не нашли — вернём как есть
        buf = io.BytesIO()
        image.save(buf, format="JPEG")
        return buf.getvalue()

    blurred_np = _blur_boxes(np_img, boxes)
    blurred_img = Image.fromarray(blurred_np)

    buf = io.BytesIO()
    blurred_img.save(buf, format="JPEG")
    return buf.getvalue()


def _guess_media_type(filename: str) -> str:
    ext = os.path.splitext(filename.lower())[1]
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "unknown"


def process_media_item(media_id: int):
    """
    Главная точка входа: вызывается из background task.
    """
    db = SessionLocal()
    try:
        item: mdl.MediaItem | None = db.query(mdl.MediaItem).filter(mdl.MediaItem.id == media_id).first()
        if not item:
            return

        if not item.original_filename:
            # на всякий пожарный
            return

        media_type = _guess_media_type(item.original_filename)
        original_data = storage.download_bytes(item.original_object_name)

        if media_type == "image":
            processed_data = process_image_bytes(original_data)
            # имя можно оставить тем же, MinIO всё равно кладёт в другой объект
            processed_object_name = storage.upload_bytes(
                processed_data,
                filename=item.original_filename,
                user_id=item.user_id,
            )
        else:
            # TODO: здесь можно сделать обработку видео через OpenCV
            # пока просто копируем оригинал
            processed_object_name = storage.upload_bytes(
                original_data,
                filename=item.original_filename,
                user_id=item.user_id,
            )

        item.processed_object_name = processed_object_name
        item.processed = True
        db.add(item)
        db.commit()

    except Exception:
        print("PROCESSING ERROR:")
        traceback.print_exc()
    finally:
        db.close()
