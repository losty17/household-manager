import enum
import datetime
from sqlalchemy import String, Float, Enum, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LogAction(str, enum.Enum):
    restock = "restock"
    consumed = "consumed"
    ended = "ended"
    created = "created"


class InventoryLog(Base):
    __tablename__ = "inventory_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[LogAction] = mapped_column(Enum(LogAction), nullable=False)
    quantity_change: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship(  # noqa: F821
        "Product", back_populates="inventory_logs"
    )
