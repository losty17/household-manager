from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from alembic.config import Config
from alembic import command as alembic_command
from app.database import SessionLocal
from app.routers import categories, products, shopping_list, auth, notifications
import app.models  # noqa: F401 – ensure models are registered with Base
from apscheduler.schedulers.background import BackgroundScheduler  # type: ignore
from app.services.notifications import send_expiry_notifications


DEFAULT_CATEGORIES = [
    {"name": "Food", "icon": "🍎", "color": "#4CAF50"},
    {"name": "Cleaning", "icon": "🧹", "color": "#2196F3"},
    {"name": "Personal Care", "icon": "🧴", "color": "#9C27B0"},
    {"name": "Electronics", "icon": "💡", "color": "#FF9800"},
    {"name": "Other", "icon": "📦", "color": "#607D8B"},
]


def _seed_categories(db: Session) -> None:
    from sqlalchemy import select
    from app.models.category import Category

    existing = db.execute(select(Category)).first()
    if existing:
        return
    for data in DEFAULT_CATEGORIES:
        db.add(Category(**data))
    db.commit()


def _run_daily_expiry_check() -> None:
    db: Session = SessionLocal()
    try:
        send_expiry_notifications(db)
    finally:
        db.close()


_scheduler = BackgroundScheduler()
_scheduler.add_job(
    _run_daily_expiry_check,
    trigger="cron",
    hour=9,
    minute=0,
    id="daily_expiry_check",
)


def _run_migrations() -> None:
    """Apply all pending Alembic migrations at startup.

    On the first startup after Alembic was introduced, the database already
    has all tables but no alembic_version table.  We detect that and stamp
    the DB at the current head so future migrations run incrementally rather
    than trying to recreate existing tables.
    """
    from sqlalchemy import inspect, text
    from app.database import engine

    cfg = Config("/app/alembic.ini")

    with engine.connect() as conn:
        inspector = inspect(conn)
        has_version_table = inspector.has_table("alembic_version")
        has_products_table = inspector.has_table("products")

        if not has_version_table and has_products_table:
            # Existing deployment before Alembic was introduced – stamp it so
            # migration 0001 (which creates these tables) is not re-run.
            conn.execute(
                text(
                    "CREATE TABLE alembic_version "
                    "(version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
                )
            )
            conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('0001')")
            )
            conn.commit()

    alembic_command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    db: Session = SessionLocal()
    try:
        _seed_categories(db)
    finally:
        db.close()
    _scheduler.start()
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(
    title="Household Manager API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(shopping_list.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"status": "ok", "app": "Household Manager API"}
