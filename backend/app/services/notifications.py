"""Push notification service.

Handles VAPID key management, subscription storage helpers, and sending
Web Push notifications to subscribed browsers.
"""
import json
import logging
import os
import datetime

from sqlalchemy.orm import Session
from sqlalchemy import select
from pywebpush import webpush, WebPushException  # type: ignore
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from app.models.product import Product
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

def _normalize_private_key_from_env(raw_key: str) -> str:
    """Normalize PEM key loaded from env variables.

    Supports values copied from `.env` with literal `\n` sequences.
    """
    key = raw_key.strip()
    if (key.startswith('"') and key.endswith('"')) or (
        key.startswith("'") and key.endswith("'")
    ):
        key = key[1:-1]
    if "\\n" in key:
        key = key.replace("\\n", "\n")
    return key


VAPID_PRIVATE_KEY = _normalize_private_key_from_env(os.getenv("VAPID_PRIVATE_KEY", ""))
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS_SUB = os.getenv("VAPID_CLAIMS_SUB", "mailto:admin@household-manager.local")
_VAPID_KEY_VALIDATED = False

# Days before expiration to start warning
EXPIRY_WARNING_DAYS = 3


def _send_push(subscription: PushSubscription, payload: dict) -> None:
    """Send a single Web Push notification."""
    global _VAPID_KEY_VALIDATED
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured – skipping push notification.")
        return
    if not _VAPID_KEY_VALIDATED:
        try:
            load_pem_private_key(VAPID_PRIVATE_KEY.encode("utf-8"), password=None)
            _VAPID_KEY_VALIDATED = True
        except ValueError as exc:
            logger.error(
                "Invalid VAPID private key format. Ensure VAPID_PRIVATE_KEY is a PEM key "
                "with real newlines (or literal \\n in .env)."
            )
            raise ValueError("Invalid VAPID private key format") from exc
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIMS_SUB},
        )
    except WebPushException as exc:
        logger.error("WebPush failed for endpoint %s: %s", subscription.endpoint[:40], exc)
        raise


def _get_all_subscriptions(db: Session) -> list[PushSubscription]:
    return db.execute(select(PushSubscription)).scalars().all()


def _broadcast(db: Session, payload: dict) -> dict[str, int]:
    """Send payload to all subscriptions, removing stale ones."""
    subscriptions = _get_all_subscriptions(db)
    stale: list[int] = []
    attempted = 0
    delivered = 0
    failed = 0
    for sub in subscriptions:
        attempted += 1
        try:
            _send_push(sub, payload)
            delivered += 1
        except WebPushException as exc:
            failed += 1
            status = getattr(exc, "response", None)
            if status is not None and status.status_code in (404, 410):
                stale.append(sub.id)
            logger.warning("Failed to push to subscription %d: %s", sub.id, exc)
        except ValueError as exc:
            if "Invalid VAPID private key format" in str(exc):
                raise
            failed += 1
            stale.append(sub.id)
            logger.warning(
                "Dropping invalid push subscription %d due to key parse error: %s",
                sub.id,
                exc,
            )
    # Remove stale subscriptions
    for sub_id in stale:
        s = db.get(PushSubscription, sub_id)
        if s:
            db.delete(s)
    if stale:
        db.commit()
    return {
        "subscriptions_total": len(subscriptions),
        "attempted": attempted,
        "delivered": delivered,
        "failed": failed,
        "removed_stale": len(stale),
    }


def get_expiring_products(db: Session, days: int = EXPIRY_WARNING_DAYS) -> list[Product]:
    """Return products expiring within *days* days that still have stock."""
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now + datetime.timedelta(days=days)
    products = (
        db.execute(
            select(Product).where(
                Product.expiration_date.isnot(None),
                Product.expiration_date > now,
                Product.expiration_date <= cutoff,
                Product.current_stock > 0,
            )
        )
        .scalars()
        .all()
    )
    return list(products)


def get_expired_products(db: Session) -> list[Product]:
    """Return products that are past expiration and still have stock."""
    now = datetime.datetime.now(datetime.timezone.utc)
    products = (
        db.execute(
            select(Product).where(
                Product.expiration_date.isnot(None),
                Product.expiration_date <= now,
                Product.current_stock > 0,
            )
        )
        .scalars()
        .all()
    )
    return list(products)


def _days_label(days: int) -> str:
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days} days"


def send_expiry_notifications(db: Session) -> dict:
    """Check for expiring/expired products and broadcast push notifications.

    Returns a summary dict with counts of what was found and sent.
    """
    logger.info("Running expiry notification check")
    now = datetime.datetime.now(datetime.timezone.utc)

    expiring = get_expiring_products(db, EXPIRY_WARNING_DAYS)
    expired = get_expired_products(db)

    logger.info(
        "Expiry check results: %d expiring-soon product(s), %d already-expired product(s)",
        len(expiring),
        len(expired),
    )

    sent_expiring = 0
    sent_expired = 0
    attempted_total = 0
    delivered_total = 0
    failed_total = 0
    removed_stale_total = 0
    subscriptions_total = len(_get_all_subscriptions(db))

    if expiring:
        lines: list[str] = []
        for p in expiring:
            exp_dt = p.expiration_date
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=datetime.timezone.utc)
            days_left = (exp_dt.date() - now.date()).days
            lines.append(f"• {p.name} – expires {_days_label(days_left)}")

        body = "\n".join(lines)
        payload = {
            "title": f"⚠️ {len(expiring)} item(s) expiring soon",
            "body": body,
            "tag": "expiring-soon",
            "url": "/",
        }
        expiring_stats = _broadcast(db, payload)
        attempted_total += expiring_stats["attempted"]
        delivered_total += expiring_stats["delivered"]
        failed_total += expiring_stats["failed"]
        removed_stale_total += expiring_stats["removed_stale"]
        sent_expiring = expiring_stats["delivered"]
        logger.info(
            "Expiring-soon push delivery: delivered=%d attempted=%d failed=%d",
            expiring_stats["delivered"],
            expiring_stats["attempted"],
            expiring_stats["failed"],
        )

    if expired:
        lines = [f"• {p.name}" for p in expired]
        body = "\n".join(lines)
        payload = {
            "title": f"🚨 {len(expired)} expired item(s) still in stock",
            "body": body,
            "tag": "expired",
            "url": "/",
        }
        expired_stats = _broadcast(db, payload)
        attempted_total += expired_stats["attempted"]
        delivered_total += expired_stats["delivered"]
        failed_total += expired_stats["failed"]
        removed_stale_total += expired_stats["removed_stale"]
        sent_expired = expired_stats["delivered"]
        logger.info(
            "Expired-items push delivery: delivered=%d attempted=%d failed=%d",
            expired_stats["delivered"],
            expired_stats["attempted"],
            expired_stats["failed"],
        )

    return {
        "expiring_count": len(expiring),
        "expired_count": len(expired),
        "sent_expiring_notification": bool(expiring) and sent_expiring > 0,
        "sent_expired_notification": bool(expired) and sent_expired > 0,
        "subscriptions_total": subscriptions_total,
        "push_attempted": attempted_total,
        "push_delivered": delivered_total,
        "push_failed": failed_total,
        "subscriptions_removed_stale": removed_stale_total,
    }
