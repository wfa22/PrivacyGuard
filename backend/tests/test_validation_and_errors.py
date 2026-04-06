import pytest

from tests.conftest import create_user_in_db, login_user, auth_header


@pytest.mark.integration
@pytest.mark.security
class TestValidationAndErrors:
    def test_invalid_email_login_returns_400(self, client):
        resp = client.post(
            "/api/auth/login",
            json={
                "email": "not-an-email",
                "password": "pass",
            },
        )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error"] is True
        assert data["status_code"] == 400
        assert data["detail"] == "Validation error"
        assert "errors" in data

    def test_invalid_register_payload_returns_400(self, client):
        resp = client.post("/api/auth/register", json={"username": "abc"})

        assert resp.status_code == 400
        data = resp.json()
        assert data["detail"] == "Validation error"
        assert "errors" in data

    def test_invalid_page_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/?page=0", headers=auth_header(token))

        assert resp.status_code == 400
        data = resp.json()
        assert data["detail"] == "Validation error"

    def test_invalid_page_size_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/?page_size=200", headers=auth_header(token))

        assert resp.status_code == 400
        data = resp.json()
        assert data["detail"] == "Validation error"

    def test_invalid_sort_by_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/?sort_by=hacked", headers=auth_header(token))

        assert resp.status_code == 400
        assert "Invalid sort_by" in resp.json()["detail"]

    def test_invalid_sort_order_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/?sort_order=sideways", headers=auth_header(token))

        assert resp.status_code == 400
        assert "Invalid sort_order" in resp.json()["detail"]

    def test_invalid_file_type_filter_returns_400(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/?file_type=audio", headers=auth_header(token))

        assert resp.status_code == 400
        assert "Invalid file_type" in resp.json()["detail"]

    def test_unknown_api_endpoint_returns_404(self, client):
        resp = client.get("/api/does/not/exist")

        assert resp.status_code == 404
        data = resp.json()
        assert data["error"] is True
        assert data["status_code"] == 404

    def test_missing_token_returns_403_or_401(self, client):
        resp = client.get("/api/users/me")
        assert resp.status_code in (401, 403)

    def test_invalid_token_returns_401(self, client):
        resp = client.get(
            "/api/users/me", headers={"Authorization": "Bearer bad.token"}
        )
        assert resp.status_code == 401

    def test_nonexistent_media_returns_404(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/media/99999", headers=auth_header(token))

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Media not found"
