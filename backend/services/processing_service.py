import io
import os
import time
import logging
import traceback
from typing import List, Tuple

import numpy as np
from PIL import Image

from core.database import SessionLocal
from models import models as mdl
from services.storage_service import StorageService
from services.removebg_service import RemoveBgService, RemoveBgResult, RemoveBgError

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

logger = logging.getLogger(__name__)

storage = StorageService()
removebg_service = RemoveBgService()

print(f"[PROCESS] YOLO_AVAILABLE={YOLO_AVAILABLE}")
print(f"[PROCESS] RemoveBg_AVAILABLE={removebg_service.is_available()}")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mpeg"}

_FACE_MODEL_PATH = "/app/models/yolo_face.pt"
_PLATE_MODEL_PATH = "/app/models/yolo_plate.pt"

_face_model = None
_plate_model = None

MIN_PROCESSING_SECONDS = 1.0


def _init_models():
    global _face_model, _plate_model

    if not YOLO_AVAILABLE:
        print("[PROCESS] YOLO not available, skipping model load")
        return

    if os.path.exists(_FACE_MODEL_PATH):
        _face_model = YOLO(_FACE_MODEL_PATH)
        print("[PROCESS] Face model loaded")
    else:
        print(f"[PROCESS] Face model NOT FOUND: {_FACE_MODEL_PATH}")

    if os.path.exists(_PLATE_MODEL_PATH):
        _plate_model = YOLO(_PLATE_MODEL_PATH)
        print("[PROCESS] Plate model loaded")
    else:
        print(f"[PROCESS] Plate model NOT FOUND: {_PLATE_MODEL_PATH}")


_init_models()


def _detect_boxes(image: np.ndarray) -> List[Tuple[int, int, int, int]]:
    boxes: List[Tuple[int, int, int, int]] = []

    if not YOLO_AVAILABLE:
        return boxes

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
                x1 = max(0, min(int(x1), w - 1))
                x2 = max(0, min(int(x2), w - 1))
                y1 = max(0, min(int(y1), h - 1))
                y2 = max(0, min(int(y2), h - 1))
                if x2 > x1 and y2 > y1:
                    boxes.append((x1, y1, x2, y2))

    run_model(_face_model)
    run_model(_plate_model)

    return boxes


try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


def _blur_boxes(image: np.ndarray, boxes: List[Tuple[int, int, int, int]]) -> np.ndarray:
    out = image.copy()
    for (x1, y1, x2, y2) in boxes:
        roi = out[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        k = max(15, ((x2 - x1) // 5) * 2 + 1)
        blurred = cv2.GaussianBlur(roi, (k, k), 0)
        out[y1:y2, x1:x2] = blurred
    return out


def process_image_bytes(data: bytes) -> bytes:
    if not CV2_AVAILABLE:
        return data

    image = Image.open(io.BytesIO(data)).convert("RGB")
    np_img = np.array(image)

    boxes = _detect_boxes(np_img)
    print(f"[PROCESS] Detected {len(boxes)} boxes")

    if not boxes:
        buf = io.BytesIO()
        image.save(buf, format="JPEG")
        return buf.getvalue()

    blurred_np = _blur_boxes(np_img, boxes)
    blurred_img = Image.fromarray(blurred_np)

    buf = io.BytesIO()
    blurred_img.save(buf, format="JPEG")
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════
# 5.2. Интеграция Remove.bg в pipeline обработки
# ══════════════════════════════════════════════════════════════════
# WHY: Remove.bg вызывается ПОСЛЕ YOLO-блюра, чтобы:
# 1. Лица/номера уже размыты → на Remove.bg уходит безопасное изображение
# 2. Если Remove.bg упадёт — пользователь всё равно получит заблюренный результат
# 3. Graceful degradation: ошибка Remove.bg НЕ ломает основной pipeline
# ══════════════════════════════════════════════════════════════════


def _apply_remove_bg(image_data: bytes) -> Tuple[bytes, bool]:
    """
    Пытается удалить фон через Remove.bg API.

    Returns:
        (result_bytes, bg_was_removed)

    Никогда не бросает исключения — при ошибке возвращает
    исходные данные с bg_was_removed=False.
    """
    if not removebg_service.is_available():
        logger.info("[PROCESS] Remove.bg not available, skipping")
        return image_data, False

    try:
        result: RemoveBgResult = removebg_service.remove_background(image_data)

        if result.success and result.image_data:
            logger.info(
                f"[PROCESS] Background removed successfully. "
                f"Output: {len(result.image_data)} bytes. "
                f"Credits remaining: {result.credits_remaining}"
            )
            return result.image_data, True
        else:
            logger.warning(
                f"[PROCESS] Remove.bg returned error: {result.error_message}. "
                f"Using original image."
            )
            return image_data, False

    except RemoveBgError as e:
        logger.warning(f"[PROCESS] Remove.bg error: {e}. Using original image.")
        return image_data, False

    except Exception as e:
        logger.error(f"[PROCESS] Unexpected Remove.bg error: {e}", exc_info=True)
        return image_data, False


def _guess_media_type(filename: str) -> str:
    ext = os.path.splitext(filename.lower())[1]
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "unknown"


def process_media_item(media_id: int, remove_bg: bool = False):
    """
    Обрабатывает медиа-файл: YOLO blur + опционально Remove.bg.

    Args:
        media_id: ID записи в БД
        remove_bg: Нужно ли удалять фон (передаётся с фронтенда)
    """
    started_at = time.time()

    db = SessionLocal()
    try:
        item: mdl.MediaItem | None = (
            db.query(mdl.MediaItem)
            .filter(mdl.MediaItem.id == media_id)
            .first()
        )
        if not item or not item.original_filename:
            return

        media_type = _guess_media_type(item.original_filename)
        original_data = storage.download_bytes(item.original_object_name)
        print(f"[PROCESS] Downloaded {len(original_data)} bytes for media #{media_id}")

        bg_was_removed = False

        if media_type == "image":
            # Шаг 1: YOLO blur (лица + номера)
            processed_data = process_image_bytes(original_data)

            # Шаг 2: Remove.bg (опционально)
            if remove_bg:
                processed_data, bg_was_removed = _apply_remove_bg(processed_data)

            # Если Remove.bg вернул PNG, сохраняем как PNG
            output_filename = item.original_filename
            if bg_was_removed and not output_filename.lower().endswith(".png"):
                # Меняем расширение на .png (т.к. фон прозрачный)
                base = os.path.splitext(output_filename)[0]
                output_filename = f"{base}.png"

            processed_object_name = storage.upload_bytes(
                processed_data,
                filename=output_filename,
                user_id=item.user_id,
            )
        else:
            # Видео — пока без Remove.bg
            processed_object_name = storage.upload_bytes(
                original_data,
                filename=item.original_filename,
                user_id=item.user_id,
            )

        item.processed_object_name = processed_object_name
        item.processed = True
        item.bg_removed = bg_was_removed

        db.add(item)
        db.commit()

        elapsed = time.time() - started_at
        if elapsed < MIN_PROCESSING_SECONDS:
            time.sleep(MIN_PROCESSING_SECONDS - elapsed)

        print(
            f"[PROCESS] Media #{media_id} done. "
            f"bg_removed={bg_was_removed}, elapsed={elapsed:.1f}s"
        )

    except Exception:
        print("PROCESSING ERROR:")
        traceback.print_exc()
    finally:
        db.close()