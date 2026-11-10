// Admin dashboard: statistics, users, products, orders, and review moderation.

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
          <td>${Number(product.stock ?? 0)} available</td>
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
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Deleting...";

        try {
          const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          const result = await readApiResponse(response);
          if (!response.ok) {
            showToast(result.message || "Unable to delete product.", "error");
            button.disabled = false;
            button.textContent = originalText;
            return;
          }
          showToast(result.message || "Product deleted successfully.", "success");
          await loadAdminDashboard();
        } catch (error) {
          showToast(error.message || "Unable to delete product.", "error");
          button.disabled = false;
          button.textContent = originalText;
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
    showToast(error.message || "Unable to edit product.", "error");
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
    showToast(error.message || "Unable to update product availability.", "error");
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
          showToast(error.message || "Unable to moderate review.", "error");
        }
      });
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message || "Unable to load reviews.")}</td></tr>`;
    console.error("Admin reviews failed", error);
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

document.querySelectorAll(".admin-nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveAdminSection(button.dataset.adminView || "overview");
  });
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
