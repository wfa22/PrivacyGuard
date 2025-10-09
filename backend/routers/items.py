from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_items():
    return {"message": "List items (not implemented)"}

@router.post("/")
def create_item():
    return {"message": "Create item (not implemented)"}

@router.put("/{item_id}")
def update_item(item_id: int):
    return {"message": f"Update item {item_id} (not implemented)"}

@router.delete("/{item_id}")
def delete_item(item_id: int):
    return {"message": f"Delete item {item_id} (not implemented)"}
