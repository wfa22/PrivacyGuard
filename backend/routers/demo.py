from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def demo_root():
    return {"message": "Demo endpoint works"}
