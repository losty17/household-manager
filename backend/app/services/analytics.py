import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.inventory_log import InventoryLog, LogAction
from app.models.product import Product, BuyingFrequency

# Number of days of safety stock used to derive the suggested minimum threshold
_SUGGESTED_MIN_SAFETY_DAYS = 7


def _ensure_utc(dt: datetime.datetime) -> datetime.datetime:
    """Return *dt* with UTC timezone attached if it is naive."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def _detect_purchase_interval_days(product_id: int, db: Session) -> float | None:
    """Return the average number of days between consecutive restock events.

    Returns ``None`` when fewer than two restock events exist (not enough
    history to compute a meaningful interval).
    """
    restock_logs = (
        db.execute(
            select(InventoryLog)
            .where(
                InventoryLog.product_id == product_id,
                InventoryLog.action == LogAction.restock,
            )
            .order_by(InventoryLog.created_at)
        )
        .scalars()
        .all()
    )

    if len(restock_logs) < 2:
        return None

    intervals: list[float] = []
    for i in range(1, len(restock_logs)):
        t1 = _ensure_utc(restock_logs[i - 1].created_at)
        t2 = _ensure_utc(restock_logs[i].created_at)
        delta = (t2 - t1).total_seconds() / 86400
        if delta > 0:
            intervals.append(delta)

    if not intervals:
        return None

    return sum(intervals) / len(intervals)


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
    previous_removal_time: datetime.datetime | None = None

    for log in logs:
        if log.action not in (LogAction.consumed, LogAction.ended):
            continue

        removed_qty = max(-log.quantity_change, 0.0)
        if removed_qty <= 0:
            continue

        current_time = _ensure_utc(log.created_at)
        if previous_removal_time is not None:
            delta = (current_time - previous_removal_time).total_seconds() / 86400
            if delta > 0:
                total_consumed += removed_qty
                total_days += delta
        previous_removal_time = current_time

    avg_daily = total_consumed / total_days if total_days > 0 else 0.0

    product = db.get(Product, product_id)
    estimated_days = None
    suggested_min_threshold = None
    if avg_daily > 0 and product:
        estimated_days = round(product.current_stock / avg_daily, 1)
        suggested_min_threshold = round(avg_daily * _SUGGESTED_MIN_SAFETY_DAYS, 2)

    detected_recurrence_days = _detect_purchase_interval_days(product_id, db)

    return {
        "product_id": product_id,
        "avg_daily_consumption": round(avg_daily, 4),
        "estimated_days_remaining": estimated_days,
        "suggested_min_threshold": suggested_min_threshold,
        "detected_recurrence_days": (
            round(detected_recurrence_days, 1) if detected_recurrence_days is not None else None
        ),
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

    For products with a fixed ``buying_frequency``, the next purchase date is
    derived from ``last_purchased + frequency_days``.

    For products with ``buying_frequency = "none"``, the function falls back to
    the auto-detected average interval between historical restock events.  If
    fewer than two restocks have been logged, ``next_purchase_date`` is cleared.

    Note: this function stages the change via ``db.add`` but does **not**
    commit the session.  The caller is responsible for calling ``db.commit``.
    """
    days = _FREQUENCY_DAYS.get(product.buying_frequency, 0)

    if days > 0 and product.last_purchased:
        # Fixed frequency path
        base = _ensure_utc(product.last_purchased)
        product.next_purchase_date = base + datetime.timedelta(days=days)
    elif product.buying_frequency == BuyingFrequency.none and product.last_purchased:
        # Auto-detect from purchase history
        detected = _detect_purchase_interval_days(product.id, db)
        if detected is not None:
            base = _ensure_utc(product.last_purchased)
            product.next_purchase_date = base + datetime.timedelta(days=detected)
        else:
            product.next_purchase_date = None
    else:
        product.next_purchase_date = None

    db.add(product)
