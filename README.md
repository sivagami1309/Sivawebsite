# SIVA MART

A simple online shop for buyers, sellers, and admins. Orders are paid by Cash on Delivery.

Built with Node.js, Express, PostgreSQL, and plain HTML, CSS, and JavaScript. There is no build step: Express serves both the website and the API from one command.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18.11 or newer and [PostgreSQL](https://www.postgresql.org). These steps work on Windows and Linux.

1. Install the packages:

   ```
   npm install
   ```

2. Copy `.env.example` to a new file called `.env`, then fill in your PostgreSQL password and a long random `AUTH_TOKEN_SECRET`. To generate a secret:

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Create the database if you don't have one yet:

   ```
   createdb -U postgres siva_mart
   ```

4. Start the app, then open http://localhost:8080:

   ```
   npm run dev
   ```

Tables are created automatically the first time it starts. Startup only adds what is missing; it never deletes tables or data.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app and restarts it when backend code changes |
| `npm start` | Starts the app for production |
| `npm run build` | Checks every JavaScript file for syntax errors |
| `npm run create-admin -- you@example.com "password" "Your Name"` | Creates an admin account |

Buyers and sellers sign up on the website. Admins can't, so use `create-admin`.

## Where things are

```
backend/
  server.js        Starts the app and connects everything
  database.js      The PostgreSQL connection
  schema.js        Creates missing tables and columns on startup
  auth.js          Login tokens and role checks
  create-admin.js  The create-admin command
  check-code.js    The build command
  routes/
    accounts.js    Register and login
    products.js    Products, images, reviews, and seller product management
    cart.js        Cart and wishlist
    orders.js      Checkout, tracking, and order status
    admin.js       Admin statistics, users, products, and reviews
frontend/
  index.html       The page (all screens are in this one file)
  styles.css       The design
  js/
    common.js      Shared helpers. Loaded first
    admin.js       Admin screens
    buyer.js       Shop, cart, checkout, and My Orders
    seller.js      Seller screens
    auth.js        Login and sign up. Loaded last, because it starts the app
```

## How orders work

1. A buyer adds products to the cart, clicks **Buy Now**, reviews the summary, and clicks **Confirm Order**.
2. The order is saved as **Order Confirmed**, stock goes down, and the cart is emptied. It also gets a `payments` row with method `Cash on Delivery` and status `pending`.
3. Admins and sellers move it along: Order Confirmed → On The Way → Received → Order Completed. Processing is an optional step after Order Confirmed. Sellers can only update orders where every product is theirs.
4. The buyer can click **Confirm Received** when it's on the way, which records Received and Order Completed together. They can then review the product. Reviews appear after an admin approves them.

## Hosting

Use `npm ci` to install, `npm run build` to build, and `npm start` to start. Set these environment variables on the host:

| Variable | Needed | Notes |
|---|---|---|
| `DATABASE_URL` | Yes, unless you set the `PG` values | PostgreSQL connection string. SSL is used unless the host is local |
| `AUTH_TOKEN_SECRET` | Yes | At least 32 characters. The app won't start in production without it |
| `NODE_ENV` | Recommended | Set to `production` |
| `DATABASE_SSL` | Only if needed | Set to `false` if your database doesn't support SSL |
| `PORT` | Set by most hosts | The server listens on it, or 8080 if it isn't set |

Visit `/api/health` to check that the database is connected.

Never commit `.env` or put passwords in the code.
