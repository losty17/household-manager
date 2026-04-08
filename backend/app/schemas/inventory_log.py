import datetime
from pydantic import BaseModel, ConfigDict


class InventoryLogCreate(BaseModel):
    product_id: int
    action: str
    quantity_change: float = 0.0
    notes: str | None = None


class InventoryLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    action: str
    quantity_change: float
    notes: str | None
    created_at: datetime.datetime
