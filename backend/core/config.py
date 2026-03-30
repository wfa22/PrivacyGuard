from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "PrivacyGuard API"
    DEBUG: bool = True

    # SEO
    PUBLIC_URL: str = "https://privacyguard.com"

    # Database
    DATABASE_URL: str = "sqlite:///./app.db"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # MinIO / S3
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "privacyguard"
    MINIO_SECURE: bool = False

    # JWT
    JWT_SECRET: str = "super_secret_key_123"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # File upload limits
    MAX_FILE_SIZE_MB: int = 50

    # ══════════════════════════════════════════════════════════════
    # 5.3. Remove.bg API — ключи через переменные окружения
    # ══════════════════════════════════════════════════════════════
    # WHY: Ключи НЕ должны быть в коде / git.
    # Пустая строка = сервис отключён (graceful degradation).
    #
    # Для получения ключа: https://www.remove.bg/api#remove-background
    # Бесплатно: 50 запросов/месяц
    #
    # Установка:
    #   export REMOVEBG_API_KEY="your_key_here"
    #   или в .env: REMOVEBG_API_KEY=your_key_here
    #   или в docker-compose.yml: environment: REMOVEBG_API_KEY=...
    # ══════════════════════════════════════════════════════════════
    REMOVEBG_API_KEY: str = ""
    REMOVEBG_TIMEOUT_SECONDS: float = 30.0
    REMOVEBG_MAX_RETRIES: int = 2
    REMOVEBG_RATE_LIMIT_PER_MINUTE: int = 10

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()