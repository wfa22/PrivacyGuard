from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from routers import auth, users, media
from core.config import settings
from core.database import Base, engine

# Инициализация базы данных
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="PrivacyGuard API",
    version="0.2.0",
    docs_url=None,  # Отключаем стандартный docs_url, создадим кастомный
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory="static"), name="static")

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


# Кастомный Swagger UI с исправлением для multipart запросов
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    """
    Кастомный Swagger UI с исправлением для передачи токена в multipart запросах
    """
    html_response = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )
    
    # Добавляем кастомный JavaScript для исправления multipart запросов
    # Версия 2.5 - токен перехватывается в реальном времени при вводе в модальном окне
    fix_script = '<script src="/static/swagger-fix.js?v=2.5"></script>'
    
    # Получаем HTML контент и модифицируем его
    # HTMLResponse.body может быть bytes или str
    if isinstance(html_response.body, bytes):
        html_content = html_response.body.decode('utf-8')
    else:
        html_content = str(html_response.body)

    html_content = html_content.replace("\ufeff", "")
    
    html_content = html_content.replace('</body>', fix_script + '</body>')
    
    return HTMLResponse(content=html_content)


@app.get("/docs/oauth2-redirect", include_in_schema=False)
async def swagger_ui_redirect():
    try:
        from fastapi.openapi.docs import get_swagger_ui_oauth2_redirect_html
        return get_swagger_ui_oauth2_redirect_html()
    except ImportError:
        return HTMLResponse(content="", status_code=200)
