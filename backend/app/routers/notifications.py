"""Notifications router – push subscription management and manual triggers."""

import os
import traceback
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.database import get_db
from app.models.push_subscription import PushSubscription
from app.services.notifications import (
    VAPID_PUBLIC_KEY,
    send_expiry_notifications,
)
from app.services.auth import verify_token

router = APIRouter(prefix="/notifications", tags=["notifications"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionPayload(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


# ---------------------------------------------------------------------------
# Public endpoint – returns the VAPID public key so the frontend can subscribe
# ---------------------------------------------------------------------------
@router.get("/vapid-public-key")
def get_vapid_public_key():
    key = VAPID_PUBLIC_KEY
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID keys not configured on the server.",
        )
    return {"public_key": key}


# ---------------------------------------------------------------------------
# Subscribe / Unsubscribe  (requires auth)
# ---------------------------------------------------------------------------
@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(
    payload: PushSubscriptionPayload,
    db: Session = Depends(get_db),
    _: None = Depends(verify_token),
):
    existing = db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    ).scalar_one_or_none()

    if existing:
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
    else:
        sub = PushSubscription(
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )
        db.add(sub)

    db.commit()
    return {"subscribed": True}


@router.post("/unsubscribe", status_code=status.HTTP_200_OK)
def unsubscribe(
    payload: PushSubscriptionPayload,
    db: Session = Depends(get_db),
    _: None = Depends(verify_token),
):
    db.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    )
    db.commit()
    return {"unsubscribed": True}


# ---------------------------------------------------------------------------
# Manual trigger endpoint (used by the hidden test panel and the scheduler)
# ---------------------------------------------------------------------------
@router.post("/send-expiry-check")
def trigger_expiry_check(
    db: Session = Depends(get_db),
    _: None = Depends(verify_token),
):
    """Immediately run the expiry notification check and send push notifications."""
    try:
        result = send_expiry_notifications(db)
    except Exception as exc:
        print(exc)
        # print stack trace
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send expiry notifications: {exc}",
        ) from exc

    return result
