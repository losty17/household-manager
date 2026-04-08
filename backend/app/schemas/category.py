import datetime
from pydantic import BaseModel, ConfigDict


class CategoryBase(BaseModel):
    name: str
    icon: str | None = None
    color: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    color: str | None = None


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime.datetime
    product_count: int = 0
