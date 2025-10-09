from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_users():
    return {"message": "List of users (not implemented yet)"}
