import datetime
from pydantic import BaseModel, ConfigDict
from app.models.inventory_log import LogAction


class InventoryLogCreate(BaseModel):
    product_id: int
    action: LogAction
    quantity_change: float = 0.0
    notes: str | None = None


class InventoryLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    action: LogAction
    quantity_change: float
    price: float | None
    notes: str | None
    created_at: datetime.datetime


class InventoryLogUpdate(BaseModel):
    action: LogAction | None = None
    quantity_change: float | None = None
    price: float | None = None
    notes: str | None = None
