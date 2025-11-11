import uuid
from minio import Minio
from typing import IO
from datetime import timedelta 

from core.config import settings

class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE
        )
        self.bucket = settings.MINIO_BUCKET
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def upload_fileobj(self, file_obj: IO, filename: str) -> str:
        object_name = f"{uuid.uuid4()}_{filename}"

        # get size
        file_obj.seek(0, 2)
        size = file_obj.tell()
        file_obj.seek(0)

        self.client.put_object(
            self.bucket,
            object_name,
            file_obj,
            length=size,
            part_size=10*1024*1024
        )
        return object_name

    def get_presigned_url(self, object_name, expires=3600):
        return self.client.presigned_get_object(
            self.bucket,
            object_name,
            expires=timedelta(seconds=expires)
        )