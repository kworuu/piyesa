const session = PiyesaAuth.requireSession("/login.html");
// requireSession already redirects if there's no session; bail out of the
// rest of this script in that case so we don't touch a page that's navigating away.
if (session) {
  renderUserChip(session);
}

function renderUserChip(session) {
  const chip = document.getElementById("userChip");
  if (!chip) return;
  chip.innerHTML = session.guest
    ? "Browsing as <strong>Guest</strong>"
    : `Hi, <strong>${escapeHtmlSafe(session.fullName || session.email)}</strong>`;
}

// Safe even before escapeHtml() is defined further down (hoisted function decl below covers it,
// but keep a tiny standalone helper here in case this runs before that point).
function escapeHtmlSafe(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  PiyesaAuth.endSession();
  window.location.href = "/login.html";
});

const state = {
  extractedItems: [],   // [{name, quantity}]
  budget: null,
  resolvedCart: null,   // result of /api/resolve-cart
  chatHistory: [],      // [{role: 'user'|'bot', text}]
  pendingSource: null,  // 'image' | 'url' | 'describe' | 'template'
  pendingPayload: null, // image base64 / url string / text / template id
  user: null,
};

// ---------- View management ----------
const views = ["landing", "describe", "review", "cart", "checkout"];
function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle("active", v === name);
  });
  const backBtn = document.getElementById("backBtn");
  const previewLink = document.getElementById("previewBomLink");
  const helpBotIndicator = document.getElementById("helpBotIndicator");
  backBtn.classList.toggle("hidden", name === "landing");
  previewLink.classList.toggle("hidden", name !== "cart");
  helpBotIndicator.classList.toggle("hidden", name !== "cart");
  window.scrollTo(0, 0);
}

document.getElementById("backBtn").addEventListener("click", () => {
  const current = views.find((v) => document.getElementById(`view-${v}`).classList.contains("active"));
  const order = { describe: "landing", review: "landing", cart: "review", checkout: "cart" };
  showView(order[current] || "landing");
});

// ---------- Toast ----------
function toast(msg, duration = 2500) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), duration);
}

// ---------- Currency ----------
function peso(n) {
  return "₱" + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

// ---------- Templates dashboard ----------
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    renderTemplates(data.templates || []);
  } catch (err) {
    console.error("Failed to load templates:", err);
  }
}

function renderTemplates(templates) {
  const grid = document.getElementById("templatesGrid");
  grid.innerHTML = "";
  templates.forEach((t) => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <div class="template-thumb">&#9881;</div>
      <div class="template-body">
        <h4>${escapeHtml(t.name)}</h4>
        <div class="template-meta">${t.items.length} components</div>
        <div class="template-price">${peso(t.estimatedCost)}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      state.pendingSource = "template";
      state.pendingPayload = t;
      openBudgetModal();
    });
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Landing: upload / url / describe ----------
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");

dropzone.addEventListener("click", () => fileInput.click());
document.getElementById("uploadImagesBtn").addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.background = "#f3fbf6"; });
dropzone.addEventListener("dragleave", () => { dropzone.style.background = ""; });
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.style.background = "";
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleImageFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) handleImageFile(fileInput.files[0]);
});

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    state.pendingSource = "image";
    state.pendingPayload = { imageBase64: base64, mimeType: file.type };
    openBudgetModal();
  };
  reader.readAsDataURL(file);
}

document.getElementById("submitUrlBtn").addEventListener("click", () => {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) { toast("Paste a tutorial URL first"); return; }
  state.pendingSource = "url";
  state.pendingPayload = url;
  openBudgetModal();
});

document.getElementById("describeBtn").addEventListener("click", () => showView("describe"));

document.getElementById("describeSubmitBtn").addEventListener("click", () => {
  const text = document.getElementById("describeText").value.trim();
  if (!text) { toast("Describe your project first"); return; }
  // Turn lines into items directly - no AI needed for plain typed lists.
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      if (match) return { name: match[2].trim(), quantity: parseInt(match[1], 10) };
      return { name: line.replace(/^[-*]\s*/, ""), quantity: 1 };
    });
  state.extractedItems = items;
  showReview();
});

// ---------- Loading overlay ----------
let loadingMessageInterval = null;

function showLoadingOverlay(messages) {
  const overlay = document.getElementById("loadingOverlay");
  const msgEl = document.getElementById("loadingMessage");
  let i = 0;
  msgEl.textContent = messages[0];
  overlay.classList.remove("hidden");

  clearInterval(loadingMessageInterval);
  if (messages.length > 1) {
    loadingMessageInterval = setInterval(() => {
      i = (i + 1) % messages.length;
      msgEl.textContent = messages[i];
    }, 1800);
  }
}

function hideLoadingOverlay() {
  clearInterval(loadingMessageInterval);
  document.getElementById("loadingOverlay").classList.add("hidden");
}

// ---------- Budget modal ----------
function openBudgetModal() {
  document.getElementById("budgetInput").value = "";
  document.getElementById("budgetModal").classList.remove("hidden");
}
function closeBudgetModal() {
  document.getElementById("budgetModal").classList.add("hidden");
}
document.getElementById("budgetCancelBtn").addEventListener("click", closeBudgetModal);
document.getElementById("budgetSkipBtn").addEventListener("click", () => {
  state.budget = null;
  closeBudgetModal();
  proceedWithExtraction();
});
document.getElementById("budgetSubmitBtn").addEventListener("click", () => {
  const val = document.getElementById("budgetInput").value;
  state.budget = val ? Number(val) : null;
  closeBudgetModal();
  proceedWithExtraction();
});

async function proceedWithExtraction() {
  if (state.pendingSource === "template") {
    state.extractedItems = state.pendingPayload.items;
    showReview();
    return;
  }

  const loadingMessages = state.pendingSource === "image"
    ? ["Reading your image...", "Identifying components...", "Matching parts to catalog...", "Almost done..."]
    : ["Fetching the tutorial page...", "Reading through the content...", "Identifying components...", "Almost done..."];
  showLoadingOverlay(loadingMessages);

  try {
    let items = [];
    if (state.pendingSource === "image") {
      const res = await fetch("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.pendingPayload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      items = data.items;
    } else if (state.pendingSource === "url") {
      const res = await fetch("/api/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: state.pendingPayload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      items = data.items;
    }

    if (!items || items.length === 0) {
      hideLoadingOverlay();
      toast("Couldn't identify any parts. Try a clearer image/URL, or describe it manually.", 4000);
      return;
    }

    state.extractedItems = items;
    showReview();
  } catch (err) {
    console.error(err);
    hideLoadingOverlay();
    toast("Extraction failed: " + err.message, 4500);
  } finally {
    hideLoadingOverlay();
  }
}

// ---------- Review step ----------
function showReview() {
  renderReviewList();
  showView("review");
}

function renderReviewList() {
  const list = document.getElementById("reviewList");
  list.innerHTML = "";
  state.extractedItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "review-row";
    row.innerHTML = `
      <input type="text" value="${escapeHtml(item.name)}" data-idx="${idx}" data-field="name" />
      <input type="number" min="1" value="${item.quantity}" data-idx="${idx}" data-field="quantity" />
      <button class="remove-btn" data-idx="${idx}" title="Remove">&times;</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      state.extractedItems[idx][field] = field === "quantity" ? Number(e.target.value) : e.target.value;
    });
  });
  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.idx);
      state.extractedItems.splice(idx, 1);
      renderReviewList();
    });
  });
}

document.getElementById("addItemBtn").addEventListener("click", () => {
  state.extractedItems.push({ name: "", quantity: 1 });
  renderReviewList();
});

document.getElementById("resolveCartBtn").addEventListener("click", async () => {
  const items = state.extractedItems.filter((i) => i.name && i.name.trim().length > 0);
  if (items.length === 0) { toast("Add at least one item"); return; }

  try {
    const res = await fetch("/api/resolve-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, budget: state.budget }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.resolvedCart = data;
    state.chatHistory = [];
    renderCart();
    seedChatGreeting();
    showView("cart");
  } catch (err) {
    console.error(err);
    toast("Could not resolve cart: " + err.message, 4000);
  }
});

// ---------- Cart view ----------
function renderCart() {
  const cart = state.resolvedCart;
  if (!cart) return;

  const inStockCount = cart.lines.filter((l) => l.status === "in_stock").length;
  document.getElementById("stockSummary").textContent = `${inStockCount}/${cart.lines.length} are in stock`;

  // Budget banner
  const banner = document.getElementById("budgetBanner");
  if (cart.budgetApplied && cart.budgetSwaps.length > 0) {
    const swapText = cart.budgetSwaps
      .map((s) => `swapped <strong>${escapeHtml(s.fromName)}</strong> &rarr; <strong>${escapeHtml(s.toName)}</strong> (saved ${peso(s.savings)})`)
      .join("; ");
    banner.innerHTML = `Budget ${peso(cart.budget)}: ${swapText}. ${cart.withinBudget ? "Now within budget." : "Still over budget — no further compatible substitutes available."}`;
    banner.classList.remove("hidden");
  } else if (cart.budget) {
    banner.textContent = `Budget ${peso(cart.budget)}: cart total ${peso(cart.total)} — within budget, no substitutions needed.`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  // Lines
  const linesEl = document.getElementById("cartLines");
  linesEl.innerHTML = "";
  cart.lines.forEach((line, idx) => {
    const div = document.createElement("div");
    div.className = `cart-line status-${line.status}`;

    if (!line.matched) {
      div.innerHTML = `
        <div class="line-thumb">&#10067;</div>
        <div>
          <p class="line-name">${escapeHtml(line.requestedName)}</p>
          <div class="line-detail">No catalog match found (qty ${line.requestedQty})</div>
          <div class="stock-label unmatched">&#9679; Unmatched</div>
        </div>
        <div></div>
        <div class="line-price"><strong>&mdash;</strong></div>
      `;
      linesEl.appendChild(div);
      return;
    }

    const statusLabel = { in_stock: "In Stock", low_stock: "Low Stock", out_of_stock: "Out of Stock" }[line.status];
    const subNote = line.substituted
      ? `<div class="sub-note">&#9888; Substituted from ${escapeHtml(line.substitutedFrom.name)} to fit budget</div>`
      : "";
    const notifyBtn = line.status === "out_of_stock"
      ? `<button class="btn btn-outline btn-small notify-btn" data-idx="${idx}">Notify when available</button>`
      : "";

    div.innerHTML = `
      <div class="line-thumb">&#128268;</div>
      <div>
        <p class="line-name">${escapeHtml(line.product.name)}</p>
        <div class="line-detail">SKU ${line.product.sku} &middot; pack of ${line.product.packSize} &middot; qty needed ${line.requestedQty}</div>
        <div class="stock-label ${line.status}">&#9679; ${statusLabel}</div>
        ${subNote}
        ${notifyBtn}
      </div>
      <div class="line-qty">
        <button class="qty-btn dec-btn" data-idx="${idx}">&minus;</button>
        <span>${line.packsNeeded}</span>
        <button class="qty-btn inc-btn" data-idx="${idx}">+</button>
      </div>
      <div class="line-price">
        <strong>${peso(line.cost)}</strong>
        <span>${peso(line.product.packPrice)} ea</span>
      </div>
    `;
    linesEl.appendChild(div);
  });

  linesEl.querySelectorAll(".notify-btn").forEach((btn) => {
    btn.addEventListener("click", () => toast("We'll notify you when this part is back in stock."));
  });
  linesEl.querySelectorAll(".inc-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => adjustLineQty(Number(e.target.dataset.idx), 1));
  });
  linesEl.querySelectorAll(".dec-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => adjustLineQty(Number(e.target.dataset.idx), -1));
  });

  document.getElementById("cartItemCount").textContent = `${cart.itemCount} items`;
  document.getElementById("cartTotal").textContent = peso(cart.total);
}

function adjustLineQty(idx, delta) {
  const line = state.resolvedCart.lines[idx];
  if (!line.matched) return;
  line.packsNeeded = Math.max(1, line.packsNeeded + delta);
  line.cost = line.packsNeeded * line.product.packPrice;
  state.resolvedCart.total = state.resolvedCart.lines.reduce((sum, l) => sum + (l.cost || 0), 0);
  state.resolvedCart.itemCount = state.resolvedCart.lines.reduce((n, l) => n + (l.packsNeeded || 0), 0);
  renderCart();
}

// ---------- Chat assistant (wired to /api/explain) ----------
function seedChatGreeting() {
  const cart = state.resolvedCart;
  const matchedCount = cart.lines.filter((l) => l.matched).length;
  const greeting = `Hi! I've resolved your cart — ${matchedCount} of ${cart.lines.length} components matched, total ${peso(cart.total)}. Ask me anything about parts, substitutions, or pricing.`;
  state.chatHistory = [{ role: "bot", text: greeting }];
  renderChat();
}

function renderChat() {
  const log = document.getElementById("chatLog");
  log.innerHTML = "";
  state.chatHistory.forEach((msg) => {
    const div = document.createElement("div");
    div.className = `chat-msg ${msg.role === "user" ? "user" : "bot"}`;
    div.innerHTML = `${escapeHtml(msg.text)}<div class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>`;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";

  state.chatHistory.push({ role: "user", text: question });
  renderChat();

  // Build a compact cart summary so we don't ship the whole catalog to Gemini.
  const cart = state.resolvedCart;
  const cartSummary = {
    total: cart.total,
    budget: cart.budget,
    budgetApplied: cart.budgetApplied,
    budgetSwaps: cart.budgetSwaps,
    lines: cart.lines.map((l) => ({
      requestedName: l.requestedName,
      matched: l.matched,
      name: l.product ? l.product.name : null,
      sku: l.sku,
      status: l.status,
      qty: l.packsNeeded,
      cost: l.cost,
      substituted: !!l.substituted,
    })),
  };

  state.chatHistory.push({ role: "bot", text: "…" });
  renderChat();

  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartSummary, question }),
    });
    const data = await res.json();
    state.chatHistory.pop(); // remove "…" placeholder
    if (data.error) {
      state.chatHistory.push({ role: "bot", text: "Sorry, I couldn't reach the assistant: " + data.error });
    } else {
      state.chatHistory.push({ role: "bot", text: data.answer });
    }
  } catch (err) {
    state.chatHistory.pop();
    state.chatHistory.push({ role: "bot", text: "Sorry, something went wrong reaching the assistant." });
  }
  renderChat();
}

document.getElementById("chatSendBtn").addEventListener("click", sendChatMessage);
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

// ---------- BOM preview modal ----------
document.getElementById("previewBomLink").addEventListener("click", (e) => {
  e.preventDefault();
  renderBomModal();
  document.getElementById("bomModal").classList.remove("hidden");
});
document.getElementById("bomCloseBtn").addEventListener("click", () => {
  document.getElementById("bomModal").classList.add("hidden");
});

function renderBomModal() {
  const cart = state.resolvedCart;
  const tbody = document.getElementById("bomTableBody");
  tbody.innerHTML = "";
  let totalParts = 0;
  let totalCost = 0;
  cart.lines.forEach((line) => {
    if (!line.matched) return;
    totalParts += line.packsNeeded;
    totalCost += line.cost;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${line.product.sku}</td>
      <td>${escapeHtml(line.product.name)}</td>
      <td>${line.packsNeeded}</td>
      <td>${peso(line.product.packPrice)}</td>
      <td>${peso(line.cost)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById("bomTotalParts").textContent = totalParts;
  document.getElementById("bomTotalCost").textContent = peso(totalCost);
}

document.getElementById("downloadBomBtn").addEventListener("click", () => {
  const cart = state.resolvedCart;
  let csv = "SKU,Description,Quantity,Unit Cost,Cost\n";
  cart.lines.forEach((line) => {
    if (!line.matched) return;
    csv += `${line.product.sku},"${line.product.name}",${line.packsNeeded},${line.product.packPrice},${line.cost}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "piyesa-bom.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Checkout (UI only — no real payment processing) ----------
document.getElementById("checkoutBtn").addEventListener("click", () => {
  renderCheckoutSidebar();
  resetCheckoutSteps();
  showView("checkout");
});

function renderCheckoutSidebar() {
  const cart = state.resolvedCart;
  const itemsEl = document.getElementById("checkoutCartItems");
  itemsEl.innerHTML = "";
  cart.lines.filter((l) => l.matched).forEach((line) => {
    const div = document.createElement("div");
    div.className = "checkout-cart-item";
    div.innerHTML = `
      <div class="item-thumb"></div>
      <div>${escapeHtml(line.product.name)}<br><span style="opacity:0.8">&times;${line.packsNeeded} &mdash; ${peso(line.cost)}</span></div>
    `;
    itemsEl.appendChild(div);
  });

  const subtotal = cart.total;
  const vat = Math.round(subtotal * 0.12);
  const shipping = subtotal > 0 ? 100 : 0;
  const total = subtotal + vat + shipping;
  document.getElementById("ckItemsPrice").textContent = peso(subtotal);
  document.getElementById("ckVatPrice").textContent = peso(vat);
  document.getElementById("ckShippingPrice").textContent = peso(shipping);
  document.getElementById("ckTotalPrice").textContent = peso(total);
}

function resetCheckoutSteps() {
  document.querySelectorAll(".checkout-step").forEach((s) => s.classList.remove("active"));
  document.getElementById("checkoutStep-info").classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('.tab[data-step="info"]').classList.add("active");
}

function goToCheckoutStep(step) {
  document.querySelectorAll(".checkout-step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`checkoutStep-${step}`).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.step === step));
}

document.getElementById("ckToPaymentBtn").addEventListener("click", () => goToCheckoutStep("payment"));
document.getElementById("ckToCompleteBtn").addEventListener("click", () => {
  const orderId = "PYS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  document.getElementById("ckOrderId").value = orderId;
  document.getElementById("ckCompleteEmail").value = document.getElementById("ckEmail").value || "";
  goToCheckoutStep("complete");
});
document.getElementById("ckDoneBtn").addEventListener("click", () => {
  toast("Order placed! (demo only — no real payment was processed)");
  showView("landing");
});

document.querySelectorAll(".payment-method").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".payment-method").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("cardFields").classList.toggle("hidden", btn.dataset.method !== "card");
  });
});

// ---------- Init ----------
loadTemplates();
showView("landing");
