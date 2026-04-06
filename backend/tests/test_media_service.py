import io
import pytest
from fastapi import HTTPException

from repositories.media_repository import MediaRepository
from services.media_service import MediaService
from tests.conftest import create_user_in_db, create_media_in_db


class DummyStorage:
    def __init__(self):
        self.deleted = []
        self.uploaded = []

    def upload_fileobj(self, file_obj, filename, user_id):
        self.uploaded.append((filename, user_id))
        return f"{user_id}/original/{filename}"

    def get_presigned_url(self, object_name, expires=3600):
        return f"http://test.local/{object_name}"

    def delete_object(self, object_name):
        self.deleted.append(object_name)

    def get_file_stream(self, object_name):
        return io.BytesIO(b"downloaded")

    def download_bytes(self, object_name):
        return b"raw"


@pytest.mark.unit
class TestMediaService:
    def test_upload_supported_image_creates_media(self, db_session):
        user = create_user_in_db(db_session, "imguser", "imguser@test.com", "pass")

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        item, response = service.upload(
            file_obj=io.BytesIO(b"img-data"),
            filename="photo.jpg",
            content_type="image/jpeg",
            file_size=8,
            user_id=user.id,
            description="test image",
        )

        assert item.id is not None
        assert item.user_id == user.id
        assert response.original_filename == "photo.jpg"
        assert response.file_type == "image"
        assert response.file_size == 8
        assert response.content_type == "image/jpeg"
        assert response.processed is False

    def test_upload_supported_video_creates_media(self, db_session):
        user = create_user_in_db(db_session, "videouser", "videouser@test.com", "pass")

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        item, response = service.upload(
            file_obj=io.BytesIO(b"video-data"),
            filename="clip.mp4",
            content_type="video/mp4",
            file_size=10,
            user_id=user.id,
            description="video",
        )

        assert item.id is not None
        assert item.user_id == user.id
        assert response.file_type == "video"
        assert response.original_filename == "clip.mp4"
        assert response.file_size == 10
        assert response.content_type == "video/mp4"

    def test_upload_unsupported_type_raises_400(self, db_session):
        user = create_user_in_db(db_session, "pdfuser", "pdfuser@test.com", "pass")

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        with pytest.raises(HTTPException) as exc:
            service.upload(
                file_obj=io.BytesIO(b"%PDF"),
                filename="doc.pdf",
                content_type="application/pdf",
                file_size=4,
                user_id=user.id,
            )

        assert exc.value.status_code == 400
        assert "unsupported file type" in exc.value.detail.lower()

    def test_upload_oversized_file_raises_400(self, db_session):
        user = create_user_in_db(db_session, "biguser", "biguser@test.com", "pass")

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        with pytest.raises(HTTPException) as exc:
            service.upload(
                file_obj=io.BytesIO(b"x"),
                filename="big.jpg",
                content_type="image/jpeg",
                file_size=999_999_999,
                user_id=user.id,
            )

        assert exc.value.status_code == 400
        assert "file too large" in exc.value.detail.lower()

    def test_user_can_get_own_media(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="a.jpg")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        response = service.get_media(item.id, user)

        assert response.id == item.id
        assert response.user_id == user.id

    @pytest.mark.security
    def test_user_cannot_get_other_media(self, db_session):
        owner = create_user_in_db(db_session, "owner", "owner@test.com", "pass")
        stranger = create_user_in_db(db_session, "other", "other@test.com", "pass")
        item = create_media_in_db(db_session, owner.id, original_filename="a.jpg")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        with pytest.raises(HTTPException) as exc:
            service.get_media(item.id, stranger)

        assert exc.value.status_code == 403

    @pytest.mark.security
    def test_admin_can_get_any_media(self, db_session):
        owner = create_user_in_db(db_session, "owner", "owner@test.com", "pass")
        admin = create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        item = create_media_in_db(db_session, owner.id, original_filename="a.jpg")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        response = service.get_media(item.id, admin)

        assert response.id == item.id

    def test_update_media_description(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="a.jpg")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        updated = service.update_media(item.id, user, description="new desc")

        assert updated.description == "new desc"

    def test_delete_media_removes_storage_objects(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(
            db_session,
            user.id,
            original_filename="a.jpg",
            processed=True,
        )

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        original_object_name = item.original_object_name
        processed_object_name = item.processed_object_name

        service.delete_media(item.id, user)

        assert original_object_name in storage.deleted
        assert processed_object_name in storage.deleted
        assert MediaRepository(db_session).get_by_id(item.id) is None

    def test_list_media_filtered_returns_paginated_response(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        create_media_in_db(db_session, user.id, original_filename="a.jpg")
        create_media_in_db(db_session, user.id, original_filename="b.jpg")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        response = service.list_media_filtered(user, page=1, page_size=10)

        assert response.total == 2
        assert response.page == 1
        assert response.page_size == 10
        assert len(response.items) == 2

    def test_list_media_filtered_invalid_sort_by_raises_400(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")

        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=DummyStorage(),
        )

        with pytest.raises(HTTPException) as exc:
            service.list_media_filtered(user, sort_by="hack")

        assert exc.value.status_code == 400

    def test_get_download_info_returns_processed_when_available(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(
            db_session,
            user.id,
            original_filename="a.jpg",
            processed=True,
        )

        storage = DummyStorage()
        service = MediaService(
            media_repo=MediaRepository(db_session),
            storage=storage,
        )

        file_obj, filename = service.get_download_info(item.id, user)

        assert filename == "a.jpg"
        assert file_obj.read() == b"downloaded"