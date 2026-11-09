const roleConfig = {
  buyer: {
    title: "Sign in as a buyer",
    subtitle: "Pick up where you left off.",
    eyebrow: "Welcome back",
    submit: "Continue as buyer",
  },

  seller: {
    title: "Sign in as a seller",
    subtitle: "Keep your shop floor moving.",
    eyebrow: "Seller workspace",
    submit: "Open seller desk",
  },

  admin: {
    title: "Sign in as an admin",
    subtitle: "See the whole siva_mart picture.",
    eyebrow: "Private access",
    submit: "Enter admin console",
  }
};

let selectedRole = "buyer";

/* =========================
   ELEMENTS
========================= */

const form = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");

const message = document.querySelector("#form-message");
const loginMessage = message;

const password = document.querySelector("#password");
const submitButton = document.querySelector(".submit-button");

const accountSummary = document.querySelector("#account-summary");
const loginHeading = document.querySelector("#login-heading");

const API_BASE_URL = window.location.origin === "null"
  ? "http://localhost:8080"
  : window.location.origin;
const pageShell = document.querySelector(".page-shell");
const buyerApp = document.querySelector("#buyer-app");
const sellerApp = document.querySelector("#seller-app");
const adminApp = document.querySelector("#admin-app");

const buyerSearch = document.querySelector("#buyer-search");
const productGrid = document.querySelector("#buyer-products");
const cartItemsContainer = document.querySelector("#cart-items");
const wishlistItemsContainer = document.querySelector("#wishlist-items");
const orderHistoryContainer = document.querySelector("#order-history");
const categoryList = document.querySelector("#category-list");
const buyerProductCount = document.querySelector("#product-count");
const buyerCartCount = document.querySelector("#cart-count");
const wishlistCount = document.querySelector("#wishlist-count");
const wishlistSummaryCount = document.querySelector("#wishlist-count-summary");
const cartTotalItems = document.querySelector("#cart-total-items");
const cartSubtotal = document.querySelector("#cart-subtotal");

const sellerProducts = document.querySelector("#seller-products");
const sellerOrders = document.querySelector("#seller-orders");
const sellerForm = document.querySelector("#seller-product-form");
const sellerProductId = document.querySelector("#product-id");
const sellerProductName = document.querySelector("#product-name");
const sellerProductCategory = document.querySelector("#product-category");
const sellerProductDescription = document.querySelector("#product-description");
const sellerProductPrice = document.querySelector("#product-price");
const sellerProductStock = document.querySelector("#product-stock");
const sellerProductImage = document.querySelector("#product-image");
const sellerProductBrand = document.querySelector("#product-brand");
const sellerProductMrp = document.querySelector("#product-mrp");
const sellerProductImages = document.querySelector("#product-images");
let buyerOrders = [];
let checkoutQuote = null;
let checkoutRequestKey = "";
let activeProductId = null;

let buyerCurrentCategory = "all";
let buyerSearchTerm = "";

function currentUser() {
  try {
    const saved = sessionStorage.getItem("siva_mart_user");
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
}

function getAuthHeaders() {
  const user = currentUser();
  return {
    "Content-Type": "application/json",
    ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {})
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeImageUrl(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  try {
    const url = new URL(image, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function closeModal(modal) {
  if (modal) modal.classList.add("hidden-form");
}

function setFormMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message${isError ? " error" : " success"}`;
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected response from server (HTTP ${response.status}). Restart the backend and try again.`);
  }

  return response.json();
}

function hideAllApps() {
  if (buyerApp) buyerApp.classList.add("hidden-form");
  if (sellerApp) sellerApp.classList.add("hidden-form");
  if (adminApp) adminApp.classList.add("hidden-form");
  if (pageShell) pageShell.classList.add("hidden-form");
}

function showLogin() {
  if (buyerApp) buyerApp.classList.add("hidden-form");
  if (sellerApp) sellerApp.classList.add("hidden-form");
  if (adminApp) adminApp.classList.add("hidden-form");
  if (pageShell) pageShell.classList.remove("hidden-form");
  if (form) form.classList.remove("hidden-form");
  if (signupForm) signupForm.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  if (loginHeading) loginHeading.classList.remove("hidden-form");
}

function showSignup() {
  if (buyerApp) buyerApp.classList.add("hidden-form");
  if (sellerApp) sellerApp.classList.add("hidden-form");
  if (pageShell) pageShell.classList.remove("hidden-form");
  if (form) form.classList.add("hidden-form");
  if (signupForm) signupForm.classList.remove("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  if (loginHeading) loginHeading.classList.add("hidden-form");
}

function updateAccountSummary(user) {
  const accountName = document.querySelector("#account-name");
  const accountRole = document.querySelector("#account-role");
  const sellerStoreName = document.querySelector("#seller-store-name");

  if (accountName) {
    accountName.textContent = user?.full_name || user?.email || "Signed in user";
  }

  if (accountRole) {
    const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Account";
    accountRole.textContent = `Role: ${roleLabel}`;
  }

  if (sellerStoreName) {
    sellerStoreName.textContent = user?.store_name || "";
    sellerStoreName.classList.toggle("hidden-form", !user?.store_name);
  }
}

function showAccount(user) {
  if (!user || !user.role) {
    showLogin();
    return;
  }

  updateAccountSummary(user);

  if (user.role === "seller") {
    showSellerView();
    return;
  }

  if (user.role === "admin") {
    showAdminView();
    return;
  }

  showBuyerView();
}

function showSellerView() {
  hideAllApps();
  if (sellerApp) sellerApp.classList.remove("hidden-form");
  if (pageShell) pageShell.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  loadSellerProducts();
  loadSellerOrders();
}

function showBuyerView() {
  hideAllApps();
  if (buyerApp) buyerApp.classList.remove("hidden-form");
  if (pageShell) pageShell.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  loadBuyerDashboard();
}

function showAdminView() {
  hideAllApps();
  if (adminApp) adminApp.classList.remove("hidden-form");
  if (pageShell) pageShell.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  setActiveAdminSection("overview");
  const profileName = document.querySelector("#admin-profile-name");
  if (profileName) {
    profileName.textContent = currentUser()?.full_name || "Siva Mart Admin";
  }
  loadAdminDashboard();
}

function showLogoutMessage() {
  if (!loginMessage) return;
  loginMessage.textContent = "You have been logged out.";
  loginMessage.className = "form-message success";
}

function resetSellerForm() {
  sellerForm.reset();
  sellerProductId.value = "";
  sellerProductMrp.value = "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

const ORDER_STAGES = [
  ["confirmed", "Order Confirmed"],
  ["processing", "Processing"],
  ["on_the_way", "On The Way"],
  ["received", "Received"],
  ["completed", "Order Completed"]
];
const ORDER_NEXT_STATUSES = {
  confirmed: ["on_the_way", "processing"],
  processing: ["on_the_way"],
  on_the_way: ["received"],
  received: ["completed"]
};

function formatPayment(order) {
  const method = String(order.payment_method || "unknown");
  const status = String(order.payment_status || "unknown");
  const note = method === "Cash on Delivery" && status === "pending" ? "Pay on delivery" : status.toUpperCase();
  return `${escapeHtml(method)} · ${escapeHtml(note)}`;
}

function formatOrderStatus(status) {
  const stage = ORDER_STAGES.find(([key]) => key === String(status || "").toLowerCase());
  return (stage ? stage[1] : String(status || "UNKNOWN").replaceAll("_", " ")).toUpperCase();
}

function renderOrderStatusButton(order, orderId, buttonClass) {
  const next = ORDER_NEXT_STATUSES[order.status];
  if (!next) return "—";
  return `<div class="order-status-actions">${next.map((status, index) => {
    const label = ORDER_STAGES.find(([key]) => key === status)[1];
    return `<button type="button" class="${index === 0 ? buttonClass : "secondary-button"}" data-advance-order="${orderId}" data-next-status="${status}" data-next-label="${label}">Mark as ${label}</button>`;
  }).join("")}</div>`;
}

function formatOrderDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function renderOrderTimeline(order) {
  const entries = Array.isArray(order.status_history) ? order.status_history : [];
  const timestamps = new Map(entries.map((entry) => [entry.status, entry.created_at]));
  // Processing is optional, so it only appears on orders that actually went through it.
  const stages = ORDER_STAGES.filter(([status]) => status !== "processing" || order.status === "processing" || timestamps.has("processing"));
  const currentIndex = stages.findIndex(([status]) => status === order.status);
  return `<ol class="order-timeline">${stages.map(([status, title], index) => {
    const timestamp = timestamps.get(status);
    const done = Boolean(timestamp) || index <= currentIndex;
    return `<li class="order-timeline-step ${done ? "is-complete" : ""}">
      <span class="timeline-marker">${done ? "✓" : ""}</span>
      <div><strong>${title}</strong><time>${timestamp ? escapeHtml(formatOrderDate(timestamp)) : (done ? "Done" : "Pending")}</time></div>
    </li>`;
  }).join("")}</ol>`;
}

function setActiveAdminSection(view) {
  const sections = [
    { key: "overview", element: document.querySelector("#admin-overview") },
    { key: "users", element: document.querySelector("#admin-users") },
    { key: "products", element: document.querySelector("#admin-products") },
    { key: "orders", element: document.querySelector("#admin-orders") },
    { key: "reviews", element: document.querySelector("#admin-reviews") }
  ];

  sections.forEach(({ key, element }) => {
    if (element) {
      element.classList.toggle("hidden-form", key !== view);
    }
  });

  document.querySelectorAll(".admin-nav-btn").forEach((button) => {
    const active = button.dataset.adminView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const pageTitle = document.querySelector("#admin-page-title");
  if (pageTitle) {
    const labels = {
      overview: "Overview",
      users: "Users",
      products: "Products",
      orders: "Orders",
      reviews: "Reviews"
    };
    pageTitle.textContent = labels[view] || "Overview";
  }
  if (view === "reviews") loadAdminReviews();
}

async function loadAdminDashboard() {
  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminProducts(),
    loadAdminOrders(),
    loadAdminReviews()
  ]);
}

async function loadAdminStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/stats`, { headers: getAuthHeaders() });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to load stats.");

    const totals = result.totals || {};
    document.querySelector("#admin-total-users").textContent = String(totals.users || 0);
    document.querySelector("#admin-total-buyers").textContent = String(totals.buyers || 0);
    document.querySelector("#admin-total-sellers").textContent = String(totals.sellers || 0);
    document.querySelector("#admin-total-products").textContent = String(totals.products || 0);
    document.querySelector("#admin-total-orders").textContent = String(totals.orders || 0);
    document.querySelector("#admin-new-orders").textContent = String(totals.newOrders || 0);
    document.querySelector("#admin-orders-processing").textContent = String(totals.ordersProcessing || 0);
    document.querySelector("#admin-orders-on-the-way").textContent = String(totals.ordersOnTheWay || 0);
    document.querySelector("#admin-awaiting-confirmation").textContent = String(totals.awaitingConfirmation || 0);
    document.querySelector("#admin-completed-orders").textContent = String(totals.completedOrders || 0);
    document.querySelector("#admin-cancelled-orders").textContent = String(totals.cancelledOrders || 0);
    document.querySelector("#admin-total-order-value").textContent = formatCurrency(totals.orderValue || 0);
    document.querySelector("#admin-total-revenue").textContent = formatCurrency(totals.revenue || 0);
  } catch (error) {
    console.error("Admin stats failed", error);
    const valueNode = document.querySelector("#admin-total-order-value");
    if (valueNode) valueNode.textContent = "Unavailable";
  }
}

async function loadAdminUsers() {
  try {
    const searchInput = document.querySelector("#admin-user-search");
    const roleInput = document.querySelector("#admin-user-role-filter");
    const params = new URLSearchParams();

    if (searchInput && searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (roleInput && roleInput.value && roleInput.value !== "all") params.set("role", roleInput.value);

    const response = await fetch(`${API_BASE_URL}/api/admin/users?${params.toString()}`, { headers: getAuthHeaders() });
    const users = await readApiResponse(response);
    if (!response.ok) throw new Error(users.message || "Unable to load users.");

    const tbody = document.querySelector("#admin-users-body");
    if (!tbody) return;

    tbody.innerHTML = users.length
      ? users.map((user) => `
        <tr>
          <td>${user.id}</td>
          <td>${escapeHtml(user.full_name || "—")}</td>
          <td>${escapeHtml(user.email || "—")}</td>
          <td><span class="admin-role-badge admin-role-${user.role || "unknown"}">${(user.role || "User").toUpperCase()}</span></td>
          <td>${user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN") : "—"}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="5" class="empty-state">No users match your filters.</td></tr>';
  } catch (error) {
    const tbody = document.querySelector("#admin-users-body");
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load users right now.</td></tr>';
    console.error("Admin users failed", error);
  }
}

async function loadAdminProducts() {
  try {
    await loadAdminSellers();
    const categorySelect = document.querySelector("#admin-product-category-filter");
    const response = await fetch(`${API_BASE_URL}/api/categories`);
    const categories = await response.json();

    if (categorySelect) {
      const selectedValue = categorySelect.value || "all";
      categorySelect.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join("");
      categorySelect.value = categories.some((category) => String(category.id) === String(selectedValue)) ? selectedValue : "all";
    }

    const searchInput = document.querySelector("#admin-product-search");
    const params = new URLSearchParams();

    if (searchInput && searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (categorySelect && categorySelect.value && categorySelect.value !== "all") params.set("category", categorySelect.value);

    const productResponse = await fetch(`${API_BASE_URL}/api/admin/products?${params.toString()}`, { headers: getAuthHeaders() });
    const products = await readApiResponse(productResponse);
    if (!productResponse.ok) throw new Error(products.message || "Unable to load products.");

    const tbody = document.querySelector("#admin-products-body");
    if (!tbody) return;

    tbody.innerHTML = products.length
      ? products.map((product) => `
        <tr>
          <td>${product.id}</td>
          <td>${escapeHtml(product.name || "—")}</td>
          <td>${formatCurrency(product.price || 0)}</td>
          <td>${formatCurrency(product.mrp_price || product.price || 0)}</td>
          <td>${Number(product.stock ?? 0) - Number(product.reserved_stock ?? 0)} available · ${Number(product.reserved_stock ?? 0)} reserved</td>
          <td>${escapeHtml(product.category_name || "General")}</td>
          <td>${escapeHtml(product.seller_name || product.store_name || "Unknown seller")}</td>
          <td><div class="admin-product-actions"><button type="button" class="secondary-button" data-admin-edit-product="${product.id}">Edit</button><button type="button" class="secondary-button" data-admin-toggle-product="${product.id}" data-available="${product.is_available}">${product.is_available ? "Disable" : "Enable"}</button><button type="button" class="secondary-button admin-delete-btn" data-admin-delete-product="${product.id}">Delete</button></div></td>
        </tr>
      `).join("")
      : '<tr><td colspan="8" class="empty-state">No products match your filters.</td></tr>';

    document.querySelectorAll("[data-admin-edit-product]").forEach((button) => {
      button.addEventListener("click", () => editAdminProduct(Number(button.dataset.adminEditProduct)));
    });
    document.querySelectorAll("[data-admin-toggle-product]").forEach((button) => {
      button.addEventListener("click", () => toggleAdminProduct(Number(button.dataset.adminToggleProduct), button.dataset.available !== "true"));
    });

    document.querySelectorAll("[data-admin-delete-product]").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.adminDeleteProduct);
        if (!productId) return;
        if (!window.confirm("Delete this product? Existing order history may block the action to protect marketplace records.")) {
          return;
        }
        try {
          const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          const result = await readApiResponse(response);
          if (!response.ok) throw new Error(result.message || "Unable to delete product.");
          alert(result.message || "Product deleted successfully.");
          await loadAdminDashboard();
        } catch (error) {
          alert(error.message || "Unable to delete product.");
        }
      });
    });
  } catch (error) {
    const tbody = document.querySelector("#admin-products-body");
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Unable to load products right now.</td></tr>';
    console.error("Admin products failed", error);
  }
}

async function loadAdminSellers() {
  const select = document.querySelector("#admin-product-seller");
  if (!select) return;
  const response = await fetch(`${API_BASE_URL}/api/admin/sellers`, { headers: getAuthHeaders() });
  const sellers = await readApiResponse(response);
  if (!response.ok) throw new Error(sellers.message || "Unable to load sellers.");
  const selected = select.value;
  select.innerHTML = '<option value="">Select a seller</option>' + sellers.map((seller) =>
    `<option value="${seller.id}">${escapeHtml(seller.store_name)} — ${escapeHtml(seller.full_name)}</option>`
  ).join("");
  if (sellers.some((seller) => String(seller.id) === selected)) select.value = selected;
}

async function editAdminProduct(productId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, { headers: getAuthHeaders() });
    const product = await readApiResponse(response);
    if (!response.ok) throw new Error(product.message || "Unable to load product.");
    document.querySelector("#admin-product-id").value = product.id;
    document.querySelector("#admin-product-seller").value = product.seller_id || "";
    document.querySelector("#admin-product-name").value = product.name || "";
    document.querySelector("#admin-product-category").value = product.category_name || "";
    document.querySelector("#admin-product-brand").value = product.brand || "";
    document.querySelector("#admin-product-description").value = product.description || "";
    document.querySelector("#admin-product-price").value = product.price;
    document.querySelector("#admin-product-mrp").value = product.mrp_price || product.price;
    document.querySelector("#admin-product-stock").value = product.stock;
    document.querySelector("#admin-product-image").value = product.image_url || "";
    document.querySelector("#admin-product-specifications").value = JSON.stringify(product.specifications || {}, null, 2);
    document.querySelector("#admin-product-offer").value = product.offer_text || "";
    document.querySelector("#admin-product-coupon").value = product.coupon_code || "";
    document.querySelector("#admin-product-return-policy").value = product.return_policy || "";
    document.querySelector("#admin-product-available").checked = product.is_available !== false;
    document.querySelector("#admin-product-form").classList.remove("hidden-form");
    document.querySelector("#admin-product-form").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    alert(error.message || "Unable to edit product.");
  }
}

async function toggleAdminProduct(productId, isAvailable) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, { headers: getAuthHeaders() });
    const product = await readApiResponse(response);
    if (!response.ok) throw new Error(product.message || "Unable to load product.");
    const body = {
      seller_id: product.seller_id,
      name: product.name,
      description: product.description,
      category: product.category_name,
      price: Number(product.price),
      mrp_price: Number(product.mrp_price || product.price),
      stock: Number(product.stock),
      image_url: product.image_url,
      brand: product.brand,
      specifications: product.specifications || {},
      offer_text: product.offer_text,
      coupon_code: product.coupon_code,
      return_policy: product.return_policy,
      is_available: isAvailable
    };
    const update = await fetch(`${API_BASE_URL}/api/admin/products/${productId}`, {
      method: "PUT", headers: getAuthHeaders(), body: JSON.stringify(body)
    });
    const result = await readApiResponse(update);
    if (!update.ok) throw new Error(result.message || "Unable to update availability.");
    await loadAdminProducts();
  } catch (error) {
    alert(error.message || "Unable to update product availability.");
  }
}

async function loadAdminOrders() {
  try {
    const searchInput = document.querySelector("#admin-order-search");
    const statusInput = document.querySelector("#admin-order-status-filter");
    const params = new URLSearchParams();

    if (searchInput && searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (statusInput && statusInput.value && statusInput.value !== "all") params.set("status", statusInput.value);

    const newOrderParams = new URLSearchParams();
    newOrderParams.set("status", "confirmed");
    if (searchInput && searchInput.value.trim()) newOrderParams.set("search", searchInput.value.trim());
    const [response, newOrdersResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/orders?${params.toString()}`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/api/admin/orders?${newOrderParams.toString()}`, { headers: getAuthHeaders() })
    ]);
    const [orders, newOrders] = await Promise.all([readApiResponse(response), readApiResponse(newOrdersResponse)]);
    if (!response.ok) throw new Error(orders.message || "Unable to load orders.");
    if (!newOrdersResponse.ok) throw new Error(newOrders.message || "Unable to load new orders.");

    const newOrdersList = document.querySelector("#admin-new-orders-list");
    const newOrdersCount = document.querySelector("#admin-new-orders-count");
    newOrdersCount.textContent = String(newOrders.length);
    newOrdersList.innerHTML = newOrders.length ? newOrders.map((order) => {
      const address = order.delivery_address || {};
      const addressText = [
        address.address_line1, address.address_line2, address.city, address.state, address.postal_code
      ].filter(Boolean).join(", ");
      const items = Array.isArray(order.items) ? order.items : [];
      return `<article class="admin-new-order-card">
        <div class="admin-new-order-heading">
          <strong>Order #${order.id}</strong>
          <span class="admin-role-badge admin-status-confirmed">${formatOrderStatus(order.status)}</span>
        </div>
        <div class="admin-new-order-content">
          <div class="admin-new-order-buyer"><strong>${escapeHtml(order.buyer_name || order.buyer_email || "Buyer")}</strong>
            <span>${escapeHtml(address.phone || "No phone on address")}</span>
            <span>${escapeHtml(addressText || "No delivery address saved")}</span>
            <small>Placed ${escapeHtml(formatOrderDate(order.created_at))}</small>
          </div>
          <div class="admin-order-products">${items.map((item) => `
            <div class="admin-order-product">
              ${item.image_url ? `<img src="${escapeHtml(safeImageUrl(item.image_url))}" alt="${escapeHtml(item.product_name)}" />` : '<span class="admin-order-image-placeholder">SIVA</span>'}
              <span><strong>${escapeHtml(item.product_name)}</strong><small>Qty ${Number(item.quantity)} · ${formatCurrency(item.price)}</small></span>
            </div>
          `).join("")}</div>
          <div class="admin-new-order-total">
            <strong>${formatCurrency(order.total_amount)}</strong>
            <span>${formatPayment(order)}</span>
          </div>
          ${renderOrderStatusButton(order, order.id, "submit-button admin-dispatch-button")}
        </div>
      </article>`;
    }).join("") : '<p class="empty-state">No new orders are waiting.</p>';

    const tbody = document.querySelector("#admin-orders-body");
    if (!tbody) return;

    tbody.innerHTML = orders.length
      ? orders.map((order) => `
        <tr>
          <td>#${order.id}</td>
          <td>${escapeHtml(order.buyer_name || order.buyer_email || "Unknown buyer")}<br /><small>${escapeHtml(order.delivery_address?.phone || "")}</small></td>
          <td>${escapeHtml([order.delivery_address?.address_line1, order.delivery_address?.city, order.delivery_address?.state, order.delivery_address?.postal_code].filter(Boolean).join(", ") || "—")}</td>
          <td>${(order.items || []).map((item) => `${escapeHtml(item.product_name)} × ${Number(item.quantity)}`).join("<br />") || "—"}</td>
          <td><span class="admin-role-badge admin-status-${String(order.status || "unknown").replace(/[^a-z_]/gi, "").toLowerCase()}">${escapeHtml(formatOrderStatus(order.status))}</span></td>
          <td>${formatCurrency(order.total_amount || 0)}<br /><small>${formatPayment(order)}</small></td>
          <td>${escapeHtml(formatOrderDate(order.created_at))}</td>
          <td>${renderOrderStatusButton(order, order.id, "secondary-button")}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="8" class="empty-state">No orders match your filters.</td></tr>';
    bindOrderStatusButtons(document.querySelector("#admin-orders"), "admin", () => Promise.all([loadAdminOrders(), loadAdminStats()]));
  } catch (error) {
    const tbody = document.querySelector("#admin-orders-body");
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Unable to load orders right now.</td></tr>';
    console.error("Admin orders failed", error);
  }
}

function bindOrderStatusButtons(container, role, refresh) {
  container.querySelectorAll("[data-advance-order]").forEach((button) => {
    button.addEventListener("click", () => advanceOrderStatus(button, role, refresh));
  });
}

async function advanceOrderStatus(button, role, refresh) {
  const orderId = button.dataset.advanceOrder;
  if (!window.confirm(`Mark order #${orderId} as ${button.dataset.nextLabel}?`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/${role}/orders/${orderId}/status`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: button.dataset.nextStatus })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to update order status.");
    await refresh();
  } catch (error) {
    window.alert(error.message || "Unable to update order status.");
    button.disabled = false;
  }
}

async function loadAdminReviews() {
  const tbody = document.querySelector("#admin-reviews-body");
  if (!tbody) return;
  try {
    const filter = document.querySelector("#admin-review-filter").value;
    const response = await fetch(`${API_BASE_URL}/api/admin/reviews?status=${encodeURIComponent(filter)}`, { headers: getAuthHeaders() });
    const reviews = await readApiResponse(response);
    if (!response.ok) throw new Error(reviews.message || "Unable to load reviews.");
    tbody.innerHTML = reviews.length ? reviews.map((review) => `
      <tr>
        <td>${escapeHtml(review.product_name)}</td><td>${escapeHtml(review.buyer_name)}</td>
        <td><span class="review-rating">${Number(review.rating)}/5</span></td>
        <td>${escapeHtml(review.review_text)}</td><td>${escapeHtml(review.moderation_status)}</td>
        <td>${review.moderation_status === "pending" ? `<div class="admin-review-actions"><button type="button" class="secondary-button" data-moderate-review="${review.id}" data-status="approved">Approve</button><button type="button" class="secondary-button" data-moderate-review="${review.id}" data-status="rejected">Reject</button></div>` : "—"}</td>
      </tr>
    `).join("") : '<tr><td colspan="6" class="empty-state">No reviews to display.</td></tr>';
    tbody.querySelectorAll("[data-moderate-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const result = await fetch(`${API_BASE_URL}/api/admin/reviews/${button.dataset.moderateReview}`, {
            method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ status: button.dataset.status })
          });
          const payload = await readApiResponse(result);
          if (!result.ok) throw new Error(payload.message || "Unable to moderate review.");
          await Promise.all([loadAdminReviews(), loadAdminStats()]);
        } catch (error) {
          alert(error.message || "Unable to moderate review.");
        }
      });
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message || "Unable to load reviews.")}</td></tr>`;
    console.error("Admin reviews failed", error);
  }
}

async function submitProductReview(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/products/${activeProductId}/reviews`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        order_item_id: Number(document.querySelector("#review-purchase").value),
        rating: Number(document.querySelector("#review-rating").value),
        review_text: document.querySelector("#review-text").value.trim()
      })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to submit review.");
    setFormMessage(document.querySelector("#review-message"), result.message);
    await loadOrders();
    window.setTimeout(() => closeModal(document.querySelector("#review-modal")), 1600);
  } catch (error) {
    setFormMessage(document.querySelector("#review-message"), error.message || "Unable to submit review.", true);
  } finally {
    button.disabled = false;
  }
}

function resetAdminProductForm() {
  const productForm = document.querySelector("#admin-product-form");
  productForm.reset();
  document.querySelector("#admin-product-id").value = "";
  document.querySelector("#admin-product-available").checked = true;
  document.querySelector("#admin-product-specifications").value = "{}";
  productForm.classList.add("hidden-form");
  setFormMessage(document.querySelector("#admin-product-message"), "");
}

async function submitAdminProduct(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const button = formElement.querySelector('button[type="submit"]');
  const productId = document.querySelector("#admin-product-id").value;
  const payload = {
    seller_id: Number(document.querySelector("#admin-product-seller").value),
    name: document.querySelector("#admin-product-name").value.trim(),
    category: document.querySelector("#admin-product-category").value.trim(),
    brand: document.querySelector("#admin-product-brand").value.trim(),
    description: document.querySelector("#admin-product-description").value.trim(),
    price: Number(document.querySelector("#admin-product-price").value),
    mrp_price: Number(document.querySelector("#admin-product-mrp").value),
    stock: Number(document.querySelector("#admin-product-stock").value),
    image_url: document.querySelector("#admin-product-image").value.trim(),
    specifications: document.querySelector("#admin-product-specifications").value || "{}",
    offer_text: document.querySelector("#admin-product-offer").value.trim(),
    coupon_code: document.querySelector("#admin-product-coupon").value.trim(),
    return_policy: document.querySelector("#admin-product-return-policy").value.trim(),
    is_available: document.querySelector("#admin-product-available").checked
  };
  if (!payload.name || !payload.seller_id || !Number.isFinite(payload.price) ||
      payload.price <= 0 || !Number.isFinite(payload.mrp_price) ||
      payload.mrp_price < payload.price || !Number.isSafeInteger(payload.stock) || payload.stock < 0) {
    return setFormMessage(document.querySelector("#admin-product-message"), "Check product name, seller, MRP, selling price, and stock.", true);
  }
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/products${productId ? `/${productId}` : ""}`, {
      method: productId ? "PUT" : "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to save product.");
    const savedProductId = productId || result.product_id;
    const files = document.querySelector("#admin-product-images").files;
    if (files.length) {
      const formData = new FormData();
      for (const file of files) formData.append("images", file);
      const user = currentUser();
      const imageResponse = await fetch(`${API_BASE_URL}/api/products/${savedProductId}/images`, {
        method: "POST",
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        body: formData
      });
      const imageResult = await readApiResponse(imageResponse);
      if (!imageResponse.ok) throw new Error(`${result.message} ${imageResult.message || "Image upload failed."}`);
    }
    resetAdminProductForm();
    await Promise.all([loadAdminProducts(), loadAdminStats()]);
  } catch (error) {
    setFormMessage(document.querySelector("#admin-product-message"), error.message || "Unable to save product.", true);
  } finally {
    button.disabled = false;
  }
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories`);
    const categories = await readApiResponse(response);
    if (!response.ok) throw new Error(categories.message || "Unable to load categories.");
    const buttons = [{ id: "all", name: "All"}, ...categories];

    categoryList.innerHTML = buttons.map((category) => `
      <button type="button" class="category-button ${String(buyerCurrentCategory) === String(category.id) ? "active" : ""}" data-category="${category.id}">
        ${escapeHtml(category.name)}
      </button>
    `).join("");

    document.querySelectorAll(".category-button").forEach((button) => {
      button.addEventListener("click", () => {
        buyerCurrentCategory = button.dataset.category;
        loadProducts();
      });
    });
  } catch (error) {
    console.error("Load categories failed", error);
  }
}

async function loadProducts() {
  try {
    const url = new URL(`${API_BASE_URL}/api/products`);
    if (buyerSearchTerm) url.searchParams.set("search", buyerSearchTerm);
    if (buyerCurrentCategory && buyerCurrentCategory !== "all") url.searchParams.set("category", buyerCurrentCategory);

    const response = await fetch(url);
    const products = await readApiResponse(response);
    if (!response.ok) throw new Error(products.message || "Unable to load products.");

    buyerProductCount.textContent = String(products.length);
    productGrid.innerHTML = products.length
      ? products.map((product) => `
        <article class="product-card" data-product-card="${product.id}">
          <button type="button" class="product-card-image" data-open-product="${product.id}" aria-label="View ${escapeHtml(product.name)}">
            ${product.image_url ? `<img src="${escapeHtml(safeImageUrl(product.image_url))}" alt="${escapeHtml(product.name)}" />` : '<span class="product-image-placeholder">SIVA MART</span>'}
          </button>
          <div class="product-card-body">
            <h5><button type="button" class="product-card-title" data-open-product="${product.id}">${escapeHtml(product.name)}</button></h5>
            <div class="product-meta">${escapeHtml(product.category_name || "General")}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</div>
            <div class="rating-line">${product.review_count ? `★ ${Number(product.average_rating).toFixed(1)} <span>(${Number(product.review_count)} reviews)</span>` : '<span>No reviews yet</span>'}</div>
            <div class="price-line"><strong class="product-price">${formatCurrency(product.price)}</strong>
              ${Number(product.mrp_price) > Number(product.price) ? `<span class="mrp-price">${formatCurrency(product.mrp_price)}</span><span class="discount-tag">${Math.round((1 - Number(product.price) / Number(product.mrp_price)) * 100)}% off</span>` : ""}
            </div>
            <span class="availability ${product.availability === "Out of Stock" ? "out-of-stock" : product.availability === "Currently Unavailable" ? "unavailable" : ""}">${escapeHtml(product.availability)}</span>
            <div class="product-actions">
              <button type="button" class="submit-button" data-add-cart="${product.id}" ${product.in_stock ? "" : "disabled"}>Add to Cart</button>
              <button type="button" class="secondary-button" data-save-wishlist="${product.id}">♡ Wishlist</button>
            </div>
          </div>
        </article>
      `).join("")
      : '<div class="empty-state">No products match your search.</div>';

    document.querySelectorAll("[data-add-cart]").forEach((button) => {
      button.addEventListener("click", async () => {
        await addToCart(Number(button.dataset.addCart));
      });
    });

    document.querySelectorAll("[data-open-product]").forEach((button) => {
      button.addEventListener("click", () => openProductDetails(Number(button.dataset.openProduct)));
    });

    productGrid.querySelectorAll(".product-card").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (!event.target.closest("button")) openProductDetails(Number(card.dataset.productCard));
      });
    });

    document.querySelectorAll("[data-save-wishlist]").forEach((button) => {
      button.addEventListener("click", async () => {
        await saveWishlist(Number(button.dataset.saveWishlist));
      });
    });
  } catch (error) {
    console.error("Load products failed", error);
  }
}

function productRating(value, count) {
  const rating = Number(value || 0);
  return count
    ? `<div class="rating-line">★ ${rating.toFixed(1)} <span>${Number(count)} customer review${Number(count) === 1 ? "" : "s"}</span></div>`
    : '<div class="rating-line"><span>No customer reviews yet</span></div>';
}

function getProductImageList(product) {
  const images = Array.isArray(product.images) ? product.images.map((image) => image.url) : [];
  if (product.image_url && !images.includes(product.image_url)) images.unshift(product.image_url);
  return images.map(safeImageUrl).filter(Boolean);
}

async function openProductDetails(productId) {
  const modal = document.querySelector("#product-detail-modal");
  const content = document.querySelector("#product-detail-content");
  content.innerHTML = '<p class="empty-state">Loading product details…</p>';
  modal.classList.remove("hidden-form");
  activeProductId = productId;
  try {
    const response = await fetch(`${API_BASE_URL}/api/products/${productId}`);
    const product = await readApiResponse(response);
    if (!response.ok) throw new Error(product.message || "Unable to load product details.");
    const images = getProductImageList(product);
    const mainImage = images[0] || "";
    const specifications = product.specifications && typeof product.specifications === "object"
      ? Object.entries(product.specifications)
      : [];
    const mrp = Number(product.mrp_price || product.price);
    const price = Number(product.price);
    const discount = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
    const estimated = new Date();
    estimated.setDate(estimated.getDate() + 5);
    const reviewsResponse = await fetch(`${API_BASE_URL}/api/products/${productId}/reviews`);
    const reviews = await readApiResponse(reviewsResponse);
    if (!reviewsResponse.ok) throw new Error(reviews.message || "Unable to load product reviews.");

    content.innerHTML = `
      <div class="product-detail-grid">
        <div class="product-gallery">
          <div class="product-gallery-main">${mainImage ? `<img id="product-main-image" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name)}" />` : '<span class="product-image-placeholder">No product image</span>'}</div>
          <div class="product-thumbnails">${images.map((image, index) => `<button type="button" class="product-thumbnail ${index === 0 ? "active" : ""}" data-gallery-image="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} image ${index + 1}" /></button>`).join("")}</div>
        </div>
        <div class="product-detail-info">
          <div class="product-meta">${escapeHtml(product.category_name || "General")}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</div>
          <h2 id="product-detail-title">${escapeHtml(product.name)}</h2>
          ${productRating(product.average_rating, product.review_count)}
          <p>${escapeHtml(product.description || "No product description has been provided.")}</p>
          <div class="price-line"><strong class="product-price">${formatCurrency(price)}</strong>
            ${mrp > price ? `<span class="mrp-price">MRP ${formatCurrency(mrp)}</span><span class="discount-tag">${discount}% off</span>` : `<span class="mrp-price">MRP ${formatCurrency(mrp)}</span>`}
          </div>
          <span class="availability ${product.availability === "Out of Stock" ? "out-of-stock" : product.availability === "Currently Unavailable" ? "unavailable" : ""}">${escapeHtml(product.availability)}</span>
          <p class="product-meta">Estimated delivery by ${estimated.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          ${product.offer_text || product.coupon_code ? `<div class="offer-card"><strong>Offers</strong>${product.offer_text ? `<p>${escapeHtml(product.offer_text)}</p>` : ""}${product.coupon_code ? `<p>Coupon: <b>${escapeHtml(product.coupon_code)}</b></p>` : ""}</div>` : ""}
          ${specifications.length ? `<h3>Specifications</h3><dl class="specification-list">${specifications.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>` : ""}
          <div class="review-section"><div class="panel-header"><h3>Customer reviews</h3><button type="button" class="secondary-button" id="write-product-review">Write a review</button></div>
            <div class="review-list">${reviews.length ? reviews.map((review) => `<article class="review-card"><div class="review-rating">${"★".repeat(Number(review.rating))}${"☆".repeat(5 - Number(review.rating))} ${Number(review.rating)}/5</div><strong>${escapeHtml(review.buyer_name)}</strong><span class="verified-label"> · Verified purchase</span><p>${escapeHtml(review.review_text)}</p><small>${new Date(review.created_at).toLocaleDateString("en-IN")}</small></article>`).join("") : '<p class="empty-state">No approved reviews yet.</p>'}</div>
          </div>
        </div>
        <aside class="product-action-card">
          <div class="price-line"><strong class="product-price">${formatCurrency(price)}</strong>${discount ? `<span class="discount-tag">${discount}% off</span>` : ""}</div>
          <span class="availability ${product.availability === "Out of Stock" ? "out-of-stock" : product.availability === "Currently Unavailable" ? "unavailable" : ""}">${escapeHtml(product.availability)}</span>
          <p>Delivery by ${estimated.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
          <p class="policy-note">${escapeHtml(product.return_policy || "Return and replacement policy has not been specified for this product. Contact the seller before purchase.")}</p>
          <button type="button" class="submit-button" id="product-add-cart" ${product.in_stock ? "" : "disabled"}>Add to Cart</button>
          <button type="button" class="secondary-button" id="product-buy-now" ${product.in_stock ? "" : "disabled"}>Buy Now</button>
          <button type="button" class="secondary-button" id="product-save-wishlist">♡ Add to Wishlist</button>
        </aside>
      </div>`;

    content.querySelectorAll("[data-gallery-image]").forEach((button) => {
      button.addEventListener("click", () => {
        const image = content.querySelector("#product-main-image");
        if (image) image.src = button.dataset.galleryImage;
        content.querySelectorAll(".product-thumbnail").forEach((item) => item.classList.toggle("active", item === button));
      });
    });
    const gallery = content.querySelector(".product-gallery-main");
    const main = content.querySelector("#product-main-image");
    if (main) main.addEventListener("click", () => gallery.classList.toggle("zoomed"));
    content.querySelector("#product-add-cart")?.addEventListener("click", async () => { await addToCart(productId); });
    content.querySelector("#product-buy-now")?.addEventListener("click", async () => {
      if (await addToCart(productId, false)) {
        closeModal(modal);
        await openCheckout();
      }
    });
    content.querySelector("#product-save-wishlist")?.addEventListener("click", () => saveWishlist(productId));
    content.querySelector("#write-product-review")?.addEventListener("click", () => openReviewComposer(productId));
  } catch (error) {
    content.innerHTML = `<p class="form-message error">${escapeHtml(error.message || "Unable to load product details.")}</p>`;
  }
}

async function loadCart() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cart`, { headers: getAuthHeaders() });
    const cart = await readApiResponse(response);
    if (!response.ok) throw new Error(cart.message || "Unable to load cart.");
    cartItemsContainer.innerHTML = cart.items && cart.items.length
      ? cart.items.map((item) => `
        <div class="mini-item">
          <strong>${item.product_name}</strong>
          <div>Qty: ${item.quantity} × ${formatCurrency(item.price)}</div>
          <div class="availability ${item.in_stock ? "" : "out-of-stock"}">${item.in_stock ? "In Stock" : "Out of Stock"}</div>
          <div class="seller-product-actions">
            <button type="button" class="secondary-button" data-cart-inc="${item.id}">+</button>
            <button type="button" class="secondary-button" data-cart-dec="${item.id}">-</button>
            <button type="button" class="secondary-button" data-cart-remove="${item.id}">Remove</button>
          </div>
        </div>
      `).join("")
      : '<div class="empty-state">Your cart is empty.</div>';

    cartTotalItems.textContent = String(cart.item_count || 0);
    cartSubtotal.textContent = formatCurrency(cart.subtotal || 0);
    buyerCartCount.textContent = String(cart.item_count || 0);

    document.querySelectorAll("[data-cart-inc]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = cart.items.find((entry) => String(entry.id) === button.dataset.cartInc);
        if (item) await updateCartItem(Number(item.id), Number(item.quantity) + 1);
      });
    });

    document.querySelectorAll("[data-cart-dec]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = cart.items.find((entry) => String(entry.id) === button.dataset.cartDec);
        if (item && Number(item.quantity) > 1) await updateCartItem(Number(item.id), Number(item.quantity) - 1);
      });
    });

    document.querySelectorAll("[data-cart-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        await removeCartItem(Number(button.dataset.cartRemove));
      });
    });
  } catch (error) {
    console.error("Cart load failed", error);
  }
}

async function loadWishlist() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wishlist`, { headers: getAuthHeaders() });
    const wishlist = await response.json();
    wishlistItemsContainer.innerHTML = wishlist.length
      ? wishlist.map((item) => `
        <div class="mini-item">
          <strong>${item.name}</strong>
          <div>${formatCurrency(item.price)}</div>
          <button type="button" class="secondary-button" data-remove-wishlist="${item.product_id}">Remove</button>
        </div>
      `).join("")
      : '<div class="empty-state">No saved wishlist items.</div>';

    wishlistCount.textContent = String(wishlist.length);
    if (wishlistSummaryCount) wishlistSummaryCount.textContent = String(wishlist.length);

    document.querySelectorAll("[data-remove-wishlist]").forEach((button) => {
      button.addEventListener("click", async () => {
        await removeWishlist(Number(button.dataset.removeWishlist));
      });
    });
  } catch (error) {
    console.error("Wishlist load failed", error);
  }
}

async function loadOrders() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders`, { headers: getAuthHeaders() });
    const orders = await readApiResponse(response);
    if (!response.ok) throw new Error(orders.message || "Unable to load orders.");
    const expandedOrders = new Set(
      [...orderHistoryContainer.querySelectorAll("[data-order-tracking-panel]:not(.hidden-form)")]
        .map((panel) => panel.dataset.orderTrackingPanel)
    );
    buyerOrders = orders;
    orderHistoryContainer.innerHTML = orders.length
      ? orders.map((order) => `
        <article class="order-item buyer-order-card">
          <div class="buyer-order-heading"><div><strong>Order #${order.id}</strong><small>Placed ${escapeHtml(formatOrderDate(order.created_at))}</small></div>
            <span class="admin-role-badge admin-status-${String(order.status || "unknown").replace(/[^a-z_]/gi, "").toLowerCase()}">${escapeHtml(formatOrderStatus(order.status))}</span>
          </div>
          ${order.status === "on_the_way" ? '<p class="on-the-way-banner">YOUR ORDER IS ON THE WAY!</p>' : ""}
          <div class="buyer-order-summary"><strong>${formatCurrency(order.total_amount)}</strong>
            <span>${formatPayment(order)}</span>
            <span>${(order.items || []).map((item) => `${escapeHtml(item.product_name)} × ${Number(item.quantity)}`).join(", ")}</span>
          </div>
          <button type="button" class="secondary-button" data-track-order="${order.id}" aria-expanded="${expandedOrders.has(String(order.id))}">Track Order &amp; Details</button>
          <div class="order-tracking-panel ${expandedOrders.has(String(order.id)) ? "" : "hidden-form"}" data-order-tracking-panel="${order.id}">
            <h4>Delivery tracking</h4>
            ${renderOrderTimeline(order)}
            <div class="buyer-order-detail-items">${(order.items || []).map((item) => `
              <div class="buyer-order-product">
                ${item.image_url ? `<img src="${escapeHtml(safeImageUrl(item.image_url))}" alt="${escapeHtml(item.product_name)}" />` : '<span class="admin-order-image-placeholder">SIVA</span>'}
                <span><strong>${escapeHtml(item.product_name)}</strong><small>Quantity ${Number(item.quantity)} · ${formatCurrency(item.price)} each</small></span>
              </div>
            `).join("")}</div>
            <p class="buyer-delivery-address"><strong>Delivery to:</strong> ${escapeHtml([
              order.delivery_address?.recipient_name, order.delivery_address?.phone,
              order.delivery_address?.address_line1, order.delivery_address?.address_line2,
              order.delivery_address?.city, order.delivery_address?.state, order.delivery_address?.postal_code
            ].filter(Boolean).join(", ") || "Address unavailable")}</p>
            ${order.status === "on_the_way" ? `<button type="button" class="submit-button confirm-received-button" data-confirm-received="${order.id}">CONFIRM RECEIVED</button>` : ""}
            ${(order.items || []).filter((item) => ["received", "completed"].includes(order.status) && !item.reviewed).map((item) => `<button type="button" class="secondary-button" data-write-review="${item.product_id}">Review ${escapeHtml(item.product_name)}</button>`).join("")}
          </div>
        </article>
      `).join("")
      : '<div class="empty-state">No orders yet.</div>';
    orderHistoryContainer.querySelectorAll("[data-track-order]").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = orderHistoryContainer.querySelector(`[data-order-tracking-panel="${button.dataset.trackOrder}"]`);
        const expanded = panel.classList.toggle("hidden-form") === false;
        button.setAttribute("aria-expanded", String(expanded));
      });
    });
    orderHistoryContainer.querySelectorAll("[data-confirm-received]").forEach((button) => {
      button.addEventListener("click", () => confirmOrderReceived(Number(button.dataset.confirmReceived), button));
    });
    orderHistoryContainer.querySelectorAll("[data-write-review]").forEach((button) => {
      button.addEventListener("click", () => openReviewComposer(Number(button.dataset.writeReview)));
    });
  } catch (error) {
    console.error("Orders load failed", error);
  }
}

async function confirmOrderReceived(orderId, button) {
  if (!window.confirm("Have you received your order?")) return;
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/received`, {
      method: "POST",
      headers: getAuthHeaders()
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to confirm receipt.");
    await loadOrders();
  } catch (error) {
    window.alert(error.message || "Unable to confirm receipt.");
    button.disabled = false;
  }
}

function openReviewComposer(productId) {
  const purchaseSelect = document.querySelector("#review-purchase");
  const eligible = buyerOrders.flatMap((order) =>
    ["received", "completed"].includes(order.status)
      ? (order.items || []).filter((item) => Number(item.product_id) === productId && !item.reviewed)
        .map((item) => ({ order, item }))
      : []
  );
  if (!eligible.length) {
    alert("You can review a product after your order has been received. Each purchase can be reviewed once.");
    return;
  }
  activeProductId = productId;
  purchaseSelect.innerHTML = eligible.map(({ order, item }) =>
    `<option value="${item.order_item_id}">Order #${order.id} · ${escapeHtml(item.product_name)}</option>`
  ).join("");
  document.querySelector("#review-text").value = "";
  setFormMessage(document.querySelector("#review-message"), "");
  document.querySelector("#review-modal").classList.remove("hidden-form");
}

async function loadBuyerDashboard() {
  await loadCategories();
  await loadProducts();
  await loadCart();
  await loadWishlist();
  await loadOrders();
}

async function addToCart(productId, showConfirmation = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cart/items`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ product_id: productId, quantity: 1 })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to add to cart.");
    await loadCart();
    if (showConfirmation) alert(result.message || "Added to cart.");
    return true;
  } catch (error) {
    alert(error.message || "Unable to add to cart.");
    return false;
  }
}

async function updateCartItem(itemId, quantity) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cart/items/${itemId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ quantity })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to update cart.");
    await loadCart();
  } catch (error) {
    alert(error.message || "Unable to update cart.");
  }
}

async function removeCartItem(itemId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cart/items/${itemId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to remove item.");
    await loadCart();
  } catch (error) {
    alert(error.message || "Unable to remove item.");
  }
}

async function clearCart() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cart`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to clear cart.");
    await loadCart();
  } catch (error) {
    alert(error.message || "Unable to clear cart.");
  }
}

async function saveWishlist(productId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wishlist`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ product_id: productId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to save wishlist");
    await loadWishlist();
    alert(result.message || "Added to wishlist.");
  } catch (error) {
    alert(error.message || "Unable to save wishlist.");
  }
}

async function removeWishlist(productId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wishlist/${productId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to remove wishlist item.");
    await loadWishlist();
  } catch (error) {
    alert(error.message || "Unable to remove wishlist item.");
  }
}

async function openCheckout() {
  const modal = document.querySelector("#checkout-modal");
  const messageNode = document.querySelector("#checkout-message");
  document.querySelector("#checkout-form").classList.remove("hidden-form");
  document.querySelector("#checkout-success").classList.add("hidden-form");
  document.querySelector("#checkout-title").classList.remove("hidden-form");
  document.querySelector(".checkout-subtitle").classList.remove("hidden-form");
  document.querySelector("#place-order-button").disabled = false;
  setFormMessage(messageNode, "");
  checkoutQuote = null;
  checkoutRequestKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
  try {
    const [quoteResponse, addressResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/checkout/quote`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/api/addresses`, { headers: getAuthHeaders() })
    ]);
    const quote = await readApiResponse(quoteResponse);
    const addresses = await readApiResponse(addressResponse);
    if (!quoteResponse.ok) throw new Error(quote.message || "Unable to load your order summary.");
    if (!addressResponse.ok) throw new Error(addresses.message || "Unable to load delivery addresses.");
    checkoutQuote = quote;
    document.querySelector("#checkout-items").innerHTML = quote.items.map((item) => `
      <div class="checkout-item"><span>${escapeHtml(item.name)} × ${item.quantity}</span><strong>${formatCurrency(item.subtotal)}</strong></div>
    `).join("");
    document.querySelector("#checkout-subtotal").textContent = formatCurrency(quote.subtotal);
    document.querySelector("#checkout-discount").textContent = `−${formatCurrency(quote.discount)}`;
    document.querySelector("#checkout-delivery").textContent = quote.delivery ? formatCurrency(quote.delivery) : "Free";
    document.querySelector("#checkout-total").textContent = formatCurrency(quote.total);
    const addressSelect = document.querySelector("#checkout-saved-address");
    addressSelect.innerHTML = '<option value="">Enter a new address</option>' + addresses.map((address) =>
      `<option value="${address.id}">${escapeHtml(address.recipient_name)} · ${escapeHtml(address.address_line1)}, ${escapeHtml(address.city)}</option>`
    ).join("");
    addressSelect.value = addresses[0] ? String(addresses[0].id) : "";
    updateCheckoutAddressFields(addresses);
    modal.classList.remove("hidden-form");
  } catch (error) {
    setFormMessage(messageNode, error.message || "Unable to load your order summary.", true);
    modal.classList.remove("hidden-form");
  }
}

let checkoutAddresses = [];

function updateCheckoutAddressFields(addresses = checkoutAddresses) {
  checkoutAddresses = addresses;
  const select = document.querySelector("#checkout-saved-address");
  const fields = document.querySelector("#checkout-address-fields");
  const saved = addresses.find((address) => String(address.id) === select.value);
  fields.classList.toggle("hidden-form", Boolean(saved));
  ["recipient", "phone", "line1", "line2", "city", "state", "postal"].forEach((field) => {
    const input = document.querySelector(`#checkout-${field}`);
    if (input) input.required = !saved && field !== "line2";
  });
  if (saved) {
    document.querySelector("#checkout-recipient").value = saved.recipient_name;
    document.querySelector("#checkout-phone").value = saved.phone;
    document.querySelector("#checkout-line1").value = saved.address_line1;
    document.querySelector("#checkout-line2").value = saved.address_line2 || "";
    document.querySelector("#checkout-city").value = saved.city;
    document.querySelector("#checkout-state").value = saved.state;
    document.querySelector("#checkout-postal").value = saved.postal_code;
  } else {
    fields.querySelectorAll("input").forEach((input) => { input.value = ""; });
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  if (!checkoutQuote) return setFormMessage(document.querySelector("#checkout-message"), "Your order summary is unavailable. Close this window and try again.", true);
  const button = document.querySelector("#place-order-button");
  const messageNode = document.querySelector("#checkout-message");
  const selectedAddress = document.querySelector("#checkout-saved-address").value;
  const address = selectedAddress ? null : {
    recipient_name: document.querySelector("#checkout-recipient").value.trim(),
    phone: document.querySelector("#checkout-phone").value.trim(),
    address_line1: document.querySelector("#checkout-line1").value.trim(),
    address_line2: document.querySelector("#checkout-line2").value.trim(),
    city: document.querySelector("#checkout-city").value.trim(),
    state: document.querySelector("#checkout-state").value.trim(),
    postal_code: document.querySelector("#checkout-postal").value.trim()
  };
  button.disabled = true;
  setFormMessage(messageNode, "Placing your order…");
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Idempotency-Key": checkoutRequestKey },
      body: JSON.stringify(selectedAddress ? { address_id: Number(selectedAddress) } : { address })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to place your order.");
    setFormMessage(messageNode, "");
    document.querySelector("#checkout-form").classList.add("hidden-form");
    document.querySelector("#checkout-title").classList.add("hidden-form");
    document.querySelector(".checkout-subtitle").classList.add("hidden-form");
    document.querySelector("#checkout-success-order").textContent = `Order #${result.order_id} · Status: ${formatOrderStatus(result.status)}`;
    document.querySelector(".checkout-success-message").textContent = `Pay ${formatCurrency(result.total)} by ${result.payment_method} when your order arrives. You can track it from My Orders.`;
    document.querySelector("#checkout-success").classList.remove("hidden-form");
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) {
    setFormMessage(messageNode, error.message || "Unable to place your order.", true);
  } finally {
    button.disabled = false;
  }
}

async function loadSellerProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/seller/products`, { headers: getAuthHeaders() });
    const products = await readApiResponse(response);
    if (!response.ok) throw new Error(products.message || "Unable to load your products.");
    sellerProducts.innerHTML = products.length
      ? products.map((product) => `
        <div class="seller-product-item">
          ${product.image_url ? `<img src="${escapeHtml(safeImageUrl(product.image_url))}" alt="${escapeHtml(product.name)}">` : ""}
          <div><strong>${escapeHtml(product.name)}</strong></div>
          <div>${escapeHtml(product.category_name || "General")}</div>
          <div>${formatCurrency(product.price)} · MRP ${formatCurrency(product.mrp_price || product.price)} · Stock: ${Number(product.stock) - Number(product.reserved_stock || 0)} available</div>
          <div>${escapeHtml(product.description || "No description added.")}</div>
          <div class="seller-product-actions">
            <button type="button" class="secondary-button" data-edit-product="${product.id}">Edit</button>
            <button type="button" class="secondary-button" data-delete-product="${product.id}">Delete</button>
          </div>
        </div>
      `).join("")
      : '<div class="empty-state">No products yet. Add your first product.</div>';

    document.querySelectorAll("[data-edit-product]").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.editProduct);
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, { headers: getAuthHeaders() });
        const product = await readApiResponse(response);
        if (!response.ok) return alert(product.message || "Unable to load product.");
        sellerProductId.value = product.id;
        sellerProductName.value = product.name;
        sellerProductCategory.value = product.category_name || "";
        sellerProductDescription.value = product.description || "";
        sellerProductPrice.value = product.price;
        sellerProductMrp.value = product.mrp_price || product.price;
        sellerProductStock.value = product.stock;
        sellerProductImage.value = product.image_url || "";
        sellerProductBrand.value = product.brand || "";
        document.querySelector("#product-specifications").value = JSON.stringify(product.specifications || {}, null, 2);
        document.querySelector("#product-offer").value = product.offer_text || "";
        document.querySelector("#product-coupon").value = product.coupon_code || "";
        document.querySelector("#product-return-policy").value = product.return_policy || "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    document.querySelectorAll("[data-delete-product]").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.deleteProduct);
        if (!window.confirm("Delete this product?")) return;

        const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
          method: "DELETE",
          headers: getAuthHeaders()
        });
        const result = await response.json();
        if (!response.ok) return alert(result.message || "Unable to delete product.");
        await loadSellerProducts();
      });
    });
  } catch (error) {
    console.error("Seller products failed", error);
  }
}

async function loadSellerOrders() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/seller/orders`, { headers: getAuthHeaders() });
    const orders = await readApiResponse(response);
    if (!response.ok) throw new Error(orders.message || "Unable to load your orders.");
    sellerOrders.innerHTML = orders.length
      ? orders.map((order) => `
        <div class="order-item">
          <strong>Order #${order.order_id}</strong>
          <div>${escapeHtml(order.buyer_name)}</div>
          <div>${escapeHtml(order.product_name)} × ${order.quantity}</div>
          <div>${formatCurrency(order.total_amount || order.subtotal || 0)} • ${escapeHtml(formatOrderStatus(order.status))}</div>
          <div>${formatPayment(order)}</div>
          <div>${new Date(order.created_at).toLocaleDateString()}</div>
          ${order.can_update_status ? renderOrderStatusButton(order, order.order_id, "secondary-button").replace("—", "") : "<small>Includes other sellers' products; an admin updates this order's status.</small>"}
        </div>
      `).join("")
      : '<div class="empty-state">No orders for your products yet.</div>';
    bindOrderStatusButtons(sellerOrders, "seller", loadSellerOrders);
  } catch (error) {
    console.error("Seller orders failed", error);
  }
}

if (sellerForm) {
  sellerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: sellerProductName.value.trim(),
      category: sellerProductCategory.value.trim(),
      description: sellerProductDescription.value.trim(),
      price: Number(sellerProductPrice.value),
      mrp_price: Number(sellerProductMrp.value || sellerProductPrice.value),
      stock: Number(sellerProductStock.value),
      image_url: sellerProductImage.value.trim(),
      brand: sellerProductBrand.value.trim(),
      specifications: document.querySelector("#product-specifications").value || "{}",
      offer_text: document.querySelector("#product-offer").value.trim(),
      coupon_code: document.querySelector("#product-coupon").value.trim(),
      return_policy: document.querySelector("#product-return-policy").value.trim()
    };

    if (!payload.name || !Number.isFinite(payload.price) || payload.price <= 0 ||
        !Number.isFinite(payload.mrp_price) || payload.mrp_price < payload.price ||
        !Number.isSafeInteger(payload.stock) || payload.stock < 0) {
      return alert("Please provide valid product details.");
    }

    const productId = sellerProductId.value;
    const url = productId ? `${API_BASE_URL}/api/products/${productId}` : `${API_BASE_URL}/api/products`;
    const method = productId ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error([result.message, result.error].filter(Boolean).join(": ") || "Unable to save product");
      const savedProductId = productId || result.product?.id;
      if (sellerProductImages.files.length) {
        const formData = new FormData();
        for (const file of sellerProductImages.files) formData.append("images", file);
        const imageHeaders = currentUser()?.token ? { Authorization: `Bearer ${currentUser().token}` } : {};
        const imageResponse = await fetch(`${API_BASE_URL}/api/products/${savedProductId}/images`, {
          method: "POST", headers: imageHeaders, body: formData
        });
        const imageResult = await readApiResponse(imageResponse);
        if (!imageResponse.ok) throw new Error(`${result.message} ${imageResult.message || "Image upload failed."}`);
      }
      resetSellerForm();
      await loadSellerProducts();
      alert(result.message || "Product saved successfully.");
    } catch (error) {
      alert(error.message || "Unable to save product.");
    }
  });
}

const cancelEditButton = document.querySelector("#cancel-edit");
if (cancelEditButton) cancelEditButton.addEventListener("click", resetSellerForm);

const buyerLogoutButton = document.querySelector("#buyer-logout");
if (buyerLogoutButton) {
  buyerLogoutButton.addEventListener("click", () => {
    sessionStorage.removeItem("siva_mart_user");
    showLogin();
    showLogoutMessage();
  });
}

const sellerLogoutButton = document.querySelector("#seller-logout");
if (sellerLogoutButton) {
  sellerLogoutButton.addEventListener("click", () => {
    sessionStorage.removeItem("siva_mart_user");
    showLogin();
    showLogoutMessage();
  });
}

const checkoutButton = document.querySelector("#checkout-button");
if (checkoutButton) checkoutButton.addEventListener("click", openCheckout);
document.querySelector("#checkout-form").addEventListener("submit", submitCheckout);
document.querySelector("#checkout-success-orders").addEventListener("click", async () => {
  closeModal(document.querySelector("#checkout-modal"));
  await loadOrders();
  document.querySelector("#order-history").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#checkout-saved-address").addEventListener("change", () => updateCheckoutAddressFields());
document.querySelector("#review-form").addEventListener("submit", submitProductReview);

const clearCartButton = document.querySelector("#clear-cart");
if (clearCartButton) clearCartButton.addEventListener("click", clearCart);

const buyerSearchInput = document.querySelector("#buyer-search");
if (buyerSearchInput) {
  buyerSearchInput.addEventListener("input", (event) => {
    buyerSearchTerm = event.target.value.trim();
    loadProducts();
  });
}

function updateRole(role) {
  selectedRole = role;

  const config = roleConfig[role];
  if (!config) return;

  const eyebrow = document.querySelector("#role-eyebrow");
  const loginTitle = document.querySelector("#login-title");
  const loginSubtitle = document.querySelector("#login-subtitle");
  const submitText = document.querySelector("#submit-text");
  const storeNameField = document.querySelector("#store-name-field");
  const storeNameInput = document.querySelector("#store-name");

  if (eyebrow) eyebrow.textContent = config.eyebrow;
  if (loginTitle) loginTitle.textContent = config.title;
  if (loginSubtitle) loginSubtitle.textContent = config.subtitle;
  if (submitText) submitText.textContent = config.submit;
  if (storeNameField) storeNameField.classList.toggle("hidden-form", role !== "seller");
  if (storeNameInput) storeNameInput.required = role === "seller";

  document.querySelectorAll(".role-tab").forEach((tab) => {
    const active = tab.dataset.role === role;

    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
}

document.querySelectorAll(".role-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    updateRole(tab.dataset.role);
  });
});

const signupRoleSelect = document.querySelector("#signup-role");
const signupStoreNameField = document.querySelector("#store-name-field");
const signupStoreNameInput = document.querySelector("#store-name");
if (signupRoleSelect && signupStoreNameField && signupStoreNameInput) {
  const updateSignupStoreName = () => {
    const isSeller = signupRoleSelect.value === "seller";
    signupStoreNameField.classList.toggle("hidden-form", !isSeller);
    signupStoreNameInput.required = isSeller;
  };

  signupRoleSelect.addEventListener("change", updateSignupStoreName);
  updateSignupStoreName();
}

const passwordToggle = document.querySelector("#password-toggle");
if (passwordToggle) {
  passwordToggle.addEventListener("click", (event) => {
    const isPassword = password.type === "password";
    password.type = isPassword ? "text" : "password";
    event.currentTarget.textContent = isPassword ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });
}

const forgotButton = document.querySelector("#forgot-link");
if (forgotButton) {
  forgotButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (message) {
      message.textContent = "Password reset is available from the shop administrator.";
      message.className = "form-message";
    }
  });
}

const showSignupButton = document.querySelector("#show-signup");
if (showSignupButton) {
  showSignupButton.addEventListener("click", (event) => {
    event.preventDefault();
    showSignup();
  });
}

const showLoginButton = document.querySelector("#show-login");
if (showLoginButton) {
  showLoginButton.addEventListener("click", (event) => {
    event.preventDefault();
    showLogin();
  });
}

const logoutButton = document.querySelector("#logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem("siva_mart_user");
    if (form) form.reset();
    showLogin();
    showLogoutMessage();
  });
}

const adminLogoutButton = document.querySelector("#admin-logout");
if (adminLogoutButton) {
  adminLogoutButton.addEventListener("click", () => {
    sessionStorage.removeItem("siva_mart_user");
    showLogin();
    showLogoutMessage();
  });
}

document.querySelectorAll(".admin-nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveAdminSection(button.dataset.adminView || "overview");
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.view === "wishlist" ? document.querySelector("#wishlist-items") :
      button.dataset.view === "orders" ? document.querySelector("#order-history") :
        document.querySelector("#buyer-products");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(button.closest(".commerce-modal"));
  });
});

document.querySelectorAll(".commerce-modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".commerce-modal").forEach(closeModal);
});

const adminUserSearch = document.querySelector("#admin-user-search");
if (adminUserSearch) adminUserSearch.addEventListener("input", loadAdminUsers);

const adminUserRoleFilter = document.querySelector("#admin-user-role-filter");
if (adminUserRoleFilter) adminUserRoleFilter.addEventListener("change", loadAdminUsers);

const adminProductSearch = document.querySelector("#admin-product-search");
if (adminProductSearch) adminProductSearch.addEventListener("input", loadAdminProducts);

const adminProductCategoryFilter = document.querySelector("#admin-product-category-filter");
if (adminProductCategoryFilter) adminProductCategoryFilter.addEventListener("change", loadAdminProducts);

const adminOrderSearch = document.querySelector("#admin-order-search");
if (adminOrderSearch) adminOrderSearch.addEventListener("input", loadAdminOrders);

const adminOrderStatusFilter = document.querySelector("#admin-order-status-filter");
if (adminOrderStatusFilter) adminOrderStatusFilter.addEventListener("change", loadAdminOrders);

const adminRefreshProducts = document.querySelector("#admin-refresh-products");
if (adminRefreshProducts) {
  adminRefreshProducts.addEventListener("click", () => {
    loadAdminProducts();
    loadAdminStats();
  });
}

document.querySelector("#admin-add-product").addEventListener("click", async () => {
  resetAdminProductForm();
  await loadAdminSellers();
  document.querySelector("#admin-product-form").classList.remove("hidden-form");
  document.querySelector("#admin-product-form").scrollIntoView({ behavior: "smooth" });
});

document.querySelector("#admin-cancel-product").addEventListener("click", resetAdminProductForm);
document.querySelector("#admin-product-form").addEventListener("submit", submitAdminProduct);
document.querySelector("#admin-review-filter").addEventListener("change", loadAdminReviews);

window.setInterval(() => {
  if (document.hidden) return;
  const user = currentUser();
  if (!user) return;
  if (user.role === "buyer" && buyerApp && !buyerApp.classList.contains("hidden-form")) {
    loadOrders();
  } else if (user.role === "admin" && adminApp && !adminApp.classList.contains("hidden-form")) {
    loadAdminOrders();
    loadAdminStats();
  }
}, 10000);

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const signupMessage = document.querySelector("#signup-message");
  const fullName = document.querySelector("#full-name").value.trim();
  const email = document.querySelector("#signup-email").value.trim();
  const passwordValue = document.querySelector("#signup-password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;
  const role = document.querySelector("#signup-role").value;
  const storeName = document.querySelector("#store-name").value.trim();

  signupMessage.textContent = "";
  signupMessage.className = "form-message";

  if (!fullName || !email || !passwordValue || !confirmPassword || !role || (role === "seller" && !storeName)) {
    signupMessage.textContent = "Complete all fields to create your account.";
    signupMessage.className = "form-message error";
    return;
  }

  if (passwordValue !== confirmPassword) {
    signupMessage.textContent = "Passwords do not match.";
    signupMessage.className = "form-message error";
    return;
  }

  if (passwordValue.length < 6) {
    signupMessage.textContent = "Password must contain at least 6 characters.";
    signupMessage.className = "form-message error";
    return;
  }

  const createButton = signupForm.querySelector(".submit-button");
  createButton.disabled = true;
  createButton.textContent = "Creating account...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, full_name: fullName, email, password: passwordValue, role, store_name: storeName })
    });

    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to create account.");

    signupForm.reset();
    showLogin();
    document.querySelector("#email").value = result.user.email;
    updateRole(result.user.role);
    loginMessage.textContent = "Account created successfully. Please login.";
    loginMessage.className = "form-message success";
  } catch (error) {
    signupMessage.textContent = error.message || "Unable to create account right now.";
    signupMessage.className = "form-message error";
  } finally {
    createButton.disabled = false;
    createButton.textContent = "Create Account";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  message.className = "form-message";

  const email = document.querySelector("#email").value.trim();
  const passwordValue = password.value;

  if (!email || !passwordValue) {
    message.textContent = "Enter your email and password to continue.";
    message.className = "form-message error";
    return;
  }

  submitButton.disabled = true;
  document.querySelector("#submit-text").textContent = "Checking access...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: selectedRole, email, password: passwordValue })
    });

    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Incorrect email or password.");

    sessionStorage.setItem("siva_mart_user", JSON.stringify({ ...result.user, token: result.token }));
    showAccount(result.user);
  } catch (error) {
    message.textContent = error.message || "Unable to sign in right now.";
    message.className = "form-message error";
  } finally {
    submitButton.disabled = false;
    document.querySelector("#submit-text").textContent = roleConfig[selectedRole].submit;
  }
});

const savedUser = sessionStorage.getItem("siva_mart_user");
if (savedUser) {
  try {
    const user = JSON.parse(savedUser);
    if (!user?.token) throw new Error("Please sign in again to continue securely.");
    showAccount(user);
  } catch (error) {
    console.error("Invalid saved user:", error);
    sessionStorage.removeItem("siva_mart_user");
    showLogin();
  }
} else {
  showLogin();
}

updateRole("buyer");
resetSellerForm();