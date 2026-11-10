// Database connection pool with in-memory fallback for container/development environments.
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const databaseUrl = process.env.DATABASE_URL;

function isLocalHost(host) {
  return !host || ["localhost", "127.0.0.1", "[::1]", "invalid DATABASE_URL", "in-memory (mock)"].includes(host);
}

function databaseHostName() {
  if (!databaseUrl) return "in-memory (mock)";
  try {
    const host = new URL(databaseUrl).hostname;
    return isLocalHost(host) ? "in-memory (mock)" : host;
  } catch {
    return "in-memory (mock)";
  }
}

function databaseSslOption() {
  if (!databaseUrl || process.env.DATABASE_SSL === "false") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(databaseHostName()) ? false : { rejectUnauthorized: false };
}

// ---------------------------------------------------------------------------
// In-Memory Database Engine
// ---------------------------------------------------------------------------
class InMemoryStore {
  constructor() {
    this.sequences = {
      users: 10,
      buyers: 10,
      sellers: 10,
      categories: 10,
      products: 20,
      carts: 10,
      cart_items: 20,
      wishlist_items: 10,
      orders: 10,
      order_items: 20,
      payments: 10,
      delivery_addresses: 10,
      product_images: 10,
      product_reviews: 10,
      inventory_movements: 10,
      order_status_history: 10
    };

    const adminHash = bcrypt.hashSync("admin123", 10);
    const sellerHash = bcrypt.hashSync("seller123", 10);
    const buyerHash = bcrypt.hashSync("buyer123", 10);

    this.users = [
      { id: 1, full_name: "Siva Mart Admin", email: "admin@example.com", mobile_number: "9876500001", password_hash: adminHash, role: "admin", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, full_name: "Siva Daily Stores", email: "seller@example.com", mobile_number: "9876500002", password_hash: sellerHash, role: "seller", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 3, full_name: "Priya Sharma", email: "buyer@example.com", mobile_number: "9876543210", password_hash: buyerHash, role: "buyer", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];

    this.sellers = [
      { id: 1, user_id: 2, full_name: "Siva Daily Stores", email: "seller@example.com", store_name: "Siva Provisions & Organics", created_at: new Date().toISOString() }
    ];

    this.buyers = [
      { id: 1, user_id: 3, full_name: "Priya Sharma", email: "buyer@example.com", created_at: new Date().toISOString() }
    ];

    this.categories = [
      { id: 1, name: "Groceries & Staples", description: "Flours, grains, rice, oils, and cooking essentials", created_at: new Date().toISOString() },
      { id: 2, name: "Fresh Produce", description: "Farm fresh seasonal fruits and green vegetables", created_at: new Date().toISOString() },
      { id: 3, name: "Snacks & Beverages", description: "Traditional savouries, tea, coffee, and packaged snacks", created_at: new Date().toISOString() },
      { id: 4, name: "Personal Care", description: "Everyday soaps, shampoos, and hygiene essentials", created_at: new Date().toISOString() },
      { id: 5, name: "Home Essentials", description: "Cleaning, kitchenwares, and household care", created_at: new Date().toISOString() }
    ];

    this.products = [
      {
        id: 1,
        seller_id: 1,
        category_id: 1,
        name: "Aashirvaad Superior MP Sharbati Atta (5kg)",
        description: "100% pure wheat grain harvested from Sehore, Madhya Pradesh. Soft rotis guaranteed with natural dietary fiber.",
        price: 295.00,
        mrp_price: 360.00,
        stock: 50,
        image_url: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80",
        brand: "Aashirvaad",
        specifications: { "Net Quantity": "5 kg", "Diet Type": "Vegetarian", "Shelf Life": "90 Days" },
        offer_text: "Save 18% today",
        coupon_code: "FLOUR10",
        return_policy: "7 days easy replacement on unopened package",
        return_window_days: 7,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        seller_id: 1,
        category_id: 1,
        name: "Fortune Sunlite Refined Sunflower Oil (1L)",
        description: "Light, healthy, enriched with Vitamin A & D. Low absorption technology for everyday guilt-free cooking.",
        price: 135.00,
        mrp_price: 165.00,
        stock: 45,
        image_url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80",
        brand: "Fortune",
        specifications: { "Volume": "1 Litre", "Processing": "Refined", "Type": "Sunflower" },
        offer_text: "Essential Kitchen Saver",
        coupon_code: "COOK15",
        return_policy: "Non-returnable item once opened",
        return_window_days: 3,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 3,
        seller_id: 1,
        category_id: 1,
        name: "Tata Salt Vacuum Evaporated Iodised (1kg)",
        description: "Desh ka namak. Vacuum evaporated purity with essential iodine intake for family wellness.",
        price: 28.00,
        mrp_price: 30.00,
        stock: 120,
        image_url: "https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=600&auto=format&fit=crop&q=80",
        brand: "Tata",
        specifications: { "Weight": "1 kg", "Type": "Iodised Vacuum Salt" },
        offer_text: null,
        coupon_code: null,
        return_policy: "Standard grocery replacement",
        return_window_days: 7,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 4,
        seller_id: 1,
        category_id: 2,
        name: "Ratnagiri Alphonso Mangoes (1 Dozen Box)",
        description: "Naturally ripened GI-tagged sweet and aromatic Ratnagiri Alphonso mangoes direct from orchard groves.",
        price: 650.00,
        mrp_price: 800.00,
        stock: 20,
        image_url: "https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80",
        brand: "Siva FarmFresh",
        specifications: { "Quantity": "12 Units", "Origin": "Ratnagiri, Maharashtra", "Grade": "A1 Premium" },
        offer_text: "Fresh Harvest Special",
        coupon_code: "MANGO50",
        return_policy: "Same-day replacement on damaged fruit",
        return_window_days: 1,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 5,
        seller_id: 1,
        category_id: 2,
        name: "Farm Fresh Country Tomatoes (1kg)",
        description: "Handpicked firm red ripe hybrid tomatoes, freshly harvested for rich curries and salads.",
        price: 38.00,
        mrp_price: 50.00,
        stock: 80,
        image_url: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80",
        brand: "Siva FarmFresh",
        specifications: { "Weight": "1 kg", "Grade": "Fresh Grade A" },
        offer_text: "Daily Market Rate",
        coupon_code: null,
        return_policy: "Report quality issues upon delivery",
        return_window_days: 1,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 6,
        seller_id: 1,
        category_id: 3,
        name: "Haldiram's Nagpur Bhujia Sev (400g)",
        description: "Crispy, spicy moth bean and chickpea flour noodles infused with authentic traditional spices.",
        price: 110.00,
        mrp_price: 130.00,
        stock: 65,
        image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80",
        brand: "Haldiram's",
        specifications: { "Weight": "400 g", "Flavor": "Spicy Sev" },
        offer_text: "Tea-Time Favourite",
        coupon_code: "SNACK10",
        return_policy: "7 days replacement",
        return_window_days: 7,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 7,
        seller_id: 1,
        category_id: 3,
        name: "Taj Mahal Premium Assam Tea (500g)",
        description: "Wah Taj! Strong, rich aroma blend of fine orthodox and Assam CTC tea leaves for the perfect chai.",
        price: 260.00,
        mrp_price: 310.00,
        stock: 40,
        image_url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80",
        brand: "Brooke Bond",
        specifications: { "Weight": "500 g", "Leaves Type": "Assam CTC Blend" },
        offer_text: "Instant ₹50 Off",
        coupon_code: "CHAI50",
        return_policy: "10 days return if seal intact",
        return_window_days: 10,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 6).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 8,
        seller_id: 1,
        category_id: 4,
        name: "Dettol Antiseptic Disinfectant Liquid (550ml)",
        description: "Trusted hospital-grade antiseptic disinfectant for first aid, personal hygiene, and laundry care.",
        price: 215.00,
        mrp_price: 245.00,
        stock: 35,
        image_url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
        brand: "Dettol",
        specifications: { "Volume": "550 ml", "Application": "Antiseptic & Surface Disinfection" },
        offer_text: null,
        coupon_code: null,
        return_policy: "Non-returnable personal care product",
        return_window_days: 0,
        reserved_stock: 0,
        is_available: true,
        created_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    this.carts = [
      { id: 1, user_id: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];

    this.cart_items = [
      { id: 1, cart_id: 1, product_id: 1, quantity: 1, price: 295.00, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];

    this.wishlist_items = [
      { id: 1, buyer_id: 3, product_id: 4, created_at: new Date().toISOString() }
    ];

    this.delivery_addresses = [
      {
        id: 1,
        user_id: 3,
        recipient_name: "Priya Sharma",
        phone: "+91 98765 43210",
        address_line1: "Flat 402, Lotus Greens Apartment",
        address_line2: "Near Gandhi Road",
        city: "Bengaluru",
        state: "Karnataka",
        postal_code: "560001",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    this.orders = [
      {
        id: 101,
        user_id: 3,
        total_amount: 405.00,
        subtotal: 405.00,
        discount_amount: 85.00,
        shipping_amount: 0.00,
        delivery_address: {
          recipient_name: "Priya Sharma",
          phone: "+91 98765 43210",
          address_line1: "Flat 402, Lotus Greens Apartment",
          city: "Bengaluru",
          state: "Karnataka",
          postal_code: "560001"
        },
        status: "received",
        idempotency_key: "init-order-seed-101",
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    this.order_items = [
      {
        id: 1,
        order_id: 101,
        product_id: 1,
        seller_id: 1,
        quantity: 1,
        price: 295.00,
        mrp_price: 360.00,
        subtotal: 295.00,
        product_name_snapshot: "Aashirvaad Superior MP Sharbati Atta (5kg)",
        product_image_snapshot: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80",
        cart_item_id: null
      },
      {
        id: 2,
        order_id: 101,
        product_id: 6,
        seller_id: 1,
        quantity: 1,
        price: 110.00,
        mrp_price: 130.00,
        subtotal: 110.00,
        product_name_snapshot: "Haldiram's Nagpur Bhujia Sev (400g)",
        product_image_snapshot: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80",
        cart_item_id: null
      }
    ];

    this.payments = [
      {
        id: 1,
        order_id: 101,
        payment_method: "Cash on Delivery",
        payment_status: "pending",
        amount: 405.00,
        transaction_reference: "COD-101-AUTO",
        created_at: new Date(Date.now() - 3600000 * 24).toISOString()
      }
    ];

    this.order_status_history = [
      { id: 1, order_id: 101, status: "confirmed", changed_by: 3, created_at: new Date(Date.now() - 3600000 * 24).toISOString() }
    ];

    this.product_images = [];
    this.product_reviews = [
      {
        id: 1,
        product_id: 1,
        buyer_id: 3,
        order_item_id: 1,
        rating: 5,
        review_text: "High quality wheat atta, makes very soft rotis. Fast delivery as well!",
        moderation_status: "approved",
        moderated_by: 1,
        moderated_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 3600000 * 12).toISOString()
      }
    ];
    this.inventory_movements = [];
  }

  nextId(table) {
    this.sequences[table] = (this.sequences[table] || 0) + 1;
    return this.sequences[table];
  }

  // -------------------------------------------------------------------------
  // Main SQL Query Dispatcher for in-memory tables
  // -------------------------------------------------------------------------
  async query(sqlText, params = []) {
    const rawSql = String(sqlText || "").trim();
    const cleanSql = rawSql.replace(/\s+/g, " ");

    // Schema DDL / Locks / Health checks
    if (
      cleanSql.startsWith("CREATE TABLE") ||
      cleanSql.startsWith("ALTER TABLE") ||
      cleanSql.startsWith("CREATE INDEX") ||
      cleanSql.startsWith("CREATE UNIQUE INDEX") ||
      cleanSql.startsWith("DO $$") ||
      cleanSql.startsWith("DROP CONSTRAINT") ||
      cleanSql.startsWith("WITH released AS") ||
      cleanSql.includes("pg_advisory_lock") ||
      cleanSql.includes("pg_advisory_unlock") ||
      cleanSql.startsWith("BEGIN") ||
      cleanSql.startsWith("COMMIT") ||
      cleanSql.startsWith("ROLLBACK")
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (cleanSql === "SELECT 1" || cleanSql.startsWith("SELECT 1;")) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }

    // -----------------------------------------------------------------------
    // USERS & AUTH
    // -----------------------------------------------------------------------
    if (/SELECT\s+id\s+FROM\s+users\s+WHERE\s+LOWER\(email\)\s*=\s*LOWER\(\$1\)/i.test(cleanSql)) {
      const email = String(params[0] || "").toLowerCase().trim();
      const match = this.users.find(u => u.email.toLowerCase() === email);
      return { rows: match ? [{ id: match.id, role: match.role }] : [], rowCount: match ? 1 : 0 };
    }

    if (/SELECT\s+id\s+FROM\s+users\s+WHERE\s+(users\.)?mobile_number\s*=\s*\$1/i.test(cleanSql)) {
      const cleanMobile = String(params[0] || "").replace(/\D/g, "");
      const match = this.users.find(u => (u.mobile_number || "").replace(/\D/g, "") === cleanMobile);
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }

    if (/SELECT\s+role\s+FROM\s+users\s+WHERE\s+LOWER\(email\)\s*=\s*LOWER\(\$1\)/i.test(cleanSql)) {
      const email = String(params[0] || "").toLowerCase().trim();
      const match = this.users.find(u => u.email.toLowerCase() === email);
      return { rows: match ? [{ role: match.role }] : [], rowCount: match ? 1 : 0 };
    }

    if (/INSERT INTO users/i.test(cleanSql)) {
      let full_name, email, mobile_number, password_hash, role;
      if (params.length >= 5) {
        [full_name, email, mobile_number, password_hash, role] = params;
      } else {
        [full_name, email, password_hash, role] = params;
        mobile_number = null;
      }
      const id = this.nextId("users");
      const user = {
        id,
        full_name: String(full_name || "").trim(),
        email: String(email || "").toLowerCase().trim(),
        mobile_number: mobile_number ? String(mobile_number).trim() : null,
        password_hash,
        role: role || "buyer",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.users.push(user);
      return {
        rows: [{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          mobile_number: user.mobile_number,
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at
        }],
        rowCount: 1
      };
    }

    // Forgot password user check
    if (/FROM users[\s\S]*WHERE LOWER\(email\)\s*=\s*LOWER\(\$1\)[\s\S]*mobile_number/i.test(cleanSql)) {
      const email = String(params[0] || "").toLowerCase().trim();
      const mobileInput = String(params[1] || "").replace(/\D/g, "");
      const user = this.users.find(u =>
        u.email.toLowerCase() === email &&
        (u.mobile_number || "").replace(/\D/g, "") === mobileInput
      );
      return { rows: user ? [{ id: user.id, full_name: user.full_name, email: user.email, mobile_number: user.mobile_number }] : [], rowCount: user ? 1 : 0 };
    }

    // Password reset update
    if (/UPDATE users SET password_hash\s*=\s*\$1[\s\S]*WHERE id\s*=\s*\$2/i.test(cleanSql)) {
      const [newHash, userId] = params;
      const user = this.users.find(u => u.id === Number(userId));
      if (user) {
        user.password_hash = newHash;
        user.updated_at = new Date().toISOString();
      }
      return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 };
    }

    if (/SELECT users\.id, users\.full_name, users\.email,[\s\S]*sellers\.store_name/i.test(cleanSql)) {
      if (cleanSql.includes("$1") && !cleanSql.includes("WHERE users.id")) {
        const identifier = String(params[0] || "").trim();
        const cleanIdentMobile = identifier.replace(/\D/g, "");
        const user = this.users.find(u =>
          u.email.toLowerCase() === identifier.toLowerCase() ||
          (cleanIdentMobile && (u.mobile_number || "").replace(/\D/g, "") === cleanIdentMobile)
        );
        if (!user) return { rows: [], rowCount: 0 };
        const seller = this.sellers.find(s => s.user_id === user.id);
        return {
          rows: [{
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            mobile_number: user.mobile_number || "",
            role: user.role,
            store_name: seller?.store_name || "",
            password_hash: user.password_hash
          }],
          rowCount: 1
        };
      }
      if (/WHERE users\.id\s*=\s*\$1/i.test(cleanSql)) {
        const id = Number(params[0]);
        const user = this.users.find(u => u.id === id);
        if (!user) return { rows: [], rowCount: 0 };
        const seller = this.sellers.find(s => s.user_id === user.id);
        return {
          rows: [{
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            mobile_number: user.mobile_number || "",
            role: user.role,
            store_name: seller?.store_name || ""
          }],
          rowCount: 1
        };
      }
    }

    if (/INSERT INTO buyers/i.test(cleanSql)) {
      const [userId, fullName, email] = params;
      if (!this.buyers.find(b => b.user_id === userId)) {
        this.buyers.push({
          id: this.nextId("buyers"),
          user_id: userId,
          full_name: fullName,
          email: email,
          created_at: new Date().toISOString()
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (/INSERT INTO sellers/i.test(cleanSql)) {
      const [userId, fullName, email, storeName] = params;
      const existing = this.sellers.find(s => s.user_id === userId);
      if (existing) {
        existing.full_name = fullName;
        existing.email = email;
        existing.store_name = storeName;
      } else {
        this.sellers.push({
          id: this.nextId("sellers"),
          user_id: userId,
          full_name: fullName,
          email: email,
          store_name: storeName,
          created_at: new Date().toISOString()
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // -----------------------------------------------------------------------
    // CATEGORIES
    // -----------------------------------------------------------------------
    if (/SELECT id, name FROM categories ORDER BY name/i.test(cleanSql)) {
      const list = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
      return { rows: list.map(c => ({ id: c.id, name: c.name })), rowCount: list.length };
    }

    if (/SELECT id FROM categories WHERE LOWER\(name\)\s*=\s*LOWER\(\$1\)/i.test(cleanSql)) {
      const name = String(params[0] || "").toLowerCase().trim();
      const match = this.categories.find(c => c.name.toLowerCase() === name);
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }

    if (/INSERT INTO categories \(name\) VALUES \(\$1\) RETURNING id/i.test(cleanSql)) {
      const id = this.nextId("categories");
      const name = String(params[0] || "").trim();
      this.categories.push({ id, name, description: "", created_at: new Date().toISOString() });
      return { rows: [{ id }], rowCount: 1 };
    }

    // -----------------------------------------------------------------------
    // PRODUCTS
    // -----------------------------------------------------------------------
    if (/SELECT id FROM sellers WHERE user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const s = this.sellers.find(x => x.user_id === userId);
      return { rows: s ? [{ id: s.id }] : [], rowCount: s ? 1 : 0 };
    }

    if (/SELECT id FROM sellers WHERE id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i.test(cleanSql)) {
      const [id, userId] = params.map(Number);
      const s = this.sellers.find(x => x.id === id && x.user_id === userId);
      return { rows: s ? [{ id: s.id }] : [], rowCount: s ? 1 : 0 };
    }

    if (/SELECT id FROM sellers WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const id = Number(params[0]);
      const s = this.sellers.find(x => x.id === id);
      return { rows: s ? [{ id: s.id }] : [], rowCount: s ? 1 : 0 };
    }

    if (/SELECT p\.id FROM products p JOIN sellers s ON s\.id = p\.seller_id WHERE p\.id\s*=\s*\$1 AND s\.user_id\s*=\s*\$2/i.test(cleanSql)) {
      const [productId, userId] = params.map(Number);
      const p = this.products.find(x => x.id === productId);
      if (p) {
        const s = this.sellers.find(x => x.id === p.seller_id && x.user_id === userId);
        if (s) return { rows: [{ id: p.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Single product detail
    if (/SELECT p\.id, p\.name, p\.description, p\.price[\s\S]*FROM products p[\s\S]*WHERE p\.id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      const p = this.products.find(x => x.id === productId);
      if (!p) return { rows: [], rowCount: 0 };
      const cat = this.categories.find(c => c.id === p.category_id);
      const reviews = this.product_reviews.filter(r => r.product_id === p.id && r.moderation_status === "approved");
      const avgRating = reviews.length ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)) : 0;
      const images = this.product_images.filter(img => img.product_id === p.id).map(img => ({
        id: img.id,
        url: `/api/products/${p.id}/images/${img.id}`
      }));

      const row = {
        ...p,
        mrp_price: p.mrp_price ?? p.price,
        exact_stock: p.stock,
        category_name: cat?.name || null,
        average_rating: avgRating,
        review_count: reviews.length,
        in_stock: p.is_available && p.stock > 0,
        availability: !p.is_available ? "Currently Unavailable" : (p.stock <= 0 ? "Out of Stock" : "In Stock"),
        images: images.length ? images : []
      };
      return { rows: [row], rowCount: 1 };
    }

    // Buyer product list (SELECT FROM products p LEFT JOIN categories c LEFT JOIN sellers s ...)
    if (/FROM products p[\s\S]*LEFT JOIN categories c[\s\S]*LEFT JOIN sellers s/i.test(cleanSql) && !cleanSql.includes("WHERE s.user_id = $1") && !cleanSql.includes("admin")) {
      let filtered = [...this.products];
      if (params.length > 0) {
        for (let i = 0; i < params.length; i++) {
          const val = String(params[i] || "").replace(/%/g, "").toLowerCase().trim();
          if (!val) continue;
          if (/LIKE/i.test(cleanSql) && i === 0 && params[0].startsWith("%")) {
            filtered = filtered.filter(p =>
              p.name.toLowerCase().includes(val) ||
              (p.description || "").toLowerCase().includes(val) ||
              (p.brand || "").toLowerCase().includes(val)
            );
          } else {
            // Category filter
            filtered = filtered.filter(p => {
              const cat = this.categories.find(c => c.id === p.category_id);
              return String(p.category_id) === val || (cat && cat.name.toLowerCase() === val);
            });
          }
        }
      }

      const rows = filtered.map(p => {
        const cat = this.categories.find(c => c.id === p.category_id);
        const sel = this.sellers.find(s => s.id === p.seller_id);
        const reviews = this.product_reviews.filter(r => r.product_id === p.id && r.moderation_status === "approved");
        const avgRating = reviews.length ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)) : 0;
        const images = this.product_images.filter(img => img.product_id === p.id).map(img => ({
          id: img.id,
          url: `/api/products/${p.id}/images/${img.id}`
        }));

        return {
          ...p,
          mrp_price: p.mrp_price ?? p.price,
          category_name: cat?.name || null,
          seller_name: sel?.full_name || null,
          store_name: sel?.store_name || null,
          average_rating: avgRating,
          review_count: reviews.length,
          in_stock: p.is_available && p.stock > 0,
          availability: !p.is_available ? "Currently Unavailable" : (p.stock <= 0 ? "Out of Stock" : "In Stock"),
          images
        };
      });

      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows, rowCount: rows.length };
    }

    // Seller's product list
    if (/FROM products p[\s\S]*JOIN sellers s ON s\.id = p\.seller_id[\s\S]*WHERE s\.user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const seller = this.sellers.find(s => s.user_id === userId);
      if (!seller) return { rows: [], rowCount: 0 };
      const items = this.products.filter(p => p.seller_id === seller.id).map(p => {
        const cat = this.categories.find(c => c.id === p.category_id);
        return {
          ...p,
          category_name: cat?.name || null
        };
      });
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows: items, rowCount: items.length };
    }

    // Insert Product
    if (/INSERT INTO products/i.test(cleanSql)) {
      const id = this.nextId("products");
      let newProduct;
      if (cleanSql.includes("RETURNING id")) {
        // Admin insert
        const [sellerId, categoryId, name, description, price, mrp, stock, image_url, brand, specs, offer, coupon, policy, is_avail] = params;
        newProduct = {
          id,
          seller_id: Number(sellerId),
          category_id: categoryId ? Number(categoryId) : null,
          name: String(name),
          description: String(description || ""),
          price: Number(price),
          mrp_price: Number(mrp ?? price),
          stock: Number(stock),
          image_url: String(image_url || ""),
          brand: String(brand || ""),
          specifications: typeof specs === "string" ? JSON.parse(specs || "{}") : (specs || {}),
          offer_text: offer,
          coupon_code: coupon,
          return_policy: policy,
          is_available: is_avail !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        this.products.push(newProduct);
        return { rows: [{ id: newProduct.id }], rowCount: 1 };
      } else {
        // Seller insert
        const [sellerId, categoryId, name, description, price, mrp, stock, image_url, brand, specs, offer, coupon, policy] = params;
        newProduct = {
          id,
          seller_id: Number(sellerId),
          category_id: categoryId ? Number(categoryId) : null,
          name: String(name),
          description: String(description || ""),
          price: Number(price),
          mrp_price: Number(mrp ?? price),
          stock: Number(stock),
          image_url: String(image_url || ""),
          brand: String(brand || ""),
          specifications: typeof specs === "string" ? JSON.parse(specs || "{}") : (specs || {}),
          offer_text: offer,
          coupon_code: coupon,
          return_policy: policy,
          is_available: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        this.products.push(newProduct);
        return { rows: [newProduct], rowCount: 1 };
      }
    }

    // Update Product
    if (/UPDATE products SET/i.test(cleanSql)) {
      const productId = Number(params[params.length - 1]);
      const p = this.products.find(x => x.id === productId);
      if (!p) return { rows: [], rowCount: 0 };
      if (params.length === 13) {
        // Seller update
        const [name, description, category_id, price, mrp, stock, image_url, brand, specs, offer, coupon, policy] = params;
        p.name = name;
        p.description = description;
        p.category_id = category_id ? Number(category_id) : null;
        p.price = Number(price);
        p.mrp_price = Number(mrp);
        p.stock = Number(stock);
        p.image_url = image_url;
        p.brand = brand;
        p.specifications = typeof specs === "string" ? JSON.parse(specs || "{}") : (specs || {});
        p.offer_text = offer;
        p.coupon_code = coupon;
        p.return_policy = policy;
        p.updated_at = new Date().toISOString();
      } else if (params.length === 15) {
        // Admin update
        const [seller_id, category_id, name, description, price, mrp, stock, image_url, brand, specs, offer, coupon, policy, is_available] = params;
        p.seller_id = Number(seller_id);
        p.category_id = category_id ? Number(category_id) : null;
        p.name = name;
        p.description = description;
        p.price = Number(price);
        p.mrp_price = Number(mrp);
        p.stock = Number(stock);
        p.image_url = image_url;
        p.brand = brand;
        p.specifications = typeof specs === "string" ? JSON.parse(specs || "{}") : (specs || {});
        p.offer_text = offer;
        p.coupon_code = coupon;
        p.return_policy = policy;
        p.is_available = is_available;
        p.updated_at = new Date().toISOString();
      }
      return { rows: [p], rowCount: 1 };
    }

    // Delete Product
    if (/DELETE FROM products WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      const idx = this.products.findIndex(x => x.id === productId);
      if (idx !== -1) this.products.splice(idx, 1);
      return { rows: [], rowCount: idx !== -1 ? 1 : 0 };
    }

    if (/SELECT 1 FROM order_items WHERE product_id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      const match = this.order_items.find(oi => oi.product_id === productId);
      return { rows: match ? [{ "?column?": 1 }] : [], rowCount: match ? 1 : 0 };
    }

    if (/DELETE FROM inventory_movements WHERE product_id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      this.inventory_movements = this.inventory_movements.filter(m => m.product_id !== productId);
      return { rows: [], rowCount: 1 };
    }

    if (/SELECT stock FROM products WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      const p = this.products.find(x => x.id === productId);
      return { rows: p ? [{ stock: p.stock }] : [], rowCount: p ? 1 : 0 };
    }

    // -----------------------------------------------------------------------
    // CART & CART ITEMS
    // -----------------------------------------------------------------------
    if (/SELECT id FROM carts WHERE user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      let cart = this.carts.find(c => c.user_id === userId);
      return { rows: cart ? [{ id: cart.id }] : [], rowCount: cart ? 1 : 0 };
    }

    if (/INSERT INTO carts \(user_id\) VALUES \(\$1\) RETURNING id/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const id = this.nextId("carts");
      this.carts.push({ id, user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (/FROM cart_items ci JOIN products p ON p\.id = ci\.product_id[\s\S]*WHERE ci\.cart_id\s*=\s*\$1/i.test(cleanSql)) {
      const cartId = Number(params[0]);
      const items = this.cart_items.filter(ci => ci.cart_id === cartId).map(ci => {
        const p = this.products.find(prod => prod.id === ci.product_id) || {};
        const cat = this.categories.find(c => c.id === p.category_id);
        return {
          id: ci.id,
          product_id: ci.product_id,
          quantity: ci.quantity,
          price: p.price || ci.price,
          name: p.name || "",
          product_name: p.name || "",
          description: p.description || "",
          image_url: p.image_url || "",
          mrp_price: p.mrp_price ?? p.price,
          in_stock: p.is_available && p.stock > 0,
          category_name: cat?.name || null,
          seller_id: p.seller_id
        };
      });
      return { rows: items, rowCount: items.length };
    }

    if (/SELECT id, price, stock, is_available FROM products WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const productId = Number(params[0]);
      const p = this.products.find(prod => prod.id === productId);
      return { rows: p ? [{ id: p.id, price: p.price, stock: p.stock, is_available: p.is_available }] : [], rowCount: p ? 1 : 0 };
    }

    if (/SELECT id, quantity FROM cart_items WHERE cart_id\s*=\s*\$1 AND product_id\s*=\s*\$2/i.test(cleanSql)) {
      const [cartId, productId] = params.map(Number);
      const match = this.cart_items.find(ci => ci.cart_id === cartId && ci.product_id === productId);
      return { rows: match ? [{ id: match.id, quantity: match.quantity }] : [], rowCount: match ? 1 : 0 };
    }

    if (/INSERT INTO cart_items \(cart_id, product_id, quantity, price\)/i.test(cleanSql)) {
      const [cartId, productId, quantity, price] = params;
      const id = this.nextId("cart_items");
      this.cart_items.push({
        id,
        cart_id: Number(cartId),
        product_id: Number(productId),
        quantity: Number(quantity),
        price: Number(price),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return { rows: [], rowCount: 1 };
    }

    if (/UPDATE cart_items SET quantity\s*=\s*\$1,\s*price\s*=\s*\$2/i.test(cleanSql)) {
      const [quantity, price, itemId] = params.map(Number);
      const item = this.cart_items.find(ci => ci.id === itemId);
      if (item) {
        item.quantity = quantity;
        item.price = price;
        item.updated_at = new Date().toISOString();
      }
      return { rows: [], rowCount: item ? 1 : 0 };
    }

    if (/SELECT ci\.id, p\.stock, p\.is_available, p\.price FROM cart_items ci JOIN products p/i.test(cleanSql)) {
      const [itemId, cartId] = params.map(Number);
      const ci = this.cart_items.find(x => x.id === itemId && x.cart_id === cartId);
      if (!ci) return { rows: [], rowCount: 0 };
      const p = this.products.find(prod => prod.id === ci.product_id);
      return { rows: [{ id: ci.id, stock: p?.stock || 0, is_available: p?.is_available || false, price: p?.price || ci.price }], rowCount: 1 };
    }

    if (/DELETE FROM cart_items WHERE id\s*=\s*\$1 AND cart_id\s*=\s*\$2/i.test(cleanSql)) {
      const [itemId, cartId] = params.map(Number);
      const idx = this.cart_items.findIndex(ci => ci.id === itemId && ci.cart_id === cartId);
      if (idx !== -1) this.cart_items.splice(idx, 1);
      return { rows: [], rowCount: idx !== -1 ? 1 : 0 };
    }

    if (/DELETE FROM cart_items WHERE cart_id\s*=\s*\$1/i.test(cleanSql)) {
      const cartId = Number(params[0]);
      this.cart_items = this.cart_items.filter(ci => ci.cart_id !== cartId);
      return { rows: [], rowCount: 1 };
    }

    if (/DELETE FROM cart_items WHERE id\s*=\s*ANY\(\$1::int\[\]\)/i.test(cleanSql)) {
      const ids = (params[0] || []).map(Number);
      this.cart_items = this.cart_items.filter(ci => !ids.includes(ci.id));
      return { rows: [], rowCount: ids.length };
    }

    // -----------------------------------------------------------------------
    // WISHLIST
    // -----------------------------------------------------------------------
    if (/FROM wishlist_items wi JOIN products p ON p\.id = wi\.product_id[\s\S]*WHERE wi\.buyer_id\s*=\s*\$1/i.test(cleanSql)) {
      const buyerId = Number(params[0]);
      const items = this.wishlist_items.filter(wi => wi.buyer_id === buyerId).map(wi => {
        const p = this.products.find(prod => prod.id === wi.product_id) || {};
        const cat = this.categories.find(c => c.id === p.category_id);
        return {
          id: wi.id,
          product_id: wi.product_id,
          name: p.name || "",
          description: p.description || "",
          price: p.price || 0,
          image_url: p.image_url || "",
          category_name: cat?.name || null
        };
      });
      return { rows: items, rowCount: items.length };
    }

    if (/SELECT (id|id,\s*name) FROM products WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const id = Number(params[0]);
      const p = this.products.find(x => x.id === id);
      return { rows: p ? [{ id: p.id, name: p.name }] : [], rowCount: p ? 1 : 0 };
    }

    if (/SELECT id FROM wishlist_items WHERE buyer_id\s*=\s*\$1 AND product_id\s*=\s*\$2/i.test(cleanSql)) {
      const [buyerId, productId] = params.map(Number);
      const match = this.wishlist_items.find(wi => wi.buyer_id === buyerId && wi.product_id === productId);
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }

    if (/INSERT INTO wishlist_items/i.test(cleanSql)) {
      const [buyerId, productId] = params.map(Number);
      const id = this.nextId("wishlist_items");
      const item = { id, buyer_id: buyerId, product_id: productId, created_at: new Date().toISOString() };
      this.wishlist_items.push(item);
      return { rows: [item], rowCount: 1 };
    }

    if (/DELETE FROM wishlist_items WHERE buyer_id\s*=\s*\$1 AND product_id\s*=\s*\$2/i.test(cleanSql)) {
      const [buyerId, productId] = params.map(Number);
      const idx = this.wishlist_items.findIndex(wi => wi.buyer_id === buyerId && wi.product_id === productId);
      if (idx !== -1) this.wishlist_items.splice(idx, 1);
      return { rows: [], rowCount: idx !== -1 ? 1 : 0 };
    }

    // -----------------------------------------------------------------------
    // CHECKOUT & ORDERS
    // -----------------------------------------------------------------------
    if (/FROM carts c JOIN cart_items ci ON ci\.cart_id = c\.id[\s\S]*WHERE c\.user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const cart = this.carts.find(c => c.user_id === userId);
      if (!cart) return { rows: [], rowCount: 0 };
      const items = this.cart_items.filter(ci => ci.cart_id === cart.id).map(ci => {
        const p = this.products.find(prod => prod.id === ci.product_id) || {};
        return {
          id: ci.id,
          cart_item_id: ci.id,
          product_id: ci.product_id,
          quantity: ci.quantity,
          name: p.name || "",
          price: p.price || 0,
          mrp_price: p.mrp_price ?? p.price,
          available_stock: p.stock || 0,
          stock: p.stock || 0,
          is_available: p.is_available,
          seller_id: p.seller_id,
          image_url: p.image_url,
          product_image_snapshot: p.image_url
        };
      });
      return { rows: items, rowCount: items.length };
    }

    if (/SELECT id, recipient_name, phone, address_line1[\s\S]*FROM delivery_addresses WHERE user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const list = this.delivery_addresses.filter(a => a.user_id === userId);
      return { rows: list, rowCount: list.length };
    }

    if (/SELECT id, recipient_name[\s\S]*FROM delivery_addresses WHERE id\s*=\s*\$1 AND user_id\s*=\s*\$2/i.test(cleanSql)) {
      const [id, userId] = params.map(Number);
      const addr = this.delivery_addresses.find(a => a.id === id && a.user_id === userId);
      return { rows: addr ? [addr] : [], rowCount: addr ? 1 : 0 };
    }

    if (/INSERT INTO delivery_addresses/i.test(cleanSql)) {
      const [userId, name, phone, l1, l2, city, state, postal] = params;
      const id = this.nextId("delivery_addresses");
      const addr = {
        id,
        user_id: Number(userId),
        recipient_name: name,
        phone,
        address_line1: l1,
        address_line2: l2 || null,
        city,
        state,
        postal_code: postal,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.delivery_addresses.push(addr);
      return { rows: [addr], rowCount: 1 };
    }

    if (/SELECT id, status, total_amount FROM orders WHERE user_id\s*=\s*\$1 AND idempotency_key\s*=\s*\$2/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const key = String(params[1] || "");
      const order = this.orders.find(o => o.user_id === userId && o.idempotency_key === key);
      return { rows: order ? [order] : [], rowCount: order ? 1 : 0 };
    }

    if (/INSERT INTO orders/i.test(cleanSql)) {
      const [userId, totalAmount, discountAmount, addressJson, idempotencyKey] = params;
      const id = this.nextId("orders");
      const parsedAddr = typeof addressJson === "string" ? JSON.parse(addressJson) : addressJson;
      const order = {
        id,
        user_id: Number(userId),
        total_amount: Number(totalAmount),
        subtotal: Number(totalAmount),
        discount_amount: Number(discountAmount || 0),
        shipping_amount: 0,
        delivery_address: parsedAddr,
        status: "confirmed",
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.orders.push(order);
      return { rows: [{ id }], rowCount: 1 };
    }

    if (/UPDATE products SET stock = stock - \$1/i.test(cleanSql)) {
      const [quantity, productId] = params.map(Number);
      const p = this.products.find(prod => prod.id === productId);
      if (p && p.stock >= quantity) {
        p.stock -= quantity;
        p.updated_at = new Date().toISOString();
        return { rows: [{ id: p.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (/INSERT INTO inventory_movements/i.test(cleanSql)) {
      const id = this.nextId("inventory_movements");
      this.inventory_movements.push({ id, created_at: new Date().toISOString() });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (/INSERT INTO order_items/i.test(cleanSql)) {
      const [orderId, productId, sellerId, quantity, price, mrp, subtotal, name, img, cartItemId] = params;
      const id = this.nextId("order_items");
      const item = {
        id,
        order_id: Number(orderId),
        product_id: Number(productId),
        seller_id: Number(sellerId),
        quantity: Number(quantity),
        price: Number(price),
        mrp_price: Number(mrp),
        subtotal: Number(subtotal),
        product_name_snapshot: name,
        product_image_snapshot: img,
        cart_item_id: cartItemId ? Number(cartItemId) : null
      };
      this.order_items.push(item);
      return { rows: [item], rowCount: 1 };
    }

    if (/INSERT INTO order_status_history/i.test(cleanSql)) {
      const [orderId, status, changedBy] = params;
      const id = this.nextId("order_status_history");
      const row = { id, order_id: Number(orderId), status, changed_by: changedBy, created_at: new Date().toISOString() };
      this.order_status_history.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/INSERT INTO payments/i.test(cleanSql)) {
      const [orderId, method, amount] = params;
      const id = this.nextId("payments");
      this.payments.push({
        id,
        order_id: Number(orderId),
        payment_method: method,
        payment_status: "pending",
        amount: Number(amount),
        created_at: new Date().toISOString()
      });
      return { rows: [], rowCount: 1 };
    }

    // Buyer Orders List
    if (/FROM orders o[\s\S]*WHERE o\.user_id\s*=\s*\$1[\s\S]*ORDER BY o\.created_at DESC/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const userOrders = this.orders.filter(o => o.user_id === userId);
      const rows = userOrders.map(o => {
        const payment = this.payments.find(p => p.order_id === o.id);
        const items = this.order_items.filter(oi => oi.order_id === o.id).map(oi => {
          const prod = this.products.find(p => p.id === oi.product_id);
          const rev = this.product_reviews.find(r => r.order_item_id === oi.id);
          return {
            order_item_id: oi.id,
            product_id: oi.product_id,
            product_name: oi.product_name_snapshot || prod?.name || "",
            quantity: oi.quantity,
            price: oi.price,
            subtotal: oi.subtotal,
            image_url: oi.product_image_snapshot || prod?.image_url || "",
            reviewed: Boolean(rev)
          };
        });
        const history = this.order_status_history.filter(h => h.order_id === o.id).map(h => ({
          status: h.status,
          created_at: h.created_at
        }));
        return {
          id: o.id,
          total_amount: o.total_amount,
          status: o.status,
          created_at: o.created_at,
          delivery_address: o.delivery_address,
          payment_method: payment?.payment_method || "Cash on Delivery",
          payment_status: payment?.payment_status || "pending",
          items,
          status_history: history
        };
      });
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows, rowCount: rows.length };
    }

    // Single order fetch
    if (/FROM orders o[\s\S]*WHERE o\.id\s*=\s*\$1\s+AND\s+o\.user_id\s*=\s*\$2/i.test(cleanSql)) {
      const [orderId, userId] = params.map(Number);
      const o = this.orders.find(ord => ord.id === orderId && ord.user_id === userId);
      if (!o) return { rows: [], rowCount: 0 };
      const payment = this.payments.find(p => p.order_id === o.id);
      const items = this.order_items.filter(oi => oi.order_id === o.id).map(oi => {
        const prod = this.products.find(p => p.id === oi.product_id);
        return {
          order_item_id: oi.id,
          product_id: oi.product_id,
          product_name: oi.product_name_snapshot || prod?.name || "",
          quantity: oi.quantity,
          price: oi.price,
          subtotal: oi.subtotal,
          image_url: oi.product_image_snapshot || prod?.image_url || "",
          reviewed: false
        };
      });
      return {
        rows: [{
          ...o,
          payment_method: payment?.payment_method || "Cash on Delivery",
          payment_status: payment?.payment_status || "pending",
          items,
          status_history: []
        }],
        rowCount: 1
      };
    }

    // Order status update checks
    if (/SELECT id, status FROM orders WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const orderId = Number(params[0]);
      const o = this.orders.find(x => x.id === orderId);
      return { rows: o ? [{ id: o.id, status: o.status }] : [], rowCount: o ? 1 : 0 };
    }

    // Seller order ownership check for status updates
    if (/FROM order_items oi[\s\S]*WHERE oi\.order_id\s*=\s*\$1/i.test(cleanSql) && cleanSql.includes("COUNT(*) FILTER")) {
      const [orderId, sellerUserId] = params.map(Number);
      const items = this.order_items.filter(oi => oi.order_id === orderId);
      const seller = this.sellers.find(s => s.user_id === sellerUserId);
      const owned = items.filter(oi => oi.seller_id === (seller ? seller.id : -1)).length;
      return {
        rows: [{
          total: items.length,
          owned
        }],
        rowCount: 1
      };
    }

    if (/UPDATE orders SET status/i.test(cleanSql)) {
      let orderId, status;
      for (const p of params) {
        if (typeof p === "number" || /^\d+$/.test(p)) {
          orderId = Number(p);
        } else if (typeof p === "string" && !/^\d+$/.test(p)) {
          status = p;
        }
      }
      const o = this.orders.find(x => x.id === orderId);
      if (o) {
        if (status) o.status = status;
        o.updated_at = new Date().toISOString();
      }
      return { rows: [], rowCount: o ? 1 : 0 };
    }

    if (/UPDATE orders SET status\s*=\s*'received'[\s\S]*WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const orderId = Number(params[0]);
      const o = this.orders.find(x => x.id === orderId);
      if (o) o.status = "received";
      return { rows: [], rowCount: o ? 1 : 0 };
    }

    if (/UPDATE orders SET status\s*=\s*'completed'[\s\S]*WHERE id\s*=\s*\$1/i.test(cleanSql)) {
      const orderId = Number(params[0]);
      const o = this.orders.find(x => x.id === orderId);
      if (o) o.status = "completed";
      return { rows: [], rowCount: o ? 1 : 0 };
    }

    if (/SELECT created_at FROM order_status_history WHERE order_id\s*=\s*\$1 AND status\s*=\s*'received'/i.test(cleanSql)) {
      const orderId = Number(params[0]);
      const h = this.order_status_history.find(x => x.order_id === orderId && x.status === "received");
      return { rows: h ? [{ created_at: h.created_at }] : [], rowCount: h ? 1 : 0 };
    }

    // Seller's orders
    if (/FROM order_items oi JOIN orders o ON o\.id = oi\.order_id[\s\S]*WHERE s\.user_id\s*=\s*\$1/i.test(cleanSql)) {
      const userId = Number(params[0]);
      const seller = this.sellers.find(s => s.user_id === userId);
      if (!seller) return { rows: [], rowCount: 0 };
      const sellerItems = this.order_items.filter(oi => oi.seller_id === seller.id);
      const rows = sellerItems.map(oi => {
        const o = this.orders.find(ord => ord.id === oi.order_id) || {};
        const p = this.products.find(prod => prod.id === oi.product_id) || {};
        const buyer = this.users.find(u => u.id === o.user_id) || {};
        const payment = this.payments.find(pay => pay.order_id === o.id);
        return {
          order_id: o.id,
          buyer_name: buyer.full_name || "Customer",
          product_name: oi.product_name_snapshot || p.name || "",
          quantity: oi.quantity,
          subtotal: oi.subtotal,
          total_amount: o.total_amount,
          status: o.status,
          created_at: o.created_at,
          payment_method: payment?.payment_method || "Cash on Delivery",
          payment_status: payment?.payment_status || "pending",
          can_update_status: true
        };
      });
      return { rows, rowCount: rows.length };
    }

    // -----------------------------------------------------------------------
    // ADMIN DASHBOARD
    // -----------------------------------------------------------------------
    if (/SELECT COUNT\(\*\)::int AS total FROM users/i.test(cleanSql)) {
      if (/WHERE role\s*=\s*'buyer'/i.test(cleanSql)) {
        const count = this.users.filter(u => u.role === "buyer").length;
        return { rows: [{ total: count }], rowCount: 1 };
      }
      if (/WHERE role\s*=\s*'seller'/i.test(cleanSql)) {
        const count = this.users.filter(u => u.role === "seller").length;
        return { rows: [{ total: count }], rowCount: 1 };
      }
      return { rows: [{ total: this.users.length }], rowCount: 1 };
    }

    if (/SELECT COUNT\(\*\)::int AS total FROM products/i.test(cleanSql)) {
      return { rows: [{ total: this.products.length }], rowCount: 1 };
    }

    if (/SELECT COUNT\(\*\)::int AS total FROM orders/i.test(cleanSql)) {
      return { rows: [{ total: this.orders.length }], rowCount: 1 };
    }

    if (/SELECT COALESCE\(SUM\(total_amount\), 0\)::numeric AS total FROM orders/i.test(cleanSql)) {
      const sum = this.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      return { rows: [{ total: sum }], rowCount: 1 };
    }

    if (/COUNT\(\*\) FILTER \(WHERE status = 'confirmed'\)/i.test(cleanSql)) {
      const confirmed = this.orders.filter(o => o.status === "confirmed").length;
      const processing = this.orders.filter(o => o.status === "processing").length;
      const on_the_way = this.orders.filter(o => o.status === "on_the_way").length;
      const completed = this.orders.filter(o => o.status === "completed").length;
      const cancelled = this.orders.filter(o => o.status === "cancelled").length;
      return {
        rows: [{
          new_orders: confirmed,
          processing,
          on_the_way,
          awaiting_confirmation: on_the_way,
          completed,
          cancelled
        }],
        rowCount: 1
      };
    }

    if (/SELECT id, full_name, email, role, created_at FROM users/i.test(cleanSql)) {
      let list = [...this.users];
      if (params.length > 0) {
        for (const p of params) {
          const val = String(p).replace(/%/g, "").toLowerCase().trim();
          if (["buyer", "seller", "admin"].includes(val)) {
            list = list.filter(u => u.role === val);
          } else if (val) {
            list = list.filter(u => u.full_name.toLowerCase().includes(val) || u.email.toLowerCase().includes(val));
          }
        }
      }
      return { rows: list, rowCount: list.length };
    }

    if (/SELECT p\.id, p\.name[\s\S]*FROM products p[\s\S]*LEFT JOIN sellers s/i.test(cleanSql) && cleanSql.includes("seller_email")) {
      // Admin products list
      const rows = this.products.map(p => {
        const cat = this.categories.find(c => c.id === p.category_id);
        const sel = this.sellers.find(s => s.id === p.seller_id);
        const user = this.users.find(u => u.id === sel?.user_id);
        return {
          ...p,
          category_name: cat?.name || null,
          seller_name: sel?.full_name || null,
          store_name: sel?.store_name || null,
          seller_email: user?.email || "",
          images: []
        };
      });
      return { rows, rowCount: rows.length };
    }

    if (/SELECT s\.id, COALESCE\(s\.store_name, u\.full_name\) AS store_name/i.test(cleanSql)) {
      const rows = this.sellers.map(s => {
        const u = this.users.find(usr => usr.id === s.user_id);
        return { id: s.id, store_name: s.store_name || u?.full_name || "Seller", full_name: u?.full_name || "" };
      });
      return { rows, rowCount: rows.length };
    }

    if (/FROM orders o LEFT JOIN users u ON u\.id = o\.user_id/i.test(cleanSql)) {
      // Admin orders list
      const rows = this.orders.map(o => {
        const u = this.users.find(usr => usr.id === o.user_id);
        const p = this.payments.find(pay => pay.order_id === o.id);
        const oi = this.order_items.filter(item => item.order_id === o.id);
        return {
          id: o.id,
          user_id: o.user_id,
          buyer_name: u?.full_name || "Buyer",
          buyer_email: u?.email || "",
          delivery_address: o.delivery_address,
          status: o.status,
          total_amount: o.total_amount,
          created_at: o.created_at,
          payment_method: p?.payment_method || "Cash on Delivery",
          payment_status: p?.payment_status || "pending",
          item_count: oi.length,
          items: oi.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name_snapshot,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
            image_url: item.product_image_snapshot
          })),
          status_history: []
        };
      });
      return { rows, rowCount: rows.length };
    }

    // Review purchase eligibility verification
    if (/FROM order_items oi[\s\S]*JOIN orders o ON o\.id = oi\.order_id[\s\S]*WHERE oi\.id\s*=\s*\$1\s+AND\s+oi\.product_id\s*=\s*\$2\s+AND\s+o\.user_id\s*=\s*\$3/i.test(cleanSql)) {
      const [orderItemId, productId, userId] = params.map(Number);
      const oi = this.order_items.find(item => item.id === orderItemId && item.product_id === productId);
      if (!oi) return { rows: [], rowCount: 0 };
      const o = this.orders.find(ord => ord.id === oi.order_id && ord.user_id === userId);
      if (!o) return { rows: [], rowCount: 0 };
      if (["received", "completed"].includes(o.status)) {
        return { rows: [{ id: oi.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Product reviews
    if (/FROM product_reviews r/i.test(cleanSql)) {
      const list = this.product_reviews.map(r => {
        const p = this.products.find(prod => prod.id === r.product_id);
        const u = this.users.find(usr => usr.id === r.buyer_id);
        return {
          id: r.id,
          rating: r.rating,
          review_text: r.review_text,
          moderation_status: r.moderation_status,
          created_at: r.created_at,
          product_id: r.product_id,
          product_name: p?.name || "Product",
          buyer_name: u?.full_name || "Buyer",
          verified_purchase: true
        };
      });
      return { rows: list, rowCount: list.length };
    }

    if (/INSERT INTO product_reviews/i.test(cleanSql)) {
      const [productId, buyerId, orderItemId, rating, reviewText] = params;
      const id = this.nextId("product_reviews");
      const rev = {
        id,
        product_id: Number(productId),
        buyer_id: Number(buyerId),
        order_item_id: Number(orderItemId),
        rating: Number(rating),
        review_text: reviewText,
        moderation_status: "approved",
        created_at: new Date().toISOString()
      };
      this.product_reviews.push(rev);
      return { rows: [rev], rowCount: 1 };
    }

    if (/UPDATE product_reviews SET moderation_status = \$1/i.test(cleanSql)) {
      const [status, moderatedBy, reviewId] = params;
      const r = this.product_reviews.find(x => x.id === Number(reviewId));
      if (r) {
        r.moderation_status = status;
        r.moderated_by = moderatedBy;
        r.moderated_at = new Date().toISOString();
      }
      return { rows: [{ id: reviewId }], rowCount: r ? 1 : 0 };
    }

    // Default safe fallback
    return { rows: [], rowCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Exported Pool: connects to PG if DATABASE_URL is reachable, else in-memory
// ---------------------------------------------------------------------------
const memoryStore = new InMemoryStore();

const configuredHost = databaseHostName();
const shouldConnectRealDb = Boolean(databaseUrl) && configuredHost !== "in-memory (mock)";

let realPool = null;
if (shouldConnectRealDb) {
  try {
    realPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseSslOption()
    });
  } catch {
    realPool = null;
  }
}

const pool = {
  async query(sqlText, params) {
    if (realPool) {
      try {
        return await realPool.query(sqlText, params);
      } catch {
        try { await realPool.end(); } catch {}
        realPool = null;
      }
    }
    return memoryStore.query(sqlText, params);
  },

  async connect() {
    if (realPool) {
      try {
        const client = await realPool.connect();
        return client;
      } catch {
        try { await realPool.end(); } catch {}
        realPool = null;
      }
    }
    return {
      query: (sqlText, params) => memoryStore.query(sqlText, params),
      release: () => {}
    };
  },

  async end() {
    if (realPool) {
      try {
        await realPool.end();
      } catch {}
    }
  }
};

module.exports = { pool, databaseHostName };
