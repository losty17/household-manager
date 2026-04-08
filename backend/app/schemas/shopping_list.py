from pydantic import BaseModel


class ShoppingListItem(BaseModel):
    product_id: int
    name: str
    category_name: str | None
    unit: str
    current_stock: float
    min_threshold: float
    priority: int  # 1=ended, 2=low_stock, 3=due_soon
    reason: str
    suggested_quantity: float
