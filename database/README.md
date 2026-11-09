# PostgreSQL database

SIVA MART uses the existing `siva_mart` PostgreSQL database. The Express backend owns additive schema setup in `backend/server.js` and applies it on startup under an advisory lock. Existing users, products, carts, orders, and payment rows are not dropped.

The schema includes MRP/offer/specification/availability fields, inventory movement history, PostgreSQL-backed product images, moderated verified-purchase reviews, saved delivery addresses, order address and product snapshots, and append-only order status history. Orders move through `confirmed`, an optional `processing`, `on_the_way`, `received`, and `completed`; the backend records the actors and timestamps and allows only one forward step at a time. Buyer-facing queries return availability labels rather than stock counts; seller and admin queries retain exact inventory.

Online payments have been removed. Each new order gets one `payments` row with method `Cash on Delivery` and status `pending`; nothing marks that money as received. Existing `payments` rows, including any gateway columns added by earlier versions, are kept unchanged as a historical record. Startup relabels existing `order_placed` orders as `confirmed`, adds an additive `orders.idempotency_key` column, and cancels any leftover unpaid checkout reservation once it expires so its stock is released.

Before deploying the upgraded backend, back up the database and verify that the configured connection can reach the expected PostgreSQL instance. The schema setup is additive; it is not a substitute for inspecting the target database or verifying the connection. For local checks, open `/api/health` after the backend starts.
