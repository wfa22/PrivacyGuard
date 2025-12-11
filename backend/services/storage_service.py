import uuid
import os
from typing import IO

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

    def get_file_stream(self, object_name: str):
        """
        Вернуть поток файла из MinIO (для скачивания через backend).
        """
        return self.client.get_object(self.bucket, object_name)
