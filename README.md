# SIVA MART

SIVA MART keeps its existing Express, vanilla JavaScript, and PostgreSQL stack. The Node backend serves the application directly; `backend/dev-frontend.js` is an optional local frontend server that proxies `/api` requests to it.

## Requirements and environment

- Node.js 18 or newer and npm.
- PostgreSQL with the existing `siva_mart` database and `users` table. Passwords must be bcrypt hashes.

Copy `.env.example` to `.env` and set your PostgreSQL connection. Use either `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. Keep `.env` out of Git.

Set this additional variable:

```env
AUTH_TOKEN_SECRET=<at-least-32-random-bytes>
```

Generate a signing secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never use the sample value in `.env.example` in production. In production, `AUTH_TOKEN_SECRET` is required; changing it invalidates existing sessions.

## Run locally (two terminals)

From `C:\Users\SIVAGAMI S\sivagami app 1\Sivagami app`:

**Terminal 1 — backend**

```powershell
Set-Location 'C:\Users\SIVAGAMI S\sivagami app 1\Sivagami app'
npm run start:backend:local
```

`start:backend:local` uses the existing `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` values in `.env`, without changing them. This is useful when `.env` also contains a `DATABASE_URL` for a remote database. Use `npm run start:backend` when `DATABASE_URL` is the intended and reachable database.

**Terminal 2 — frontend**

```powershell
Set-Location 'C:\Users\SIVAGAMI S\sivagami app 1\Sivagami app'
npm run start:frontend
```

Open the frontend at http://localhost:5173. It proxies API calls to the backend at http://localhost:8080. The backend also serves the full app at http://localhost:8080. Check PostgreSQL connectivity at http://localhost:8080/api/health.

The backend runs additive PostgreSQL schema setup on startup, protected by a PostgreSQL advisory lock. It creates product images, moderated verified-purchase reviews, delivery addresses, and inventory movements without dropping existing customer or product tables. Take a database backup before the first upgraded startup. If startup reports a database connection error, correct the local connection variables and verify `/api/health` before retrying; migrations do not run while PostgreSQL is unreachable.

## Shopping and orders

- Product details, availability, ratings, and reviews use live PostgreSQL data. New reviews are pending until an administrator approves them.
- Product image uploads are stored in PostgreSQL (up to 8 JPEG, PNG, WebP, or GIF images per product, 512 KiB per image).
- Buyers see only `In Stock`, `Out of Stock`, or `Currently Unavailable`. Exact stock and reserved quantities remain in seller/admin tools.
- SIVA MART does not take online payments, and no payment gateway credentials are needed. Every order is Cash on Delivery: it gets a `payments` row with method `Cash on Delivery` and status `pending`, and nothing marks money as received.
- A buyer adds products to the cart, clicks **Buy Now**, reviews the order summary and delivery address, and clicks **Confirm Order**. The backend recalculates prices, checks and reduces stock, creates the order as `confirmed` (shown as "Order Confirmed"), and empties the cart in one transaction. The order's unique number is its database ID. The buyer then sees "Order Placed Successfully".
- New orders appear in the buyer's My Orders, the admin Orders page, and the dashboard of each seller whose product was ordered.
- Orders move one step at a time: Order Confirmed → On The Way → Received → Order Completed, with an optional Processing step between Order Confirmed and On The Way. Admins can update any order. A seller can update an order only when every product in it is theirs. The buyer can click **Confirm Received** on an order that is on the way, which records Received and Order Completed together.
- Buyers can review a product once their order has been received.
- Buyer and admin order screens poll the PostgreSQL-backed APIs every 10 seconds while open, so status updates appear without relying on browser storage or a WebSocket service.

Never put `AUTH_TOKEN_SECRET` in frontend code or commit it to Git.

## Accounts and administration

Buyer and seller registration remains available from the login screen. Admin accounts must already exist in the PostgreSQL `users` table with role `admin`; public registration cannot create admin accounts. Sign in again after upgrading because sessions now use server-signed bearer tokens instead of editable browser identity headers.

Administrators can manage product listings, MRP/selling price, descriptions, specifications, images, offers, availability, exact inventory, orders and order statuses, order revenue, and review moderation. Deleting a product with order history remains blocked to preserve records; disable its availability instead.

## Deploying to Vercel

Set the project root to this directory. Configure `DATABASE_URL` (or the PostgreSQL variables) and `AUTH_TOKEN_SECRET` as Vercel environment variables. The schema setup runs against the configured PostgreSQL database on application startup.

Deploy with:

```powershell
npx vercel --prod
```

## Native C++ backend

`backend/main.cpp` is an existing Drogon migration and currently provides only a partial API. Commerce and account routes remain in the Express backend; use `npm run start:backend` for this application.
