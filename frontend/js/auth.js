// Login, sign up, forgot password, logout, and screen router. Loaded last because it starts the app.

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

const forgotForm = document.querySelector("#forgot-form");
const roleTabsContainer = document.querySelector(".role-tabs");
const loginSwitchPrompt = document.querySelector("#login-switch-prompt");

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
  if (forgotForm) forgotForm.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  if (loginHeading) loginHeading.classList.remove("hidden-form");
  if (roleTabsContainer) roleTabsContainer.classList.remove("hidden-form");
  if (loginSwitchPrompt) loginSwitchPrompt.classList.remove("hidden-form");
}

function showSignup() {
  if (buyerApp) buyerApp.classList.add("hidden-form");
  if (sellerApp) sellerApp.classList.add("hidden-form");
  if (adminApp) adminApp.classList.add("hidden-form");
  if (pageShell) pageShell.classList.remove("hidden-form");
  if (form) form.classList.add("hidden-form");
  if (signupForm) signupForm.classList.remove("hidden-form");
  if (forgotForm) forgotForm.classList.add("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  if (loginHeading) loginHeading.classList.add("hidden-form");
  if (roleTabsContainer) roleTabsContainer.classList.add("hidden-form");
  if (loginSwitchPrompt) loginSwitchPrompt.classList.add("hidden-form");
}

function showForgotPassword() {
  if (buyerApp) buyerApp.classList.add("hidden-form");
  if (sellerApp) sellerApp.classList.add("hidden-form");
  if (adminApp) adminApp.classList.add("hidden-form");
  if (pageShell) pageShell.classList.remove("hidden-form");
  if (form) form.classList.add("hidden-form");
  if (signupForm) signupForm.classList.add("hidden-form");
  if (forgotForm) forgotForm.classList.remove("hidden-form");
  if (accountSummary) accountSummary.classList.add("hidden-form");
  if (loginHeading) loginHeading.classList.add("hidden-form");
  if (roleTabsContainer) roleTabsContainer.classList.add("hidden-form");
  if (loginSwitchPrompt) loginSwitchPrompt.classList.add("hidden-form");
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
  loginMessage.textContent = "You have been logged out securely.";
  loginMessage.className = "form-message success";
}

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

const adminLogoutButton = document.querySelector("#admin-logout");
if (adminLogoutButton) {
  adminLogoutButton.addEventListener("click", () => {
    sessionStorage.removeItem("siva_mart_user");
    showLogin();
    showLogoutMessage();
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

function updateRole(role) {
  selectedRole = role;

  const config = roleConfig[role];
  if (!config) return;

  const eyebrow = document.querySelector("#role-eyebrow");
  const loginTitle = document.querySelector("#login-title");
  const loginSubtitle = document.querySelector("#login-subtitle");
  const submitText = document.querySelector("#submit-text");

  if (eyebrow) eyebrow.textContent = config.eyebrow;
  if (loginTitle) loginTitle.textContent = config.title;
  if (loginSubtitle) loginSubtitle.textContent = config.subtitle;
  if (submitText) submitText.textContent = config.submit;

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

// ---------------------------------------------------------------------------
// PASSWORD VISIBILITY TOGGLES
// ---------------------------------------------------------------------------
function setupPasswordToggle(buttonSelector, inputSelector) {
  const toggleBtn = document.querySelector(buttonSelector);
  const input = document.querySelector(inputSelector);
  if (toggleBtn && input) {
    toggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      toggleBtn.textContent = isPassword ? "Hide" : "Show";
      toggleBtn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  }
}

setupPasswordToggle("#password-toggle", "#password");
setupPasswordToggle("#signup-password-toggle", "#signup-password");
setupPasswordToggle("#confirm-password-toggle", "#confirm-password");
setupPasswordToggle("#forgot-password-toggle", "#forgot-new-password");
setupPasswordToggle("#forgot-confirm-toggle", "#forgot-confirm-password");

// ---------------------------------------------------------------------------
// NAVIGATION SWITCHERS
// ---------------------------------------------------------------------------
const forgotButton = document.querySelector("#forgot-link");
if (forgotButton) {
  forgotButton.addEventListener("click", (event) => {
    event.preventDefault();
    showForgotPassword();
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

const showLoginFromForgot = document.querySelector("#show-login-from-forgot");
if (showLoginFromForgot) {
  showLoginFromForgot.addEventListener("click", (event) => {
    event.preventDefault();
    showLogin();
  });
}

// ---------------------------------------------------------------------------
// SIGN UP SUBMISSION
// ---------------------------------------------------------------------------
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const signupMessage = document.querySelector("#signup-message");
  const fullName = document.querySelector("#full-name").value.trim();
  const email = document.querySelector("#signup-email").value.trim();
  const mobileNumber = document.querySelector("#signup-mobile").value.trim();
  const passwordValue = document.querySelector("#signup-password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;
  const role = document.querySelector("#signup-role").value;
  const storeName = document.querySelector("#store-name").value.trim();

  signupMessage.textContent = "";
  signupMessage.className = "form-message";

  if (!fullName || !email || !mobileNumber || !passwordValue || !confirmPassword || !role) {
    signupMessage.textContent = "Please fill in all required registration fields.";
    signupMessage.className = "form-message error";
    return;
  }

  if (fullName.length < 2) {
    signupMessage.textContent = "Full name must be at least 2 characters.";
    signupMessage.className = "form-message error";
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    signupMessage.textContent = "Please enter a valid email address.";
    signupMessage.className = "form-message error";
    return;
  }

  const mobileDigits = mobileNumber.replace(/\D/g, "");
  if (mobileDigits.length < 10 || mobileDigits.length > 15) {
    signupMessage.textContent = "Please enter a valid mobile number (10 to 15 digits).";
    signupMessage.className = "form-message error";
    return;
  }

  if (role === "seller" && !storeName) {
    signupMessage.textContent = "Store name is required for seller accounts.";
    signupMessage.className = "form-message error";
    return;
  }

  if (passwordValue !== confirmPassword) {
    signupMessage.textContent = "Password and Confirm Password do not match.";
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
  createButton.innerHTML = "<span>Creating Account...</span>";

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        full_name: fullName,
        email,
        mobile_number: mobileNumber,
        mobileNumber,
        password: passwordValue,
        confirm_password: confirmPassword,
        role,
        store_name: storeName
      })
    });

    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to create account.");

    signupForm.reset();
    showLogin();
    document.querySelector("#email").value = result.user.email;
    updateRole(result.user.role);
    loginMessage.textContent = "Account registered successfully! Please sign in with your credentials.";
    loginMessage.className = "form-message success";
    showToast("Registration successful! Welcome to SIVA MART.", "success");
  } catch (error) {
    signupMessage.textContent = error.message || "Unable to create account right now.";
    signupMessage.className = "form-message error";
  } finally {
    createButton.disabled = false;
    createButton.innerHTML = '<span>Create Account</span><span class="arrow">&#8594;</span>';
  }
});

// ---------------------------------------------------------------------------
// LOGIN SUBMISSION
// ---------------------------------------------------------------------------
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  message.className = "form-message";

  const email = document.querySelector("#email").value.trim();
  const passwordValue = password.value;

  if (!email || !passwordValue) {
    message.textContent = "Enter your email address or mobile number, and password.";
    message.className = "form-message error";
    return;
  }

  submitButton.disabled = true;
  document.querySelector("#submit-text").textContent = "Signing in...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: selectedRole, email, password: passwordValue })
    });

    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Incorrect credentials or account type.");

    // Store secure user data and JWT token; never store plain-text passwords
    sessionStorage.setItem("siva_mart_user", JSON.stringify({ ...result.user, token: result.token }));
    showToast(`Welcome back, ${result.user.full_name || "User"}!`, "success");
    showAccount(result.user);
  } catch (error) {
    message.textContent = error.message || "Unable to sign in right now.";
    message.className = "form-message error";
  } finally {
    submitButton.disabled = false;
    document.querySelector("#submit-text").textContent = roleConfig[selectedRole].submit;
  }
});

// ---------------------------------------------------------------------------
// FORGOT PASSWORD SUBMISSION
// ---------------------------------------------------------------------------
if (forgotForm) {
  forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const forgotMsg = document.querySelector("#forgot-message");
    const email = document.querySelector("#forgot-email").value.trim();
    const mobileNumber = document.querySelector("#forgot-mobile").value.trim();
    const newPassword = document.querySelector("#forgot-new-password").value;
    const confirmPassword = document.querySelector("#forgot-confirm-password").value;

    forgotMsg.textContent = "";
    forgotMsg.className = "form-message";

    if (!email || !mobileNumber || !newPassword || !confirmPassword) {
      forgotMsg.textContent = "Complete all fields to reset your password.";
      forgotMsg.className = "form-message error";
      return;
    }

    if (newPassword !== confirmPassword) {
      forgotMsg.textContent = "New password and Confirm password do not match.";
      forgotMsg.className = "form-message error";
      return;
    }

    if (newPassword.length < 6) {
      forgotMsg.textContent = "New password must contain at least 6 characters.";
      forgotMsg.className = "form-message error";
      return;
    }

    const resetBtn = forgotForm.querySelector(".submit-button");
    resetBtn.disabled = true;
    resetBtn.innerHTML = "<span>Resetting Password...</span>";

    try {
      const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          mobile_number: mobileNumber,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });

      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Unable to reset password.");

      forgotForm.reset();
      showLogin();
      document.querySelector("#email").value = email;
      loginMessage.textContent = "Password updated successfully. Please sign in with your new password.";
      loginMessage.className = "form-message success";
      showToast("Password reset successfully! Please log in.", "success");
    } catch (error) {
      forgotMsg.textContent = error.message || "Unable to reset password.";
      forgotMsg.className = "form-message error";
    } finally {
      resetBtn.disabled = false;
      resetBtn.innerHTML = '<span>Reset Password</span><span class="arrow">&#8594;</span>';
    }
  });
}

// ---------------------------------------------------------------------------
// BACKGROUND DASHBOARD REFRESH
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// INITIAL SESSION CHECK
// ---------------------------------------------------------------------------
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
