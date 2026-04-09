import os
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

APP_PASSWORD = os.getenv("APP_PASSWORD", "")
if not APP_PASSWORD:
    logging.warning(
        "APP_PASSWORD is not set. The application will reject all login attempts. "
        "Set the APP_PASSWORD environment variable."
    )

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    SECRET_KEY = "change-me-in-production"
    logging.warning(
        "SECRET_KEY is not set. Using an insecure default. "
        "Set the SECRET_KEY environment variable before deploying to production."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
_TOKEN_SUBJECT = "owner"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def verify_app_password(plain: str) -> bool:
    # Use constant-time comparison to prevent timing attacks
    return bool(APP_PASSWORD) and hmac.compare_digest(plain, APP_PASSWORD)


def create_access_token(expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode({"sub": _TOKEN_SUBJECT, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str = Depends(oauth2_scheme)) -> None:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") != _TOKEN_SUBJECT:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
