// Seller dashboard: the seller's products and orders.

function resetSellerForm() {
  sellerForm.reset();
  sellerProductId.value = "";
  sellerProductMrp.value = "";
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
          <div>${formatCurrency(product.price)} · MRP ${formatCurrency(product.mrp_price || product.price)} · Stock: ${Number(product.stock)} available</div>
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
      if (!response.ok) throw new Error(result.message || "Unable to save product");
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
