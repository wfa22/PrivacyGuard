import pytest
from fastapi import HTTPException

from repositories.user_repository import UserRepository
from repositories.token_repository import TokenRepository
from services.user_service import UserService
from tests.conftest import create_user_in_db


@pytest.mark.unit
class TestUserService:
    def test_list_all_returns_users(self, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        create_user_in_db(db_session, "u2", "u2@test.com", "pass", role="admin")

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        users = service.list_all()

        assert len(users) == 2

    def test_get_by_id_returns_user(self, db_session):
        user = create_user_in_db(db_session, "u1", "u1@test.com", "pass")

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        found = service.get_by_id(user.id)

        assert found.id == user.id
        assert found.email == "u1@test.com"

    def test_get_by_id_not_found_raises_404(self, db_session):
        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        with pytest.raises(HTTPException) as exc:
            service.get_by_id(99999)

        assert exc.value.status_code == 404

    @pytest.mark.security
    def test_change_role_updates_role(self, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )
        user = create_user_in_db(
            db_session, "user", "user@test.com", "pass", role="user"
        )

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        updated = service.change_role(user.id, "admin", admin)

        assert updated.role == "admin"

    def test_change_role_invalid_role_raises_400(self, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )
        user = create_user_in_db(
            db_session, "user", "user@test.com", "pass", role="user"
        )

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        with pytest.raises(HTTPException) as exc:
            service.change_role(user.id, "superuser", admin)

        assert exc.value.status_code == 400

    @pytest.mark.security
    def test_admin_cannot_demote_self(self, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        with pytest.raises(HTTPException) as exc:
            service.change_role(admin.id, "user", admin)

        assert exc.value.status_code == 400
        assert "cannot remove admin role from yourself" in exc.value.detail.lower()

    def test_delete_user_removes_user(self, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )
        victim = create_user_in_db(db_session, "victim", "victim@test.com", "pass")

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        service.delete_user(victim.id, admin)

        assert UserRepository(db_session).get_by_id(victim.id) is None

    @pytest.mark.security
    def test_delete_self_raises_400(self, db_session):
        admin = create_user_in_db(
            db_session, "admin", "admin@test.com", "pass", role="admin"
        )

        service = UserService(
            user_repo=UserRepository(db_session),
            token_repo=TokenRepository(db_session),
        )

        with pytest.raises(HTTPException) as exc:
            service.delete_user(admin.id, admin)

        assert exc.value.status_code == 400
