import os
import sys
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from core.database import Base, get_db
from models.models import User, MediaItem
from services.auth_service import hash_password

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["DATABASE_URL"] = "sqlite://"

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


TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


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


@pytest.fixture
def fake_storage(monkeypatch):
    class FakeFile:
        def __init__(self, data=b"fake-bytes"):
            self._data = data
            self.closed = False

        def read(self):
            return self._data

        def close(self):
            self.closed = True

        def release_conn(self):
            pass

    class FakeStorage:
        def __init__(self):
            self.deleted = []
            self.uploaded = []

        def upload_fileobj(self, file_obj, filename, user_id):
            self.uploaded.append((filename, user_id))
            return f"{user_id}/original/{filename}"

        def upload_bytes(self, data, filename, user_id):
            self.uploaded.append((filename, user_id))
            return f"{user_id}/processed/{filename}"

        def get_presigned_url(self, object_name, expires=3600):
            return f"http://test.local/{object_name}?expires={expires}"

        def get_file_stream(self, object_name):
            return FakeFile(b"download-data")

        def download_bytes(self, object_name):
            return b"source-image-bytes"

        def delete_object(self, object_name):
            self.deleted.append(object_name)

    storage = FakeStorage()
    monkeypatch.setattr("services.media_service.StorageService", lambda: storage)
    return storage


@pytest.fixture
def fake_processing(monkeypatch):
    calls = []

    def _fake_process_media_item(media_id: int, remove_bg: bool = False):
        calls.append({"media_id": media_id, "remove_bg": remove_bg})

    monkeypatch.setattr("routers.media.process_media_item", _fake_process_media_item)
    return calls


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


def create_media_in_db(
        db,
        user_id: int,
        original_filename: str = "file.jpg",
        processed: bool = False,
        file_type: str = "image",
        file_size: int = 1234,
        content_type: str = "image/jpeg",
        description: str | None = None,
        bg_removed: bool = False,
):
    item = MediaItem(
        user_id=user_id,
        original_object_name=f"{user_id}/original/{original_filename}",
        original_filename=original_filename,
        processed=processed,
        processed_object_name=(
            f"{user_id}/processed/{original_filename}" if processed else None
        ),
        file_type=file_type,
        file_size=file_size,
        content_type=content_type,
        description=description,
        bg_removed=bg_removed,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def login_user(client_, email, password):
    resp = client_.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def login_full(client_, email, password):
    resp = client_.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    return data["access_token"], data["refresh_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}
