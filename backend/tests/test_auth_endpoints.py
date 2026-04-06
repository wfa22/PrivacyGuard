import pytest

from tests.conftest import create_user_in_db, login_full, login_user, auth_header


@pytest.mark.integration
class TestAuthEndpoints:
    def test_register_returns_201_and_user_structure(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@test.com",
            "password": "mypass123",
        })

        assert resp.status_code == 201
        data = resp.json()
        assert {"id", "username", "email", "role"} <= set(data.keys())
        assert data["username"] == "newuser"
        assert data["role"] == "user"

    def test_login_returns_token_structure(self, client, db_session):
        create_user_in_db(db_session, "user1", "user1@test.com", "password123")

        resp = client.post("/api/auth/login", json={
            "email": "user1@test.com",
            "password": "password123",
        })

        assert resp.status_code == 200
        data = resp.json()
        assert {"access_token", "refresh_token", "token_type"} <= set(data.keys())
        assert data["token_type"] == "Bearer"

    def test_login_wrong_password_returns_401(self, client, db_session):
        create_user_in_db(db_session, "user2", "user2@test.com", "correct")

        resp = client.post("/api/auth/login", json={
            "email": "user2@test.com",
            "password": "wrong",
        })

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid credentials"

    @pytest.mark.security
    def test_refresh_returns_new_tokens(self, client, db_session):
        create_user_in_db(db_session, "ref1", "ref1@test.com", "pass")
        _, rt = login_full(client, "ref1@test.com", "pass")

        resp = client.post("/api/auth/refresh", json={"refresh_token": rt})

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["refresh_token"] != rt

    @pytest.mark.security
    def test_logout_revokes_refresh_token(self, client, db_session):
        create_user_in_db(db_session, "logout1", "logout1@test.com", "pass")
        at, rt = login_full(client, "logout1@test.com", "pass")

        resp = client.post(
            "/api/auth/logout",
            json={"refresh_token": rt},
            headers=auth_header(at),
        )
        assert resp.status_code == 204

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert resp2.status_code == 401

    def test_users_me_requires_valid_access_token(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))

        assert resp.status_code == 200
        assert resp.json()["email"] == "u1@test.com"

    @pytest.mark.security
    def test_refresh_token_cannot_access_protected_endpoint(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        _, rt = login_full(client, "u1@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(rt))

        assert resp.status_code == 401