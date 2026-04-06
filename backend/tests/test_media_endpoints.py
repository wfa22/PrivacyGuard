import io
import pytest

from tests.conftest import (
    create_user_in_db,
    create_media_in_db,
    login_user,
    auth_header,
)


@pytest.mark.integration
class TestMediaEndpoints:
    def test_list_media_returns_paginated_structure(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/", headers=auth_header(token))

        assert resp.status_code == 200
        data = resp.json()
        assert {"items", "total", "page", "page_size", "pages"} <= set(data.keys())
        assert isinstance(data["items"], list)

    def test_upload_image_returns_201_and_structure(self, client, db_session, monkeypatch):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        class FakeStorage:
            def upload_fileobj(self, file_obj, filename, user_id):
                return f"{user_id}/original/{filename}"

            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("photo.jpg", io.BytesIO(b"image-bytes"), "image/jpeg")},
            data={"description": "test upload", "remove_bg": "false"},
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["original_filename"] == "photo.jpg"
        assert data["file_type"] == "image"
        assert data["content_type"] == "image/jpeg"
        assert data["description"] == "test upload"
        assert data["processed"] is False

    def test_upload_unsupported_type_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )

        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_get_own_media_returns_200(self, client, db_session, monkeypatch):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="img.jpg")
        token = login_user(client, "u1@test.com", "pass")

        class FakeStorage:
            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.get(f"/api/media/{item.id}", headers=auth_header(token))

        assert resp.status_code == 200
        assert resp.json()["id"] == item.id

    @pytest.mark.security
    def test_user_cannot_access_other_media(self, client, db_session, monkeypatch):
        owner = create_user_in_db(db_session, "owner", "owner@test.com", "pass")
        other = create_user_in_db(db_session, "other", "other@test.com", "pass")
        item = create_media_in_db(db_session, owner.id, original_filename="img.jpg")
        token = login_user(client, "other@test.com", "pass")

        class FakeStorage:
            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.get(f"/api/media/{item.id}", headers=auth_header(token))

        assert resp.status_code == 403

    @pytest.mark.security
    def test_admin_can_access_any_media(self, client, db_session, monkeypatch):
        owner = create_user_in_db(db_session, "owner", "owner@test.com", "pass")
        admin = create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        item = create_media_in_db(db_session, owner.id, original_filename="img.jpg")
        token = login_user(client, "admin@test.com", "pass")

        class FakeStorage:
            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.get(f"/api/media/{item.id}", headers=auth_header(token))

        assert resp.status_code == 200

    def test_patch_media_updates_description(self, client, db_session, monkeypatch):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="img.jpg", description="old")
        token = login_user(client, "u1@test.com", "pass")

        class FakeStorage:
            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.patch(
            f"/api/media/{item.id}",
            headers=auth_header(token),
            json={"description": "new"},
        )

        assert resp.status_code == 200
        assert resp.json()["description"] == "new"

    def test_delete_media_returns_204(self, client, db_session, monkeypatch):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="img.jpg", processed=True)
        token = login_user(client, "u1@test.com", "pass")

        class FakeStorage:
            def delete_object(self, object_name):
                return None

            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.delete(f"/api/media/{item.id}", headers=auth_header(token))

        assert resp.status_code == 204

    def test_download_media_returns_file_response(self, client, db_session, monkeypatch):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        item = create_media_in_db(db_session, user.id, original_filename="img.jpg", processed=True)
        token = login_user(client, "u1@test.com", "pass")

        class FakeStream(io.BytesIO):
            def close(self):
                super().close()

        class FakeStorage:
            def get_file_stream(self, object_name):
                return FakeStream(b"file-content")

            def get_presigned_url(self, object_name, expires=3600):
                return f"http://test.local/{object_name}"

        monkeypatch.setattr("routers.media.StorageService", lambda: FakeStorage())
        monkeypatch.setattr("services.media_service.StorageService", lambda: FakeStorage())

        resp = client.get(f"/api/media/{item.id}/download", headers=auth_header(token))

        assert resp.status_code == 200
        assert resp.headers["content-disposition"].startswith("attachment;")