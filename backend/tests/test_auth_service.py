import pytest
from fastapi import HTTPException

from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository
from services.auth_service import AuthService, verify_password


@pytest.mark.unit
class TestAuthService:
    def test_register_creates_user(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        user = service.register("alice", "alice@test.com", "secret123")

        assert user.id is not None
        assert user.username == "alice"
        assert user.email == "alice@test.com"
        assert user.role == "user"
        assert verify_password("secret123", user.password_hash)

    def test_register_duplicate_email_raises_400(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        service.register("alice", "alice@test.com", "secret123")

        with pytest.raises(HTTPException) as exc:
            service.register("alice2", "alice@test.com", "another")

        assert exc.value.status_code == 400
        assert "email already exists" in exc.value.detail.lower()

    def test_register_duplicate_username_raises_400(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        service.register("alice", "alice@test.com", "secret123")

        with pytest.raises(HTTPException) as exc:
            service.register("alice", "alice2@test.com", "another")

        assert exc.value.status_code == 400
        assert "username already exists" in exc.value.detail.lower()

    def test_login_returns_access_and_refresh_tokens(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )
        service.register("bob", "bob@test.com", "pass123")

        result = service.login("bob@test.com", "pass123", "pytest")

        assert "access_token" in result
        assert "refresh_token" in result
        assert result["token_type"] == "Bearer"

    def test_login_invalid_password_raises_401(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )
        service.register("bob", "bob@test.com", "pass123")

        with pytest.raises(HTTPException) as exc:
            service.login("bob@test.com", "wrongpass", "pytest")

        assert exc.value.status_code == 401
        assert exc.value.detail == "Invalid credentials"

    @pytest.mark.security
    def test_refresh_rotates_token(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )
        service.register("carol", "carol@test.com", "pass123")

        login_result = service.login("carol@test.com", "pass123", "device-1")
        old_rt = login_result["refresh_token"]

        refresh_result = service.refresh(old_rt, "device-1")

        assert "access_token" in refresh_result
        assert "refresh_token" in refresh_result
        assert refresh_result["refresh_token"] != old_rt

    @pytest.mark.security
    def test_refresh_reuse_detected_revokes_all(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )
        service.register("dave", "dave@test.com", "pass123")

        login_result = service.login("dave@test.com", "pass123", "device-1")
        old_rt = login_result["refresh_token"]

        next_result = service.refresh(old_rt, "device-1")
        new_rt = next_result["refresh_token"]

        with pytest.raises(HTTPException) as exc1:
            service.refresh(old_rt, "device-1")
        assert exc1.value.status_code == 401
        assert "reuse detected" in exc1.value.detail.lower()

        with pytest.raises(HTTPException) as exc2:
            service.refresh(new_rt, "device-1")
        assert exc2.value.status_code == 401

    @pytest.mark.security
    def test_logout_revokes_only_matching_user_token(self, db_session):
        service = AuthService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )
        user = service.register("eve", "eve@test.com", "pass123")

        login_result = service.login("eve@test.com", "pass123", "device-1")
        rt = login_result["refresh_token"]

        service.logout(rt, user.id)

        with pytest.raises(HTTPException) as exc:
            service.refresh(rt, "device-1")
        assert exc.value.status_code == 401