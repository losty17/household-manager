# Household Manager

A Mobile-First Household Resource Management App built with React + shadcn/ui and FastAPI + PostgreSQL.

## Features

- **Inventory Tracking** – Manage items by category with stock levels, thresholds, and units
- **Low Stock Alerts** – Automatic flagging when stock falls below minimum threshold
- **Recurrence Logic** – Track buying frequency (weekly/bi-weekly/monthly) and predict next purchase
- **Expiration & Status** – Track expiry dates; mark items as "Ended" to force onto shopping list
- **Dynamic Shopping List** – Prioritised list combining Ended, Low Stock, and due items
- **One-Tap Buy / Bulk Buy** – Restock single items or select multiple for batch purchase
- **Consumption Analytics** – Estimates daily consumption rate from inventory log history
- **Mobile-First UI** – Bottom navigation, touch-friendly cards, progress bars
- **Push Notifications** – Browser Web Push for expiring/expired item reminders (daily at 09:00)
- **Expiring Soon Panel** – At-a-glance panel on the home screen for items expiring within 3 days

## Quick Start

```bash
docker compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/v1
- API Docs: http://localhost:8000/docs

## Push Notifications Setup

Web Push requires VAPID keys. Generate them once:

```bash
python3 -c "
from py_vapid import Vapid
import base64
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
v = Vapid()
v.generate_keys()
priv = v.private_pem().decode().strip()
pub = base64.urlsafe_b64encode(
    v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
).decode().rstrip('=')
print('VAPID_PRIVATE_KEY=' + priv.replace(chr(10), r'\n'))
print('VAPID_PUBLIC_KEY=' + pub)
"
```

Add the output to your backend `.env` (or docker-compose environment):

```env
VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
VAPID_PUBLIC_KEY=BA...
VAPID_CLAIMS_SUB=mailto:admin@your-domain.com
```

> **Note:** Web Push only works over HTTPS (or `localhost`). The bell icon on the home screen toggles push subscriptions. The daily expiry check runs at 09:00 server time.

### Hidden Test Panel

Navigate to `/push-test` (no navigation link) to:
- Check/toggle push subscription
- Trigger an immediate expiry check
- Schedule a check in 30 s / 2 min / 5 min
- Send a local browser notification without a server round-trip

## Database Migrations (Alembic)

Schema changes are managed with [Alembic](https://alembic.sqlalchemy.org/). Migrations run automatically every time the backend starts (`alembic upgrade head` is called inside the FastAPI lifespan).

### Adding a new column / table

1. Edit (or create) the SQLAlchemy model in `backend/app/models/`.
2. Generate a migration:
   ```bash
   docker compose exec backend alembic revision --autogenerate -m "describe your change"
   ```
3. Review the generated file in `backend/alembic/versions/` and commit it.
4. The next `docker compose up` will apply it automatically.

### Rolling back

```bash
docker compose exec backend alembic downgrade -1
```



```
household-manager/
├── backend/          # FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── models/   # Category, Product, InventoryLog, PushSubscription
│   │   ├── schemas/  # Pydantic request/response schemas
│   │   ├── routers/  # REST endpoints (incl. /notifications)
│   │   └── services/ # Shopping list logic, analytics, notifications
│   └── requirements.txt
├── frontend/         # React + TypeScript + Vite + shadcn/ui
│   ├── public/
│   │   └── sw.js     # Service worker (handles push events)
│   └── src/
│       ├── pages/    # Dashboard, Inventory, ShoppingList, PushTest
│       ├── components/ # ExpiringPanel, PushNotificationToggle, …
│       └── lib/      # API client, pushNotifications utilities
└── docker-compose.yml
```
