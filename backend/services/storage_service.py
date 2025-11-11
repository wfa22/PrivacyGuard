import uuid
from minio import Minio
from typing import IO

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
        self.client.put_object(self.bucket, object_name, file_obj, length=-1, part_size=10*1024*1024)
        return object_name

    def get_presigned_url(self, object_name: str, expires: int = 3600) -> str:
        return self.client.presigned_get_object(self.bucket, object_name, expires=expires)
