import pytest

from tests.conftest import create_user_in_db, login_user, auth_header


@pytest.mark.integration
@pytest.mark.security
class TestUsersEndpoints:
    def test_user_can_get_me(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))

        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "u1"
        assert data["role"] == "user"

    def test_user_cannot_list_users(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))

        assert resp.status_code == 403

    def test_admin_can_list_users(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        create_user_in_db(db_session, "user", "user@test.com", "pass")
        token = login_user(client, "admin@test.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_admin_can_change_user_role(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "user", "user@test.com", "pass")
        token = login_user(client, "admin@test.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )

        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_admin_cannot_demote_self(self, client, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )
        token = login_user(client, "admin@test.com", "pass")

        resp = client.patch(
            f"/api/users/{admin.id}/role",
            json={"role": "user"},
            headers=auth_header(token),
        )

        assert resp.status_code == 400

    def test_admin_can_delete_user(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "user", "user@test.com", "pass")
        token = login_user(client, "admin@test.com", "pass")

        resp = client.delete(
            f"/api/users/{target.id}",
            headers=auth_header(token),
        )

        assert resp.status_code == 204

    def test_admin_cannot_delete_self(self, client, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )
        token = login_user(client, "admin@test.com", "pass")

        resp = client.delete(
            f"/api/users/{admin.id}",
            headers=auth_header(token),
        )

        assert resp.status_code == 400

    def test_invalid_role_returns_400(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "user", "user@test.com", "pass")
        token = login_user(client, "admin@test.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "superuser"},
            headers=auth_header(token),
        )

        assert resp.status_code == 400

    def test_nonexistent_user_returns_404(self, client, db_session):
        create_user_in_db(db_session, "admin", "admin@test.com", "pass", role="admin")
        token = login_user(client, "admin@test.com", "pass")

        resp = client.get("/api/users/99999", headers=auth_header(token))

        assert resp.status_code == 404
