import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.product import Product, ProductStatus
from app.schemas.shopping_list import ShoppingListItem


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

    # Priority 3 – due for repurchase
    for p in products:
        if p.id not in seen_ids and p.next_purchase_date:
            npd = p.next_purchase_date
            if npd.tzinfo is None:
                npd = npd.replace(tzinfo=datetime.timezone.utc)
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
