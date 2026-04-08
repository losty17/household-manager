from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


def _to_read(cat: Category) -> CategoryRead:
    return CategoryRead(
        id=cat.id,
        name=cat.name,
        icon=cat.icon,
        color=cat.color,
        created_at=cat.created_at,
        product_count=len(cat.products),
    )


@router.get("/", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    categories = db.execute(select(Category).order_by(Category.name)).scalars().all()
    return [_to_read(c) for c in categories]


@router.post("/", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.execute(
        select(Category).where(Category.name == payload.name)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category '{payload.name}' already exists.",
        )
    cat = Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _to_read(cat)


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    return _to_read(cat)


@router.put("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)
):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return _to_read(cat)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    has_products = (
        db.execute(select(Product).where(Product.category_id == category_id)).first()
        is not None
    )
    if has_products:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete category with associated products.",
        )
    db.delete(cat)
    db.commit()
