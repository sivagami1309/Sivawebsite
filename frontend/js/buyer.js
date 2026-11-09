// Buyer shop: products, cart, wishlist, checkout, My Orders, and reviews.

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

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.view === "wishlist" ? document.querySelector("#wishlist-items") :
      button.dataset.view === "orders" ? document.querySelector("#order-history") :
        document.querySelector("#buyer-products");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
