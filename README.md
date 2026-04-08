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

## Quick Start

```bash
docker compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/v1
- API Docs: http://localhost:8000/docs

## Project Structure

```
household-manager/
├── backend/          # FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── models/   # Category, Product, InventoryLog
│   │   ├── schemas/  # Pydantic request/response schemas
│   │   ├── routers/  # REST endpoints
│   │   └── services/ # Shopping list logic, analytics
│   └── requirements.txt
├── frontend/         # React + TypeScript + Vite + shadcn/ui
│   └── src/
│       ├── pages/    # Dashboard, Inventory, ShoppingList
│       ├── components/
│       └── lib/      # API client, utilities
└── docker-compose.yml
```
