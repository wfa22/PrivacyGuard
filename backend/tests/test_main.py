"""
Тесты для PrivacyGuard.

Покрывают:
6.1 — вход с корректными и некорректными учетными данными
6.2 — доступ к защищённым ресурсам с валидным и невалидным access token
6.3 — обновление access token через refresh token (ротация)
6.4 — отзыв сессии при выходе и блокирование дальнейшего обновления
6.5 — проверка ограничений ролей и запрет операций вне полномочий
7.1 — существующая функциональность MVP сохранена
7.2 — сессии обрабатываются предсказуемо и безопасно
7.3 — клиентская и серверная части используют единые правила доступа
ЛР3 — фильтрация, пагинация, CRUD, валидация
"""

import os
import sys
import io
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from core.database import Base, get_db
from models.models import User
from services.auth_service import hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


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


# ══════════════════════════════════════════════════
# FIXTURES & HELPERS
# ══════════════════════════════════════════════════
@pytest.fixture(autouse=True)
def setup_database():
    # Гарантируем, что ИМЕННО наш override активен
    app.dependency_overrides[get_db] = override_get_db
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


def create_user_in_db(db, username, email, password, role="user"):
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


def login_user(client_, email, password):
    resp = client_.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def login_full(client_, email, password):
    """Возвращает оба токена: (access_token, refresh_token)."""
    resp = client_.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    return data["access_token"], data["refresh_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════════════
# 6.1 — ВХОД С КОРРЕКТНЫМИ И НЕКОРРЕКТНЫМИ ДАННЫМИ
# ══════════════════════════════════════════════════
class TestLogin:
    """6.1 — вход с корректными и некорректными учетными данными."""

    def test_login_correct_credentials(self, client, db_session):
        """Корректный email + пароль → 200 + оба токена."""
        create_user_in_db(db_session, "user1", "user1@test.com", "password123")

        resp = client.post("/api/auth/login", json={
            "email": "user1@test.com",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"

    def test_login_wrong_password(self, client, db_session):
        """Неверный пароль → 401."""
        create_user_in_db(db_session, "user2", "user2@test.com", "correct")

        resp = client.post("/api/auth/login", json={
            "email": "user2@test.com",
            "password": "wrong",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_email(self, client):
        """Несуществующий email → 401."""
        resp = client.post("/api/auth/login", json={
            "email": "nobody@test.com",
            "password": "any",
        })
        assert resp.status_code == 401

    def test_login_empty_password(self, client, db_session):
        """Пустой пароль → 401 или 422."""
        create_user_in_db(db_session, "user3", "user3@test.com", "pass")

        resp = client.post("/api/auth/login", json={
            "email": "user3@test.com",
            "password": "",
        })
        assert resp.status_code in (401, 422)

    def test_login_invalid_email_format(self, client):
        """Невалидный формат email → 422."""
        resp = client.post("/api/auth/login", json={
            "email": "not-an-email",
            "password": "pass",
        })
        assert resp.status_code == 422

    def test_register_then_login(self, client):
        """Регистрация + вход тем же паролем → работает."""
        client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@test.com",
            "password": "mypass",
        })

        resp = client.post("/api/auth/login", json={
            "email": "new@test.com",
            "password": "mypass",
        })
        assert resp.status_code == 200

    def test_register_duplicate_email(self, client):
        """Повторная регистрация с тем же email → 400."""
        payload = {"username": "u1", "email": "dup@test.com", "password": "pass"}
        assert client.post("/api/auth/register", json=payload).status_code == 201

        payload["username"] = "u2"
        assert client.post("/api/auth/register", json=payload).status_code == 400

    def test_register_always_user_role(self, client):
        """Регистрация всегда даёт role=user."""
        resp = client.post("/api/auth/register", json={
            "username": "newbie",
            "email": "newbie@test.com",
            "password": "pass",
        })
        assert resp.status_code == 201
        assert resp.json()["role"] == "user"


# ══════════════════════════════════════════════════
# 6.2 — ДОСТУП С ВАЛИДНЫМ И НЕВАЛИДНЫМ ACCESS TOKEN
# ══════════════════════════════════════════════════
class TestAccessToken:
    """6.2 — доступ к защищённым ресурсам с валидным/невалидным AT."""

    def test_valid_token_access(self, client, db_session):
        """Валидный AT → доступ к /users/me."""
        create_user_in_db(db_session, "valid", "valid@test.com", "pass")
        token = login_user(client, "valid@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["email"] == "valid@test.com"

    def test_no_token(self, client):
        """Без токена → 401/403."""
        resp = client.get("/api/users/me")
        assert resp.status_code in (401, 403)

    def test_invalid_token(self, client):
        """Мусорный токен → 401."""
        resp = client.get("/api/users/me", headers=auth_header("invalid.token.here"))
        assert resp.status_code == 401

    def test_random_string_token(self, client):
        """Произвольная строка → 401."""
        resp = client.get("/api/users/me", headers=auth_header("abc123"))
        assert resp.status_code == 401

    def test_refresh_token_cannot_be_used_as_access(self, client, db_session):
        """7.2 — Refresh token нельзя использовать как access token."""
        create_user_in_db(db_session, "rtuser", "rt@test.com", "pass")
        _, refresh_token = login_full(client, "rt@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(refresh_token))
        assert resp.status_code == 401

    def test_no_token_on_all_protected_endpoints(self, client):
        """Без токена все защищённые endpoint'ы возвращают 401/403."""
        endpoints = [
            ("GET", "/api/users/me"),
            ("GET", "/api/users/"),
            ("GET", "/api/media/"),
            ("DELETE", "/api/media/1"),
            ("PATCH", "/api/users/1/role"),
            ("DELETE", "/api/users/1"),
        ]
        for method, url in endpoints:
            resp = client.request(method, url)
            assert resp.status_code in (401, 403), f"{method} {url} returned {resp.status_code}"


# ══════════════════════════════════════════════════
# 6.3 — ОБНОВЛЕНИЕ ACCESS TOKEN ЧЕРЕЗ REFRESH TOKEN
# ══════════════════════════════════════════════════
class TestRefreshToken:
    """6.3 — обновление AT через RT + ротация."""

    def test_refresh_returns_new_tokens(self, client, db_session):
        """Refresh выдаёт новую пару AT + RT."""
        create_user_in_db(db_session, "ref1", "ref1@test.com", "pass")
        _, rt = login_full(client, "ref1@test.com", "pass")

        resp = client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert resp.status_code == 200

        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_new_access_token_works(self, client, db_session):
        """Новый AT после refresh работает для доступа к API."""
        create_user_in_db(db_session, "ref2", "ref2@test.com", "pass")
        _, rt = login_full(client, "ref2@test.com", "pass")

        refresh_resp = client.post("/api/auth/refresh", json={"refresh_token": rt})
        new_at = refresh_resp.json()["access_token"]

        resp = client.get("/api/users/me", headers=auth_header(new_at))
        assert resp.status_code == 200
        assert resp.json()["username"] == "ref2"

    def test_old_refresh_token_revoked_after_rotation(self, client, db_session):
        """6.3 — После ротации старый RT больше не принимается."""
        create_user_in_db(db_session, "rot1", "rot1@test.com", "pass")
        _, old_rt = login_full(client, "rot1@test.com", "pass")

        resp1 = client.post("/api/auth/refresh", json={"refresh_token": old_rt})
        assert resp1.status_code == 200

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": old_rt})
        assert resp2.status_code == 401

    def test_chained_rotation(self, client, db_session):
        """Цепочка ротаций: RT₁→RT₂→RT₃ работает."""
        create_user_in_db(db_session, "chain", "chain@test.com", "pass")
        _, rt = login_full(client, "chain@test.com", "pass")

        for i in range(3):
            resp = client.post("/api/auth/refresh", json={"refresh_token": rt})
            assert resp.status_code == 200, f"Rotation {i+1} failed"
            rt = resp.json()["refresh_token"]

        final_at = resp.json()["access_token"]
        resp = client.get("/api/users/me", headers=auth_header(final_at))
        assert resp.status_code == 200

    def test_invalid_refresh_token(self, client):
        """Невалидный RT → 401."""
        resp = client.post("/api/auth/refresh", json={"refresh_token": "garbage"})
        assert resp.status_code == 401

    def test_access_token_cannot_be_used_as_refresh(self, client, db_session):
        """AT нельзя использовать вместо RT для refresh."""
        create_user_in_db(db_session, "atref", "atref@test.com", "pass")
        at, _ = login_full(client, "atref@test.com", "pass")

        resp = client.post("/api/auth/refresh", json={"refresh_token": at})
        assert resp.status_code == 401


# ══════════════════════════════════════════════════
# 6.4 — LOGOUT И БЛОКИРОВАНИЕ ДАЛЬНЕЙШЕГО ОБНОВЛЕНИЯ
# ══════════════════════════════════════════════════
class TestLogout:
    """6.4 — отзыв сессии при выходе."""

    def test_logout_revokes_refresh_token(self, client, db_session):
        """После logout старый RT не принимается для refresh."""
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

    def test_logout_does_not_affect_other_sessions(self, client, db_session):
        """Logout одной сессии не отзывает другую."""
        create_user_in_db(db_session, "multi", "multi@test.com", "pass")

        at1, rt1 = login_full(client, "multi@test.com", "pass")
        at2, rt2 = login_full(client, "multi@test.com", "pass")

        client.post(
            "/api/auth/logout",
            json={"refresh_token": rt1},
            headers=auth_header(at1),
        )

        resp = client.post("/api/auth/refresh", json={"refresh_token": rt2})
        assert resp.status_code == 200

    def test_relogin_after_logout(self, client, db_session):
        """После logout можно залогиниться заново."""
        create_user_in_db(db_session, "relog", "relog@test.com", "pass")
        at, rt = login_full(client, "relog@test.com", "pass")

        client.post(
            "/api/auth/logout",
            json={"refresh_token": rt},
            headers=auth_header(at),
        )

        at2, rt2 = login_full(client, "relog@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(at2))
        assert resp.status_code == 200

    def test_reuse_detection_revokes_all(self, client, db_session):
        """7.2 — Повторное использование отозванного RT отзывает ВСЕ сессии."""
        create_user_in_db(db_session, "reuse", "reuse@test.com", "pass")
        _, rt1 = login_full(client, "reuse@test.com", "pass")

        resp1 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp1.status_code == 200
        rt2 = resp1.json()["refresh_token"]

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp2.status_code == 401

        resp3 = client.post("/api/auth/refresh", json={"refresh_token": rt2})
        assert resp3.status_code == 401


# ══════════════════════════════════════════════════
# 6.5 — ОГРАНИЧЕНИЯ РОЛЕЙ
# ══════════════════════════════════════════════════
class TestRoleRestrictions:
    """6.5 — проверка ограничений ролей."""

    def test_user_can_get_own_profile(self, client, db_session):
        create_user_in_db(db_session, "u1", "u1@test.com", "pass")
        token = login_user(client, "u1@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))
        assert resp.status_code == 200

    def test_user_cannot_list_users(self, client, db_session):
        create_user_in_db(db_session, "u2", "u2@test.com", "pass")
        token = login_user(client, "u2@test.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 403

    def test_user_cannot_view_other_profile(self, client, db_session):
        user_a = create_user_in_db(db_session, "uA", "a@test.com", "pass")
        create_user_in_db(db_session, "uB", "b@test.com", "pass")
        token_b = login_user(client, "b@test.com", "pass")

        resp = client.get(f"/api/users/{user_a.id}", headers=auth_header(token_b))
        assert resp.status_code == 403

    def test_user_cannot_change_roles(self, client, db_session):
        target = create_user_in_db(db_session, "target", "target@test.com", "pass")
        create_user_in_db(db_session, "attacker", "attacker@test.com", "pass")
        token = login_user(client, "attacker@test.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_user_cannot_delete_users(self, client, db_session):
        victim = create_user_in_db(db_session, "victim", "victim@test.com", "pass")
        create_user_in_db(db_session, "hacker", "hacker@test.com", "pass")
        token = login_user(client, "hacker@test.com", "pass")

        resp = client.delete(f"/api/users/{victim.id}", headers=auth_header(token))
        assert resp.status_code == 403

    def test_user_cannot_self_promote(self, client, db_session):
        user = create_user_in_db(db_session, "sneaky", "sneaky@test.com", "pass")
        token = login_user(client, "sneaky@test.com", "pass")

        resp = client.patch(
            f"/api/users/{user.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_admin_can_list_users(self, client, db_session):
        create_user_in_db(db_session, "adm", "adm@test.com", "pass", role="admin")
        create_user_in_db(db_session, "reg", "reg@test.com", "pass")
        token = login_user(client, "adm@test.com", "pass")

        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_admin_can_view_any_user(self, client, db_session):
        create_user_in_db(db_session, "adm2", "adm2@test.com", "pass", role="admin")
        regular = create_user_in_db(db_session, "someone", "someone@test.com", "pass")
        token = login_user(client, "adm2@test.com", "pass")

        resp = client.get(f"/api/users/{regular.id}", headers=auth_header(token))
        assert resp.status_code == 200

    def test_admin_can_change_role(self, client, db_session):
        create_user_in_db(db_session, "boss", "boss@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "promoted", "promoted@test.com", "pass")
        token = login_user(client, "boss@test.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_admin_can_demote_other_admin(self, client, db_session):
        create_user_in_db(db_session, "a1", "a1@test.com", "pass", role="admin")
        other = create_user_in_db(db_session, "a2", "a2@test.com", "pass", role="admin")
        token = login_user(client, "a1@test.com", "pass")

        resp = client.patch(
            f"/api/users/{other.id}/role",
            json={"role": "user"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "user"

    def test_admin_cannot_demote_self(self, client, db_session):
        admin = create_user_in_db(db_session, "self", "self@test.com", "pass", role="admin")
        token = login_user(client, "self@test.com", "pass")

        resp = client.patch(
            f"/api/users/{admin.id}/role",
            json={"role": "user"},
            headers=auth_header(token),
        )
        assert resp.status_code == 400

    def test_admin_can_delete_user(self, client, db_session):
        create_user_in_db(db_session, "deladm", "deladm@test.com", "pass", role="admin")
        victim = create_user_in_db(db_session, "todel", "todel@test.com", "pass")
        token = login_user(client, "deladm@test.com", "pass")

        resp = client.delete(f"/api/users/{victim.id}", headers=auth_header(token))
        assert resp.status_code == 204

    def test_admin_cannot_delete_self(self, client, db_session):
        admin = create_user_in_db(db_session, "nodel", "nodel@test.com", "pass", role="admin")
        token = login_user(client, "nodel@test.com", "pass")

        resp = client.delete(f"/api/users/{admin.id}", headers=auth_header(token))
        assert resp.status_code == 400

    def test_admin_invalid_role(self, client, db_session):
        create_user_in_db(db_session, "radm", "radm@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "nr", "nr@test.com", "pass")
        token = login_user(client, "radm@test.com", "pass")

        resp = client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "superuser"},
            headers=auth_header(token),
        )
        assert resp.status_code == 400

    def test_nonexistent_user_role_change(self, client, db_session):
        create_user_in_db(db_session, "ra", "ra@test.com", "pass", role="admin")
        token = login_user(client, "ra@test.com", "pass")

        resp = client.patch(
            "/api/users/99999/role",
            json={"role": "admin"},
            headers=auth_header(token),
        )
        assert resp.status_code == 404


# ══════════════════════════════════════════════════
# 7.1 — MVP СОХРАНЁН
# ══════════════════════════════════════════════════
class TestMVPPreserved:
    """7.1 — существующая функциональность MVP сохранена."""

    def test_register_works(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "mvpuser",
            "email": "mvp@test.com",
            "password": "pass123",
        })
        assert resp.status_code == 201
        assert resp.json()["username"] == "mvpuser"

    def test_login_works(self, client, db_session):
        create_user_in_db(db_session, "mvplogin", "mvplogin@test.com", "secret")

        resp = client.post("/api/auth/login", json={
            "email": "mvplogin@test.com",
            "password": "secret",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_get_me_works(self, client, db_session):
        create_user_in_db(db_session, "mvpme", "mvpme@test.com", "pass")
        token = login_user(client, "mvpme@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "mvpme"
        assert resp.json()["role"] == "user"

    def test_refresh_works(self, client, db_session):
        create_user_in_db(db_session, "mvpref", "mvpref@test.com", "pass")
        _, rt = login_full(client, "mvpref@test.com", "pass")

        resp = client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_media_endpoints_accessible(self, client, db_session):
        """Список медиа доступен (ответ — пагинированный объект)."""
        create_user_in_db(db_session, "mvpmedia", "mvpmedia@test.com", "pass")
        token = login_user(client, "mvpmedia@test.com", "pass")

        resp = client.get("/api/media/", headers=auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "pages" in data
        assert isinstance(data["items"], list)


# ══════════════════════════════════════════════════
# 7.2 — СЕССИИ ПРЕДСКАЗУЕМЫ И БЕЗОПАСНЫ
# ══════════════════════════════════════════════════
class TestSessionSecurity:
    """7.2 — сессии обрабатываются предсказуемо и безопасно."""

    def test_refresh_token_not_accepted_as_access(self, client, db_session):
        create_user_in_db(db_session, "sec1", "sec1@test.com", "pass")
        _, rt = login_full(client, "sec1@test.com", "pass")

        resp = client.get("/api/users/me", headers=auth_header(rt))
        assert resp.status_code == 401

    def test_access_token_not_accepted_as_refresh(self, client, db_session):
        create_user_in_db(db_session, "sec2", "sec2@test.com", "pass")
        at, _ = login_full(client, "sec2@test.com", "pass")

        resp = client.post("/api/auth/refresh", json={"refresh_token": at})
        assert resp.status_code == 401

    def test_reuse_detection(self, client, db_session):
        create_user_in_db(db_session, "sec3", "sec3@test.com", "pass")
        _, rt1 = login_full(client, "sec3@test.com", "pass")

        resp1 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp1.status_code == 200
        rt2 = resp1.json()["refresh_token"]

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
        assert resp2.status_code == 401

        resp3 = client.post("/api/auth/refresh", json={"refresh_token": rt2})
        assert resp3.status_code == 401

    def test_role_change_revokes_sessions(self, client, db_session):
        create_user_in_db(db_session, "adm_rc", "adm_rc@test.com", "pass", role="admin")
        target = create_user_in_db(db_session, "tgt_rc", "tgt_rc@test.com", "pass")
        admin_token = login_user(client, "adm_rc@test.com", "pass")

        _, target_rt = login_full(client, "tgt_rc@test.com", "pass")

        client.patch(
            f"/api/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(admin_token),
        )

        resp = client.post("/api/auth/refresh", json={"refresh_token": target_rt})
        assert resp.status_code == 401

    def test_multiple_sessions_independent(self, client, db_session):
        create_user_in_db(db_session, "ms", "ms@test.com", "pass")

        at1, rt1 = login_full(client, "ms@test.com", "pass")
        at2, rt2 = login_full(client, "ms@test.com", "pass")

        assert client.get("/api/users/me", headers=auth_header(at1)).status_code == 200
        assert client.get("/api/users/me", headers=auth_header(at2)).status_code == 200

        assert client.post("/api/auth/refresh", json={"refresh_token": rt1}).status_code == 200
        assert client.post("/api/auth/refresh", json={"refresh_token": rt2}).status_code == 200


# ══════════════════════════════════════════════════
# 7.3 — ЕДИНЫЕ ПРАВИЛА ДОСТУПА
# ══════════════════════════════════════════════════
class TestUnifiedAccessRules:
    """7.3 — клиентская и серверная части используют единые правила."""

    def test_media_isolation_user_sees_own(self, client, db_session):
        create_user_in_db(db_session, "own", "own@test.com", "pass")
        create_user_in_db(db_session, "oth", "oth@test.com", "pass")

        token_own = login_user(client, "own@test.com", "pass")
        token_oth = login_user(client, "oth@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_own),
            files={"file": ("test.jpg", io.BytesIO(b"data"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]

        resp2 = client.get(f"/api/media/{media_id}", headers=auth_header(token_oth))
        assert resp2.status_code == 403

    def test_media_isolation_user_cannot_delete_other(self, client, db_session):
        create_user_in_db(db_session, "fo", "fo@test.com", "pass")
        create_user_in_db(db_session, "st", "st@test.com", "pass")

        token_fo = login_user(client, "fo@test.com", "pass")
        token_st = login_user(client, "st@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_fo),
            files={"file": ("p.png", io.BytesIO(b"png"), "image/png")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]
        resp2 = client.delete(f"/api/media/{media_id}", headers=auth_header(token_st))
        assert resp2.status_code == 403

    def test_admin_can_access_any_media(self, client, db_session):
        create_user_in_db(db_session, "mo", "mo@test.com", "pass")
        create_user_in_db(db_session, "ma", "ma@test.com", "pass", role="admin")

        token_mo = login_user(client, "mo@test.com", "pass")
        token_ma = login_user(client, "ma@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_mo),
            files={"file": ("d.jpg", io.BytesIO(b"jpg"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]
        resp2 = client.get(f"/api/media/{media_id}", headers=auth_header(token_ma))
        assert resp2.status_code == 200


# ══════════════════════════════════════════════════
# ЛР3 — ФИЛЬТРАЦИЯ, ПОИСК, СОРТИРОВКА, ПАГИНАЦИЯ
# ══════════════════════════════════════════════════
class TestMediaFiltering:
    """ЛР3 — корректность фильтрации, поиска, сортировки и пагинации."""

    def test_paginated_response_structure(self, client, db_session):
        """GET /media/ возвращает корректную структуру пагинации."""
        create_user_in_db(db_session, "pg1", "pg1@test.com", "pass")
        token = login_user(client, "pg1@test.com", "pass")

        resp = client.get("/api/media/", headers=auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 10
        assert data["pages"] == 0

    def test_custom_page_size(self, client, db_session):
        """Можно указать свой page_size."""
        create_user_in_db(db_session, "pg2", "pg2@test.com", "pass")
        token = login_user(client, "pg2@test.com", "pass")

        resp = client.get("/api/media/?page_size=5", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["page_size"] == 5

    def test_invalid_sort_by_returns_400(self, client, db_session):
        """Невалидный sort_by → 400."""
        create_user_in_db(db_session, "sf1", "sf1@test.com", "pass")
        token = login_user(client, "sf1@test.com", "pass")

        resp = client.get("/api/media/?sort_by=hacked_field", headers=auth_header(token))
        assert resp.status_code == 400

    def test_invalid_sort_order_returns_400(self, client, db_session):
        """Невалидный sort_order → 400."""
        create_user_in_db(db_session, "so1", "so1@test.com", "pass")
        token = login_user(client, "so1@test.com", "pass")

        resp = client.get("/api/media/?sort_order=sideways", headers=auth_header(token))
        assert resp.status_code == 400

    def test_invalid_file_type_returns_400(self, client, db_session):
        """Невалидный file_type → 400."""
        create_user_in_db(db_session, "ft1", "ft1@test.com", "pass")
        token = login_user(client, "ft1@test.com", "pass")

        resp = client.get("/api/media/?file_type=audio", headers=auth_header(token))
        assert resp.status_code == 400

    def test_page_too_small_returns_422(self, client, db_session):
        """page=0 → 422 (FastAPI Query ge=1)."""
        create_user_in_db(db_session, "pv1", "pv1@test.com", "pass")
        token = login_user(client, "pv1@test.com", "pass")

        resp = client.get("/api/media/?page=0", headers=auth_header(token))
        assert resp.status_code == 422

    def test_page_size_too_large_returns_422(self, client, db_session):
        """page_size=200 → 422 (FastAPI Query le=100)."""
        create_user_in_db(db_session, "pv2", "pv2@test.com", "pass")
        token = login_user(client, "pv2@test.com", "pass")

        resp = client.get("/api/media/?page_size=200", headers=auth_header(token))
        assert resp.status_code == 422

    def test_search_empty_string(self, client, db_session):
        """Пустая строка поиска → без ошибки, возвращает все."""
        create_user_in_db(db_session, "se1", "se1@test.com", "pass")
        token = login_user(client, "se1@test.com", "pass")

        resp = client.get("/api/media/?search=", headers=auth_header(token))
        assert resp.status_code == 200

    def test_filter_processed_false(self, client, db_session):
        """Фильтр processed=false работает без ошибки."""
        create_user_in_db(db_session, "fp1", "fp1@test.com", "pass")
        token = login_user(client, "fp1@test.com", "pass")

        resp = client.get("/api/media/?processed=false", headers=auth_header(token))
        assert resp.status_code == 200

    def test_filter_processed_true(self, client, db_session):
        """Фильтр processed=true работает без ошибки."""
        create_user_in_db(db_session, "fp2", "fp2@test.com", "pass")
        token = login_user(client, "fp2@test.com", "pass")

        resp = client.get("/api/media/?processed=true", headers=auth_header(token))
        assert resp.status_code == 200

    def test_filter_by_file_type_image(self, client, db_session):
        """Фильтр file_type=image работает."""
        create_user_in_db(db_session, "fti1", "fti1@test.com", "pass")
        token = login_user(client, "fti1@test.com", "pass")

        resp = client.get("/api/media/?file_type=image", headers=auth_header(token))
        assert resp.status_code == 200

    def test_filter_by_file_type_video(self, client, db_session):
        """Фильтр file_type=video работает."""
        create_user_in_db(db_session, "ftv1", "ftv1@test.com", "pass")
        token = login_user(client, "ftv1@test.com", "pass")

        resp = client.get("/api/media/?file_type=video", headers=auth_header(token))
        assert resp.status_code == 200

    def test_sort_by_id_asc(self, client, db_session):
        """Сортировка по id asc работает."""
        create_user_in_db(db_session, "sid1", "sid1@test.com", "pass")
        token = login_user(client, "sid1@test.com", "pass")

        resp = client.get("/api/media/?sort_by=id&sort_order=asc", headers=auth_header(token))
        assert resp.status_code == 200

    def test_combined_filters(self, client, db_session):
        """Комбинация нескольких фильтров работает."""
        create_user_in_db(db_session, "comb1", "comb1@test.com", "pass")
        token = login_user(client, "comb1@test.com", "pass")

        resp = client.get(
            "/api/media/?search=test&processed=false&file_type=image"
            "&sort_by=created_at&sort_order=desc&page=1&page_size=5",
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 5


# ══════════════════════════════════════════════════
# ЛР3 — CRUD-ОПЕРАЦИИ С МЕДИА
# ══════════════════════════════════════════════════
class TestMediaCRUD:
    """ЛР3 — корректность CRUD-операций с пользовательскими данными."""

    def test_upload_unsupported_type_rejected(self, client, db_session):
        """Загрузка неподдерживаемого MIME-типа → 400."""
        create_user_in_db(db_session, "cr1", "cr1@test.com", "pass")
        token = login_user(client, "cr1@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF-data"), "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_get_nonexistent_media_returns_404(self, client, db_session):
        """GET /media/99999 → 404."""
        create_user_in_db(db_session, "cr2", "cr2@test.com", "pass")
        token = login_user(client, "cr2@test.com", "pass")

        resp = client.get("/api/media/99999", headers=auth_header(token))
        assert resp.status_code == 404

    def test_delete_nonexistent_media_returns_404(self, client, db_session):
        """DELETE /media/99999 → 404."""
        create_user_in_db(db_session, "cr3", "cr3@test.com", "pass")
        token = login_user(client, "cr3@test.com", "pass")

        resp = client.delete("/api/media/99999", headers=auth_header(token))
        assert resp.status_code == 404

    def test_update_nonexistent_media_returns_404(self, client, db_session):
        """PATCH /media/99999 → 404."""
        create_user_in_db(db_session, "cr4", "cr4@test.com", "pass")
        token = login_user(client, "cr4@test.com", "pass")

        resp = client.patch(
            "/api/media/99999",
            headers=auth_header(token),
            json={"description": "new desc"},
        )
        assert resp.status_code == 404

    def test_update_other_user_media_denied(self, client, db_session):
        """PATCH чужого файла → 403."""
        create_user_in_db(db_session, "own_cr5", "own_cr5@test.com", "pass")
        create_user_in_db(db_session, "oth_cr5", "oth_cr5@test.com", "pass")

        token_own = login_user(client, "own_cr5@test.com", "pass")
        token_oth = login_user(client, "oth_cr5@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token_own),
            files={"file": ("t.jpg", io.BytesIO(b"img"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]

        resp2 = client.patch(
            f"/api/media/{media_id}",
            headers=auth_header(token_oth),
            json={"description": "hacked"},
        )
        assert resp2.status_code == 403

    def test_upload_and_get_returns_metadata(self, client, db_session):
        """После загрузки GET возвращает метаданные (file_type, file_size и т.д.)."""
        create_user_in_db(db_session, "meta1", "meta1@test.com", "pass")
        token = login_user(client, "meta1@test.com", "pass")

        content = b"fake-image-content-for-test"
        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
            data={"description": "Test photo"},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        data = resp.json()
        assert data["file_type"] == "image"
        assert data["file_size"] == len(content)
        assert data["content_type"] == "image/jpeg"
        assert data["description"] == "Test photo"
        assert data["original_filename"] == "photo.jpg"

    def test_upload_and_update_description(self, client, db_session):
        """PATCH обновляет описание файла."""
        create_user_in_db(db_session, "upd1", "upd1@test.com", "pass")
        token = login_user(client, "upd1@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("img.png", io.BytesIO(b"png-data"), "image/png")},
            data={"description": "old desc"},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]

        resp2 = client.patch(
            f"/api/media/{media_id}",
            headers=auth_header(token),
            json={"description": "updated desc"},
        )
        assert resp2.status_code == 200
        assert resp2.json()["description"] == "updated desc"

    def test_upload_and_delete(self, client, db_session):
        """Загрузка → удаление → GET возвращает 404."""
        create_user_in_db(db_session, "del1", "del1@test.com", "pass")
        token = login_user(client, "del1@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("rm.jpg", io.BytesIO(b"data"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        media_id = resp.json()["id"]

        resp2 = client.delete(f"/api/media/{media_id}", headers=auth_header(token))
        assert resp2.status_code == 204

        resp3 = client.get(f"/api/media/{media_id}", headers=auth_header(token))
        assert resp3.status_code == 404

    def test_upload_appears_in_list(self, client, db_session):
        """Загруженный файл появляется в пагинированном списке."""
        create_user_in_db(db_session, "lst1", "lst1@test.com", "pass")
        token = login_user(client, "lst1@test.com", "pass")

        resp = client.post(
            "/api/media/upload",
            headers=auth_header(token),
            files={"file": ("list.jpg", io.BytesIO(b"jpg"), "image/jpeg")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip("MinIO not available")

        resp2 = client.get("/api/media/", headers=auth_header(token))
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1