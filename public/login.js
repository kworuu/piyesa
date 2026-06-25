function toast(msg, duration = 2500) {
  const el = document.getElementById("toast");
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), duration);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function handleLoginSubmit() {
  const emailEl = document.getElementById("loginEmail");
  const passwordEl = document.getElementById("loginPassword");
  if (!emailEl || !passwordEl) return;

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  if (!email || !validateEmail(email)) {
    toast("Enter a valid email address");
    return;
  }
  if (!password) {
    toast("Enter your password");
    return;
  }

  toast(`Welcome, ${email.split("@")[0]}! Redirecting...`, 1500);
  setTimeout(() => {
    window.location.href = "/";
  }, 600);
}

document.getElementById("loginBtn").addEventListener("click", handleLoginSubmit);
document.getElementById("guestBtn").addEventListener("click", () => {
  window.location.href = "/";
});
document.getElementById("registerBtn").addEventListener("click", () => {
  toast("Register is not implemented yet.");
});
document.getElementById("forgotPasswordBtn").addEventListener("click", () => {
  toast("Forgot password is not implemented yet.");
});
