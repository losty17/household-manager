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
    estimated_price: float | None  # last_price * suggested_quantity


class PredictedShoppingListItem(ShoppingListItem):
    days_until_needed: float  # 0 = needed now, >0 = predicted future need
    predicted_date: str  # ISO-8601 date string of when the item will be needed
