from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PrivacyGuard API"
    DEBUG: bool = True
    # DATABASE_URL: str = "sqlite:///./app.db"

settings = Settings()
