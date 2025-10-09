from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, users, items, demo
from core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="PrivacyGuard API (lab2)",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo"])

@app.get("/")
def root():
    return {"message": "Backend structure ready"}
