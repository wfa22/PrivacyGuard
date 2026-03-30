from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.utils import get_openapi
from fastapi.responses import PlainTextResponse, Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.gzip import GZipMiddleware

from routers import auth, users, media
from core.config import settings
from core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="PrivacyGuard API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════
# 4.3. СЖАТИЕ ОТВЕТОВ
# ══════════════════════════════════════════════════════════════════
# WHY: JSON-ответы API сжимаются в 3-5 раз с gzip.
# minimum_size=500 — не сжимаем маленькие ответы (overhead > выигрыш)
# Пример: список из 50 файлов: 15KB → 3KB
# ══════════════════════════════════════════════════════════════════
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(
    users.router,
    prefix="/api",
    tags=["Users"],
    dependencies=[Depends(auth.get_current_user)]
)
app.include_router(
    media.router,
    prefix="/api",
    tags=["Media"],
    dependencies=[Depends(auth.get_current_user)]
)


# ══════════════════════════════════════════════════════════════════
# 3.3. КОРРЕКТНЫЕ HTTP-СТАТУСЫ
# ══════════════════════════════════════════════════════════════════
#
# WHY: Поисковые боты используют HTTP-статусы для принятия решений:
# - 200: индексировать страницу
# - 301/302: следовать редиректу
# - 403: не индексировать, но не удалять из индекса
# - 404: удалить из индекса через время
# - 410: немедленно удалить из индекса (сильнее 404)
# - 5xx: временная ошибка, повторить позже
#
# Без кастомных обработчиков FastAPI возвращает 422 на валидацию
# и дефолтный текст для 404 — не информативно для ботов.
# ══════════════════════════════════════════════════════════════════


@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Единый обработчик HTTP-ошибок с корректными статусами.

    Для API-запросов (/api/*) возвращает JSON.
    Для остальных — JSON с правильным статус-кодом,
    который бот может интерпретировать.
    """
    error_messages = {
        400: "Bad Request",
        401: "Authentication required",
        403: "Access forbidden — insufficient permissions",
        404: "Resource not found",
        405: "Method not allowed",
        410: "Resource permanently removed",
        429: "Too many requests — rate limit exceeded",
        500: "Internal server error",
    }

    status_code = exc.status_code
    detail = exc.detail or error_messages.get(status_code, "Error")

    return JSONResponse(
        status_code=status_code,
        content={
            "error": True,
            "status_code": status_code,
            "detail": detail,
            # SEO: подсказка для дебага, не для пользователя
            "path": str(request.url.path),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    422 Validation Error → 400 Bad Request.

    WHY: 422 — нестандартный код, некоторые инструменты
    его не понимают. 400 — универсально понятен.
    """
    return JSONResponse(
        status_code=400,
        content={
            "error": True,
            "status_code": 400,
            "detail": "Validation error",
            "errors": [
                {
                    "field": ".".join(str(loc) for loc in err["loc"]),
                    "message": err["msg"],
                }
                for err in exc.errors()
            ],
        },
    )


# ══════════════════════════════════════════════════════════════════
# 3.1. SITEMAP.XML
# ══════════════════════════════════════════════════════════════════


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    """
    Статический sitemap для публичных страниц.

    Анализ (WHY):
    - Содержит ТОЛЬКО публичные индексируемые страницы
    - /censoring, /dashboard, /admin — НЕ включены (за auth)
    - /api/* — НЕ включены (не HTML)
    - priority: / = 1.0 (главная), /auth = 0.3 (утилитарная)
    - changefreq: реальная частота обновления контента
    - lastmod: дата последнего деплоя (хардкод, в production — автоматизировать)

    Edge cases:
    - Cache-Control: 24 часа — боты не будут дёргать каждый запрос
    - Content-Type: application/xml — обязательно для парсинга
    """
    base_url = settings.PUBLIC_URL.rstrip("/")

    # Публичные страницы с приоритетами
    pages = [
        {
            "loc": "/",
            "lastmod": "2025-03-29",
            "changefreq": "weekly",
            "priority": "1.0",
        },
        {
            "loc": "/auth",
            "lastmod": "2025-03-29",
            "changefreq": "monthly",
            "priority": "0.3",
        },
    ]

    url_entries = ""
    for page in pages:
        url_entries += f"""
  <url>
    <loc>{base_url}{page["loc"]}</loc>
    <lastmod>{page["lastmod"]}</lastmod>
    <changefreq>{page["changefreq"]}</changefreq>
    <priority>{page["priority"]}</priority>
  </url>"""

    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
{url_entries}
</urlset>"""

    return Response(
        content=xml_content.strip(),
        media_type="application/xml",
        headers={
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "X-Robots-Tag": "noindex",  # сам sitemap не нужно индексировать
        },
    )


# ══════════════════════════════════════════════════════════════════
# 3.2. ROBOTS.TXT
# ══════════════════════════════════════════════════════════════════


@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
def robots_txt():
    """
    robots.txt — инструкции для поисковых краулеров.

    Анализ (WHY):
    - Allow / и /auth — публичные страницы, нужна индексация
    - Disallow /api/ — API-эндпоинты, не HTML, не для индексации
    - Disallow /docs, /redoc — Swagger UI, служебные страницы
    - Disallow /censoring — за авторизацией, пользовательский контент
    - Disallow /dashboard — личные данные пользователей
    - Disallow /admin — админ-панель, RBAC
    - Disallow /static/ — JS/CSS бандлы, не самостоятельные страницы
    - Crawl-delay: 1 — вежливость, не DDoS-им сервер краулерами
    - Sitemap — автообнаружение для поисковиков

    Edge cases:
    - Googlebot игнорирует Crawl-delay (но другие боты — нет)
    - Disallow не гарантирует исключение из индекса
      (для гарантии нужен meta noindex, что мы уже сделали)
    - robots.txt кэшируется ботами на ~24 часа
    """
    base_url = settings.PUBLIC_URL.rstrip("/")

    content = f"""# PrivacyGuard robots.txt
# Docs: https://developers.google.com/search/docs/crawling-indexing/robots/intro

User-agent: *

# Публичные страницы — разрешены
Allow: /$
Allow: /auth$

# API — запрещено (не HTML)
Disallow: /api/

# Swagger/ReDoc — служебные
Disallow: /docs
Disallow: /redoc

# Закрытые страницы (за авторизацией)
Disallow: /censoring
Disallow: /dashboard
Disallow: /admin

# Статика (бандлы) — не нужна в индексе
Disallow: /static/

# Вежливость к серверу
Crawl-delay: 1

# Карта сайта
Sitemap: {base_url}/sitemap.xml
"""
    return content.strip()


# ══════════════════════════════════════════════════════════════════
# 3.4. JSON-LD API ENDPOINT
# ══════════════════════════════════════════════════════════════════
#
# JSON-LD основной уже встроен в HomePage.tsx (на клиенте).
# Здесь добавляем API-эндпоинт, который может использоваться
# для SSR или pre-rendering в будущем.
# ══════════════════════════════════════════════════════════════════


@app.get("/api/seo/structured-data", include_in_schema=False)
def get_structured_data():
    """
    Возвращает JSON-LD structured data для главной страницы.

    WHY: Этот эндпоинт может использоваться:
    1. Pre-renderer (Rendertron, Prerender.io) для генерации HTML
    2. SSR-решение в будущем (Next.js, Remix)
    3. Внешние инструменты для валидации structured data

    Типы schema.org:
    - Organization: бренд, контакты
    - WebApplication: описание продукта для Google
    - HowTo: может отображаться как Rich Snippet в выдаче
    """
    base_url = settings.PUBLIC_URL.rstrip("/")

    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "name": "PrivacyGuard",
                "url": base_url,
                "logo": f"{base_url}/og-image.png",
                "description": "AI-powered privacy protection service for images and videos.",
                "contactPoint": {
                    "@type": "ContactPoint",
                    "email": "support@privacyguard.com",
                    "contactType": "customer support",
                    "availableLanguage": "English",
                },
                "sameAs": [],
            },
            {
                "@type": "WebApplication",
                "name": "PrivacyGuard",
                "url": base_url,
                "applicationCategory": "MultimediaApplication",
                "operatingSystem": "Web",
                "description": (
                    "Automatically blur faces and license plates in photos "
                    "and videos using AI. Free, fast, GDPR-compliant."
                ),
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD",
                },
                "featureList": [
                    "AI face detection and blurring",
                    "License plate detection and blurring",
                    "Batch image processing",
                    "Video processing",
                    "GDPR compliance",
                    "End-to-end encryption",
                ],
            },
            {
                "@type": "HowTo",
                "name": "How to blur faces and license plates with PrivacyGuard",
                "description": (
                    "Three simple steps to protect privacy in your images and videos."
                ),
                "totalTime": "PT2M",
                "step": [
                    {
                        "@type": "HowToStep",
                        "position": 1,
                        "name": "Upload",
                        "text": (
                            "Upload your photos or videos securely. "
                            "We support JPEG, PNG, MP4, and more."
                        ),
                        "url": f"{base_url}/censoring",
                    },
                    {
                        "@type": "HowToStep",
                        "position": 2,
                        "name": "Process",
                        "text": (
                            "Our AI automatically detects faces and license plates, "
                            "applying intelligent blur effects."
                        ),
                    },
                    {
                        "@type": "HowToStep",
                        "position": 3,
                        "name": "Download",
                        "text": "Download your privacy-protected files instantly.",
                    },
                ],
            },
        ],
    }


# ══════════════════════════════════════════════════════════════════
# 3.3 (доп). CATCH-ALL для несуществующих API-маршрутов → 404
# ══════════════════════════════════════════════════════════════════


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
async def api_catch_all(path: str):
    """
    Любой запрос к /api/*, не совпавший с роутерами → 404.

    WHY: Без этого FastAPI вернёт 405 Method Not Allowed или
    непонятный ответ. 404 — чёткий сигнал клиенту и ботам.
    """
    return JSONResponse(
        status_code=404,
        content={
            "error": True,
            "status_code": 404,
            "detail": f"API endpoint '/api/{path}' not found",
        },
    )


# ══════════════════════════════════════════════════════════════════
# ROOT
# ══════════════════════════════════════════════════════════════════


@app.get("/")
def root():
    return {"message": "PrivacyGuard API is running", "version": "0.2.0"}


# ══════════════════════════════════════════════════════════════════
# OPENAPI SCHEMA
# ══════════════════════════════════════════════════════════════════


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    openapi_schema.setdefault("components", {})
    openapi_schema["components"].setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
    }

    openapi_schema["security"] = [{"BearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi