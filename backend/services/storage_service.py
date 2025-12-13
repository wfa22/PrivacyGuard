import uuid
import os
import io
from typing import IO
from datetime import timedelta

from minio import Minio
from core.config import settings


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self.bucket = settings.MINIO_BUCKET

        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def build_object_name(self, user_id: int, filename: str) -> str:
        clean_name = os.path.basename(filename)
        file_uuid = uuid.uuid4()
        return f"{user_id}/{file_uuid}/{clean_name}"

    def upload_fileobj(self, file_obj: IO, filename: str, user_id: int) -> str:
        object_name = self.build_object_name(user_id, filename)

        file_obj.seek(0, 2)
        size = file_obj.tell()
        file_obj.seek(0)

        self.client.put_object(
            self.bucket,
            object_name,
            file_obj,
            length=size,
            part_size=10 * 1024 * 1024,
        )

        return object_name

    def upload_bytes(self, data: bytes, filename: str, user_id: int) -> str:
        """Залить готовые байты как объект."""
        buf = io.BytesIO(data)
        return self.upload_fileobj(buf, filename, user_id)

    def get_file_stream(self, object_name: str):
        """Стрим для скачивания через StreamingResponse."""
        return self.client.get_object(self.bucket, object_name)

    def get_presigned_url(self, object_name: str, expires: int = 3600) -> str:
        """URL для превью (если ты его используешь)."""
        return self.client.presigned_get_object(
            self.bucket,
            object_name,
            expires=timedelta(seconds=expires),
        )

    def download_bytes(self, object_name: str) -> bytes:
        """Скачать объект как bytes (для обработки)."""
        obj = self.client.get_object(self.bucket, object_name)
        try:
            data = obj.read()
        finally:
            obj.close()
            obj.release_conn()
        return data
