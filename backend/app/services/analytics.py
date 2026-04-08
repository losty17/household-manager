import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.inventory_log import InventoryLog, LogAction
from app.models.product import Product, BuyingFrequency


def get_consumption_rate(product_id: int, db: Session) -> dict:
    logs = (
        db.execute(
            select(InventoryLog)
            .where(InventoryLog.product_id == product_id)
            .order_by(InventoryLog.created_at)
        )
        .scalars()
        .all()
    )

    total_consumed = 0.0
    total_days = 0.0
    restock_time: datetime.datetime | None = None
    restock_qty = 0.0

    for log in logs:
        if log.action == LogAction.restock:
            restock_time = log.created_at
            restock_qty = log.quantity_change
        elif log.action in (LogAction.consumed, LogAction.ended) and restock_time:
            end_time = log.created_at
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=datetime.timezone.utc)
            if restock_time.tzinfo is None:
                restock_time = restock_time.replace(tzinfo=datetime.timezone.utc)
            delta = (end_time - restock_time).total_seconds() / 86400
            if delta > 0:
                total_consumed += restock_qty
                total_days += delta
            restock_time = None
            restock_qty = 0.0

    avg_daily = total_consumed / total_days if total_days > 0 else 0.0

    product = db.get(Product, product_id)
    estimated_days = None
    if avg_daily > 0 and product:
        estimated_days = round(product.current_stock / avg_daily, 1)

    return {
        "product_id": product_id,
        "avg_daily_consumption": round(avg_daily, 4),
        "estimated_days_remaining": estimated_days,
        "last_calculated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


_FREQUENCY_DAYS: dict[str, int] = {
    BuyingFrequency.weekly: 7,
    BuyingFrequency.bi_weekly: 14,
    BuyingFrequency.monthly: 30,
    BuyingFrequency.none: 0,
}


def update_next_purchase_date(product: Product, db: Session) -> None:
    """Calculate and persist next_purchase_date on *product*.

    Note: this function stages the change via ``db.add`` but does **not**
    commit the session.  The caller is responsible for calling ``db.commit``.
    """
    days = _FREQUENCY_DAYS.get(product.buying_frequency, 0)
    if days == 0 or not product.last_purchased:
        product.next_purchase_date = None
    else:
        base = product.last_purchased
        if base.tzinfo is None:
            base = base.replace(tzinfo=datetime.timezone.utc)
        product.next_purchase_date = base + datetime.timedelta(days=days)
    db.add(product)
