import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.product import Product, ProductStatus
from app.models.inventory_log import InventoryLog, LogAction
from app.schemas.shopping_list import ShoppingListItem, PredictedShoppingListItem


def _ensure_utc(dt: datetime.datetime) -> datetime.datetime:
    """Return *dt* with UTC timezone attached if it is naive."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def get_shopping_list(db: Session) -> list[ShoppingListItem]:
    products = db.execute(select(Product)).scalars().all()
    today = datetime.datetime.now(datetime.timezone.utc)

    seen_ids: set[int] = set()
    items: list[ShoppingListItem] = []

    def category_name(p: Product) -> str | None:
        return p.category.name if p.category else None

    def suggested_qty(p: Product, priority: int) -> float:
        if priority == 1:
            return p.min_threshold * 2
        return max(p.min_threshold * 2 - p.current_stock, p.min_threshold)

    # Priority 1 – ended
    for p in products:
        if p.status == ProductStatus.ended:
            seen_ids.add(p.id)
            items.append(
                ShoppingListItem(
                    product_id=p.id,
                    name=p.name,
                    category_name=category_name(p),
                    unit=p.unit,
                    current_stock=p.current_stock,
                    min_threshold=p.min_threshold,
                    priority=1,
                    reason="Ended - immediate restock needed",
                    suggested_quantity=suggested_qty(p, 1),
                )
            )

    # Priority 2 – low stock (not already added)
    for p in products:
        if p.id not in seen_ids and p.current_stock < p.min_threshold:
            seen_ids.add(p.id)
            items.append(
                ShoppingListItem(
                    product_id=p.id,
                    name=p.name,
                    category_name=category_name(p),
                    unit=p.unit,
                    current_stock=p.current_stock,
                    min_threshold=p.min_threshold,
                    priority=2,
                    reason=(
                        f"Low stock: {p.current_stock} {p.unit} remaining "
                        f"(min: {p.min_threshold})"
                    ),
                    suggested_quantity=suggested_qty(p, 2),
                )
            )

    # Priority 2 – already expired (not already added)
    for p in products:
        if p.id not in seen_ids and p.expiration_date:
            exp = _ensure_utc(p.expiration_date)
            if exp <= today:
                seen_ids.add(p.id)
                items.append(
                    ShoppingListItem(
                        product_id=p.id,
                        name=p.name,
                        category_name=category_name(p),
                        unit=p.unit,
                        current_stock=p.current_stock,
                        min_threshold=p.min_threshold,
                        priority=2,
                        reason=f"Expired on {exp.date().isoformat()} - restock needed",
                        suggested_quantity=suggested_qty(p, 2),
                    )
                )

    # Priority 3 – due for repurchase
    for p in products:
        if p.id not in seen_ids and p.next_purchase_date:
            npd = _ensure_utc(p.next_purchase_date)
            if npd <= today:
                seen_ids.add(p.id)
                items.append(
                    ShoppingListItem(
                        product_id=p.id,
                        name=p.name,
                        category_name=category_name(p),
                        unit=p.unit,
                        current_stock=p.current_stock,
                        min_threshold=p.min_threshold,
                        priority=3,
                        reason="Due for repurchase",
                        suggested_quantity=suggested_qty(p, 3),
                    )
                )

    items.sort(key=lambda x: (x.priority, x.name))
    return items


def _avg_daily_consumption_bulk(
    product_ids: list[int], db: Session
) -> dict[int, float]:
    """Return avg daily consumption (units/day) for each product id."""
    logs = (
        db.execute(
            select(InventoryLog)
            .where(InventoryLog.product_id.in_(product_ids))
            .order_by(InventoryLog.product_id, InventoryLog.created_at)
        )
        .scalars()
        .all()
    )

    rates: dict[int, float] = {pid: 0.0 for pid in product_ids}
    restock_time: dict[int, datetime.datetime] = {}
    restock_qty: dict[int, float] = {}
    total_consumed: dict[int, float] = {pid: 0.0 for pid in product_ids}
    total_days: dict[int, float] = {pid: 0.0 for pid in product_ids}

    for log in logs:
        pid = log.product_id
        if log.action == LogAction.restock:
            restock_time[pid] = log.created_at
            restock_qty[pid] = log.quantity_change
        elif log.action in (LogAction.consumed, LogAction.ended) and pid in restock_time:
            end_time = _ensure_utc(log.created_at)
            start_time = _ensure_utc(restock_time[pid])
            delta = (end_time - start_time).total_seconds() / 86400
            if delta > 0:
                total_consumed[pid] = total_consumed.get(pid, 0.0) + restock_qty.get(pid, 0.0)
                total_days[pid] = total_days.get(pid, 0.0) + delta
            restock_time.pop(pid, None)
            restock_qty.pop(pid, None)

    for pid in product_ids:
        if total_days[pid] > 0:
            rates[pid] = total_consumed[pid] / total_days[pid]

    return rates


def predict_shopping_list(db: Session, days: int) -> list[PredictedShoppingListItem]:
    """Return items predicted to be needed within the next *days* days.

    Includes items already on the current shopping list (days_until_needed=0)
    plus items whose stock is projected to fall below min_threshold, whose
    next_purchase_date falls within the requested window, or whose
    expiration_date falls within the requested window (meaning a restock will
    be needed after the product expires).
    """
    products = db.execute(select(Product)).scalars().all()
    today = datetime.datetime.now(datetime.timezone.utc)
    future = today + datetime.timedelta(days=days)

    seen_ids: set[int] = set()
    items: list[PredictedShoppingListItem] = []

    def category_name(p: Product) -> str | None:
        return p.category.name if p.category else None

    def suggested_qty(p: Product, priority: int) -> float:
        if priority == 1:
            return p.min_threshold * 2
        return max(p.min_threshold * 2 - p.current_stock, p.min_threshold)

    def make_item(
        p: Product,
        priority: int,
        reason: str,
        days_until: float,
        qty: float | None = None,
    ) -> PredictedShoppingListItem:
        needed_at = today + datetime.timedelta(days=days_until)
        return PredictedShoppingListItem(
            product_id=p.id,
            name=p.name,
            category_name=category_name(p),
            unit=p.unit,
            current_stock=p.current_stock,
            min_threshold=p.min_threshold,
            priority=priority,
            reason=reason,
            suggested_quantity=qty if qty is not None else suggested_qty(p, priority),
            days_until_needed=round(days_until, 1),
            predicted_date=needed_at.date().isoformat(),
        )

    # Priority 1 – already ended
    for p in products:
        if p.status == ProductStatus.ended:
            seen_ids.add(p.id)
            items.append(make_item(p, 1, "Ended - immediate restock needed", 0.0))

    # Priority 2 – already low stock
    for p in products:
        if p.id not in seen_ids and p.current_stock < p.min_threshold:
            seen_ids.add(p.id)
            items.append(
                make_item(
                    p,
                    2,
                    f"Low stock: {p.current_stock} {p.unit} remaining (min: {p.min_threshold})",
                    0.0,
                )
            )

    # Priority 2 – already expired (not already added)
    for p in products:
        if p.id not in seen_ids and p.expiration_date:
            exp = _ensure_utc(p.expiration_date)
            if exp <= today:
                seen_ids.add(p.id)
                items.append(
                    make_item(
                        p,
                        2,
                        f"Expired on {exp.date().isoformat()} - restock needed",
                        0.0,
                    )
                )

    # Priority 3 – already due for repurchase or due within window
    for p in products:
        if p.id not in seen_ids and p.next_purchase_date:
            npd = _ensure_utc(p.next_purchase_date)
            if npd <= future:
                days_until = max((npd - today).total_seconds() / 86400, 0.0)
                seen_ids.add(p.id)
                reason = (
                    "Due for repurchase"
                    if days_until == 0.0
                    else f"Due for repurchase in {round(days_until)} day(s)"
                )
                items.append(make_item(p, 3, reason, days_until))

    # Priority 3 – frequency-based items never purchased (no next_purchase_date)
    _FREQ_DAYS: dict[str, int] = {
        "weekly": 7,
        "bi-weekly": 14,
        "monthly": 30,
    }
    for p in products:
        if p.id in seen_ids:
            continue
        freq_days = _FREQ_DAYS.get(p.buying_frequency.value, 0)
        if freq_days == 0:
            continue
        if p.last_purchased is None:
            # Never purchased through the app – predict it immediately
            seen_ids.add(p.id)
            items.append(
                make_item(
                    p,
                    3,
                    f"Never purchased – scheduled {p.buying_frequency.value}",
                    0.0,
                )
            )
        else:
            # next_purchase_date not set or beyond window; check multi-cycle
            last = _ensure_utc(p.last_purchased)
            cycle = 1
            while True:
                next_buy = last + datetime.timedelta(days=freq_days * cycle)
                days_until = (next_buy - today).total_seconds() / 86400
                if days_until > days:
                    break
                if days_until >= 0:
                    seen_ids.add(p.id)
                    reason = (
                        "Due for repurchase"
                        if days_until == 0.0
                        else f"Due for repurchase in {round(days_until)} day(s)"
                    )
                    items.append(make_item(p, 3, reason, days_until))
                    break
                cycle += 1

    # Priority 3 – expiring within prediction window (not already added)
    for p in products:
        if p.id not in seen_ids and p.expiration_date:
            exp = _ensure_utc(p.expiration_date)
            if today < exp <= future:
                days_until = (exp - today).total_seconds() / 86400
                seen_ids.add(p.id)
                items.append(
                    make_item(
                        p,
                        3,
                        f"Expires in {round(days_until)} day(s) on {exp.date().isoformat()} - will need restock",
                        days_until,
                    )
                )

    # Priority 4 – consumption-rate projection: stock will run out within window
    remaining_ids = [p.id for p in products if p.id not in seen_ids]
    if remaining_ids:
        rates = _avg_daily_consumption_bulk(remaining_ids, db)
        product_map = {p.id: p for p in products}
        for pid in remaining_ids:
            p = product_map[pid]
            rate = rates.get(pid, 0.0)
            if rate <= 0:
                continue
            days_remaining = p.current_stock / rate
            if days_remaining <= days:
                # Suggest enough to cover the entire prediction window:
                # units needed over `days` days minus what's currently on hand,
                # plus min_threshold as a safety buffer.
                suggested = max(rate * days - p.current_stock + p.min_threshold, p.min_threshold)
                items.append(
                    make_item(
                        p,
                        4,
                        f"Stock will run out in ~{round(days_remaining)} day(s) at current usage rate",
                        days_remaining,
                        round(suggested, 2),
                    )
                )

    items.sort(key=lambda x: (x.priority, x.days_until_needed, x.name))
    return items
