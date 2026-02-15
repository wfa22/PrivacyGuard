"""
Тесты RBAC для PrivacyGuard.

Покрывают:
  5.1 — существующая функциональность MVP не нарушена
  5.2 — права доступа применяются стабильно для всех ролей
  5.3 — неавторизованные и недостаточно привилегированные действия блокируются
"""

import os
import sys
import io
import pytest

# ── Чтобы импорты backend работали ──
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Переключаем на тестовую SQLite in-memory ДО импорта приложения ──
os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from core.database import Base, get_db
from models.models import User
from services.auth_service import hash_password

# ── Тестовая БД in-memory с общим соединением ──
# StaticPool + check_same_thread=False нужны, чтобы in-memory БД
# была доступна из разных потоков/соединений
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Включаем поддержку FK для SQLite (по умолчанию выключена)
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ══════════════════════════════════════════════════
# FIXTURES
# ══════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def setup_database():
    """Пересоздаём таблицы перед каждым тестом."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_user_in_db(db, username: str, email: str, password: str, role: str = "user") -> User:
    """Хелпер: создаёт пользователя напрямую в БД."""
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(client_: TestClient, email: str, password: str) -> str:
    """Хелпер: логинит пользователя и возвращает access_token."""
    resp = client_.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    """Хелпер: заголовок авторизации."""
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════════════
# 5.1 — СУЩЕСТВУЮЩАЯ ФУНКЦИОНАЛЬНОСТЬ НЕ НАРУШЕНА
# ══════════════════════════════════════════════════

class TestBasicFunctionality:
    """Проверяем, что базовые сценарии MVP работают после RBAC."""

    def test_register_new_user(self, client):
        """Регистрация нового пользователя работает."""
        resp = client.post("/api/auth/register", json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "password123",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert data["role"] == "user"  # по умолчанию user

    def test_register_duplicate_email(self, client):
        """Повторная регистрация с тем же email — 400."""
        payload = {"username": "user1", "email": "dup@example.com", "password": "pass123"}
        resp1 = client.post("/api/auth/register", json=payload)
        assert resp1.status_code == 201

        payload["username"] = "user2"
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code == 400

    def test_login_success(self, client, db_session):
        """Логин с корректными данными возвращает токены."""
        create_user_in_db(db_session, "loginuser", "login@example.com", "secret")

        resp = client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "secret",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"

    def test_login_wrong_password(self, client, db_session):
        """Логин с неверным паролем — 401."""
        create_user_in_db(db_session, "wrongpass", "wrong@example.com", "correct")

        resp = client.post("/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "incorrect",
        })
        assert resp.status_code == 401

    def test_get_current_user(self, client, db_session):
        """GET /api/users/me возвращает текущего пользователя."""
        create_user_in_db(db_session, "meuser", "me@example.com", "pass123")
        token = login_user(client, "me@example.com", "pass123")

        resp = client.get("/api/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "meuser"
        assert data["role"] == "user"

    def test_refresh_token(self, client, db_session):
        """Refresh token выдаёт новую пару токенов."""
        create_user_in_db(db_session, "refreshuser", "refresh@example.com", "pass")
        login_resp = client.post("/api/auth/login", json={
            "email": "refresh@example.com",
            "password": "pass",
        })
        refresh_token = login_resp.json()["refresh_token"]

        resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        assert "access_token" in resp.json()


# ══════════════════════════════════════════════════
# 5.2 — ПРАВА ДОСТУПА СТАБИЛЬНЫ ДЛЯ ВСЕХ РОЛЕЙ
# ══════════════════════════════════════════════════

class TestUserRolePermissions:
    """Проверяем, что обычный user может делать то, что ему разрешено."""

    def test_user_can_get_own_profile(self, client, db_session):
        create_user_in_db(db_session, "user1", "user1@example.com", "pass")
        token = login_user(client, "user1@example.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "user1"

    def test_user_cannot_list_all_users(self, client, db_session):
        """User не может получить список всех пользователей — 403."""
        create_user_in_db(db_session, "user2", "user2@example.com", "pass")
        token = login_user(client, "user2@example.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 403

    def test_user_cannot_get_other_user_profile(self, client, db_session):
        """User не может смотреть чужой профиль — 403."""
        user1 = create_user_in_db(db_session, "userA", "a@example.com", "pass")
        create_user_in_db(db_session, "userB", "b@example.com", "pass")
        token_b = login_user(client, "b@example.com", "pass")

        resp = client.get(f"/api/users/{user1.id}", headers=auth_header(token_b))
        assert resp.status_code == 403

    def test_user_cannot_change_roles(self, client, db_session):
        """User не может менять роли — 403."""
        user1 = create_user_in_db(db_session, "target", "target@example.com", "pass")
        create_user_in_db(db_session, "attacker", "attacker@example.com", "pass")
        token = login_user(client, "attacker@example.com", "pass")

        resp = client.patch(
            f"/api/users/{user1.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_user_cannot_delete_other_users(self, client, db_session):
        """User не может удалять пользователей — 403."""
        victim = create_user_in_db(db_session, "victim", "victim@example.com", "pass")
        create_user_in_db(db_session, "hacker", "hacker@example.com", "pass")
        token = login_user(client, "hacker@example.com", "pass")

        resp = client.delete(f"/api/users/{victim.id}", headers=auth_header(token))
        assert resp.status_code == 403


class TestAdminRolePermissions:
    """Проверяем, что admin может делать всё что ему разрешено."""

    def test_admin_can_list_all_users(self, client, db_session):
        """Admin может получить список всех пользователей."""
        create_user_in_db(db_session, "admin1", "admin@example.com", "pass", role="admin")
        create_user_in_db(db_session, "regular", "regular@example.com", "pass")
        token = login_user(client, "admin@example.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 200
        users = resp.json()
        assert len(users) == 2

    def test_admin_can_view_any_user(self, client, db_session):
        """Admin может просматривать любой профиль."""
        create_user_in_db(db_session, "admin2", "admin2@example.com", "pass", role="admin")
        regular = create_user_in_db(db_session, "somebody", "somebody@example.com", "pass")
        token = login_user(client, "admin2@example.com", "pass")

        resp = client.get(f"/api/users/{regular.id}", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "somebody"

    def test_admin_can_change_user_role(self, client, db_session):
        """Admin может менять роли других пользователей."""
        create_user_in_db(db_session, "superadmin", "super@example.com", "pass", role="admin")
        target = create_user_in_db(db_session, "promoted", "promoted@example.com", "pass")
        token = login_user(client, "super@example.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_admin_can_demote_other_admin(self, client, db_session):
        """Admin может понизить другого админа до user."""
        create_user_in_db(db_session, "boss", "boss@example.com", "pass", role="admin")
        other_admin = create_user_in_db(db_session, "admin2", "admin2@example.com", "pass", role="admin")
        token = login_user(client, "boss@example.com", "pass")

        resp = client.patch(
            f"/api/users/{other_admin.id}/role",
            json={"role": "user"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "user"

    def test_admin_cannot_demote_self(self, client, db_session):
        """Admin не может снять роль admin с самого себя."""
        admin = create_user_in_db(db_session, "selfadmin", "self@example.com", "pass", role="admin")
        token = login_user(client, "self@example.com", "pass")

        resp = client.patch(
            f"/api/users/{admin.id}/role",
            json={"role": "user"},
            headers=auth_header(token),
        )
        assert resp.status_code == 400

    def test_admin_can_delete_user(self, client, db_session):
        """Admin может удалить пользователя."""
        create_user_in_db(db_session, "deladmin", "deladmin@example.com", "pass", role="admin")
        victim = create_user_in_db(db_session, "todelete", "todelete@example.com", "pass")
        token = login_user(client, "deladmin@example.com", "pass")

        resp = client.delete(f"/api/users/{victim.id}", headers=auth_header(token))
        assert resp.status_code == 204

    def test_admin_cannot_delete_self(self, client, db_session):
        """Admin не может удалить самого себя."""
        admin = create_user_in_db(db_session, "nodelete", "nodelete@example.com", "pass", role="admin")
        token = login_user(client, "nodelete@example.com", "pass")

        resp = client.delete(f"/api/users/{admin.id}", headers=auth_header(token))
        assert resp.status_code == 400

    def test_admin_change_to_invalid_role(self, client, db_session):
        """Нельзя назначить несуществующую роль."""
        create_user_in_db(db_session, "roleadmin", "roleadmin@example.com", "pass", role="admin")
        target = create_user_in_db(db_session, "norole", "norole@example.com", "pass")
        token = login_user(client, "roleadmin@example.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "superuser"},
            headers=auth_header(token),
        )
        assert resp.status_code == 400


# ══════════════════════════════════════════════════
# 5.3 — НЕАВТОРИЗОВАННЫЕ ДЕЙСТВИЯ БЛОКИРУЮТСЯ
# ══════════════════════════════════════════════════

class TestUnauthorizedAccess:
    """Проверяем, что без токена ничего не работает."""

    def test_no_token_users_me(self, client):
        """GET /api/users/me без токена — 401 или 403."""
        resp = client.get("/api/users/me")
        assert resp.status_code in (401, 403)

    def test_no_token_users_list(self, client):
        """GET /api/users/ без токена — 401 или 403."""
        resp = client.get("/api/users/")
        assert resp.status_code in (401, 403)

    def test_no_token_media_list(self, client):
        """GET /api/media/ без токена — 401 или 403."""
        resp = client.get("/api/media/")
        assert resp.status_code in (401, 403)

    def test_no_token_media_upload(self, client):
        """POST /api/media/upload без токена — 401 или 403."""
        resp = client.post("/api/media/upload")
        assert resp.status_code in (401, 403, 422)

    def test_no_token_media_delete(self, client):
        """DELETE /api/media/1 без токена — 401 или 403."""
        resp = client.delete("/api/media/1")
        assert resp.status_code in (401, 403)

    def test_no_token_change_role(self, client):
        """PATCH /api/users/1/role без токена — 401 или 403."""
        resp = client.patch("/api/users/1/role", json={"role": "admin"})
        assert resp.status_code in (401, 403)

    def test_no_token_delete_user(self, client):
        """DELETE /api/users/1 без токена — 401 или 403."""
        resp = client.delete("/api/users/1")
        assert resp.status_code in (401, 403)

    def test_invalid_token(self, client):
        """Невалидный токен — 401."""
        resp = client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401

    def test_expired_token_format(self, client):
        """Произвольная строка вместо JWT — 401."""
        resp = client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer abc123"},
        )
        assert resp.status_code == 401


class TestMediaAccessControl:
    """Проверяем изоляцию медиа-файлов между пользователями."""

    def test_user_sees_only_own_media(self, client, db_session):
        """User видит только свои файлы в списке."""
        create_user_in_db(db_session, "owner", "owner@example.com", "pass")
        create_user_in_db(db_session, "other", "other@example.com", "pass")

        token_owner = login_user(client, "owner@example.com", "pass")
        token_other = login_user(client, "other@example.com", "pass")

        # Owner загружает файл
        file_content = b"fake image content"
        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_owner),
            files={"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")},
        )
        # Может быть 201 или ошибка MinIO (в тестах нет MinIO)
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available in test environment")

        media_id = resp.json()["id"]

        # Other пытается получить чужой файл
        resp2 = client.get(f"/api/media/{media_id}", headers=auth_header(token_other))
        assert resp2.status_code == 403

    def test_user_cannot_delete_other_media(self, client, db_session):
        """User не может удалить чужой файл."""
        create_user_in_db(db_session, "fileowner", "fileowner@example.com", "pass")
        create_user_in_db(db_session, "stranger", "stranger@example.com", "pass")

        token_owner = login_user(client, "fileowner@example.com", "pass")
        token_stranger = login_user(client, "stranger@example.com", "pass")

        # Owner загружает файл
        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_owner),
            files={"file": ("photo.png", io.BytesIO(b"png data"), "image/png")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available in test environment")

        media_id = resp.json()["id"]

        # Stranger пытается удалить
        resp2 = client.delete(f"/api/media/{media_id}", headers=auth_header(token_stranger))
        assert resp2.status_code == 403

    def test_admin_can_access_any_media(self, client, db_session):
        """Admin может просматривать чужие файлы."""
        create_user_in_db(db_session, "mediaowner", "mediaowner@example.com", "pass")
        create_user_in_db(db_session, "mediaadmin", "mediaadmin@example.com", "pass", role="admin")

        token_owner = login_user(client, "mediaowner@example.com", "pass")
        token_admin = login_user(client, "mediaadmin@example.com", "pass")

        # Owner загружает файл
        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_owner),
            files={"file": ("doc.jpg", io.BytesIO(b"jpg data"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available in test environment")

        media_id = resp.json()["id"]

        # Admin может его просмотреть
        resp2 = client.get(f"/api/media/{media_id}", headers=auth_header(token_admin))
        assert resp2.status_code == 200


class TestRoleEscalationPrevention:
    """Проверяем, что нельзя повысить себе права."""

    def test_user_cannot_self_promote(self, client, db_session):
        """User не может сам себе назначить роль admin."""
        user = create_user_in_db(db_session, "sneaky", "sneaky@example.com", "pass")
        token = login_user(client, "sneaky@example.com", "pass")

        resp = client.patch(
            f"/api/users/{user.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_registered_user_is_always_user_role(self, client):
        """Новый зарегистрированный пользователь всегда получает роль 'user'."""
        resp = client.post("/api/auth/register", json={
            "username": "newbie",
            "email": "newbie@example.com",
            "password": "pass123",
        })
        assert resp.status_code == 201
        assert resp.json()["role"] == "user"

    def test_nonexistent_user_role_change(self, client, db_session):
        """Смена роли несуществующего пользователя — 404."""
        create_user_in_db(db_session, "realadmin", "realadmin@example.com", "pass", role="admin")
        token = login_user(client, "realadmin@example.com", "pass")

        resp = client.patch(
            "/api/users/99999/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 404