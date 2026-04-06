"""
Контрольный regression/smoke-набор для итоговой проверки лабораторной.

Назначение:
- подтвердить, что ключевые сценарии приложения работают;
- подтвердить, что ограничения безопасности соблюдаются;
- дать короткий, понятный набор проверок для финального прогона.

Этот файл НЕ заменяет остальные тесты.
Он агрегирует самые критичные проверки по пунктам 7.1 и 7.2.
"""

import pytest

from tests.conftest import (
    create_user_in_db,
    create_media_in_db,
    login_user,
    login_full,
    auth_header,
)


@pytest.mark.integration
class TestCriticalScenarios:
    def test_register_login_get_me_flow_works(self, client):
        register_resp = client.post(
            "/api/auth/register",
            json={
                "username": "finaluser",
                "email": "finaluser@test.com",
                "password": "pass123",
            },
        )
        assert register_resp.status_code == 201

        login_resp = client.post(
            "/api/auth/login",
            json={
                "email": "finaluser@test.com",
                "password": "pass123",
            },
        )
        assert login_resp.status_code == 200

        access_token = login_resp.json()["access_token"]

        me_resp = client.get("/api/users/me", headers=auth_header(access_token))
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "finaluser@test.com"

    def test_media_list_endpoint_available_for_authorized_user(
        self, client, db_session
    ):
        create_user_in_db(db_session, "mediauser", "mediauser@test.com", "pass")
        token = login_user(client, "mediauser@test.com", "pass")

        resp = client.get("/api/media/", headers=auth_header(token))

        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_admin_user_management_flow_works(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "target", "target@test.com", "pass")

        token = login_user(client, "admin@test.com", "pass")

        list_resp = client.get("/api/users/", headers=auth_header(token))
        assert list_resp.status_code == 200

        role_resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert role_resp.status_code == 200
        assert role_resp.json()["role"] == "admin"


@pytest.mark.security
class TestSecurityRestrictions:
    def test_guest_cannot_access_protected_route(self, client):
        resp = client.get("/api/users/me")
        assert resp.status_code in (401, 403)

    def test_regular_user_cannot_access_admin_endpoints(self, client, db_session):
        create_user_in_db(db_session, "user", "user@test.com", "pass")
        token = login_user(client, "user@test.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 403

    def test_user_cannot_access_foreign_media(self, client, db_session):
        owner = create_user_in_db(db_session, "owner", "owner@test.com", "pass")
        item = create_media_in_db(db_session, owner.id, original_filename="secret.jpg")

        token = login_user(client, "intruder@test.com", "pass")
        resp = client.get(f"/api/media/{item.id}", headers=auth_header(token))

        assert resp.status_code == 403

    def test_refresh_token_reuse_detection_still_protects_sessions(
        self, client, db_session
    ):
        create_user_in_db(db_session, "reuse", "reuse@test.com", "pass")

        _, rt1 = login_full(client, "reuse@test.com", "pass")

        resp1 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp1.status_code == 200
        rt2 = resp1.json()["refresh_token"]

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp2.status_code == 401

        resp3 = client.post("/api/auth/refresh", json={"refresh_token": rt2})
        assert resp3.status_code == 401
