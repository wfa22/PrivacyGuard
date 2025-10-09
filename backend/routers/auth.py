from fastapi import APIRouter, HTTPException, status
from models.schemas import UserCreate, UserResponse, LoginRequest
from services.auth_service import hash_password, verify_password

router = APIRouter()

# Временная "БД" в памяти
fake_users_db: list[dict] = []
user_id_counter = 1

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate):
    global user_id_counter
    # проверка уникальности email
    for u in fake_users_db:
        if u["email"] == user.email:
            raise HTTPException(status_code=400, detail="User with this email already exists")

    password_hash = hash_password(user.password)
    new_user = {
        "id": user_id_counter,
        "username": user.username,
        "email": user.email,
        "password_hash": password_hash,
    }
    user_id_counter += 1
    fake_users_db.append(new_user)

    return {"id": new_user["id"], "username": new_user["username"], "email": new_user["email"]}

@router.post("/login")
def login(payload: LoginRequest):
    # находим пользователя по email
    for u in fake_users_db:
        if u["email"] == payload.email:
            if verify_password(payload.password, u.get("password_hash","")):
                # Возвращаем простую демонстрационную информацию вместо токена
                return {"message": "login ok", "user_id": u["id"]}
            raise HTTPException(status_code=401, detail="Invalid credentials")
    raise HTTPException(status_code=404, detail="User not found")
