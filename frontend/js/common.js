// Page elements and helpers shared by every screen. Loaded first.

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

function showToast(message, type = "info") {
  if (!message) return;
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function bindOrderStatusButtons(container, role, refresh) {
  if (!container) return;
  container.querySelectorAll("[data-advance-order]").forEach((button) => {
    button.addEventListener("click", () => advanceOrderStatus(button, role, refresh));
  });
}

async function advanceOrderStatus(button, role, refresh) {
  const orderId = button.dataset.advanceOrder;
  const nextStatus = button.dataset.nextStatus;
  const nextLabel = button.dataset.nextLabel || nextStatus;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Updating...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/${role}/orders/${orderId}/status`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: nextStatus })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to update order status.");
    showToast(result.message || `Order #${orderId} marked as ${nextLabel}`, "success");
    await refresh();
  } catch (error) {
    showToast(error.message || "Unable to update order status.", "error");
    button.disabled = false;
    button.textContent = originalText;
  }
}

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
