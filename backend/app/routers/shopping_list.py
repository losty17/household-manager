import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.product import Product, ProductStatus
from app.models.inventory_log import InventoryLog, LogAction
from app.schemas.shopping_list import ShoppingListItem, PredictedShoppingListItem
from app.services.shopping_list import get_shopping_list, predict_shopping_list
from app.services.analytics import update_next_purchase_date
from app.number_utils import EPSILON, is_less, round_non_negative_decimal, round_decimal
from pydantic import BaseModel

router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


class BulkBuyRequest(BaseModel):
    product_ids: list[int]


@router.get("/", response_model=list[ShoppingListItem])
def shopping_list(db: Session = Depends(get_db)):
    return get_shopping_list(db)


@router.get("/predict", response_model=list[PredictedShoppingListItem])
def predict_list(
    days: int = Query(default=7, ge=1, le=365, description="Number of days to look ahead"),
    db: Session = Depends(get_db),
):
    """Return predicted shopping needs for the next *days* days."""
    return predict_shopping_list(db, days)


@router.post("/bulk-buy", response_model=list[ShoppingListItem])
def bulk_buy(payload: BulkBuyRequest, db: Session = Depends(get_db)):
    # Validate all products exist before making any modifications.
    products = []
    not_found = []
    for product_id in payload.product_ids:
        product = db.get(Product, product_id)
        if product:
            products.append(product)
        else:
            not_found.append(product_id)

    if not_found:
        raise HTTPException(
            status_code=404,
            detail=f"Products not found: {not_found}",
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    for product in products:
        new_stock = round_non_negative_decimal(product.min_threshold * 2)
        previous_stock = round_non_negative_decimal(product.current_stock)
        quantity_change = round_decimal(new_stock - previous_stock)
        product.current_stock = new_stock
        product.last_purchased = now
        product.status = (
            ProductStatus.ended
            if product.current_stock <= EPSILON
            else (
                ProductStatus.low_stock
                if is_less(product.current_stock, product.min_threshold)
                else ProductStatus.ok
            )
        )
        db.add(
            InventoryLog(
                product_id=product.id,
                action=LogAction.restock,
                quantity_change=quantity_change,
                notes="Bulk buy restock",
            )
        )
        update_next_purchase_date(product, db)

    db.commit()
    return get_shopping_list(db)
