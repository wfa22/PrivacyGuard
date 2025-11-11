from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.security import OAuth2PasswordBearer

from routers import auth, users, items, demo, media
from core.config import settings
from core.database import Base, engine

# Инициализация базы данных
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="PrivacyGuard API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(users.router, prefix="/api", tags=["Users"])
app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo"])
app.include_router(media.router, prefix="/api", tags=["Media"])


@app.get("/")
def root():
    return {"message": "Backend structure ready"}


# OAuth2 схема для Swagger
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Кастомное описание OpenAPI, чтобы Swagger подставлял токен
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version="0.2.0",
        description="PrivacyGuard API",
        routes=app.routes,
    )

    # Добавляем схему BearerAuth
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT"
        }
    }

    # Применяем BearerAuth ко всем методам, кроме публичных
    for path, path_item in openapi_schema["paths"].items():
        for method_name, method_obj in path_item.items():
            # Исключаем публичные эндпоинты
            if not any(public_path in path for public_path in ["/auth/login", "/auth/register", "/docs", "/redoc", "/openapi.json"]):
                method_obj.setdefault("security", [{"BearerAuth": []}])

    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
