import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models.product import Product, ProductStatus
from app.models.inventory_log import InventoryLog, LogAction
from app.schemas.product import ProductCreate, ProductUpdate, ProductRead
from app.schemas.inventory_log import InventoryLogRead
from app.services.analytics import get_consumption_rate, update_next_purchase_date
from pydantic import BaseModel

router = APIRouter(prefix="/products", tags=["products"])


def _compute_status(product: Product) -> ProductStatus:
    if product.current_stock <= 0:
        return ProductStatus.ended
    if product.current_stock < product.min_threshold:
        return ProductStatus.low_stock
    return ProductStatus.ok


def _to_read(product: Product) -> ProductRead:
    return ProductRead(
        id=product.id,
        name=product.name,
        category_id=product.category_id,
        category_name=product.category.name if product.category else None,
        current_stock=product.current_stock,
        min_threshold=product.min_threshold,
        unit=product.unit,
        buying_frequency=product.buying_frequency,
        last_purchased=product.last_purchased,
        next_purchase_date=product.next_purchase_date,
        expiration_date=product.expiration_date,
        status=product.status,
        last_price=product.last_price,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


class RestockRequest(BaseModel):
    new_stock: float
    price: float | None = None
    notes: str | None = None


@router.get("/", response_model=list[ProductRead])
def list_products(
    category_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    stmt = select(Product)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if status is not None:
        try:
            status_enum = ProductStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        stmt = stmt.where(Product.status == status_enum)
    products = db.execute(stmt.order_by(Product.name)).scalars().all()
    return [_to_read(p) for p in products]


@router.post("/", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**payload.model_dump())
    product.status = _compute_status(product)
    db.add(product)
    db.flush()

    log = InventoryLog(
        product_id=product.id,
        action=LogAction.created,
        quantity_change=product.current_stock,
        notes="Product created",
    )
    db.add(log)

    update_next_purchase_date(product, db)
    db.commit()
    db.refresh(product)
    return _to_read(product)


@router.get("/{product_id}", response_model=ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return _to_read(product)


@router.put("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(product, field, value)

    if "status" not in changes:
        product.status = _compute_status(product)

    update_next_purchase_date(product, db)
    db.commit()
    db.refresh(product)
    return _to_read(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    db.delete(product)
    db.commit()


@router.post("/{product_id}/restock", response_model=ProductRead)
def restock_product(
    product_id: int,
    payload: RestockRequest,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    quantity_change = payload.new_stock - product.current_stock
    product.current_stock = payload.new_stock
    product.last_purchased = datetime.datetime.now(datetime.timezone.utc)
    product.status = _compute_status(product)
    if payload.price is not None:
        product.last_price = payload.price

    log = InventoryLog(
        product_id=product.id,
        action=LogAction.restock,
        quantity_change=quantity_change,
        price=payload.price,
        notes=payload.notes,
    )
    db.add(log)
    update_next_purchase_date(product, db)
    db.commit()
    db.refresh(product)
    return _to_read(product)


@router.post("/{product_id}/mark-ended", response_model=ProductRead)
def mark_product_ended(
    product_id: int,
    notes: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    previous_stock = product.current_stock
    product.current_stock = 0.0
    product.status = ProductStatus.ended

    log = InventoryLog(
        product_id=product.id,
        action=LogAction.ended,
        quantity_change=-previous_stock,
        notes=notes or "Marked as ended",
    )
    db.add(log)
    db.commit()
    db.refresh(product)
    return _to_read(product)


@router.post("/{product_id}/consume", response_model=ProductRead)
def consume_product(
    product_id: int,
    quantity: float = Query(..., description="Amount to remove from stock", gt=0),
    notes: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    new_stock = max(product.current_stock - quantity, 0.0)
    quantity_change = new_stock - product.current_stock
    product.current_stock = new_stock
    product.status = _compute_status(product)

    log = InventoryLog(
        product_id=product.id,
        action=LogAction.consumed,
        quantity_change=quantity_change,
        notes=notes or f"Removed {quantity} {product.unit}",
    )
    db.add(log)
    db.commit()
    db.refresh(product)
    return _to_read(product)


@router.get("/{product_id}/consumption-rate")
def consumption_rate(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return get_consumption_rate(product_id, db)


@router.get("/{product_id}/logs", response_model=list[InventoryLogRead])
def product_logs(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    logs = (
        db.execute(
            select(InventoryLog)
            .where(InventoryLog.product_id == product_id)
            .order_by(InventoryLog.created_at.desc())
        )
        .scalars()
        .all()
    )
    return logs
