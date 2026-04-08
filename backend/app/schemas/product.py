import datetime
from pydantic import BaseModel, ConfigDict, computed_field


class ProductBase(BaseModel):
    name: str
    category_id: int | None = None
    current_stock: float = 0.0
    min_threshold: float = 0.0
    unit: str = "count"
    buying_frequency: str = "none"
    last_purchased: datetime.datetime | None = None
    next_purchase_date: datetime.datetime | None = None
    expiration_date: datetime.datetime | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    category_id: int | None = None
    current_stock: float | None = None
    min_threshold: float | None = None
    unit: str | None = None
    buying_frequency: str | None = None
    last_purchased: datetime.datetime | None = None
    next_purchase_date: datetime.datetime | None = None
    expiration_date: datetime.datetime | None = None
    status: str | None = None


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    category_name: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    @computed_field
    @property
    def is_low_stock(self) -> bool:
        return self.current_stock < self.min_threshold
