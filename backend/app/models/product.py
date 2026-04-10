import enum
import datetime
from sqlalchemy import String, Float, Enum, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BuyingFrequency(str, enum.Enum):
    weekly = "weekly"
    bi_weekly = "bi-weekly"
    monthly = "monthly"
    none = "none"


class ProductStatus(str, enum.Enum):
    ok = "ok"
    low_stock = "low_stock"
    ended = "ended"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    current_stock: Mapped[float] = mapped_column(Float, default=0.0)
    min_threshold: Mapped[float] = mapped_column(Float, default=0.0)
    unit: Mapped[str] = mapped_column(String(50), default="count")
    buying_frequency: Mapped[BuyingFrequency] = mapped_column(
        Enum(BuyingFrequency), default=BuyingFrequency.none
    )
    last_purchased: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_purchase_date: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expiration_date: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus), default=ProductStatus.ok
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped["Category"] = relationship(  # noqa: F821
        "Category", back_populates="products"
    )
    inventory_logs: Mapped[list["InventoryLog"]] = relationship(  # noqa: F821
        "InventoryLog", back_populates="product", cascade="all, delete-orphan"
    )
