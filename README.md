# Deej Hauls — Group Order Portal

Admin portal for managing group buy / haul orders across multiple product categories. Built for CodePath's Deej Hauls operation.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Google Sheets API v4 |
| Auth | `jose` JWT (24h session cookie) |
| Deployment | Vercel (auto-deploy from `main`) |
| Notifications | Telegram Bot API |

---

## Local Development

> Node.js is managed via nvm. Run the following before any npm commands:
> ```bash
> source ~/.nvm/nvm.sh && nvm use 20
> ```

```bash
source ~/.nvm/nvm.sh && nvm use 20
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.local` and fill in the values:

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email for Sheets API |
| `GOOGLE_PRIVATE_KEY` | Service account private key |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID |
| `SESSION_SECRET` | JWT signing secret (min 32 chars) |
| `ADMIN_PASSWORD` | Password for admin login |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |

---

## Google Sheets Structure

The spreadsheet acts as the database. All sheet names and column positions are fixed.

### `Pricelist` — Product catalog
| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Category | Product Name | Price/Kit | Price/Vial | Vials/Kit | Handling Fee | Active | Use Case | Product Function |

### `Order-XX` sheets — One sheet per batch (e.g. `Order-01`, `Order-02`)
| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| order_date | id (row) | order_id | customer_name | telegram_username | product_name | category | qty_item | price_per_item | handling_fee | category_total | overall_total | status | category_status |

### `Batches` — Batch registry
| A | B | C | D |
|---|---|---|---|
| id | name | status (active/closed) | created_date |

### `CategoryLocks` — Prevents fulfillment edits once a category is paid
| A | B | C | D |
|---|---|---|---|
| batch_id | category | locked (TRUE/FALSE) | locked_at |

### `OrderingLocks` — Prevents new customer orders for a category
| A | B | C | D |
|---|---|---|---|
| batch_id | category | locked (TRUE/FALSE) | locked_at |

### `CategoryNotes` — Internal notes per category
| A | B |
|---|---|
| category | notes |

### `Settings` — App settings as JSON in cell A1
Stores MOQ and handling fee configuration (see `lib/types.ts → AppSettings`).

### `pephaulers` — Telegram chatId registry
| A | B | C |
|---|---|---|
| Telegram Username | Chat ID | Updated timestamp |

### `ShippingDetails` — Customer shipping addresses
| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| telegram_username | full_name | phone | address | city | province | zip | notes | updated_at |

---

## Product Categories

| Category | Emoji | Notes |
|---|---|---|
| USP BAC | 💉 | Bacteriostatic water. Kit-based (tracked per kit). Tiered handling: ₱50 per 50 ampoules. |
| SERUMS | 🧪 | Peptide serums. Kit-based (tracked per kit). Flat handling fee per product. |
| PENS | 🖊️ | Injection pens. Tiered handling: base ₱150 + ₱50 per 5 pens. |
| COSMETICS | ✨ | Skincare/cosmetics. Bulk discount: -₱100 per box above threshold. |
| TOPICAL RAWS | 🧴 | Raw ingredients. Variety-based handling: base ₱150 + ₱50 per product variety. |

---

## Order & Category Status Model

### Order Status (`OrderStatus`)

Reflects the overall payment/fulfillment state of an order. Can be set manually or auto-derived from category statuses.

| Status | Color | Meaning |
|---|---|---|
| `pending` | Yellow | No payment received yet |
| `waiting` | Orange | Legacy / manual "waiting on customer" state |
| `partially_paid` | Indigo | At least one category has some payment; not all categories fully paid |
| `paid` | Blue | All categories fully paid |
| `partially_fulfilled` | Teal | All categories at least paid; some partially or fully fulfilled |
| `fulfilled` | Green | All categories fully fulfilled |
| `cancelled` | Gray | Order cancelled |

**Auto-derivation** (triggered when a category status is updated):
1. All categories `fulfilled` → order `fulfilled`
2. All categories `paid` or `fulfilled`, at least one `partially_fulfilled` or `fulfilled` → order `partially_fulfilled`
3. All categories `paid` or `fulfilled` → order `paid`
4. Any category with payment activity (partially_paid, paid, partially_fulfilled, fulfilled) → order `partially_paid`
5. All categories `pending` → order `pending`

### Category Status (`CategoryStatus`)

Per-item / per-category payment and fulfillment tracking within an order.

| Status | Color | Meaning |
|---|---|---|
| `pending` | Gray | No payment for this category yet |
| `partially_paid` | Indigo | Partial payment received |
| `paid` | Blue | Full payment received — triggers a Category Lock |
| `partially_fulfilled` | Teal | Items partially delivered/fulfilled |
| `fulfilled` | Green | All items delivered — triggers a Category Lock |

---

## Admin Pages

### `/admin/orders`
Main orders management page.

- **Orders table**: Search by name/telegram, filter by batch, status, or Kit 1.
- **Summary cards**: Total orders, product collectibles, handling fees, grand total; payment status breakdown; per-category collectibles; status count badges.
- **Side panel**: Opens on "View →". Edit customer name, telegram, order-level status. Per-category status pills (Pending → ½ Paid → Paid → ½ Fulfilled → Fulfilled). Add/remove items. Shipping details. Remind via Telegram. Delete order.

### `/admin/kit-roster`
Visual kit allocation and customer breakdown.

**Customer Breakdown tab** (default):
- Shows all categories (USP BAC, SERUMS, PENS, COSMETICS, TOPICAL RAWS).
- One table per category. Rows = customers. Shows customer, telegram, date, items ordered (with individual item category statuses), total qty, subtotal.
- Sortable by customer name, date, qty, subtotal, or status.
- Category filter pills to drill in.
- Total row with customer count + total qty + total subtotal.

**Kit Allocation tab**:
- Shows kit-based categories only (USP BAC, SERUMS).
- Grouped by product → kit number.
- Each kit card shows capacity, filled/open slots, fill percentage, and a hauler table.

### `/admin/dashboard`
High-level batch overview.

### `/admin/products`
Pricelist management.

- Add/edit/delete products.
- Toggle active/inactive.
- Products grouped by category → use case (subcategory).
- Settings: MOQ per category, tiered handling fee formulas, category notes.

### `/admin/orders/[id]`
Standalone full-page order detail view (alternative to side panel).

---

## Customer-Facing Pages

### `/` (root)
Public order form.

- Browse products by category.
- Select quantities (respects MOQ, max vials/kit).
- Real-time handling fee calculation.
- Kit fill indicator.
- Existing order lookup by Telegram username.
- Submit order.

### `/invoice/[orderId]`
Printable invoice view for a specific order.

---

## Key Business Logic

### Handling Fee Calculation

| Category | Formula |
|---|---|
| PENS | `baseFee + floor((n-1) / tierSize) * tierIncrement` |
| USP BAC | `ceil(n / tierSize) * feePerTier` |
| TOPICAL RAWS | `baseFee + varieties * perVarietyIncrement` |
| COSMETICS | Flat fee with bulk discount above threshold |
| SERUMS | Flat fee per product |

All values configurable via **Products → Settings**.

### Kit Allocation (USP BAC & SERUMS)

Customers reserve vial slots in sequential order. Each product has a fixed `vialsPerKit`. Orders fill kits in first-come-first-served order. A customer's order can span a kit boundary (split across two kits).

### Upsert Logic

Submitting an order for a Telegram username that already has an order in the active batch **replaces** the previous order (all old rows deleted, new rows inserted).

### Ordering Locks

When an ordering lock is active for a category, new orders for that category return a 403 error. Set manually from the admin.

### Category Locks

Automatically set when a category's status reaches `paid` or `fulfilled`. Prevents accidental status regression.

---

## Deployment

Deployed on Vercel. Pushes to `main` auto-deploy.

Repository: `Daphne-CPAdmin/Order-Portal`

---

## Changelog

| Date | Change |
|---|---|
| 2026-03-27 | Add `partially_paid` and `partially_fulfilled` as top-level `OrderStatus` values with auto-derivation from category statuses; filter bar, summary badges, and status pills updated |
| 2026-03-27 | Kit Roster: add Customer Breakdown tab covering all categories (PENS, COSMETICS, TOPICAL RAWS, USP BAC, SERUMS) with sortable table and total count row |
| 2026-03-27 | Add `CategoryStatus` type (`partially_paid`, `partially_fulfilled`) for per-category tracking; category status selector in orders panel now shows all 5 states as pills |
| 2026-03 | Shipping details feature (keyed by Telegram username) |
| 2026-03 | Editable MOQ and tiered handling fee settings in Products admin tab |
| 2026-03 | Admin ability to add items to existing orders |
| 2026-03 | Per-category collectibles row in orders summary |
| 2026-02 | Initial build — orders, kit allocation, pricelist, batches, Telegram bot integration |
