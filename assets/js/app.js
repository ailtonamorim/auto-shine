const page = document.body.dataset.page;
const usersStorageKey = "autoshine:users";
const currentUserStorageKey = "autoshine:current-user";
const authTokenStorageKey = "autoshine:token";
const donoTokenKey = "autoshine:dono-token";
const userLocationStorageKey = "autoshine:user-location";
const defaultBookingTimes = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
const defaultScheduleDays = ["1", "2", "3", "4", "5", "6"];
const weekdayLabels = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sab",
};

// ── Usuário (cliente) ───────────────────────────────────────────────────────
function getUsersFromStorage() {
  const raw = localStorage.getItem(usersStorageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsersToStorage(users) {
  localStorage.setItem(usersStorageKey, JSON.stringify(users));
}

function getCurrentUser() {
  const raw = localStorage.getItem(currentUserStorageKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function logoutFromServer() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Não foi possível encerrar a sessão no servidor.");
}

function setCurrentUser(user, token) {
  // Uma autenticação explícita escolhe qual conta está em uso neste navegador.
  localStorage.removeItem(donoTokenKey);
  localStorage.removeItem(adminTokenKey);
  localStorage.setItem(currentUserStorageKey, JSON.stringify({ ...user, role: "client" }));
  if (token) localStorage.setItem(authTokenStorageKey, token);
  else localStorage.removeItem(authTokenStorageKey);
  updateNavAuthState();
  updatePartnerNavState();
}

function clearCurrentUser() {
  localStorage.removeItem(currentUserStorageKey);
  localStorage.removeItem(authTokenStorageKey);
  updateNavAuthState();
}

function getAuthToken() {
  return localStorage.getItem(authTokenStorageKey);
}

function getClientFromToken() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.role === "client" && payload.id) || (!payload.role && payload.id && !payload.donoId && !payload.adminRole)
      ? payload
      : null;
  } catch {
    return null;
  }
}

// ── Dono (parceiro) ─────────────────────────────────────────────────────────
function getDonoToken() {
  return localStorage.getItem(donoTokenKey);
}

function setDonoToken(token) {
  localStorage.removeItem(currentUserStorageKey);
  localStorage.removeItem(authTokenStorageKey);
  localStorage.removeItem(adminTokenKey);
  localStorage.setItem(donoTokenKey, token);
  updateNavAuthState();
  updatePartnerNavState();
}

function clearDonoToken() {
  // Também descarta sessões de cliente remanescentes de versões anteriores.
  localStorage.removeItem(currentUserStorageKey);
  localStorage.removeItem(authTokenStorageKey);
  localStorage.removeItem(donoTokenKey);
  updateNavAuthState();
  updatePartnerNavState();
}

function getDonoFromToken() {
  const token = getDonoToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.role === "partner" && payload.donoId) || (!payload.role && payload.donoId) ? payload : null;
  } catch { return null; }
}

// ── Helpers de fetch autenticado ────────────────────────────────────────────
async function donoFetch(path, options = {}) {
  const token = getDonoToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  await tratarSessaoEncerrada(response, "dono", token);
  return response;
}

async function userFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  await tratarSessaoEncerrada(response, "usuario", token);
  return response;
}

async function tratarSessaoEncerrada(response, tipo, tokenUsado) {
  if (response.status !== 401) return;
  const data = await response.clone().json().catch(() => ({}));
  if (data.code !== "SESSAO_INVALIDA") return;
  // Uma resposta atrasada não pode encerrar um login mais recente.
  if ((tipo === "dono" ? getDonoToken() : getAuthToken()) !== tokenUsado) return;
  if (tipo === "dono") clearDonoToken();
  else clearCurrentUser();
  const perfil = tipo === "dono" ? "empresa" : "cliente";
  window.location.href = `cadastro.html?perfil=${perfil}&mode=login&auth=session_expired`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file, scope, fetcher) {
  if (!file || !file.size) return "";
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    throw new Error("Use uma imagem PNG, JPG ou WEBP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }
  const imagem = await readFileAsDataUrl(file);
  const res = await fetcher("/api/uploads/imagem", {
    method: "POST",
    body: JSON.stringify({ imagem, nomeArquivo: file.name, escopo: scope }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Não foi possível enviar a imagem.");
  return data.url || "";
}

// Feedback visual: tipos explícitos, leitura sem pressa e confirmações únicas.
const toastRecords = new Map();
const toastLabels = { success: "Sucesso", error: "Erro", warning: "Atenção", info: "Informação" };
const toastIcons = { success: "✓", error: "!", warning: "!", info: "i" };

function ensureToastRoot() {
  let root = document.querySelector("[data-toast-root]");
  if (!root) {
    root = document.createElement("div");
    root.className = "toast-stack";
    root.dataset.toastRoot = "true";
    root.setAttribute("aria-label", "Notificações");
    document.body.appendChild(root);
  }
  return root;
}

function showToast(message, type = "info", options = {}) {
  type = Object.hasOwn(toastLabels, type) ? type : "info";
  const text = String(message ?? "").trim();
  if (!text) return null;
  const key = `${type}:${text}`;
  if (toastRecords.has(key)) return toastRecords.get(key).element;
  const root = ensureToastRoot();
  if (toastRecords.size >= 3) {
    const records = [...toastRecords.values()];
    (records.find(record => record.type === "success" || record.type === "info") || records[0]).close();
  }
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.innerHTML = `<span class="app-toast-icon" aria-hidden="true">${toastIcons[type]}</span>
    <div class="app-toast-content" role="${type === "error" ? "alert" : "status"}" aria-atomic="true">
      <strong>${toastLabels[type]}</strong><span>${escapeHtml(text)}</span>
    </div><button type="button" aria-label="Fechar aviso: ${toastLabels[type]}">&times;</button>`;
  // Erros ficam disponíveis até o fechamento; duration: 0 também é persistente.
  let remaining = options.duration ?? (type === "error" ? 0 : type === "warning" ? 8000 : 5000);
  if (!Number.isFinite(remaining) || remaining < 0) remaining = 0;
  let timer = null;
  let started = 0;
  let hovered = false;
  let focused = false;
  const pause = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
      remaining = Math.max(1, remaining - (Date.now() - started));
    }
  };
  const close = () => {
    pause();
    const hadFocus = toast.contains(document.activeElement);
    toastRecords.delete(key);
    toast.remove();
    if (hadFocus) root.querySelector("button")?.focus({ preventScroll: true });
  };
  const resume = () => {
    if (!remaining || hovered || focused || timer !== null) return;
    started = Date.now();
    timer = window.setTimeout(close, remaining);
  };
  toast.addEventListener("pointerenter", () => { hovered = true; pause(); });
  toast.addEventListener("pointerleave", () => { hovered = false; resume(); });
  toast.addEventListener("focusin", () => { focused = true; pause(); });
  toast.addEventListener("focusout", event => {
    if (toast.contains(event.relatedTarget)) return;
    focused = false;
    resume();
  });
  toast.querySelector("button").addEventListener("click", close);
  toastRecords.set(key, { element: toast, type, close });
  root.appendChild(toast);
  resume();
  return toast;
}

function notify(message, type = "info", options = {}) {
  return showToast(message, type, options);
}

// Mensagem única na página de destino, sem colocar textos ou dados de conta na URL.
function redirectWithNotice(url, message, type = "success") {
  const destination = new URL(url, window.location.href);
  if (destination.origin !== window.location.origin) return;
  try {
    sessionStorage.setItem("autoshine:flash", JSON.stringify({
      message, type, path: destination.pathname, expires: Date.now() + 60000,
    }));
  } catch { /* O redirecionamento continua se o navegador bloquear armazenamento. */ }
  window.location.assign(destination.href);
}

function consumeNotice() {
  try {
    const raw = sessionStorage.getItem("autoshine:flash");
    if (!raw) return;
    const notice = JSON.parse(raw);
    if (notice.expires > Date.now() && notice.path !== window.location.pathname) return;
    sessionStorage.removeItem("autoshine:flash");
    if (notice.expires > Date.now() && typeof notice.message === "string") notify(notice.message, notice.type);
  } catch { try { sessionStorage.removeItem("autoshine:flash"); } catch {} }
}

// Bloqueio por formulário/lista antes do primeiro await, com restauração em qualquer saída.
const pendingActionTargets = new WeakSet();
function guardAction(handler, selector = null) {
  return async function(event) {
    const target = event.currentTarget;
    const button = selector ? event.target.closest(selector) : event.submitter;
    if (selector && !button) return;
    if (pendingActionTargets.has(target)) { event.preventDefault(); return; }
    pendingActionTargets.add(target);
    const hadFocus = button === document.activeElement;
    const wasDisabled = button?.disabled;
    const oldBusy = target.getAttribute("aria-busy");
    if (button) button.disabled = true;
    target.setAttribute("aria-busy", "true");
    try { await handler.call(this, event); }
    catch { notify("Não foi possível concluir a ação. Tente novamente.", "error"); }
    finally {
      pendingActionTargets.delete(target);
      if (button) button.disabled = wasDisabled;
      if (hadFocus && button?.isConnected && !modalStack.length && document.activeElement === document.body) button.focus({ preventScroll: true });
      if (oldBusy === null) target.removeAttribute("aria-busy");
      else target.setAttribute("aria-busy", oldBusy);
    }
  };
}

// Ciclo de foco compartilhado por modais, incluindo modais sobrepostos.
const modalStack = [];
let modalInertSnapshot = [];
function modalFocusable(root) {
  return [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
    .filter(element => !element.disabled && element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length);
}
function restoreModalBackground() {
  modalInertSnapshot.forEach(([element, inert]) => { element.inert = inert; });
  modalInertSnapshot = [];
}
function updateModalBackground() {
  restoreModalBackground();
  const top = modalStack.at(-1);
  document.body.classList.toggle("app-modal-open", Boolean(top));
  if (!top) return;
  let child = top.root;
  while (child && child !== document.body) {
    const parent = child.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (sibling === child || sibling.matches('[data-toast-root], script, style, link') || top.allowed.includes(sibling)) continue;
      modalInertSnapshot.push([sibling, sibling.inert]);
      sibling.inert = true;
    }
    child = parent;
  }
}
function activateModal(root, options = {}) {
  if (modalStack.some(item => item.root === root)) return;
  modalStack.push({ root, onEscape: options.onEscape, allowed: options.allowed || [], previousFocus: document.activeElement });
  root.setAttribute("tabindex", "-1");
  updateModalBackground();
  (options.initialFocus || modalFocusable(root)[0] || root).focus({ preventScroll: true });
}
function deactivateModal(root) {
  const index = modalStack.findIndex(item => item.root === root);
  if (index < 0) return;
  const wasTop = index === modalStack.length - 1;
  const [closed] = modalStack.splice(index, 1);
  updateModalBackground();
  if (!wasTop) return;
  const top = modalStack.at(-1);
  const previous = closed.previousFocus;
  if (previous?.isConnected && !previous.closest('[inert]') && previous.getClientRects().length && (!top || top.root.contains(previous))) previous.focus({ preventScroll: true });
  else if (top) (modalFocusable(top.root)[0] || top.root).focus({ preventScroll: true });
}
document.addEventListener("keydown", event => {
  const top = modalStack.at(-1);
  if (!top) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    top.onEscape?.();
  } else if (event.key === "Tab") {
    const elements = modalFocusable(top.root);
    const first = elements[0] || top.root, last = elements.at(-1) || top.root;
    if (!elements.length || !top.root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
}, true);
document.addEventListener("focusin", event => {
  const top = modalStack.at(-1);
  if (top && !top.root.contains(event.target)) (modalFocusable(top.root)[0] || top.root).focus({ preventScroll: true });
});
// Fim da base de feedback.


function initializePasswordVisibilityToggles(root = document) {
  const passwordInputs = root.querySelectorAll('input[type="password"]:not([data-password-toggle-ready="true"])');

  passwordInputs.forEach((input) => {
    const parent = input.parentElement;
    if (!parent) return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-visibility-wrap";

    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-visibility-toggle";
    button.setAttribute("aria-controls", input.id || "");

    const SVG_EYE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const SVG_EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    const refreshButtonState = () => {
      const visible = input.type === "text";
      icon.innerHTML = visible ? SVG_EYE_OFF : SVG_EYE;
      button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
      button.setAttribute("aria-pressed", visible ? "true" : "false");
      button.title = visible ? "Ocultar senha" : "Mostrar senha";
    };

    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      refreshButtonState();
      input.focus({ preventScroll: true });
    });

    wrapper.appendChild(button);
    input.dataset.passwordToggleReady = "true";
    refreshButtonState();
  });
}

function ensureConfirmDialog() {
  let dialog = document.querySelector("[data-confirm-dialog]");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.className = "confirm-dialog hidden";
  dialog.dataset.confirmDialog = "true";
  dialog.innerHTML = `
    <div class="confirm-dialog-backdrop" data-confirm-cancel></div>
    <article class="confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <h2 id="confirm-dialog-title">Confirmar ação</h2>
      <p id="confirm-dialog-message" data-confirm-message></p>
      <div class="hidden" data-confirm-fields>
        <label for="confirm-reason">Motivo da alteração</label>
        <textarea id="confirm-reason" rows="3" minlength="5" maxlength="500"></textarea>
        <label class="hidden" data-confirm-exception-label><input type="checkbox" data-confirm-exception /> Registrar exceção ao prazo normal. A justificativa será compartilhada no histórico.</label>
        <p data-confirm-feedback role="alert"></p>
      </div>
      <div class="confirm-dialog-actions">
        <button class="btn btn-ghost" type="button" data-confirm-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-confirm-ok>Confirmar</button>
      </div>
    </article>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

let confirmationOpen = false;
function confirmAction(message, options = {}) {
  // Uma segunda solicitação não herda a resposta da primeira.
  if (confirmationOpen) return Promise.resolve(false);
  confirmationOpen = true;
  const dialog = ensureConfirmDialog();
  const okButton = dialog.querySelector("[data-confirm-ok]");
  const cancelButton = dialog.querySelector("button[data-confirm-cancel]");
  dialog.querySelector("#confirm-dialog-title").textContent = options.title || (options.danger ? "Confirmar exclusão" : "Confirmar ação");
  dialog.querySelector("[data-confirm-message]").textContent = message;
  okButton.textContent = options.confirmLabel || "Confirmar";
  okButton.classList.toggle("btn-danger", Boolean(options.danger));
  const reasonInput = dialog.querySelector("#confirm-reason");
  const exceptionInput = dialog.querySelector("[data-confirm-exception]");
  const feedback = dialog.querySelector("[data-confirm-feedback]");
  dialog.querySelector("[data-confirm-fields]").classList.toggle("hidden", !options.requireReason);
  dialog.querySelector("[data-confirm-exception-label]").classList.toggle("hidden", !options.allowDeadlineException);
  reasonInput.value = "";
  exceptionInput.checked = false;
  feedback.textContent = "";
  dialog.classList.remove("hidden");
  return new Promise(resolve => {
    let closed = false;
    const close = result => {
      if (closed) return;
      closed = true;
      dialog.classList.add("hidden");
      dialog.removeEventListener("click", onClick);
      deactivateModal(dialog);
      confirmationOpen = false;
      resolve(result);
    };
    const onClick = event => {
      if (event.target.closest("[data-confirm-ok]")) {
        if (options.requireReason) {
          const motivo = reasonInput.value.trim();
          if (motivo.length < 5 || motivo.length > 500) { feedback.textContent = "Informe o motivo com 5 a 500 caracteres."; reasonInput.focus(); return; }
          if (options.allowDeadlineException && !exceptionInput.checked) { feedback.textContent = "Confirme a exceção de prazo para continuar."; exceptionInput.focus(); return; }
          close({ motivo, excecaoPrazo: exceptionInput.checked });
        } else close(true);
      }
      else if (event.target.closest("[data-confirm-cancel]")) close(false);
    };
    dialog.addEventListener("click", onClick);
    activateModal(dialog, { initialFocus: options.danger ? cancelButton : okButton, onEscape: () => close(false) });
  });
}

// ── Utilitários ─────────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createSlug(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeOwnerLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function coordinatesValid(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = toRad(to[0] - from[0]);
  const dLng = toRad(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from[0])) *
      Math.cos(toRad(to[0])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatDistance(from, to) {
  const km = distanceKm(from, to);
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function saveUserLocation(position) {
  if (!Array.isArray(position) || !coordinatesValid(position[0], position[1])) return;
  try {
    sessionStorage.setItem(userLocationStorageKey, JSON.stringify({
      latitude: Number(position[0]),
      longitude: Number(position[1]),
    }));
  } catch {}
}

function isValidShopImagePath(value) {
  const imagePath = String(value || "").trim();
  if (/^https?:\/\//i.test(imagePath)) return true;
  return /^assets\/(img|uploads)\/[a-z0-9._/-]+\.(svg|png|jpe?g|webp)$/i.test(imagePath) && !imagePath.includes("..");
}

function parseTextList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n;,]+/);
  return source
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function parseScheduleTimes(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,\n;]/)
      .map((item) => item.trim());
  const unique = new Set();
  source.forEach((item) => {
    const match = String(item || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
    unique.add(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  });
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function parseScheduleDays(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,\n;]/)
      .map((item) => item.trim());
  const unique = new Set();
  source.forEach((item) => {
    const day = Number(item);
    if (Number.isInteger(day) && day >= 0 && day <= 6) unique.add(String(day));
  });
  return [...unique].sort((a, b) => Number(a) - Number(b));
}

function formatScheduleSummary(daysValue, timesValue) {
  const days = parseScheduleDays(daysValue || defaultScheduleDays);
  const times = parseScheduleTimes(timesValue || defaultBookingTimes);
  const daysText = days.length
    ? days.map((day) => weekdayLabels[day] || day).join(", ")
    : "sem dias";
  const timesText = times.length ? times.join(", ") : "sem horários";
  return `${daysText} - ${timesText}`;
}

function deriveCategoryFromServicos(servicos) {
  if (!Array.isArray(servicos) || !servicos.length) return "serviços gerais";
  const first = String(servicos[0]?.nome || "").trim();
  return first ? normalizeCategory(first) : "serviços gerais";
}

// ── Navegação ────────────────────────────────────────────────────────────────
function getReturnUrl() {
  return `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}`;
}

function redirectToLogin(reason = "login_required") {
  const next = encodeURIComponent(getReturnUrl());
  window.location.href = `cadastro.html?mode=login&next=${next}&reason=${reason}`;
}

function setActiveNavLink() {
  const map = {
    home: "index.html",
    cadastro: "cadastro.html",
    servicos: "servicos.html",
    mapa: "mapa.html",
    "meus-agendamentos": "meus-agendamentos.html",
    favoritos: "favoritos.html",
    "perfil-usuario": "perfil-usuario.html",
    "perfil-dono": "perfil-dono.html",
  };
  const target = map[page];
  if (!target) return;
  document.querySelectorAll(".topbar nav a").forEach((a) => {
    const matches = a.getAttribute("href")?.includes(target);
    a.classList.toggle("active", Boolean(matches));
  });
}

// Função responsável por atualizar o menu com base no login do usuário
function updateNavAuthState() {
  const partnerLogged = Boolean(getDonoFromToken());
  const adminLogged = Boolean(getAdminToken());
  const clientLogged = !partnerLogged && !adminLogged && Boolean(getCurrentUser() && getClientFromToken());
  const anyUserLogged = clientLogged || partnerLogged || adminLogged;
  
  const linkAgendamentos = document.getElementById("link-agendamentos");
  const linkFavoritos = document.getElementById("link-favoritos");

  document.querySelectorAll('header a[href*="cadastro.html"]').forEach((link) => {
    link.classList.toggle("hidden", anyUserLogged);
  });

  document.querySelectorAll('header a[href*="cadastro-dono.html"], header a[href*="perfil-dono.html"]').forEach((link) => {
    link.classList.toggle("hidden", !partnerLogged);
  });
  document.querySelectorAll('header a[href*="admin.html"]').forEach((link) => {
    link.classList.toggle("hidden", !adminLogged);
  });
  document.querySelectorAll('header a[href*="servicos.html"], header a[href*="mapa.html"], header a[href*="perfil.html"], header a[href*="avaliacoes.html"], header a[href*="agendamento.html"]').forEach((link) => {
    link.classList.toggle("hidden", partnerLogged || adminLogged);
  });
  document.querySelectorAll('header a[href*="perfil-usuario.html"], header a[href*="meus-agendamentos.html"], header a[href*="favoritos.html"]').forEach((link) => {
    link.classList.toggle("hidden", !clientLogged);
  });
  document.querySelectorAll(".site-footer a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes("mapa.html") || href.includes("meus-agendamentos.html") || href.includes("index.html")) {
      link.classList.toggle("hidden", partnerLogged || adminLogged);
    }
    if (href.includes("cadastro.html?perfil=empresa")) {
      link.classList.toggle("hidden", anyUserLogged);
    }
    if (href.includes("admin.html")) {
      link.classList.toggle("hidden", !adminLogged);
    }
  });

  if (linkAgendamentos) {
    linkAgendamentos.classList.toggle("hidden", !clientLogged);
  }
  if (linkFavoritos) {
    linkFavoritos.classList.toggle("hidden", !clientLogged);
  }

  document.querySelectorAll('header a[href*="favoritos.html"], header a[href*="meus-agendamentos.html"]').forEach((link) => {
    link.classList.toggle("hidden", !clientLogged);
  });

  // Remove os botões de "Sair" antigos antes de recriar para evitar duplicações
  document.querySelectorAll("[data-client-session-link]").forEach((item) => item.remove());

  // Se o usuário não está logado, a função para por aqui
  if (!clientLogged) return;

  // Se está logado, cria dinamicamente o botão "Sair"
  document.querySelectorAll(".topbar nav").forEach((nav) => {
    const profileMenu = window.createUserProfileMenu(getCurrentUser(), () => {
      clearCurrentUser();
      window.location.href = "/auth/logout";
    });
    profileMenu.dataset.clientSessionLink = "profile";
    // A conta fica à direita, sem ocupar o centro reservado aos links.
    const header = nav.closest(".topbar");
    const access = header?.querySelector(".header-access");
    if (access) access.insertAdjacentElement("afterend", profileMenu);
    else nav.appendChild(profileMenu);
  });
}

// Mantém o acesso ao painel visível em todas as páginas enquanto uma empresa
// estiver autenticada, sem precisar alterar o menu de cada arquivo HTML.
function updatePartnerNavState() {
  const footer = document.querySelector(".site-footer");
  if (footer) {
    footer.remove();
    initializeSiteFooter();
  }
  const partnerLogged = Boolean(getDonoFromToken());
  const partnerPage = page === "cadastro-dono" || page === "parceiro" || page === "perfil-dono";

  document.querySelectorAll("[data-partner-session-link]").forEach((item) => item.remove());
  if (partnerLogged) {
    document.querySelectorAll('header a[href*="cadastro-dono.html"]').forEach((link) => {
      if (!link.closest(".main-nav")) link.remove();
    });
  }

  const navItems = page === "perfil-dono"
    ? [
        ["Painel", "cadastro-dono.html#dashboard"],
        ["Dados do parceiro", "#conta", "conta"],
        ["Minhas lojas", "#lojas", "lojas"],
        ["Perfil da loja", "#perfil-loja", "perfil-loja"],
        ["Serviços", "#servicos", "servicos"],
      ]
    : [
        ["Dashboard", "#dashboard", "dashboard"],
        ["Meu Lava Jato", "#estabelecimento", "estabelecimento"],
        ["Agendamentos", "#agendamentos", "agendamentos"],
        ["Perfil da loja", "perfil-dono.html#perfil-loja"],
      ];

  document.querySelectorAll(".topbar .main-nav").forEach((nav) => {
    if (partnerPage) {
      nav.replaceChildren();
      nav.hidden = !partnerLogged;
      if (!partnerLogged) return;

      for (const [label, href, tab] of navItems) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        if (tab && page === "perfil-dono") link.dataset.ownerTab = tab;
        if (tab && page !== "perfil-dono") link.dataset.goTab = tab;
        nav.append(link);
      }
      return;
    }

    nav.hidden = false;
    if (!partnerLogged) return;

    let partnerLink = nav.querySelector('a[href*="cadastro-dono.html"]');
    if (!partnerLink) {
      partnerLink = document.createElement("a");
      partnerLink.href = "cadastro-dono.html";
      partnerLink.textContent = "Painel do parceiro";
      const servicesLink = Array.from(nav.querySelectorAll("a")).find((link) =>
        (link.getAttribute("href") || "").includes("servicos.html"),
      );
      if (servicesLink) servicesLink.insertAdjacentElement("afterend", partnerLink);
      else nav.prepend(partnerLink);
    }

    partnerLink.dataset.partnerSessionLink = "panel";
    partnerLink.classList.remove("active");
    partnerLink.removeAttribute("aria-current");
  });
}

function requireAuth(reason = "login_required") {
  if (getDonoFromToken()) {
    notify("Você está usando uma conta de parceiro. Agendamentos e avaliações são ações de uma conta de cliente.", "warning");
    return false;
  }
  if (!getAdminToken() && getCurrentUser() && getClientFromToken()) return true;
  clearCurrentUser();
  redirectToLogin(reason);
  return false;
}

function initializeAuthRequiredLinks() {
  document.querySelectorAll("a.requires-auth").forEach((link) => {
    if (link.dataset.authBound === "1") return;
    link.dataset.authBound = "1";
    link.addEventListener("click", (event) => {
      if (!requireAuth(link.dataset.authAction || "login_required")) event.preventDefault();
    });
  });
}

function showPartnerClientRestriction() {
  if (!getDonoFromToken()) return false;
  const main = document.querySelector("main");
  if (main) main.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Conta de parceiro</p>
      <h1>Esta área é destinada a clientes</h1>
      <p class="hero-text">Sua conta de parceiro gerencia o estabelecimento e os agendamentos recebidos. Para contratar serviços, use uma conta de cliente.</p>
      <a class="btn btn-primary" href="cadastro-dono.html">Voltar ao painel do parceiro</a>
    </section>`;
  return true;
}

// ── Rodape do site ───────────────────────────────────────────────────────────
function initializeSiteFooter() {
  if (page === "admin" || document.querySelector(".site-footer")) return;

  const year = new Date().getFullYear();
  const partnerLogged = Boolean(getDonoFromToken());
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container site-footer-inner">
      <section>
        <h2>Sobre Nós</h2>
        <p>Marketplace para encontrar lava jatos, comparar avalia&ccedil;&otilde;es e agendar servi&ccedil;os automotivos com praticidade.</p>
      </section>
      <section>
        <h3>${partnerLogged ? "Sua empresa" : "Para Você"}</h3>
        <nav class="footer-links" aria-label="Links do AutoShine">
          ${partnerLogged ? `
          <a href="cadastro-dono.html">Dashboard</a>
          <a href="cadastro-dono.html?tab=estabelecimento">Meu lava-jato</a>
          <a href="cadastro-dono.html?tab=agendamentos">Agendamentos recebidos</a>` : `
          <a href="index.html">In&iacute;cio</a>
          <a href="mapa.html">Mapa</a>
          <a href="meus-agendamentos.html">Agendamentos</a>`}
        </nav>
      </section>
      <section>
        <h3>Para Empresas</h3>
        <nav class="footer-links" aria-label="Links para parceiros">
          
          <a href="${partnerLogged ? "cadastro-dono.html" : "cadastro.html?perfil=empresa&mode=login"}">Painel do parceiro</a>
          
        </nav>
      </section>
      <section>
        <h3>Ajuda &amp; Suporte</h3>
        <nav class="footer-links" aria-label="Links legais">
          <a href="termos.html">Termos de uso</a>
          <a href="privacidade.html">Pol&iacute;tica de privacidade</a>
          <a href="mailto:contato@autoshine.com">contato@autoshine.com</a>
        </nav>
      </section>
    </div>
    <div class="container footer-small">
      <span>&copy; ${year} AutoShine. Todos os direitos reservados.</span>
      <span>Servi&ccedil;os automotivos, agendamentos e avalia&ccedil;&otilde;es em um s&oacute; lugar.</span>
    </div>
  `;
  document.body.appendChild(footer);
}

function initializeReportActions() {
  const modal = document.createElement("div");
  modal.className = "report-dialog hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "report-dialog-title");
  modal.innerHTML = `
    <div class="report-dialog-backdrop" data-report-close></div>
    <section class="report-dialog-card">
      <button class="report-dialog-close" type="button" aria-label="Fechar denúncia" data-report-close>&times;</button>
      <div class="report-dialog-head">
        <span class="report-dialog-kicker">Central de confiança</span>
        <h2 id="report-dialog-title">Denunciar</h2>
        <p id="report-dialog-copy"></p>
      </div>
      <form id="report-dialog-form" class="report-dialog-form" novalidate>
        <div class="field">
          <label for="report-dialog-reason">Motivo</label>
          <select id="report-dialog-reason" required></select>
        </div>
        <div class="field">
          <label for="report-dialog-details">Detalhes</label>
          <textarea id="report-dialog-details" rows="4" maxlength="400" placeholder="Conte rapidamente o que aconteceu. Isso ajuda nossa equipe a analisar melhor."></textarea>
        </div>
        <p id="report-dialog-feedback" class="report-dialog-feedback" role="status"></p>
        <div class="report-dialog-actions">
          <button class="btn btn-ghost" type="button" data-report-close>Cancelar</button>
          <button id="report-dialog-submit" class="btn btn-primary" type="submit">Enviar denúncia</button>
        </div>
      </form>
      <div id="report-dialog-success" class="report-dialog-success hidden" role="status">
        <strong>Denúncia enviada</strong>
        <p>Nossa equipe vai analisar sua denúncia.</p>
        <button class="btn btn-primary" type="button" data-report-close>Fechar</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector("#report-dialog-form");
  const title = modal.querySelector("#report-dialog-title");
  const copy = modal.querySelector("#report-dialog-copy");
  const reasonSelect = modal.querySelector("#report-dialog-reason");
  const detailsInput = modal.querySelector("#report-dialog-details");
  const feedback = modal.querySelector("#report-dialog-feedback");
  const submitButton = modal.querySelector("#report-dialog-submit");
  const successBox = modal.querySelector("#report-dialog-success");
  let reportPayload = null;
  let lastFocusedButton = null;
  let reportSending = false;

  const shopReasons = [
    ["Informações divergentes", "Informações divergentes"],
    ["Preço diferente do anunciado", "Preço diferente do anunciado"],
    ["Atendimento inadequado", "Atendimento inadequado"],
    ["Conteúdo incorreto", "Conteúdo incorreto"],
    ["Outro motivo", "Outro motivo"],
  ];
  const reviewReasons = [
    ["Conteúdo ofensivo", "Conteúdo ofensivo"],
    ["Avaliação suspeita", "Avaliação suspeita"],
    ["Informação falsa", "Informação falsa"],
    ["Exposição de dados pessoais", "Exposição de dados pessoais"],
    ["Outro motivo", "Outro motivo"],
  ];

  function setReportFeedback(message, type = "") {
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.className = `report-dialog-feedback${type ? ` is-${type}` : ""}`;
  }

  function closeReportDialog() {
    if (reportSending) return;
    modal.classList.add("hidden");
    deactivateModal(modal);
    reportPayload = null;
    form?.reset();
    setReportFeedback("");
    form?.classList.remove("hidden");
    successBox?.classList.add("hidden");
    if (submitButton) submitButton.disabled = false;
    if (lastFocusedButton) lastFocusedButton.focus();
  }

  function openReportDialog({ isReview, label, payload, trigger }) {
    if (reportSending) return;
    reportPayload = payload;
    lastFocusedButton = trigger || null;
    const reasons = isReview ? reviewReasons : shopReasons;
    const fallbackLabel = isReview ? "esta avaliação" : "esta loja";
    if (title) title.textContent = isReview ? "Denunciar avaliação" : "Denunciar loja";
    if (copy) {
      copy.textContent = `Informe o motivo da denúncia sobre ${label || fallbackLabel}. Sua identificação fica restrita à equipe.`;
    }
    if (reasonSelect) {
      reasonSelect.innerHTML = [
        `<option value="">Selecione um motivo</option>`,
        ...reasons.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`),
      ].join("");
    }
    form?.reset();
    setReportFeedback("");
    form?.classList.remove("hidden");
    successBox?.classList.add("hidden");
    modal.classList.remove("hidden");
    activateModal(modal, { initialFocus: reasonSelect, onEscape: closeReportDialog });
  }

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-report-close]")) closeReportDialog();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeReportDialog();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!reportPayload || reportSending) return;
    const motivo = reasonSelect?.value.trim() || "";
    const detalhes = detailsInput?.value.trim() || "";
    if (motivo.length < 4) {
      setReportFeedback("Selecione um motivo para continuar.", "error");
      reasonSelect?.focus();
      return;
    }

    reportSending = true;
    modal.setAttribute("aria-busy", "true");
    modal.querySelectorAll("button[data-report-close]").forEach(button => { button.disabled = true; });
    setReportFeedback("Enviando denúncia. Aguarde a conclusão para fechar.");
    if (submitButton) submitButton.disabled = true;
    try {
      const res = await userFetch("/api/denuncias", {
        method: "POST",
        body: JSON.stringify({ ...reportPayload, motivo, detalhes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportFeedback(data.error || "Não foi possível enviar a denúncia.", "error");
        return;
      }
      form?.classList.add("hidden");
      successBox?.classList.remove("hidden");
      successBox?.querySelector("button")?.focus();
    } catch {
      setReportFeedback("Erro ao enviar denúncia. Tente novamente.", "error");
    } finally {
      reportSending = false;
      modal.removeAttribute("aria-busy");
      modal.querySelectorAll("button[data-report-close]").forEach(button => { button.disabled = false; });
      if (submitButton) submitButton.disabled = false;
      if (!successBox.classList.contains("hidden")) successBox.querySelector("button")?.focus();
    }
  });

  document.addEventListener("click", async (event) => {
    const reportButton = event.target.closest("[data-report-shop], [data-report-review]");
    if (!reportButton) return;
    event.preventDefault();

    if (!requireAuth("denunciar")) return;

    const isReview = Boolean(reportButton.dataset.reportReview);
    openReportDialog({
      isReview,
      label: reportButton.dataset.reportLabel || "",
      trigger: reportButton,
      payload: {
        tipo: isReview ? "avaliacao" : "loja",
        lojaId: Number(reportButton.dataset.reportShop || 0) || undefined,
        avaliacaoId: Number(reportButton.dataset.reportReview || 0) || undefined,
      },
    });
    return;
  });
}

let homeUserPosition = null;

function loadSavedHomePosition() {
  try {
    const raw = sessionStorage.getItem(userLocationStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const lat = Number(parsed.latitude);
    const lng = Number(parsed.longitude);
    if (coordinatesValid(lat, lng)) homeUserPosition = [lat, lng];
  } catch {}
}

// ── Filtro de categoria (home) ───────────────────────────────────────────────
function initCategoryFilter() {
  const categoryList = document.getElementById("category-list");
  if (!categoryList) return;

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;

    categoryList.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    button.classList.add("active");

    if (homeUserPosition) applyHomeLocationRanking();
    else applyHomeFilters();
  });
}

function applyHomeFilters() {
  const category = document.querySelector("#category-list .chip.active")?.dataset.category || "todos";

  document.querySelectorAll("#shop-grid .shop-card").forEach((card) => {
    const services = card.dataset.services || "";
    const matchesCategory = category === "todos" || services.includes(category);
    card.style.display = matchesCategory ? "" : "none";
  });
}

function updateHomeLocationStatus(message) {
  const status = document.getElementById("location-status");
  if (status) status.textContent = message;
}

function updateHomeDistances() {
  if (!homeUserPosition) return;

  document.querySelectorAll("#shop-grid .shop-card").forEach((card) => {
    const lat = Number(card.dataset.latitude);
    const lng = Number(card.dataset.longitude);
    const distanceLabel = card.querySelector("[data-shop-distance]");

    if (!coordinatesValid(lat, lng)) {
      card.dataset.distanceKm = "999999";
      if (distanceLabel) {
        distanceLabel.hidden = false;
        distanceLabel.textContent = "Distância indisponível";
      }
      return;
    }

    const shopPosition = [lat, lng];
    card.dataset.distanceKm = String(distanceKm(homeUserPosition, shopPosition));
    if (distanceLabel) {
      distanceLabel.hidden = false;
      distanceLabel.textContent = `${formatDistance(homeUserPosition, shopPosition)} de você`;
    }
  });
}

function sortHomeShopsByDistance() {
  const shopGrid = document.getElementById("shop-grid");
  if (!shopGrid || !homeUserPosition) return;

  [...shopGrid.querySelectorAll('[data-owner-created="1"]')]
    .sort((a, b) => Number(a.dataset.distanceKm || 999999) - Number(b.dataset.distanceKm || 999999))
    .forEach((card) => shopGrid.appendChild(card));
}

function sortHomeShopsByPrice() {
  const shopGrid = document.getElementById("shop-grid");
  if (!shopGrid) return;
  [...shopGrid.querySelectorAll('[data-owner-created="1"]')]
    .sort((a, b) => Number(a.dataset.precoMedio || 9999) - Number(b.dataset.precoMedio || 9999))
    .forEach((card) => shopGrid.appendChild(card));
}

function sortHomeShopsByRating() {
  const shopGrid = document.getElementById("shop-grid");
  if (!shopGrid) return;
  [...shopGrid.querySelectorAll('[data-owner-created="1"]')]
    .sort((a, b) => Number(b.dataset.avgRating || 0) - Number(a.dataset.avgRating || 0))
    .forEach((card) => shopGrid.appendChild(card));
}

function initSortBar() {
  const sortBtns = document.querySelectorAll("[data-sort]");
  if (!sortBtns.length) return;

  sortBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      sortBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const sort = btn.dataset.sort;
      if (sort === "price") sortHomeShopsByPrice();
      else if (sort === "rating") sortHomeShopsByRating();
      else if (sort === "distance" && homeUserPosition) sortHomeShopsByDistance();
      else {
        const shopGrid = document.getElementById("shop-grid");
        if (shopGrid) [...shopGrid.querySelectorAll('[data-owner-created="1"]')]
          .sort((a, b) => Number(a.dataset.shopId) - Number(b.dataset.shopId))
          .forEach((card) => shopGrid.appendChild(card));
      }
      applyHomeFilters();
    });
  });
}

function applyHomeLocationRanking() {
  updateHomeDistances();
  sortHomeShopsByDistance();
  applyHomeFilters();

  const nearbyTitle = document.getElementById("nearby-title");
  if (nearbyTitle) nearbyTitle.textContent = "Lava jatos mais próximos de você";
}

function initUseLocation() {
  const locationButton = document.getElementById("use-location-btn");
  if (!locationButton) return;

  document.getElementById("label-location-cta")?.addEventListener("click", () => locationButton.click());

  locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      updateHomeLocationStatus("Geolocalização não suportada neste navegador.");
      return;
    }
    locationButton.disabled = true;
    locationButton.textContent = "Buscando localização...";
    updateHomeLocationStatus("Solicitando permissão para encontrar lava jatos perto de você.");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        homeUserPosition = [position.coords.latitude, position.coords.longitude];
        saveUserLocation(homeUserPosition);
        applyHomeLocationRanking();
        locationButton.disabled = false;
        locationButton.textContent = "Atualizar localização";
        updateHomeLocationStatus("Pronto. As recomendações agora estão ordenadas pela distância estimada.");
      },
      () => {
        locationButton.disabled = false;
        locationButton.textContent = "Minha localização";
        updateHomeLocationStatus("Não foi possível acessar sua localização agora. Verifique a permissão do navegador.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  });
}

// Uma prévia compartilhada, fora do grid, evita recortes e mudanças de altura.
let shopPreviewController = null;

function getShopPreviewController() {
  if (shopPreviewController) return shopPreviewController;
  const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const panel = document.createElement("section");
  panel.id = "shop-service-preview";
  panel.className = "shop-preview";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "shop-preview-title");
  const backdrop = document.createElement("div");
  backdrop.className = "shop-preview-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  document.body.append(backdrop, panel);

  let activeCard = null;
  let trigger = null;
  let openTimer;
  let closeTimer;
  let modal = false;
  let anchorPosition = null;
  let viewportSize = null;
  let dismissedCard = null;

  function clearTimers() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  }

  function close(restoreFocus = false) {
    clearTimers();
    const previousTrigger = trigger;
    const hadFocus = panel.contains(document.activeElement);
    if (restoreFocus && activeCard) dismissedCard = activeCard;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (activeCard) activeCard.classList.remove("shop-preview-active");
    panel.hidden = true;
    backdrop.hidden = true;
    panel.removeAttribute("aria-modal");
    deactivateModal(panel);
    document.body.classList.remove("shop-preview-lock");
    activeCard = null;
    trigger = null;
    modal = false;
    if ((restoreFocus || hadFocus) && previousTrigger?.isConnected) {
      previousTrigger.focus({ preventScroll: true });
    }
  }

  function scheduleClose() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (modal || panel.contains(document.activeElement)) return;
      if (hoverQuery.matches && (panel.matches(":hover") || activeCard?.matches(":hover"))) return;
      close();
    }, 180);
  }

  function open(card, loja, explicit) {
    clearTimers();
    if (!card.isConnected || !card.getClientRects().length) return;
    if (activeCard === card) {
      if (explicit) panel.querySelector("[data-preview-close]").focus();
      return;
    }
    close();
    activeCard = card;
    dismissedCard = null;
    trigger = card.querySelector("[data-shop-preview]");
    modal = !hoverQuery.matches || window.innerWidth <= 600;
    panel.classList.toggle("is-sheet", modal);
    const services = Array.isArray(loja.servicos) ? loja.servicos : [];
    const rows = services.slice(0, 3).map((service) => {
      const price = service.preco;
      const hasPrice = price !== null && price !== undefined && String(price).trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0;
      return `<li><strong>${escapeHtml(service.nome || "Serviço")}</strong>
        <span><b>${hasPrice ? escapeHtml(Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })) : "Preço a consultar"}</b>
        <span>${escapeHtml(String(service.duracao || "").trim() || "Duração a consultar")}</span></span></li>`;
    }).join("");
    panel.innerHTML = `
      <div class="shop-preview-photo"></div>
      <button class="shop-preview-close" type="button" data-preview-close aria-label="Fechar prévia">&times;</button>
      ${createFavoriteButtonHtml(card.querySelector("[data-favorite-toggle]")?.classList.contains("is-favorited"), loja.id)}
      <div class="shop-preview-content">
        <p class="shop-preview-label">Prévia dos serviços</p>
        <h2 id="shop-preview-title">${escapeHtml(loja.nome || "Estabelecimento")}</h2>
        <div class="shop-preview-rating"></div>
        ${loja.descricao ? `<p class="shop-preview-description">${escapeHtml(loja.descricao)}</p>` : ""}
        ${services.length ? `<ul class="shop-preview-services">${rows}</ul>` : '<p class="shop-preview-empty">Serviços ainda não cadastrados.</p>'}
        ${services.length > 3 ? `<p class="shop-preview-more">+ ${services.length - 3} serviço(s) disponível(is)</p>` : ""}
        <a class="btn btn-primary" href="perfil.html?shopId=${encodeURIComponent(loja.id)}">Ver todos os serviços</a>
      </div>`;
    const sourceImage = card.querySelector(".shop-card-img-wrap img");
    if (sourceImage) {
      const photo = sourceImage.cloneNode(true);
      photo.loading = "eager";
      panel.querySelector(".shop-preview-photo").appendChild(photo);
    }
    const rating = card.querySelector(".shop-rating, .shop-no-rating");
    if (rating) panel.querySelector(".shop-preview-rating").appendChild(rating.cloneNode(true));
    trigger.setAttribute("aria-expanded", "true");
    card.classList.add("shop-preview-active");
    panel.hidden = false;
    anchorPosition = card.getBoundingClientRect();
    viewportSize = [window.innerWidth, window.innerHeight];
    if (modal) {
      panel.style.removeProperty("width");
      panel.style.removeProperty("left");
      panel.style.removeProperty("top");
      backdrop.hidden = false;
      panel.setAttribute("aria-modal", "true");
      activateModal(panel, { allowed: [backdrop], onEscape: () => close(true) });
      document.body.classList.add("shop-preview-lock");
    } else {
      const bounds = card.getBoundingClientRect();
      const width = Math.min(420, Math.max(320, bounds.width * 1.08), window.innerWidth - 24);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(12, Math.min(bounds.left - (width - bounds.width) / 2, window.innerWidth - width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(bounds.top - 8, window.innerHeight - panel.offsetHeight - 12))}px`;
    }
    if (explicit) panel.querySelector("[data-preview-close]").focus({ preventScroll: true });
  }

  panel.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  panel.addEventListener("pointerleave", scheduleClose);
  panel.addEventListener("focusout", scheduleClose);
  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-preview-close], [data-favorite-toggle]")) close(true);
  });
  backdrop.addEventListener("click", () => close(true));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearTimers();
      if (activeCard) { event.preventDefault(); close(true); }
    }
    if (event.key !== "Tab" || !modal) return;
    const focusable = Array.from(panel.querySelectorAll("button, a[href]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener("pointerdown", (event) => {
    if (activeCard && !modal && !panel.contains(event.target) && !activeCard.contains(event.target)) close();
  });
  // Ordenação/filtros também podem ser acionados pelo teclado.
  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target) && !event.target.closest("[data-shop-preview]")) close();
  });
  window.addEventListener("scroll", (event) => {
    if (panel.contains(event.target) || modal) return;
    // Um clique pode chegar antes do evento de uma rolagem já concluída.
    // Só fechar se a posição do card realmente mudou após abrir a prévia.
    const bounds = activeCard?.getBoundingClientRect();
    if (bounds && (Math.abs(bounds.top - anchorPosition.top) > 1 || Math.abs(bounds.left - anchorPosition.left) > 1)) close();
  }, true);
  window.addEventListener("resize", () => {
    if (!viewportSize || viewportSize[0] !== window.innerWidth || viewportSize[1] !== window.innerHeight) close();
  });
  window.addEventListener("blur", () => close());
  hoverQuery.addEventListener("change", () => close());

  shopPreviewController = {
    register(card, loja) {
      const button = card.querySelector("[data-shop-preview]");
      button.addEventListener("click", () => open(card, loja, true));
      card.addEventListener("pointerenter", (event) => {
        if (!hoverQuery.matches || event.pointerType === "touch" || modal || dismissedCard === card || panel.contains(document.activeElement)) return;
        clearTimers();
        openTimer = setTimeout(() => open(card, loja, false), 250);
      });
      card.addEventListener("pointerleave", () => {
        if (dismissedCard === card) dismissedCard = null;
        scheduleClose();
      });
    },
  };
  return shopPreviewController;
}

// ── Home: cards de lojas da API ──────────────────────────────────────────────
function buildHomeCard(loja) {
  const article = document.createElement("article");
  article.className = "shop-card";
  const isFavorited = Boolean(loja.isFavorited);

  const servicos = loja.servicos || [];
  const serviceText = [loja.categoria || "", ...servicos.map((s) => normalizeCategory(s.nome))]
    .join(" ")
    .trim();
  article.dataset.services = serviceText;
  article.dataset.ownerCreated = "1";
  article.dataset.shopId = String(loja.id);
  article.dataset.latitude = String(loja.latitude ?? "");
  article.dataset.longitude = String(loja.longitude ?? "");
  article.dataset.precoMedio = String(loja.precoMedio ?? 9999);
  const avaliacoesSort = loja.avaliacoes || [];
  const avgRatingSort = avaliacoesSort.length
    ? avaliacoesSort.reduce((s, a) => s + Number(a.nota || 0), 0) / avaliacoesSort.length
    : 0;
  article.dataset.avgRating = String(avgRatingSort);

  const safeName = escapeHtml(loja.nome);
  const safePhoto = escapeHtml(loja.fotoUrl || "");
  const safeCapaFallback = escapeHtml(loja.capaUrl || "assets/img/detalhe-premium-estetica.png");
  const safeAddress = escapeHtml(loja.endereco || "Endereço não informado");
  const profileUrl = `perfil.html?shopId=${encodeURIComponent(loja.id)}`;

  const avaliacoes = loja.avaliacoes || [];
  const avgRating = avaliacoes.length
    ? (avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length).toFixed(1)
    : null;
  const metaHtml = avgRating
    ? `<p class="meta shop-rating"><span class="stars">&#9733; ${avgRating}</span><span class="shop-rating-count">(${avaliacoes.length})</span></p>`
    : `<p class="meta shop-no-rating">Sem avaliações ainda</p>`;

  article.innerHTML = `
    ${createFavoriteButtonHtml(isFavorited, loja.id)}
    <div class="shop-card-img-wrap">
      <img src="${safePhoto}" alt="Foto do lava jato ${safeName}" loading="lazy" onerror="if(this.dataset.capa&&this.src!==this.dataset.capa){this.src=this.dataset.capa;}else{this.src='assets/img/detalhe-premium-estetica.png';this.onerror=null;}" data-capa="${safeCapaFallback}" />
    </div>
    <div class="shop-content">
      <h3>${safeName}</h3>
      ${metaHtml}
      <p class="shop-address">&#128205; ${safeAddress}</p>
      <p class="shop-distance" data-shop-distance hidden></p>
      <div class="shop-card-actions">
        <button type="button" class="btn btn-secondary" data-shop-preview aria-haspopup="dialog" aria-expanded="false" aria-controls="shop-service-preview" aria-label="Prévia dos serviços de ${safeName}">Prévia</button>
        <a class="btn btn-secondary" href="${profileUrl}">Ver serviços</a>
      </div>
    </div>
  `;
  getShopPreviewController().register(article, loja);
  return article;
}

async function renderOwnerShopsOnHome() {
  const shopGrid = document.getElementById("shop-grid");
  if (!shopGrid) return;

  loadSavedHomePosition();

  shopGrid.querySelectorAll('[data-owner-created="1"]').forEach((card) => card.remove());

  try {
    const favoriteIds = await fetchUserFavoriteShopIds();
    const res = await fetch("/api/lojas", { cache: "no-store" });
    if (!res.ok) return;
    const { lojas } = await res.json();
    lojas.forEach((loja) => {
      loja.isFavorited = favoriteIds.includes(loja.id);
      shopGrid.appendChild(buildHomeCard(loja));
    });
    if (homeUserPosition) {
      applyHomeLocationRanking();
      const btn = document.getElementById("use-location-btn");
      if (btn) btn.textContent = "Atualizar localização";
      const sortDistBtn = document.getElementById("sort-distance");
      if (sortDistBtn) sortDistBtn.style.display = "";
      updateHomeLocationStatus("Mostrando os lava jatos mais próximos de você.");
    } else {
      applyHomeFilters();
    }
  } catch {}
}

async function initFavoritesPage() {
  if (showPartnerClientRestriction()) return;
  const favoritesGrid = document.getElementById("favorites-grid");
  const emptyMessage = document.getElementById("favorites-empty");
  if (!favoritesGrid) return;

  if (!requireAuth("favoritos")) return;

  favoritesGrid.innerHTML = "";
  if (emptyMessage) emptyMessage.classList.add("hidden");

  try {
    const res = await userFetch("/api/favoritos");
    if (!res.ok) {
      favoritesGrid.innerHTML = "<p>Não foi possível carregar suas lojas favoritas agora.</p>";
      return;
    }
    const data = await res.json();
    const lojas = Array.isArray(data.lojas) ? data.lojas : [];
    if (!lojas.length) {
      if (emptyMessage) emptyMessage.classList.remove("hidden");
      return;
    }
    lojas.forEach((loja) => {
      loja.isFavorited = true;
      favoritesGrid.appendChild(buildHomeCard(loja));
    });
  } catch {
    favoritesGrid.innerHTML = "<p>Não foi possível carregar suas lojas favoritas agora.</p>";
  }
}

// ── Página do parceiro ───────────────────────────────────────────────────────
// Agendamento: resumo, edição explícita e histórico compartilhados por cliente/parceiro.
function bookingPaymentOptions(loja) {
  const list = [...new Set(parseTextList(loja?.formasPagamento))];
  return list.length ? list : ['A combinar no local'];
}
function bookingDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '—');
}
function bookingToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
}
function bookingUnread(ag, role) {
  const field = role === 'parceiro' ? 'vistoParceiroEm' : 'vistoClienteEm';
  return (ag.alteracoes || []).filter(a => a.autorTipo !== role && !a[field]);
}
function bookingHistoryHtml(ag, role) {
  const entries = ag.alteracoes || [];
  if (!entries.length) return '<p class="empty-copy">Nenhuma alteração após a criação.</p>';
  const labels = { data:'Data', hora:'Horário', veiculo:'Veículo', notas:'Observações', formaPagamento:'Forma de pagamento', status:'Status', duracaoAgendaMinutos:'Duração definida para a agenda (min)'  };
  return `<details class="booking-history"><summary>Histórico de alterações (${entries.length})</summary>
    <ol>${entries.map(a => {
      const time = new Date(a.createdAt);
      const when = Number.isNaN(time.getTime()) ? '' : time.toLocaleString('pt-BR');
      const rows = Object.keys(a.atual || {}).filter(k => labels[k]).map(k => {
        const format = v => escapeHtml(k === 'data' ? bookingDateLabel(v) : String(v || 'Não informado'));
        return `<li><strong>${labels[k]}:</strong> ${format(a.anterior?.[k])} → ${format(a.atual[k])}</li>`;
      }).join('');
      return `<li><p><strong>${a.autorTipo === 'sistema' ? 'Sistema' : a.autorTipo === 'admin' ? 'Administrador' : a.autorTipo === 'parceiro' ? 'Estabelecimento' : 'Cliente'}</strong> · ${escapeHtml(a.autorNome || '')} · ${escapeHtml(when)}</p><p><strong>Motivo:</strong> ${escapeHtml(a.motivo || '')}</p><ul>${rows}</ul></li>`;
    }).join('')}</ol>
    ${role !== 'admin' && bookingUnread(ag,role).length ? `<button type="button" class="btn btn-secondary" data-booking-action="read" data-id="${ag.id}">Marcar alterações como lidas</button>` : ''}
  </details>`;
}
function bookingEditorHtml(ag, role, cancel = false) {
  const id = `booking-${role}-${ag.id}`;
  const scheduleLocked = role === 'cliente' && !ag.regras?.podeReagendar;
  const exceptionRequired = role === 'parceiro' && ag.regras?.exigeExcecaoPrazo;
  const payments = bookingPaymentOptions(ag.loja);
  const paymentHtml = payments.map(p => `<option value="${escapeHtml(p)}" ${p === ag.formaPagamento ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
  return `<form class="booking-editor" data-booking-editor="${ag.id}" data-cancel="${cancel}" data-schedule-locked="${scheduleLocked}">
    <h4 tabindex="-1">${cancel ? 'Cancelar agendamento' : 'Editar agendamento'}</h4>
    ${cancel ? '<p>O cancelamento será informado à outra parte e ficará no histórico.</p>' : `
    <div class="field-grid">
      <div class="field"><label for="${id}-date">Data</label><input id="${id}-date" name="data" type="date" ${scheduleLocked ? 'disabled' : ''} required min="${bookingToday()}" value="${escapeHtml(ag.data)}" /></div>
      <div class="field"><label for="${id}-time">Horário</label><select id="${id}-time" name="hora" ${scheduleLocked ? 'disabled' : ''} required><option value="${escapeHtml(ag.hora)}">${escapeHtml(ag.hora)}</option></select></div>
    </div>
    <p class="empty-copy" data-booking-availability role="status"></p>
    <div class="field-grid">
      <div class="field"><label for="${id}-vehicle">Veículo</label><select id="${id}-vehicle" name="veiculo" required>${['carro','moto','caminhonete'].map(v=>`<option value="${v}" ${String(ag.veiculo).toLowerCase()===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}</select></div>
      <div class="field"><label for="${id}-payment">Forma de pagamento no local</label><select id="${id}-payment" name="formaPagamento" required><option value="">Selecione</option>${paymentHtml}</select></div>
    </div>
    <div class="field"><label for="${id}-notes">Observações</label><textarea id="${id}-notes" name="notas" rows="2" maxlength="2000">${escapeHtml(ag.notas || '')}</textarea></div>`}
    ${scheduleLocked && !cancel ? '<p class="booking-update-notice">O prazo de reagendamento terminou. Você ainda pode ajustar os demais dados antes do início do atendimento.</p>' : ''}
    ${exceptionRequired ? `<label><input type="checkbox" name="excecaoPrazo" /> Registrar exceção de prazo para ${cancel ? 'cancelar' : 'reagendar'}. O motivo ficará no histórico.</label>` : ''}
    <div class="field"><label for="${id}-reason">Motivo ${cancel ? 'do cancelamento' : 'da alteração'}</label><textarea id="${id}-reason" name="motivo" required minlength="5" maxlength="500" rows="2" placeholder="Explique o motivo para a outra parte."></textarea></div>
    <p class="empty-copy" data-booking-feedback role="status"></p>
    <div class="booking-item-actions"><button class="btn btn-primary" type="submit">${cancel ? 'Confirmar cancelamento' : 'Salvar alterações'}</button><button class="btn btn-ghost" type="button" data-booking-action="discard" data-id="${ag.id}">${cancel ? 'Voltar' : 'Descartar edição'}</button></div>
  </form>`;
}
function bookingServiceName(booking) {
  return booking?.servicoNome || `${booking?.servico?.nome || 'Serviço'} (nome atual; histórico não registrado)`;
}
function bookingPriceCents(booking) {
  const value = booking?.precoCentavos;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function bookingMoney(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
function bookingPriceLabel(booking) {
  const cents = bookingPriceCents(booking);
  return cents === null ? 'Valor histórico não registrado' : bookingMoney(cents);
}
function bookingDurationLabel(booking) {
  return Number.isSafeInteger(booking?.duracaoMinutos) && booking.duracaoMinutos > 0
    ? `${booking.duracaoMinutos} min` : booking?.duracaoAgendaMinutos ? `${booking.duracaoAgendaMinutos} min (definidos para a agenda)` : 'Duração histórica não registrada';
}
function bookingRevenue(bookings) {
  return bookings.reduce((total, booking) => {
    if (booking.status !== 'finalizado') return total;
    const cents = bookingPriceCents(booking);
    if (cents === null) total.semValor++;
    else { total.centavos += cents; total.comValor++; }
    return total;
  }, { centavos: 0, semValor: 0, comValor: 0 });
}
function bookingRevenueLabel(total) {
  if (total.semValor && !total.comValor) return 'Valor não registrado';
  return bookingMoney(total.centavos) + (total.semValor ? ' (parcial)' : '');
}
function bookingDurationEditorHtml(ag, role) {
  return `<form class="booking-editor" data-booking-editor="${ag.id}" data-duration="true">
    <h4 tabindex="-1">Definir duração da reserva antiga</h4>
    <p>Informe a duração combinada com o cliente. Ela organizará a agenda, sem preencher o preço nem a duração histórica da compra. Após salvar, este campo não poderá ser alterado por esta ação.</p>
    <div class="field"><label for="duration-${role}-${ag.id}">Duração em minutos</label><input id="duration-${role}-${ag.id}" name="duracaoAgendaMinutos" type="number" min="1" max="1440" step="1" required /></div>
    <div class="field"><label for="reason-${role}-${ag.id}">Motivo / confirmação com o cliente</label><textarea id="reason-${role}-${ag.id}" name="motivo" minlength="5" maxlength="500" required></textarea></div>
    <p class="empty-copy" data-booking-feedback role="status"></p>
    <div class="booking-item-actions"><button class="btn btn-primary" type="submit">Salvar duração</button><button class="btn btn-ghost" type="button" data-booking-action="discard" data-id="${ag.id}">Voltar</button></div>
  </form>`;
}
function bookingCardHtml(ag, role) {
  const active = ['pendente','confirmado'].includes(ag.status) && !ag.regras?.expiracaoPendente;
  const statusClass = ag.status === 'expirado' ? 'booking-status-expired' : ag.status === 'finalizado' ? 'booking-status-done' : ag.status === 'cancelado' ? 'booking-status-canceled' : 'booking-status-pending';
  const unread = bookingUnread(ag,role);
  const regras = ag.regras || {};
  return `<article class="${role === 'parceiro' ? 'booking-received-item' : 'user-booking-card'} booking-summary-card" data-booking-card="${ag.id}">
    <div class="booking-item-head"><div><h3>${escapeHtml(ag.loja?.nome || 'Lava-jato')}</h3><p>${escapeHtml(bookingServiceName(ag))}</p></div><span class="booking-status-badge ${statusClass}">${escapeHtml(ag.status === 'expirado' ? 'Expirado' : ag.status || 'pendente')}</span></div>
    ${ag.status === 'expirado' ? '<p class="booking-update-notice">Expirado automaticamente: o estabelecimento não confirmou antes do horário marcado. Para reservar outro horário, faça um novo agendamento.</p>' : ''}
    ${ag.status === 'pendente' && active ? '<p class="empty-copy">Aguardando confirmação do estabelecimento. Sem confirmação até o horário marcado, este agendamento expira automaticamente.</p>' : ''}
    ${ag.regras?.expiracaoPendente ? '<p class="booking-update-notice">O prazo de confirmação terminou. Atualize a lista para consultar o encerramento automático.</p>' : ''}
    ${unread.length ? `<p class="booking-update-notice" role="status">Seu agendamento foi atualizado. Confira o histórico (${unread.length} ${unread.length===1?'nova alteração':'novas alterações'}).</p>` : ''}
    <dl class="booking-summary-data"><div><dt>Data e horário</dt><dd>${escapeHtml(bookingDateLabel(ag.data))} às ${escapeHtml(ag.hora)}</dd></div><div><dt>Veículo</dt><dd>${escapeHtml(ag.veiculo || 'Não informado')}</dd></div><div><dt>Forma de pagamento escolhida</dt><dd>${escapeHtml(ag.formaPagamento || 'Não informado')}</dd></div>
    <div><dt>Valor reservado</dt><dd>${escapeHtml(bookingPriceLabel(ag))}</dd></div><div><dt>Duração reservada</dt><dd>${escapeHtml(bookingDurationLabel(ag))}</dd></div>
    ${role === 'parceiro' ? `<div><dt>Cliente</dt><dd>${escapeHtml(ag.usuario?.nome || ag.nomeCliente || 'Cliente')} · ${escapeHtml(ag.usuario?.email || ag.emailCliente || '')}</dd></div>` : ''}</dl>
    <p class="empty-copy">Pagamento no estabelecimento. A forma escolhida não confirma que o pagamento foi recebido.</p>
    ${active && regras.limiteCancelamento ? `<p class="empty-copy">Prazo normal para cancelar/reagendar: ${escapeHtml(regras.limiteCancelamento)} (Brasília).${regras.exigeExcecaoPrazo ? ' Exceções exigem justificativa.' : ''}</p>` : ''}
    ${active && regras.motivoFinalizar && role === 'parceiro' ? `<p class="empty-copy">${escapeHtml(regras.motivoFinalizar)}${regras.fimPrevisto ? ` Término previsto: ${escapeHtml(regras.fimPrevisto)} (Brasília).` : ''}</p>` : ''}
    ${active && role === 'cliente' && !regras.podeCancelar ? '<p class="booking-update-notice">O prazo para cancelar terminou. Entre em contato com o estabelecimento.</p>' : ''}
    ${ag.notas ? `<p class="booking-notes"><strong>Observações:</strong> ${escapeHtml(ag.notas)}</p>` : ''}
    ${active && !ag.duracaoMinutos && !ag.duracaoAgendaMinutos ? '<p class="booking-update-notice">Reserva antiga sem duração: novas reservas nesta data ficam suspensas até o parceiro definir a duração ou encerrar esta reserva.</p>' : ''}
    ${active ? `<div class="booking-item-actions" data-booking-summary-actions>
      ${regras.podeEditar ? `<button class="btn btn-secondary" type="button" data-booking-action="edit" data-id="${ag.id}">Editar agendamento</button>` : ''}
      ${role==='parceiro' && !ag.duracaoMinutos && !ag.duracaoAgendaMinutos ? `<button class="btn btn-secondary" type="button" data-booking-action="duration" data-id="${ag.id}">Definir duração da agenda</button>` : ''}
      ${role==='parceiro' && regras.podeConfirmar ? `<button class="btn btn-secondary" type="button" data-booking-action="confirm" data-id="${ag.id}">Confirmar agendamento</button>` : ''}
      ${role==='parceiro' && regras.podeFinalizar ? `<button class="btn btn-secondary" type="button" data-booking-action="finish" data-id="${ag.id}">Marcar como finalizado</button>` : ''}
      ${regras.podeCancelar ? `<button class="btn btn-ghost" type="button" data-booking-action="cancel" data-id="${ag.id}">Cancelar agendamento</button>` : ''}
    </div>` : ''}
    <div data-booking-editor-slot></div>
    ${bookingHistoryHtml(ag,role)}
  </article>`;
}
function createBookingListController(list, role, onLoad = () => {}) {
  const fetcher = role === 'parceiro' ? donoFetch : userFetch;
  const suffix = role === 'parceiro' ? '/dono' : '';
  const toolbar = document.createElement('div');
  toolbar.className = 'booking-list-toolbar';
  toolbar.innerHTML = '<p class="empty-copy" role="status">Carregando agendamentos...</p><button type="button" class="btn btn-ghost">Atualizar lista</button>';
  list.before(toolbar);
  const message = toolbar.querySelector('p');
  let bookings = [], signature = '', loading = false, saving = false, reloadRequested = false;
  async function load({ silent = false } = {}) {
    if (saving || (silent && list.querySelector('[data-booking-editor]'))) return;
    if (loading) { if (!silent) reloadRequested = true; return; }
    loading = true;
    try {
      const res = await fetcher(`/api/agendamentos/${role === 'parceiro' ? 'dono' : 'me'}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os agendamentos.');
      if (silent && (saving || list.querySelector('[data-booking-editor]'))) return;
      bookings = data.agendamentos || [];
      const nextSignature = JSON.stringify(bookings);
      if (signature !== nextSignature || !silent) {
        const expanded = new Set([...list.querySelectorAll('.booking-history[open]')].map(d=>d.closest('[data-booking-card]').dataset.bookingCard));
        list.innerHTML = bookings.length ? bookings.map(ag=>bookingCardHtml(ag,role)).join('') : '<p class="empty-copy">Nenhum agendamento encontrado.</p>';
        for (const card of list.querySelectorAll('[data-booking-card]')) if (expanded.has(card.dataset.bookingCard)) card.querySelector('.booking-history')?.setAttribute('open','');
        signature = nextSignature;
        onLoad(bookings);
      }
      const unread = bookings.reduce((n,ag)=>n+bookingUnread(ag,role).length,0);
      message.textContent = unread ? `${unread} ${unread===1?'alteração não lida':'alterações não lidas'}. Confira os avisos abaixo.` : 'Lista atualizada. Novas alterações aparecem aqui automaticamente.';
    } catch (err) { message.textContent = err.message || 'Erro de conexão. Clique em Atualizar lista para tentar novamente.'; }
    finally { loading = false; if (reloadRequested) { reloadRequested = false; await load(); } }
  }
  toolbar.querySelector('button').addEventListener('click',()=>{
    if (list.querySelector('[data-booking-editor]')) { message.textContent = 'Salve ou descarte a edição antes de atualizar a lista.'; return; }
    load();
  });
  async function send(url, payload) {
    const res = await fetcher(url,{method:'PUT',body:JSON.stringify(payload)});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível salvar.');
    return data;
  }
  function closeEditor(card) {
    card.querySelector('[data-booking-editor-slot]').innerHTML = '';
    card.querySelector('[data-booking-summary-actions]')?.classList.remove('hidden');
  }
  async function availability(form,ag) {
    const date = form.elements.data.value, select = form.elements.hora, msg = form.querySelector('[data-booking-availability]');
    const requestId = String(Number(form.dataset.availabilityRequest || 0)+1);
    form.dataset.availabilityRequest = requestId;
    const selected = select.value;
    form.dataset.availabilityReady = '0';select.disabled = true;
    msg.textContent = 'Consultando horários...';
    try {
      const res = await fetcher(`/api/agendamentos/${ag.id}${suffix}/disponibilidade?data=${encodeURIComponent(date)}`);
      const result = await res.json();
      if (!form.isConnected || form.dataset.availabilityRequest !== requestId) return;
      if (!res.ok) throw new Error(result.error || 'Falha ao consultar horários.');
      const times = result.horarios || [];
      // A reserva existente permanece válida caso a grade de horários tenha sido alterada depois.
      if (date===ag.data) { const current=times.find(t=>t.hora===ag.hora); if(current) {current.disponivel=true;current.motivo='';} else times.push({hora:ag.hora,disponivel:true}); }
      select.innerHTML = '<option value="">Selecione</option>'+times.map(t=>`<option value="${escapeHtml(t.hora)}" ${t.disponivel?'':'disabled'}>${escapeHtml(t.hora)}${t.disponivel?'':` (${escapeHtml(t.motivo || 'indisponível')})`}</option>`).join('');
      select.value = times.some(t=>t.hora===selected && t.disponivel) ? selected : '';
      select.disabled = !times.some(t=>t.disponivel);
      form.dataset.availabilityReady = '1';
      msg.textContent = result.mensagem || (select.disabled ? 'Nenhum horário disponível nesta data.' : 'Horários de Brasília. A disponibilidade considera toda a duração.');
    } catch(err) { if(form.isConnected && form.dataset.availabilityRequest===requestId)msg.textContent = err.message || 'Erro ao consultar horários. Altere a data para tentar novamente.'; }
  }
  list.addEventListener('click', guardAction(async event=>{
    const button = event.target.closest('[data-booking-action]');
    if(!button || saving)return;
    const ag = bookings.find(a=>String(a.id)===button.dataset.id), action = button.dataset.bookingAction;
    if(!ag)return;
    if (action !== 'discard' && list.querySelector('[data-booking-editor]')) { notify('Salve ou descarte a edição aberta antes de continuar.', "warning"); return; }
    const card = button.closest('[data-booking-card]');
    if(action==='discard') {closeEditor(card);card.querySelector('[data-booking-action="edit"]')?.focus();return;}
    if(action==='edit'||action==='cancel'||action==='duration') {
      card.querySelector('[data-booking-summary-actions]').classList.add('hidden');
      card.querySelector('[data-booking-editor-slot]').innerHTML = action==='duration' ? bookingDurationEditorHtml(ag,role) : bookingEditorHtml(ag,role,action==='cancel');
      const form = card.querySelector('form');form.querySelector('h4').focus();
      if(action==='edit') { if(form.dataset.scheduleLocked==='true') form.dataset.availabilityReady='1'; else availability(form,ag); }
      return;
    }
    if(action==='read' && !card.querySelector('.booking-history')?.open) return;
    if(action==='confirm'||action==='finish') {
      if(!await confirmAction(`${action === 'finish' ? 'Finalizar' : 'Confirmar'} o agendamento #${ag.id}, de ${ag.data.split('-').reverse().join('/')} às ${ag.hora}? O cliente verá esta atualização.`,{title: action === 'finish' ? 'Finalizar atendimento' : 'Confirmar agendamento', confirmLabel: action === 'finish' ? 'Finalizar' : 'Confirmar'}))return;
    }
    saving = true;button.disabled = true;
    try {
      if(action==='read') await send(`/api/agendamentos/${ag.id}${suffix}/alteracoes/lidas`,{ids:bookingUnread(ag,role).slice(0,500).map(a=>a.id)});
      else if(action==='confirm'||action==='finish') await send(`/api/agendamentos/${ag.id}/status`,{status:action==='finish'?'finalizado':'confirmado',revisao:ag.revisao});
      else return;
      saving=false;await load();
      if (action === "confirm" || action === "finish") notify(action === "finish" ? "Atendimento marcado como finalizado." : "Agendamento confirmado.", "success");
    } catch(err) {notify(err.message || 'Erro de conexão.', "error");}
    finally {saving=false;button.disabled=false;}
  }, '[data-booking-action]'));
  list.addEventListener('change',event=>{
    const form = event.target.closest('[data-booking-editor]');
    if(form && event.target.name==='data') {
      const ag = bookings.find(a=>String(a.id)===form.dataset.bookingEditor);
      if(ag)availability(form,ag);
    }
  });
  list.addEventListener('submit',async event=>{
    const form = event.target.closest('[data-booking-editor]');if(!form)return;
    event.preventDefault();if(saving)return;
    const ag = bookings.find(a=>String(a.id)===form.dataset.bookingEditor);if(!ag)return;
    const cancel = form.dataset.cancel==='true', duration = form.dataset.duration==='true';
    const feedback = form.querySelector('[data-booking-feedback]');
    if(!form.reportValidity())return;
    const payload = Object.fromEntries(new FormData(form));
    payload.revisao = ag.revisao;
    payload.excecaoPrazo = payload.excecaoPrazo === 'on';
    if (form.dataset.scheduleLocked === 'true' && !cancel && !duration) { payload.data = ag.data; payload.hora = ag.hora; }
    payload.motivo = String(payload.motivo||'').trim();
    if(payload.motivo.length<5){feedback.textContent='Explique o motivo com pelo menos 5 caracteres.';return;}
    if(duration) payload.duracaoAgendaMinutos=Number(payload.duracaoAgendaMinutos);
    if(!cancel && !duration && (form.dataset.availabilityReady!=='1'||!payload.hora)){feedback.textContent='Selecione um horário disponível antes de salvar.';return;}
    if(!cancel && !duration && ['data','hora','veiculo','notas','formaPagamento'].every(k=>String(payload[k]||'').trim()===String(ag[k]||'').trim())){feedback.textContent='Nenhuma informação foi alterada.';return;}
    saving=true;
    const controls = [...form.querySelectorAll('button,input,select,textarea')].map(control => ({ control, disabled: control.disabled }));
    controls.forEach(({control}) => { control.disabled = true; });
    feedback.textContent='Salvando...';
    try {
      await send(`/api/agendamentos/${ag.id}${suffix}${duration?'/duracao':cancel?'/cancelar':''}`,payload);
      closeEditor(form.closest('[data-booking-card]'));
      saving=false;await load();notify(cancel?'Agendamento cancelado. O motivo está disponível para a outra parte.':'Alterações salvas. A outra parte verá um aviso e o histórico.', "success");
    } catch(err) {feedback.textContent=err.message || 'Erro de conexão. Tente novamente.';}
    finally {saving=false;controls.forEach(({control,disabled}) => { control.disabled = disabled; });}
  });
  const timer = window.setInterval(()=>{if(!document.hidden)load({silent:true});},30000);
  const refresh = ()=>{if(!document.hidden)load({silent:true});};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
  return {load};
}

async function initPartnerPage() {
  const authShell = document.getElementById("partner-auth-shell") || document.getElementById("dono-auth-shell");
  const managementShell = document.getElementById("partner-management-shell");
  const loginForm = document.getElementById("owner-login-form") || document.getElementById("dono-login-form");
  const ownerSessionLabel = document.getElementById("owner-session-label");
  const ownerLogoutButton = document.getElementById("owner-logout-btn");
  const form = document.getElementById("partner-form");
  const servicesList = document.getElementById("partner-services-list");
  const addServiceButton = document.getElementById("add-partner-service");
  const serviceTemplate = document.getElementById("partner-service-template");
  const ownedList = document.getElementById("partner-owned-list");
  const bookingsList = document.getElementById("partner-bookings-list");
  const dashboardRoot = document.getElementById("partner-dashboard-root");
  const latitudeInput = document.getElementById("partner-latitude");
  const longitudeInput = document.getElementById("partner-longitude");
  const addressInput = document.getElementById("partner-address");
  const geocodeAddressButton = document.getElementById("partner-geocode-address");
  const geocodeFeedback = document.getElementById("partner-geocode-feedback");
  const useCurrentLocationButton = document.getElementById("partner-use-current-location");
  const scheduleTimesInput = document.getElementById("partner-schedule-times");
  const scheduleFeedback = document.getElementById("partner-schedule-feedback");
  const photoFileInput = document.getElementById("partner-photo-file");
  const coverFileInput = document.getElementById("partner-cover-file");
  const paymentsInput = document.getElementById("partner-payments");
  const cancellationPolicyInput = document.getElementById("partner-cancellation-policy");
  const galleryInput = document.getElementById("partner-gallery");
  const photoFeedback = document.getElementById("partner-photo-feedback");
  const coverFeedback = document.getElementById("partner-cover-feedback");
  const submitButton = document.getElementById("partner-submit-btn");

  if (
    !authShell || !managementShell || !ownerSessionLabel || !ownerLogoutButton ||
    !form || !servicesList || !addServiceButton || !serviceTemplate || !ownedList ||
    !latitudeInput || !longitudeInput || !addressInput || !geocodeAddressButton || !useCurrentLocationButton ||
    !scheduleTimesInput || !submitButton
  ) return;

  const tabButtons = managementShell.querySelectorAll("[data-partner-tab]");
  const tabPanels = managementShell.querySelectorAll("[data-partner-panel]");
  const cancelEditButton = document.getElementById("partner-cancel-edit");
  const shopEditor = document.getElementById("partner-shop-editor");
  const shopOverview = document.getElementById("partner-shop-overview");
  const formTitle = document.getElementById("partner-form-title");
  const formHint = document.getElementById("partner-form-hint");
  const editSubmitSlot = document.getElementById("partner-edit-submit-slot");
  const createSubmitSlot = submitButton.parentElement;
  let wizardGoToStep = null;
  let syncTimeTags = null;
  let extraPhotoSlots = [
    { file: null, existingUrl: "" },
    { file: null, existingUrl: "" },
    { file: null, existingUrl: "" },
  ];

  // loja em memória para edição rápida (evita fetch extra)
  let cachedShops = [];
  let shopsLoaded = false;
  let shopEditorOpen = false;
  let cachedBookings = [];
  let partnerNotifications = [];
  let partnerReports = [];
  let partnerAttachmentObjectUrls = [];
  let unreadPartnerNotifications = 0;
  let selectedDashboardShopId = "";
  let ownerSidebarCollapsed = localStorage.getItem("autoshine:owner-sidebar-collapsed") === "1";

  function syncShopView() {
    const showEditor = shopEditorOpen || (shopsLoaded && !cachedShops.length);
    shopEditor?.classList.toggle("hidden", !showEditor);
    shopOverview?.classList.toggle("hidden", showEditor);
    cancelEditButton?.classList.toggle("hidden", !form.dataset.editingShopId);
  }

  function setPartnerFormMode(editing) {
    if (formTitle) formTitle.textContent = editing ? "Editar dados do lava-jato" : "Cadastrar seu lava-jato";
    if (formHint) formHint.textContent = editing
      ? "Atualize os dados, as fotos e a agenda do estabelecimento. Os serviços são gerenciados na lista de Meu lava-jato."
      : "Preencha as etapas para publicar seu estabelecimento.";
    const serviceStep = document.querySelector('#partner-wizard-progress [data-step="4"]');
    serviceStep?.classList.toggle("hidden", editing);
    serviceStep?.previousElementSibling?.classList.toggle("hidden", editing);
    form.querySelector('[data-wizard-next="3"]')?.classList.toggle("hidden", editing);
    // A rota PUT atualiza a loja; serviços têm seu próprio editor e suas rotas.
    form.querySelectorAll('[data-wizard-panel="4"] input, [data-wizard-panel="4"] textarea, [data-wizard-panel="4"] select').forEach((field) => { field.disabled = editing; });
    editSubmitSlot?.classList.toggle("hidden", !editing);
    (editing && editSubmitSlot ? editSubmitSlot : createSubmitSlot).appendChild(submitButton);
    submitButton.textContent = editing ? "Salvar alterações" : "Publicar lava jato";
  }

  function switchTab(name) {
    tabButtons.forEach((t) => {
      const active = t.dataset.partnerTab === name;
      t.classList.toggle("active", active);
      if (active) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    tabPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.partnerPanel !== name));
    syncShopView();
  }

  cancelEditButton?.addEventListener("click", () => {
    resetPartnerForm();
    switchTab("estabelecimento");
    document.getElementById("partner-overview-title")?.focus({ preventScroll: true });
  });

  tabButtons.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.partnerTab));
  });

  document.addEventListener("click", (event) => {
    const goTabBtn = event.target.closest("[data-go-tab]");
    if (goTabBtn && managementShell && !managementShell.classList.contains("hidden")) {
      switchTab(goTabBtn.dataset.goTab);
    }
  });

  function showAuthArea() {
    if (page === "cadastro-dono") {
      window.location.replace("cadastro.html?perfil=empresa&mode=login");
      return;
    }
    authShell.classList.remove("hidden");
    managementShell.classList.add("hidden");
  }

  function showManagementArea(dono) {
    authShell.classList.add("hidden");
    managementShell.classList.remove("hidden");
    ownerSessionLabel.textContent = `Conectado como: ${dono.nome} (${dono.login})`;
  }

  function localDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
  }

  function shiftDateKey(dateKey, days) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0,10);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  }

  function bookingBelongsToShop(booking, shopId) {
    return String(booking?.lojaId || booking?.loja?.id || "") === String(shopId);
  }

  function bookingPrice(booking) {
    return Number(booking?.servico?.preco || 0);
  }

  function renderPartnerNotifications() {
    const badge = dashboardRoot?.querySelector("[data-notification-count]");
    const list = dashboardRoot?.querySelector("[data-notifications-list]");
    const unreadLabel = dashboardRoot?.querySelector("[data-notification-unread-label]");
    const trigger = dashboardRoot?.querySelector("[data-toggle-notifications]");
    if (unreadLabel) unreadLabel.textContent = `${unreadPartnerNotifications} não lidas`;
    if (trigger) trigger.setAttribute("aria-label", `Notificações não lidas: ${unreadPartnerNotifications}`);
    if (badge) {
      badge.textContent = String(unreadPartnerNotifications);
      badge.classList.toggle("hidden", unreadPartnerNotifications === 0);
    }
    if (!list) return;
    list.innerHTML = partnerNotifications.length
      ? partnerNotifications.map((notification) => {
          const date = notification.createdAt
            ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.createdAt))
            : "";
          return `<article class="owner-notification-item ${notification.lida ? "is-read" : "is-unread"}">
            <div><strong>${escapeHtml(notification.titulo)}</strong><small>${escapeHtml(date)}</small></div>
            <p>${escapeHtml(notification.mensagem)}</p>
            ${notification.lida ? "" : `<button class="btn btn-ghost" type="button" data-notification-read="${notification.id}">Marcar como lida</button>`}
          </article>`;
        }).join("")
      : '<p class="owner-notifications-empty">Nenhuma notificação recebida.</p>';
  }

  async function loadPartnerNotifications() {
    try {
      const res = await donoFetch("/api/dono/notificacoes");
      if (!res.ok) return;
      const data = await res.json();
      partnerNotifications = Array.isArray(data.notificacoes) ? data.notificacoes : [];
      unreadPartnerNotifications = Number(data.naoLidas) || 0;
      renderPartnerNotifications();
    } catch {}
  }

  function reportAttachments(report) {
    try {
      const files = JSON.parse(report.anexosResposta || "[]");
      return Array.isArray(files) ? files.filter((file) => typeof file === "string" && /^[a-f0-9-]+\.(png|jpg|pdf)$/i.test(file)) : [];
    } catch {
      return [];
    }
  }

  function renderPartnerReports() {
    const list = dashboardRoot?.querySelector("[data-partner-reports-list]");
    if (!list) return;
    partnerAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    partnerAttachmentObjectUrls = [];
    const statusLabels = {
      pendente: "Pendente",
      aberta: "Pendente",
      em_analise: "Em análise",
      aguardando_defesa: "Aguardando defesa",
      contestada: "Contestada",
      procedente: "Procedente",
      rejeitada: "Rejeitada",
    };
    list.innerHTML = partnerReports.length
      ? partnerReports.map((report) => {
          const status = String(report.status || "pendente").toLowerCase();
          const attachments = reportAttachments(report);
          const attachmentLinks = attachments.map((file) => `<a class="partner-report-attachment" href="#" data-attachment-url="/api/parceiro/denuncias/${report.id}/anexos/${encodeURIComponent(file)}" target="_blank" rel="noopener">Carregando ${escapeHtml(file)}</a>`).join("");
          const finalizado = ["procedente", "rejeitada"].includes(status);
          const podeResponder = !finalizado && status !== "contestada";
          const data = report.createdAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.createdAt)) : "";
          return `<article class="partner-report-item">
            <header><div><strong>${escapeHtml(report.loja?.nome || "Sua loja")}</strong><small>${escapeHtml(data)}</small></div><span class="partner-report-status">${escapeHtml(statusLabels[status] || status)}</span></header>
            <p><strong>Motivo:</strong> ${escapeHtml(report.motivo)}</p>
            <p><strong>Relato do cliente:</strong> ${escapeHtml(report.detalhes || "Sem detalhes adicionais.")}</p>
            <details><summary>Histórico e decisão</summary>
              ${report.respostaLoja ? `<p><strong>Sua defesa (${escapeHtml(report.dataResposta ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.dataResposta)) : "enviada")}):</strong> ${escapeHtml(report.respostaLoja)}</p>` : ""}
              ${attachmentLinks ? `<p class="partner-report-attachments"><strong>Anexos:</strong> ${attachmentLinks}</p>` : ""}
              ${report.parecerAdmin ? `<p><strong>Parecer da equipe:</strong> ${escapeHtml(report.parecerAdmin)}</p>` : "<p>A equipe ainda não registrou um parecer.</p>"}
            </details>
            ${podeResponder ? `<button class="btn btn-primary" type="button" data-partner-report-reply="${report.id}">Responder / contestar</button>` : ""}
          </article>`;
        }).join("")
      : '<p class="owner-notifications-empty">Nenhuma denúncia recebida pelas suas lojas.</p>';
    hydratePartnerAttachments(list);
  }

  async function hydratePartnerAttachments(container) {
    container?.querySelectorAll("[data-attachment-url]").forEach(async (link) => {
      try {
        const response = await donoFetch(link.dataset.attachmentUrl);
        if (!response.ok) throw new Error("Anexo indisponível");
        const objectUrl = URL.createObjectURL(await response.blob());
        partnerAttachmentObjectUrls.push(objectUrl);
        link.href = objectUrl;
        link.textContent = link.textContent.replace("Carregando ", "Abrir ");
      } catch {
        link.textContent = "Anexo indisponível";
        link.removeAttribute("href");
      }
    });
  }

  async function loadPartnerReports() {
    const list = dashboardRoot?.querySelector("[data-partner-reports-list]");
    if (list) list.innerHTML = '<p class="owner-notifications-empty">Carregando denúncias...</p>';
    try {
      const res = await donoFetch("/api/dono/denuncias");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar denúncias.");
      partnerReports = Array.isArray(data.denuncias) ? data.denuncias : [];
      renderPartnerReports();
    } catch (err) {
      if (list) list.innerHTML = `<p class="owner-notifications-empty">${escapeHtml(err.message || "Erro ao carregar denúncias.")}</p>`;
    }
  }

  function renderPartnerDashboard() {
    if (!dashboardRoot) return;

    if (!cachedShops.length) {
      selectedDashboardShopId = "";
      dashboardRoot.innerHTML = `
        <div class="owner-dashboard-empty">
          <h2>Dashboard do lava jato</h2>
          <p class="empty-copy">Cadastre seu lava jato para acompanhar agendamentos, faturamento, serviços e avaliações por aqui.</p>
          <button class="btn btn-primary" type="button" data-go-tab="estabelecimento">Cadastrar lava jato</button>
        </div>`;
      return;
    }

    if (!selectedDashboardShopId || !cachedShops.some((loja) => String(loja.id) === String(selectedDashboardShopId))) {
      selectedDashboardShopId = String(cachedShops[0].id);
    }

    const loja = cachedShops.find((item) => String(item.id) === String(selectedDashboardShopId)) || cachedShops[0];
    const dono = getDonoFromToken() || {};
    const lojaId = String(loja.id);
    const hoje = localDateKey();
    const ontem = shiftDateKey(hoje, -1);
    const lojaBookings = cachedBookings.filter((booking) => bookingBelongsToShop(booking, lojaId));
    const activeStatuses = new Set(["pendente", "confirmado"]);
    const todayBookings = lojaBookings.filter((booking) => booking.data === hoje && ! ["cancelado", "expirado"].includes(booking.status));
    const yesterdayBookings = lojaBookings.filter((booking) => booking.data === ontem && ! ["cancelado", "expirado"].includes(booking.status));
    const activeTodayBookings = todayBookings.filter((booking) => activeStatuses.has(booking.status || "pendente"));
    const finishedTodayBookings = todayBookings.filter((booking) => booking.status === "finalizado");
    const finishedYesterdayBookings = yesterdayBookings.filter((booking) => booking.status === "finalizado");
    const dailyTotal = bookingRevenue(finishedTodayBookings);
    const yesterdayTotal = bookingRevenue(finishedYesterdayBookings);
    const dailyRevenue = dailyTotal.centavos / 100;
    const yesterdayRevenue = yesterdayTotal.centavos / 100;
    const servicos = Array.isArray(loja.servicos) ? loja.servicos : [];
    const avaliacoes = Array.isArray(loja.avaliacoes) ? loja.avaliacoes : [];
    const ratingAverage = avaliacoes.length
      ? avaliacoes.reduce((sum, review) => sum + Number(review.nota || 0), 0) / avaliacoes.length
      : 0;
    const attendedClientsCount = new Set(
      finishedTodayBookings.map((booking) => {
        const raw = booking.usuarioId || booking.emailCliente || booking.nomeCliente || booking.id;
        return String(raw || "");
      }),
    ).size;
    const reviewsUrl = `avaliacoes.html?lojaId=${encodeURIComponent(loja.id)}&shop=${encodeURIComponent(loja.nome)}`;
    const scheduleTimes = parseScheduleTimes(loja.agendaHorarios || defaultBookingTimes);
    const scheduleDays = parseScheduleDays(loja.agendaDias || defaultScheduleDays);
    const todayDay = String(new Date(`${hoje}T12:00:00`).getDay());
    const isOpenToday = scheduleDays.includes(todayDay);
    const weekKeys = Array.from({ length: 6 }, (_, index) => shiftDateKey(hoje, index - 5));
    const weeklyCounts = weekKeys.map((dateKey) => lojaBookings.filter((booking) => booking.data === dateKey && ! ["cancelado", "expirado"].includes(booking.status)).length);
    const weeklyTotals = weekKeys.map((dateKey) => bookingRevenue(lojaBookings.filter((booking) => booking.data === dateKey)));
    const weeklyRevenue = weeklyTotals.map(total => total.centavos / 100);
    const weeklyMissing = weeklyTotals.reduce((sum, total) => sum + total.semValor, 0);
    const maxWeeklyCount = Math.max(1, ...weeklyCounts);
    const maxWeeklyRevenue = Math.max(1, ...weeklyRevenue);
    const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

    function toTrend(current, previous, singular, plural) {
      const base = Number(previous) || 0;
      const now = Number(current) || 0;
      const diff = now - base;
      if (!base) {
        if (!now) return { text: "Sem variação", className: "is-neutral" };
        return {
          text: `+${now} ${now === 1 ? singular : plural} vs ontem`,
          className: "is-up",
        };
      }
      const pct = Math.round((Math.abs(diff) / base) * 100);
      if (diff === 0) return { text: "Mesmo volume de ontem", className: "is-neutral" };
      return {
        text: `${diff > 0 ? "+" : "-"}${pct}% em relação a ontem`,
        className: diff > 0 ? "is-up" : "is-down",
      };
    }

    const bookingsTrend = toTrend(todayBookings.length, yesterdayBookings.length, "agendamento", "agendamentos");
    const revenueTrend = dailyTotal.semValor || yesterdayTotal.semValor
      ? { text: 'Comparação indisponível: há valores históricos não registrados.', className: 'is-neutral' }
      : toTrend(dailyRevenue, yesterdayRevenue, "real", "reais");

    const selectorHtml = cachedShops.length > 1
      ? `<select class="owner-dashboard-shop-select" data-dashboard-shop>${cachedShops
          .map((shop) => `<option value="${escapeHtml(String(shop.id))}" ${String(shop.id) === lojaId ? "selected" : ""}>${escapeHtml(shop.nome)}</option>`)
          .join("")}</select>`
      : `<span class="owner-dashboard-shop-pill">${escapeHtml(loja.nome)}</span>`;

    const servicesHtml = servicos.length
      ? servicos
          .map((service) => `
            <li class="owner-service-row">
              <div class="owner-service-row-main">
                <strong>${escapeHtml(service.nome || "Serviço")}</strong>
                <span>${formatMoney(service.preco)} - ${escapeHtml(service.duracao || "duração não informada")}</span>
              </div>
              <div class="owner-service-row-actions">
                <button class="btn btn-ghost" type="button" data-go-tab="estabelecimento">Editar</button>
                <button class="btn btn-ghost" type="button" data-go-tab="estabelecimento">Excluir</button>
              </div>
            </li>`)
          .join("")
      : '<li class="owner-service-empty">Nenhum serviço cadastrado ainda. Clique em "Gerenciar serviços" para começar.</li>';

    const slotHtml = isOpenToday && scheduleTimes.length
      ? scheduleTimes
          .map((hora) => {
            const point = Date.parse(`${hoje}T${hora}:00Z`);
            const active = lojaBookings.filter(booking => {
              if (!activeStatuses.has(booking.status)) return false;
              const minutes = booking.duracaoMinutos ?? booking.duracaoAgendaMinutos;
              if (!minutes) return booking.data === hoje;
              const start = Date.parse(`${booking.data}T${booking.hora}:00Z`);
              return start <= point && point < start + minutes * 60000;
            });
            const blocked = (loja.agendaBloqueios || []).some(b => b.data === hoje && (!b.inicio || (b.inicio <= hora && hora < b.fim)));
            const capacity = loja.capacidadeSimultanea ?? 1;
            const pendingDuration = active.some(booking => !booking.duracaoMinutos && !booking.duracaoAgendaMinutos);
            const label = pendingDuration ? 'Duração pendente: novas reservas suspensas' : blocked ? 'Bloqueado para novas reservas' : `${active.length}/${capacity} vagas ocupadas`;
            const className = pendingDuration || blocked || active.length >= capacity ? 'is-busy' : 'is-free';
            const detail = active.length ? active.map(booking => `${escapeHtml(booking.nomeCliente || booking.usuario?.nome || 'Cliente')} - ${escapeHtml(bookingServiceName(booking))}`).join('; ') : 'Sem atendimento neste instante';
            return `
              <li class="owner-timeline-item ${className}">
                <span class="owner-timeline-hour">${escapeHtml(hora)}</span>
                <div class="owner-timeline-content">
                  <strong>${label}</strong>
                  <p>${detail}</p>
                </div>
              </li>`;
          })
          .join("")
      : '<li class="owner-timeline-empty">A loja não atende hoje. Ajuste os horários na aba Cadastrar / Editar.</li>';

    const reviewsHtml = avaliacoes.length
      ? avaliacoes.slice(0, 3).map((review) => {
          const author = review.usuario?.nome || review.nomeCliente || "Cliente";
          const dateText = review.createdAt
            ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(review.createdAt))
            : "Data indisponível";
          return `
            <article class="owner-review-card">
              <div class="owner-review-head">
                <strong>${escapeHtml(author)}</strong>
                <span class="owner-review-rating">&#9733; ${Number(review.nota || 0).toFixed(1).replace(".", ",")}</span>
              </div>
              <p>${escapeHtml(review.comentario || "Sem comentário escrito.")}</p>
              <small>${escapeHtml(dateText)}</small>
            </article>`;
        }).join("")
      : '<p class="empty-copy">Ainda não há avaliações recebidas.</p>';

    const barsHtml = weekKeys.map((dateKey, index) => {
      const count = weeklyCounts[index];
      const height = count ? Math.max(18, Math.round((count / maxWeeklyCount) * 118)) : 12;
      const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
      return `
        <div class="owner-performance-bar" style="--bar-h:${height}px" aria-label="${weekLabels[dayIndex]}: ${count} agendamentos">
          <span>${count}</span>
          <em>${weekLabels[dayIndex]}</em>
        </div>`;
    }).join("");

    const revenueBarsHtml = weekKeys.map((dateKey, index) => {
      const value = weeklyRevenue[index];
      const total = weeklyTotals[index];
      const height = value ? Math.max(18, Math.round((value / maxWeeklyRevenue) * 118)) : 12;
      const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
      return `
        <div class="owner-performance-bar is-revenue" style="--bar-h:${height}px" aria-label="${weekLabels[dayIndex]}: ${escapeHtml(bookingRevenueLabel(total))}; ${total.semValor} sem valor histórico">
          <span>${total.semValor && !total.comValor ? "--" : formatMoney(value).replace("R$", "").trim()}${total.semValor ? "*" : ""}</span>
          <em>${weekLabels[dayIndex]}</em>
        </div>`;
    }).join("");

    dashboardRoot.innerHTML = `
      <div class="owner-dashboard-layout ${ownerSidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        <aside class="owner-dashboard-sidebar">
          <div class="owner-dashboard-brand">
            <span></span>
            <strong>AutoShine</strong>
            <button class="owner-sidebar-toggle" type="button" data-dashboard-toggle-sidebar aria-label="Recolher menu" aria-expanded="${ownerSidebarCollapsed ? "false" : "true"}">|||</button>
          </div>
          <nav aria-label="Atalhos do dashboard">
            <button class="owner-dashboard-nav active" type="button" data-go-tab="dashboard"><span class="owner-nav-icon">DS</span><span>Visão geral</span></button>
            <button class="owner-dashboard-nav" type="button" data-go-tab="agendamentos"><span class="owner-nav-icon">AG</span><span>Agendamentos</span></button>
            <button class="owner-dashboard-nav" type="button" data-go-tab="estabelecimento"><span class="owner-nav-icon">SV</span><span>Serviços</span></button>
            <a class="owner-dashboard-nav" href="${reviewsUrl}"><span class="owner-nav-icon">AV</span><span>Avaliações</span></a>
            <button class="owner-dashboard-nav" type="button" data-open-partner-reports><span class="owner-nav-icon">DE</span><span>Denúncias</span></button>
            <button class="owner-dashboard-nav" type="button" data-dashboard-edit-shop="${escapeHtml(lojaId)}"><span class="owner-nav-icon">ED</span><span>Editar lava-jato</span></button>
          </nav>
        </aside>

        <section class="owner-dashboard-main">
          <header class="owner-dashboard-topbar">
            <div class="owner-topbar-branding">
              <p class="owner-topbar-label">Painel do parceiro</p>
              <h2>${escapeHtml(loja.nome)}</h2>
              <span>${escapeHtml(loja.endereco || "Endereço não informado")}</span>
            </div>
            <div class="owner-topbar-actions">
              <div class="owner-notifications">
                <button class="owner-notifications-trigger" type="button" data-toggle-notifications aria-label="Notificações não lidas: ${unreadPartnerNotifications}" aria-expanded="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
                  <span class="owner-notifications-count ${unreadPartnerNotifications ? "" : "hidden"}" data-notification-count>${unreadPartnerNotifications}</span>
                </button>
                <section class="owner-notifications-popover hidden" data-notifications-panel aria-label="Notificações recentes">
                  <header><strong>Notificações</strong><span data-notification-unread-label>${unreadPartnerNotifications} não lidas</span></header>
                  <div data-notifications-list></div>
                </section>
              </div>
              <span class="owner-plan-badge">Plano Premium</span>
              ${selectorHtml}
              <button class="btn btn-ghost" type="button" data-go-tab="agendamentos">Ações rápidas</button>
              <span class="owner-profile-chip">${escapeHtml(dono.nome || "Parceiro")}</span>
            </div>
          </header>

          <div class="owner-dashboard-metrics">
            <article class="owner-metric-card">
              <span class="owner-metric-icon" aria-hidden="true">AG</span>
              <p>Agendamentos hoje</p>
              <strong>${todayBookings.length}</strong>
              <small class="${bookingsTrend.className}">${bookingsTrend.text}</small>
            </article>
            <article class="owner-metric-card">
              <span class="owner-metric-icon" aria-hidden="true">FT</span>
              <p>Valor finalizado hoje</p>
              <strong>${escapeHtml(bookingRevenueLabel(dailyTotal))}</strong>
              ${dailyTotal.semValor ? `<small>${dailyTotal.semValor} atendimento(s) sem valor histórico, excluído(s) da soma.</small>` : ''}
              <small class="${revenueTrend.className}">${revenueTrend.text}</small>
            </article>
            <article class="owner-metric-card">
              <span class="owner-metric-icon" aria-hidden="true">AV</span>
              <p>Avaliação média</p>
              <strong>${avaliacoes.length ? ratingAverage.toFixed(1).replace(".", ",") : "--"}</strong>
              <small>${avaliacoes.length} avaliação${avaliacoes.length === 1 ? "" : "es"}</small>
            </article>
            <article class="owner-metric-card">
              <span class="owner-metric-icon" aria-hidden="true">CL</span>
              <p>Clientes atendidos</p>
              <strong>${attendedClientsCount}</strong>
              <small>Somente serviços finalizados hoje</small>
            </article>
          </div>

          <article class="owner-dashboard-card owner-dashboard-priority">
            <div class="owner-card-head">
              <h3>Ocupação da agenda do dia</h3>
              <button class="btn btn-ghost" type="button" data-go-tab="agendamentos">Ver todos os agendamentos</button>
            </div>
            <p class="empty-copy">Ocupação em cada horário, no fuso de Brasília. Para reservar, a vaga precisa estar disponível por toda a duração do serviço.</p><ul class="owner-timeline-grid">${slotHtml}</ul>
          </article>

          <div class="owner-dashboard-grid">
            <article class="owner-dashboard-card owner-dashboard-card-services">
              <div class="owner-card-head">
                <h3>Serviços cadastrados</h3>
                <button class="btn btn-primary" type="button" data-go-tab="estabelecimento">Gerenciar serviços</button>
              </div>
              <ul class="owner-service-summary">${servicesHtml}</ul>
            </article>

            <article class="owner-dashboard-card">
              <h3>Avaliações recentes</h3>
              <p class="owner-rating-line"><span class="stars">&#9733; ${avaliacoes.length ? ratingAverage.toFixed(1).replace(".", ",") : "--"}</span> ${avaliacoes.length} avaliação${avaliacoes.length === 1 ? "" : "es"}</p>
              <div class="owner-review-list">${reviewsHtml}</div>
            </article>
          </div>

          <div class="owner-dashboard-grid owner-dashboard-grid-charts">
            <article class="owner-dashboard-card">
              <h3>Desempenho semanal</h3>
              <div class="owner-performance-chart">${barsHtml}</div>
            </article>

            <article class="owner-dashboard-card">
              <h3>Valor finalizado nos últimos 6 dias</h3>
              <p class="empty-copy">Valores reservados dos serviços finalizados, pela data agendada. Não representam pagamentos confirmados.</p>
              ${weeklyMissing ? `<p class="empty-copy">* ${weeklyMissing} atendimento(s) sem valor histórico não entram na soma. Os dias marcados têm valores incompletos.</p>` : ''}
              <div class="owner-performance-chart">${revenueBarsHtml}</div>
            </article>
          </div>
        </section>
      </div>
      <dialog class="partner-reports-dialog" data-partner-reports-dialog>
        <header class="partner-reports-dialog-head"><div><p class="owner-topbar-label">Central de atendimento</p><h2>Denúncias recebidas</h2></div><button class="owner-sidebar-toggle" type="button" data-close-partner-reports aria-label="Fechar denúncias">Fechar</button></header>
        <div data-partner-reports-list></div>
        <form class="partner-defense-form hidden" data-partner-defense-form enctype="multipart/form-data">
          <input type="hidden" name="denunciaId" />
          <div class="partner-defense-context" data-partner-defense-context></div>
          <div class="field"><label for="partner-defense-text">Sua justificativa</label><textarea id="partner-defense-text" name="respostaLoja" rows="6" minlength="20" maxlength="5000" required placeholder="Explique sua versão e os esclarecimentos relevantes. Mínimo de 20 caracteres."></textarea></div>
          <div class="field"><label for="partner-defense-files">Comprovantes (PNG, JPG ou PDF, até 4 arquivos de 5 MB)</label><input id="partner-defense-files" type="file" name="anexos" accept="image/png,image/jpeg,application/pdf" multiple /></div>
          <p class="partner-defense-feedback" data-partner-defense-feedback role="status"></p>
          <div class="partner-defense-actions"><button class="btn btn-ghost" type="button" data-defense-back>Voltar</button><button class="btn btn-primary" type="submit">Enviar defesa</button></div>
        </form>
      </dialog>`;
    renderPartnerNotifications();
  }

  function createServiceRow(initialData = null) {
    const fragment = serviceTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".partner-service-item");
    const removeButton = fragment.querySelector(".remove-partner-service");
    const nameInput = fragment.querySelector('[data-service-field="name"]');
    const priceInput = fragment.querySelector('[data-service-field="price"]');
    const durationInput = fragment.querySelector('[data-service-field="duration"]');
    const descriptionInput = fragment.querySelector('[data-service-field="description"]');
    const includedInput = fragment.querySelector('[data-service-field="included"]');
    const stepsInput = fragment.querySelector('[data-service-field="steps"]');
    const productsInput = fragment.querySelector('[data-service-field="products"]');
    const guidanceInput = fragment.querySelector('[data-service-field="guidance"]');
    const warrantyInput = fragment.querySelector('[data-service-field="warranty"]');

    if (initialData) {
      nameInput.value = initialData.nome || initialData.name || "";
      priceInput.value = initialData.preco ?? initialData.price ?? "";
      durationInput.value = initialData.duracao || initialData.duration || "";
      descriptionInput.value = initialData.descricao || initialData.description || "";
      if (includedInput) includedInput.value = initialData.inclusos || "";
      if (stepsInput) stepsInput.value = initialData.etapas || "";
      if (productsInput) productsInput.value = initialData.produtos || "";
      if (guidanceInput) guidanceInput.value = initialData.orientacoes || "";
      if (warrantyInput) warrantyInput.value = initialData.garantia || "";
    }

    removeButton.addEventListener("click", () => {
      if (servicesList.querySelectorAll(".partner-service-item").length <= 1) {
        notify("Você precisa manter pelo menos um serviço.", "warning");
        return;
      }
      item.remove();
    });

    servicesList.appendChild(fragment);
  }

  function clearServicesRows() {
    servicesList.innerHTML = "";
    createServiceRow();
  }

  function readServicesFromForm() {
    return Array.from(servicesList.querySelectorAll(".partner-service-item"))
      .map((row) => ({
        nome: row.querySelector('[data-service-field="name"]').value.trim(),
        preco: Number(String(row.querySelector('[data-service-field="price"]').value || "").replace(",", ".")),
        duracao: row.querySelector('[data-service-field="duration"]').value.trim(),
        descricao: row.querySelector('[data-service-field="description"]').value.trim(),
        inclusos: row.querySelector('[data-service-field="included"]')?.value.trim() || "",
        etapas: row.querySelector('[data-service-field="steps"]')?.value.trim() || "",
        produtos: row.querySelector('[data-service-field="products"]')?.value.trim() || "",
        orientacoes: row.querySelector('[data-service-field="guidance"]')?.value.trim() || "",
        garantia: row.querySelector('[data-service-field="warranty"]')?.value.trim() || "",
      }))
      .filter((s) => s.nome && s.descricao && s.duracao && Number.isFinite(s.preco));
  }

  function setScheduleDays(daysValue) {
    const days = parseScheduleDays(daysValue || defaultScheduleDays);
    form.querySelectorAll('input[name="agendaDias"]').forEach((input) => {
      input.checked = days.includes(input.value);
    });
  }

  function readScheduleDaysFromForm() {
    return Array.from(form.querySelectorAll('input[name="agendaDias"]:checked')).map((input) => input.value);
  }

  function setPartnerFeedback(element, message = "", state = "") {
    if (!element) return;
    element.textContent = message;
    element.className = `empty-copy validation-msg${state ? ` is-${state}` : ""}`;
  }

  function resetScheduleFields() {
    setScheduleDays(defaultScheduleDays);
    scheduleTimesInput.value = defaultBookingTimes.join(", ");
    form.elements.capacidadeSimultanea.value = '1';
    form.elements.agendaFechamento.value = '18:00';
    form.elements.agendaBloqueios.value = '';
    setPartnerFeedback(scheduleFeedback, "");
  }

  function resetPartnerForm() {
    form.reset();
    clearServicesRows();
    resetScheduleFields();
    if (photoFileInput) photoFileInput.value = "";
    if (coverFileInput) coverFileInput.value = "";
    if (paymentsInput) paymentsInput.value = "Pix, Cartão, Dinheiro";
    if (cancellationPolicyInput) cancellationPolicyInput.value = "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.";
    if (galleryInput) galleryInput.value = "";
    setPartnerFeedback(photoFeedback, "");
    setPartnerFeedback(coverFeedback, "");
    setPartnerFeedback(geocodeFeedback, "");
    submitButton.textContent = "Publicar lava jato";
    form.dataset.editingShopId = "";
    shopEditorOpen = false;
    setPartnerFormMode(false);
    if (cancelEditButton) cancelEditButton.classList.add("hidden");
    // Resetar zona de foto e wizard
    const photoPreview = document.getElementById("partner-photo-preview");
    const photoPlaceholder = document.getElementById("partner-photo-placeholder");
    const photoZone = document.getElementById("partner-photo-zone");
    const mainAdjustBtn = document.getElementById("partner-photo-adjust-main");
    if (photoPreview) { photoPreview.src = ""; photoPreview.classList.add("hidden"); }
    if (photoPlaceholder) photoPlaceholder.classList.remove("hidden");
    if (photoZone) photoZone.classList.remove("has-preview");
    if (mainAdjustBtn) mainAdjustBtn.classList.add("hidden");
    extraPhotoSlots = [{ file: null, existingUrl: "" }, { file: null, existingUrl: "" }, { file: null, existingUrl: "" }];
    [1, 2, 3].forEach((i) => {
      const ez = document.getElementById(`partner-extra-zone-${i}`);
      if (!ez) return;
      const ep = ez.querySelector(".photo-upload-preview");
      const epl = ez.querySelector(".photo-upload-placeholder");
      const eab = ez.querySelector(".photo-adjust-btn");
      const ei = ez.querySelector("input[type='file']");
      if (ep) { ep.src = ""; ep.classList.add("hidden"); }
      if (epl) epl.classList.remove("hidden");
      if (eab) eab.classList.add("hidden");
      if (ei) ei.value = "";
      ez.classList.remove("has-preview");
    });
    syncTimeTags?.();
    wizardGoToStep?.(1);
  }

  function loadShopToForm(loja) {
    // Voltar ao mesmo editor preserva o rascunho ao alternar as abas.
    if (shopEditorOpen && form.dataset.editingShopId === String(loja.id)) {
      switchTab("estabelecimento");
      formTitle?.focus({ preventScroll: true });
      return;
    }
    resetPartnerForm();
    form.dataset.editingShopId = String(loja.id);
    document.getElementById("partner-shop-name").value = loja.nome || "";
    document.getElementById("partner-summary").value = loja.descricao || "";
    document.getElementById("partner-address").value = loja.endereco || "";
    document.getElementById("partner-photo").value = loja.fotoUrl || "";
    document.getElementById("partner-cover").value = loja.capaUrl || "";
    if (paymentsInput) paymentsInput.value = loja.formasPagamento || "";
    if (cancellationPolicyInput) cancellationPolicyInput.value = loja.politicaCancelamento || "";
    if (galleryInput) galleryInput.value = parseTextList(loja.fotosAdicionais).join("\n");
    if (photoFileInput) photoFileInput.value = "";
    if (coverFileInput) coverFileInput.value = "";
    setPartnerFeedback(photoFeedback, "");
    setPartnerFeedback(coverFeedback, "");
    setPartnerFeedback(geocodeFeedback, "");
    latitudeInput.value = Number.isFinite(Number(loja.latitude)) ? loja.latitude : "";
    longitudeInput.value = Number.isFinite(Number(loja.longitude)) ? loja.longitude : "";
    setScheduleDays(loja.agendaDias || defaultScheduleDays);
    scheduleTimesInput.value = parseScheduleTimes(loja.agendaHorarios || defaultBookingTimes).join(", ");
    form.elements.capacidadeSimultanea.value = loja.capacidadeSimultanea ?? 1;
    form.elements.agendaFechamento.value = loja.agendaFechamento || '18:00';
    form.elements.agendaBloqueios.value = (loja.agendaBloqueios || []).map(b => b.data + (b.inicio ? ` ${b.inicio}-${b.fim}` : '')).join('\n');

    servicesList.innerHTML = "";
    if (Array.isArray(loja.servicos) && loja.servicos.length) {
      loja.servicos.forEach((s) => createServiceRow(s));
    } else {
      createServiceRow();
    }

    submitButton.textContent = "Salvar alterações";
    // Mostrar foto existente no preview
    const photoPreview = document.getElementById("partner-photo-preview");
    const photoPlaceholder = document.getElementById("partner-photo-placeholder");
    const photoZone = document.getElementById("partner-photo-zone");
    const mainAdjustBtn2 = document.getElementById("partner-photo-adjust-main");
    if (loja.fotoUrl && photoPreview) {
      photoPreview.src = loja.fotoUrl;
      photoPreview.classList.remove("hidden");
      if (photoPlaceholder) photoPlaceholder.classList.add("hidden");
      if (photoZone) photoZone.classList.add("has-preview");
      if (mainAdjustBtn2) mainAdjustBtn2.classList.add("hidden");
    }
    // Carregar fotos extras existentes nos slots
    const existingExtraUrls = parseTextList(loja.fotosAdicionais).slice(0, 3);
    extraPhotoSlots = [0, 1, 2].map((i) => ({ file: null, existingUrl: existingExtraUrls[i] || "" }));
    [1, 2, 3].forEach((i) => {
      const ez = document.getElementById(`partner-extra-zone-${i}`);
      if (!ez) return;
      const ep = ez.querySelector(".photo-upload-preview");
      const epl = ez.querySelector(".photo-upload-placeholder");
      const eab = ez.querySelector(".photo-adjust-btn");
      const url = existingExtraUrls[i - 1] || "";
      if (url && ep) {
        ep.src = url;
        ep.classList.remove("hidden");
        if (epl) epl.classList.add("hidden");
        if (eab) eab.classList.add("hidden");
        ez.classList.add("has-preview");
      } else {
        if (ep) { ep.src = ""; ep.classList.add("hidden"); }
        if (epl) epl.classList.remove("hidden");
        if (eab) eab.classList.add("hidden");
        ez.classList.remove("has-preview");
      }
    });
    syncTimeTags?.();
    shopEditorOpen = true;
    setPartnerFormMode(true);
    switchTab("estabelecimento");
    wizardGoToStep?.(1);
    formTitle?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function renderOwnedShops() {
    try {
      const res = await donoFetch("/api/lojas/minhas");
      if (!res.ok) {
        ownedList.innerHTML = '<p class="empty-copy">Erro ao carregar lojas.</p>';
        return;
      }
      const { lojas } = await res.json();
      cachedShops = Array.isArray(lojas) ? lojas : [];
      shopsLoaded = true;
      syncShopView();
      if (!selectedDashboardShopId || !cachedShops.some((loja) => String(loja.id) === String(selectedDashboardShopId))) {
        selectedDashboardShopId = cachedShops[0] ? String(cachedShops[0].id) : "";
      }
      await loadPartnerNotifications();
      renderPartnerDashboard();

      if (!cachedShops.length) {
        ownedList.innerHTML = `
          <div class="partner-empty-state">
            <p class="empty-copy">Você ainda não publicou nenhum lava jato.</p>
            <button type="button" class="btn btn-primary" data-go-tab="estabelecimento">Cadastrar lava-jato</button>
          </div>`;
        return;
      }

      ownedList.innerHTML = cachedShops
        .map((loja) => {
          const safeId = escapeHtml(String(loja.id));
          const safeName = escapeHtml(loja.nome);
          const safeCategory = escapeHtml(loja.categoria || "serviços gerais");
          const safeAddress = escapeHtml(loja.endereco || "");
          const safeSchedule = escapeHtml(formatScheduleSummary(loja.agendaDias, loja.agendaHorarios));
          const approvalLabel = loja.bloqueado
            ? "Bloqueado pelo administrador"
            : loja.statusAprovacao === "pendente"
              ? "Aguardando aprovação"
              : "Publicado no marketplace";
          const approvalClass = loja.statusAprovacao === "pendente" || loja.bloqueado
            ? "owned-shop-approval-pending"
            : "owned-shop-approval-active";
          const servicos = Array.isArray(loja.servicos) ? loja.servicos : [];

          const servicesHtml = servicos.length
            ? servicos
                .map(
                  (s) => `
                <div class="owned-service-item">
                  <div class="owned-service-info">
                    <strong>${escapeHtml(s.nome)}</strong>
                    <span class="owned-service-meta">R$ ${Number(s.preco || 0).toFixed(2).replace(".", ",")} &bull; ${escapeHtml(s.duracao)}</span>
                    <span class="owned-service-desc">${escapeHtml(s.descricao)}</span>
                  </div>
                  <div class="owned-shop-actions">
                    <button class="btn btn-secondary" type="button"
                      data-edit-owner-service="${safeId}"
                      data-service-id="${s.id}">Editar</button>
                    <button class="btn btn-ghost" type="button"
                      data-remove-owner-service="${safeId}"
                      data-service-id="${s.id}">Excluir</button>
                  </div>
                </div>`,
                )
                .join("")
            : '<p class="empty-copy" style="padding:8px 0">Nenhum serviço cadastrado ainda.</p>';

          return `
          <article class="owned-shop-card">
            <div class="owned-shop-header">
              <div class="owned-shop-info">
                <h3>${safeName}</h3>
                <div class="owned-shop-meta-row">
                  <span class="owned-shop-badge">${safeCategory}</span>
                  <span class="owned-shop-approval ${approvalClass}">${approvalLabel}</span>
                  <span class="owned-shop-meta">${safeAddress}</span>
                </div>
                <span class="owned-shop-meta">Agenda: ${safeSchedule}</span>
              </div>
              <div class="owned-shop-actions">
                <button class="btn btn-secondary" type="button" data-edit-owner-shop="${safeId}">Editar dados</button>
                <button class="btn btn-ghost" type="button" data-remove-owner-shop="${safeId}">Excluir lava jato</button>
              </div>
            </div>

            <div class="owned-services-section">
              <div class="section-head" style="margin-bottom:10px">
                <h4>Serviços (${servicos.length})</h4>
                <button class="btn btn-primary" type="button" data-add-owner-service="${safeId}">Adicionar serviço</button>
              </div>
              <div class="owned-service-list">${servicesHtml}</div>

              <div class="partner-inline-service-editor hidden" data-service-editor="${safeId}">
                <h4 data-inline-editor-title>Adicionar serviço</h4>
                <div class="field-grid">
                  <div class="field">
                    <label>Nome do serviço <span class="field-hint">— pode criar combos, ex: Lavagem + Cera</span></label>
                    <input type="text" data-inline-service-field="name" placeholder="Ex: Lavagem completa ou Lavagem + Cera protetora" />
                  </div>
                  <div class="field">
                    <label>Preço (R$)</label>
                    <input type="number" data-inline-service-field="price" min="0" step="0.01" placeholder="Ex: 89" />
                  </div>
                </div>
                <div class="field-grid">
                  <div class="field">
                    <label>Duração</label>
                    <input type="text" data-inline-service-field="duration" placeholder="Ex: 1h" />
                  </div>
                  <div class="field">
                    <label>Descrição</label>
                    <input type="text" data-inline-service-field="description" placeholder="Resumo rápido do serviço" />
                  </div>
                </div>
                <div class="field-grid service-detail-fields">
                  <div class="field">
                    <label>O que está incluído <span class="field-hint">— um item por linha</span></label>
                    <textarea data-inline-service-field="included" rows="4" placeholder="Aspiração interna&#10;Limpeza dos vidros"></textarea>
                  </div>
                  <div class="field">
                    <label>Etapas <span class="field-hint">— uma etapa por linha</span></label>
                    <textarea data-inline-service-field="steps" rows="4" placeholder="Inspeção inicial&#10;Execução do serviço&#10;Conferência final"></textarea>
                  </div>
                </div>
                <div class="field-grid service-detail-fields">
                  <div class="field">
                    <label>Produtos e equipamentos</label>
                    <textarea data-inline-service-field="products" rows="3" placeholder="Produtos profissionais utilizados"></textarea>
                  </div>
                  <div class="field">
                    <label>Garantia</label>
                    <textarea data-inline-service-field="warranty" rows="3" placeholder="Política de garantia deste serviço"></textarea>
                  </div>
                </div>
                <div class="field service-detail-fields">
                  <label>Orientações ao cliente</label>
                  <textarea data-inline-service-field="guidance" rows="3" placeholder="Cuidados antes ou depois do atendimento"></textarea>
                </div>
                <p class="empty-copy partner-inline-service-feedback" data-inline-service-feedback></p>
                <div class="owned-shop-actions">
                  <button class="btn btn-primary" type="button" data-save-owner-service="${safeId}">Salvar serviço</button>
                  <button class="btn btn-ghost" type="button" data-cancel-owner-service-editor="${safeId}">Cancelar</button>
                </div>
              </div>
            </div>
          </article>`;
        })
        .join("");
    } catch {
      ownedList.innerHTML = '<p class="empty-copy">Erro ao carregar lojas.</p>';
      renderPartnerDashboard();
    }
  }

  let partnerBookingController = null;
  async function renderReceivedBookings() {
    if (!bookingsList) return;
    if (!partnerBookingController) {
      partnerBookingController = createBookingListController(bookingsList, 'parceiro', (items) => {
        cachedBookings = items;
        renderPartnerDashboard();
        const unread = items.reduce((sum,ag)=>sum+bookingUnread(ag,'parceiro').length,0);
        const tab = managementShell.querySelector('[data-partner-tab="agendamentos"]');
        if (tab) tab.textContent = unread ? `Agendamentos (${unread} novas alterações)` : 'Agendamentos';
      });
    }
    await partnerBookingController.load();
  }

  if (dashboardRoot) {
    dashboardRoot.addEventListener("change", (event) => {
      const select = event.target.closest("[data-dashboard-shop]");
      if (!select) return;
      selectedDashboardShopId = select.value;
      renderPartnerDashboard();
    });

    dashboardRoot.addEventListener("click", (event) => {
      const reportsButton = event.target.closest("[data-open-partner-reports]");
      if (reportsButton) {
        const dialog = dashboardRoot.querySelector("[data-partner-reports-dialog]");
        const form = dashboardRoot.querySelector("[data-partner-defense-form]");
        const list = dashboardRoot.querySelector("[data-partner-reports-list]");
        form?.classList.add("hidden");
        list?.classList.remove("hidden");
        dialog?.showModal();
        loadPartnerReports();
        return;
      }

      const closeReportsButton = event.target.closest("[data-close-partner-reports]");
      if (closeReportsButton) {
        dashboardRoot.querySelector("[data-partner-reports-dialog]")?.close();
        return;
      }

      const replyButton = event.target.closest("[data-partner-report-reply]");
      if (replyButton) {
        const report = partnerReports.find((item) => String(item.id) === replyButton.dataset.partnerReportReply);
        if (!report) return;
        const form = dashboardRoot.querySelector("[data-partner-defense-form]");
        const list = dashboardRoot.querySelector("[data-partner-reports-list]");
        const context = dashboardRoot.querySelector("[data-partner-defense-context]");
        form.elements.denunciaId.value = String(report.id);
        const previousAttachments = reportAttachments(report).map((filename) => `<a href="#" data-attachment-url="/api/parceiro/denuncias/${report.id}/anexos/${encodeURIComponent(filename)}" target="_blank" rel="noopener">Carregando ${escapeHtml(filename)}</a>`).join("");
        context.innerHTML = `<h3>${escapeHtml(report.loja?.nome || "Sua loja")} · ${escapeHtml(report.motivo)}</h3><p><strong>Relato do cliente:</strong> ${escapeHtml(report.detalhes || "Sem detalhes adicionais.")}</p>${report.respostaLoja ? `<p><strong>Resposta anterior:</strong> ${escapeHtml(report.respostaLoja)}</p>` : ""}${previousAttachments ? `<p><strong>Anexos anteriores:</strong> ${previousAttachments}</p>` : ""}${report.parecerAdmin ? `<p><strong>Parecer anterior:</strong> ${escapeHtml(report.parecerAdmin)}</p>` : ""}`;
        hydratePartnerAttachments(context);
        list?.classList.add("hidden");
        form?.classList.remove("hidden");
        return;
      }

      if (event.target.closest("[data-defense-back]")) {
        dashboardRoot.querySelector("[data-partner-defense-form]")?.classList.add("hidden");
        dashboardRoot.querySelector("[data-partner-reports-list]")?.classList.remove("hidden");
        return;
      }

      const notificationButton = event.target.closest("[data-toggle-notifications]");
      if (notificationButton) {
        const panel = dashboardRoot.querySelector("[data-notifications-panel]");
        const isOpening = panel?.classList.contains("hidden");
        panel?.classList.toggle("hidden", !isOpening);
        notificationButton.setAttribute("aria-expanded", String(Boolean(isOpening)));
        if (isOpening) loadPartnerNotifications();
        return;
      }

      const markReadButton = event.target.closest("[data-notification-read]");
      if (markReadButton) {
        const notificationId = markReadButton.dataset.notificationRead;
        donoFetch(`/api/dono/notificacoes/${notificationId}/lida`, { method: "PATCH" })
          .then((res) => {
            if (!res.ok) throw new Error("Não foi possível atualizar a notificação.");
            return loadPartnerNotifications();
          })
          .catch(() => notify("Não foi possível marcar a notificação como lida."));
        return;
      }

      const toggleSidebarBtn = event.target.closest("[data-dashboard-toggle-sidebar]");
      if (toggleSidebarBtn) {
        ownerSidebarCollapsed = !ownerSidebarCollapsed;
        localStorage.setItem("autoshine:owner-sidebar-collapsed", ownerSidebarCollapsed ? "1" : "0");
        renderPartnerDashboard();
        return;
      }

      const editBtn = event.target.closest("[data-dashboard-edit-shop]");
      if (!editBtn) return;
      const loja = cachedShops.find((shop) => String(shop.id) === String(editBtn.dataset.dashboardEditShop));
      if (loja) loadShopToForm(loja);
    });

    dashboardRoot.addEventListener("submit", async (event) => {
      const defenseForm = event.target.closest("[data-partner-defense-form]");
      if (!defenseForm) return;
      event.preventDefault();
      const feedback = defenseForm.querySelector("[data-partner-defense-feedback]");
      const submit = defenseForm.querySelector('button[type="submit"]');
      const responseText = defenseForm.elements.respostaLoja.value.trim();
      const files = Array.from(defenseForm.elements.anexos.files || []);
      if (responseText.length < 20) {
        feedback.textContent = "Escreva uma justificativa com pelo menos 20 caracteres.";
        feedback.className = "partner-defense-feedback is-error";
        defenseForm.elements.respostaLoja.focus();
        return;
      }
      if (files.length > 4 || files.some((file) => file.size > 5 * 1024 * 1024)) {
        feedback.textContent = "Anexe no máximo 4 arquivos de até 5 MB cada.";
        feedback.className = "partner-defense-feedback is-error";
        return;
      }

      feedback.textContent = "Enviando defesa...";
      feedback.className = "partner-defense-feedback";
      if (submit) submit.disabled = true;
      try {
        const token = getDonoToken();
        const formData = new FormData(defenseForm);
        const denunciaId = defenseForm.elements.denunciaId.value;
        const response = await fetch(`/api/parceiro/denuncias/${encodeURIComponent(denunciaId)}/responder`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível enviar a defesa.");
        notify(data.message || "Defesa enviada para análise.");
        defenseForm.reset();
        defenseForm.classList.add("hidden");
        dashboardRoot.querySelector("[data-partner-reports-list]")?.classList.remove("hidden");
        await Promise.all([loadPartnerReports(), loadPartnerNotifications()]);
      } catch (err) {
        feedback.textContent = err.message || "Erro ao enviar a defesa.";
        feedback.className = "partner-defense-feedback is-error";
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  // Botão adicionar serviço no form principal
  addServiceButton.addEventListener("click", () => createServiceRow());

  // Chips de serviço rápido
  document.querySelectorAll("[data-quick-service]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const [name = "", rawPrice = "0", duration = "", description = ""] =
        chip.dataset.quickService.split("|");
      createServiceRow({
        nome: name,
        preco: Number(rawPrice) || 0,
        duracao: duration,
        descricao: description,
      });
    });
  });

  // Usar localização atual
  geocodeAddressButton.addEventListener("click", async () => {
    const endereco = addressInput.value.trim();
    if (endereco.length < 6) {
      setPartnerFeedback(geocodeFeedback, "Informe um endereço mais completo.", "warning");
      return;
    }

    geocodeAddressButton.disabled = true;
    setPartnerFeedback(geocodeFeedback, "Buscando coordenadas...", "warning");
    try {
      const res = await fetch(`/api/geocode?endereco=${encodeURIComponent(endereco)}`);
      const data = await res.json();
      if (!res.ok || !data.melhor) {
        setPartnerFeedback(geocodeFeedback, data.error || "Endereço não encontrado.", "invalid");
        return;
      }
      latitudeInput.value = Number(data.melhor.latitude).toFixed(6);
      longitudeInput.value = Number(data.melhor.longitude).toFixed(6);
      if (data.melhor.endereco) addressInput.value = data.melhor.endereco;
      setPartnerFeedback(geocodeFeedback, "Endereço localizado e coordenadas preenchidas.", "valid");
    } catch {
      setPartnerFeedback(geocodeFeedback, "Não foi possível buscar o endereço agora.", "invalid");
    } finally {
      geocodeAddressButton.disabled = false;
    }
  });

  useCurrentLocationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      notify("Geolocalização não suportada neste navegador.", "error");
      return;
    }
    setPartnerFeedback(geocodeFeedback, "Capturando sua localização...", "warning");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        latitudeInput.value = position.coords.latitude.toFixed(6);
        longitudeInput.value = position.coords.longitude.toFixed(6);
        try {
          const url = `/api/geocode/reverso?lat=${encodeURIComponent(latitudeInput.value)}&lon=${encodeURIComponent(longitudeInput.value)}`;
          const res = await fetch(url);
          const data = await res.json();
          if (res.ok && data.resultado?.endereco) {
            addressInput.value = data.resultado.endereco;
            setPartnerFeedback(geocodeFeedback, "Localização capturada e endereço preenchido.", "valid");
          } else {
            setPartnerFeedback(geocodeFeedback, "Localização capturada. Confira o endereço manualmente.", "warning");
          }
        } catch {
          setPartnerFeedback(geocodeFeedback, "Localização capturada. Confira o endereço manualmente.", "warning");
        }
      },
      () => setPartnerFeedback(geocodeFeedback, "Não foi possível capturar sua localização agora.", "invalid"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });

  // Ações na lista de lojas próprias
  ownedList.addEventListener("click", guardAction(async (event) => {
    if (!getDonoFromToken()) { showAuthArea(); return; }

    // Excluir loja
    const removeShopBtn = event.target.closest("[data-remove-owner-shop]");
    if (removeShopBtn) {
      if (!(await confirmAction(`Excluir o lava jato "${cachedShops.find(shop => String(shop.id) === removeShopBtn.dataset.removeOwnerShop)?.nome || "selecionado"}" permanentemente? Todos os serviços e agendamentos também serão removidos.`, { title: "Excluir lava jato", danger: true, confirmLabel: "Excluir lava jato" }))) return;
      const shopId = removeShopBtn.dataset.removeOwnerShop;
      try {
        const res = await donoFetch(`/api/lojas/${shopId}`, { method: "DELETE" });
        if (!res.ok) { const d = await res.json(); notify(d.error || "Erro ao excluir.", "error"); return; }
        if (form.dataset.editingShopId === shopId) resetPartnerForm();
        await renderOwnedShops();
        await renderReceivedBookings();
        if (!cachedShops.length) switchTab("estabelecimento");
        notify("Lava jato removido do marketplace.", "success");
      } catch { notify("Erro de conexão.", "error"); }
      return;
    }

    // Abrir editor inline de novo serviço
    const addServiceBtn = event.target.closest("[data-add-owner-service]");
    if (addServiceBtn) {
      const shopId = addServiceBtn.dataset.addOwnerService;
      ownedList.querySelectorAll("[data-service-editor]").forEach((e) => e.classList.add("hidden"));
      const editor = ownedList.querySelector(`[data-service-editor="${shopId}"]`);
      if (!editor) return;
      const title = editor.querySelector("[data-inline-editor-title]");
      if (title) title.textContent = "Adicionar serviço";
      editor.dataset.editingServiceId = "";
      editor.querySelector('[data-inline-service-field="name"]').value = "";
      editor.querySelector('[data-inline-service-field="price"]').value = "";
      editor.querySelector('[data-inline-service-field="duration"]').value = "";
      editor.querySelector('[data-inline-service-field="description"]').value = "";
      const fb = editor.querySelector("[data-inline-service-feedback]");
      if (fb) fb.textContent = "";
      editor.classList.remove("hidden");
      editor.querySelector('[data-inline-service-field="name"]').focus();
      return;
    }

    // Abrir editor inline para editar serviço existente
    const editServiceBtn = event.target.closest("[data-edit-owner-service]");
    if (editServiceBtn) {
      const shopId = editServiceBtn.dataset.editOwnerService;
      const serviceId = Number(editServiceBtn.dataset.serviceId);
      const shop = cachedShops.find((s) => s.id === Number(shopId));
      const servico = shop?.servicos?.find((s) => s.id === serviceId);
      if (!servico) return;

      ownedList.querySelectorAll("[data-service-editor]").forEach((e) => e.classList.add("hidden"));
      const editor = ownedList.querySelector(`[data-service-editor="${shopId}"]`);
      if (!editor) return;

      const title = editor.querySelector("[data-inline-editor-title]");
      if (title) title.textContent = "Editar serviço";
      editor.dataset.editingServiceId = String(serviceId);
      editor.querySelector('[data-inline-service-field="name"]').value = servico.nome || "";
      editor.querySelector('[data-inline-service-field="price"]').value = servico.preco ?? "";
      editor.querySelector('[data-inline-service-field="duration"]').value = servico.duracao || "";
      editor.querySelector('[data-inline-service-field="description"]').value = servico.descricao || "";
      editor.querySelector('[data-inline-service-field="included"]').value = servico.inclusos || "";
      editor.querySelector('[data-inline-service-field="steps"]').value = servico.etapas || "";
      editor.querySelector('[data-inline-service-field="products"]').value = servico.produtos || "";
      editor.querySelector('[data-inline-service-field="guidance"]').value = servico.orientacoes || "";
      editor.querySelector('[data-inline-service-field="warranty"]').value = servico.garantia || "";
      const fb = editor.querySelector("[data-inline-service-feedback]");
      if (fb) fb.textContent = "";
      editor.classList.remove("hidden");
      editor.querySelector('[data-inline-service-field="name"]').focus();
      return;
    }

    // Salvar serviço (criar ou editar)
    const saveServiceBtn = event.target.closest("[data-save-owner-service]");
    if (saveServiceBtn) {
      const shopId = saveServiceBtn.dataset.saveOwnerService;
      const editor = ownedList.querySelector(`[data-service-editor="${shopId}"]`);
      if (!editor) return;

      const fb = editor.querySelector("[data-inline-service-feedback]");
      const nome = editor.querySelector('[data-inline-service-field="name"]').value.trim();
      const preco = Number(
        String(editor.querySelector('[data-inline-service-field="price"]').value || "").replace(",", "."),
      );
      const duracao = editor.querySelector('[data-inline-service-field="duration"]').value.trim();
      const descricao = editor.querySelector('[data-inline-service-field="description"]').value.trim();
      const inclusos = editor.querySelector('[data-inline-service-field="included"]').value.trim();
      const etapas = editor.querySelector('[data-inline-service-field="steps"]').value.trim();
      const produtos = editor.querySelector('[data-inline-service-field="products"]').value.trim();
      const orientacoes = editor.querySelector('[data-inline-service-field="guidance"]').value.trim();
      const garantia = editor.querySelector('[data-inline-service-field="warranty"]').value.trim();

      if (!nome || !duracao || !descricao) {
        if (fb) fb.textContent = "Preencha nome, duração e descrição do serviço.";
        return;
      }
      if (!Number.isFinite(preco) || preco < 0) {
        if (fb) fb.textContent = "Informe um preço válido para o serviço.";
        return;
      }

      const editingServiceId = editor.dataset.editingServiceId;
      try {
        let res;
        if (editingServiceId) {
          res = await donoFetch(`/api/lojas/${shopId}/servicos/${editingServiceId}`, {
            method: "PUT",
            body: JSON.stringify({ nome, preco, duracao, descricao, inclusos, etapas, produtos, orientacoes, garantia }),
          });
        } else {
          res = await donoFetch(`/api/lojas/${shopId}/servicos`, {
            method: "POST",
            body: JSON.stringify({ nome, preco, duracao, descricao, inclusos, etapas, produtos, orientacoes, garantia }),
          });
        }
        if (!res.ok) {
          const d = await res.json();
          if (fb) fb.textContent = d.error || "Erro ao salvar serviço.";
          return;
        }
        editor.classList.add("hidden");
        await renderOwnedShops();
        notify(editingServiceId ? "Serviço atualizado com sucesso." : "Serviço cadastrado com sucesso.", "success");
      } catch {
        if (fb) fb.textContent = "Erro de conexão.";
      }
      return;
    }

    // Cancelar editor inline
    const cancelEditorBtn = event.target.closest("[data-cancel-owner-service-editor]");
    if (cancelEditorBtn) {
      const shopId = cancelEditorBtn.dataset.cancelOwnerServiceEditor;
      const editor = ownedList.querySelector(`[data-service-editor="${shopId}"]`);
      if (editor) editor.classList.add("hidden");
      return;
    }

    // Excluir serviço
    const removeServiceBtn = event.target.closest("[data-remove-owner-service]");
    if (removeServiceBtn) {
      if (!(await confirmAction(`Excluir o serviço "${cachedShops.find(shop => String(shop.id) === removeServiceBtn.dataset.removeOwnerService)?.servicos?.find(service => String(service.id) === removeServiceBtn.dataset.serviceId)?.nome || "selecionado"}"?`, { title: "Excluir serviço", danger: true, confirmLabel: "Excluir serviço" }))) return;
      const shopId = removeServiceBtn.dataset.removeOwnerService;
      const serviceId = removeServiceBtn.dataset.serviceId;
      try {
        const res = await donoFetch(`/api/lojas/${shopId}/servicos/${serviceId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const d = await res.json();
          notify(d.error || "Erro ao excluir serviço.", "error");
          return;
        }
        await renderOwnedShops();
        notify("Serviço removido com sucesso.", "success");
      } catch { notify("Erro de conexão.", "error"); }
      return;
    }

    // Editar dados do lava jato
    const editShopBtn = event.target.closest("[data-edit-owner-shop]");
    if (editShopBtn) {
      const shopId = Number(editShopBtn.dataset.editOwnerShop);
      const loja = cachedShops.find((s) => s.id === shopId);
      if (loja) {
        loadShopToForm(loja);
      } else {
        try {
          const res = await fetch(`/api/lojas/${shopId}`);
          if (res.ok) { const { loja: l } = await res.json(); loadShopToForm(l); }
          else notify("Não foi possível carregar o lava jato.", "error");
        } catch { notify("Erro de conexão.", "error"); }
      }
    }
  }, 'button'));

  // Submeter formulário de loja
  form.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    if (!getDonoFromToken()) { showAuthArea(); notify("Faça login na sua conta de parceiro para continuar.", "warning"); return; }

    const editingId = form.dataset.editingShopId || "";
    const formData = new FormData(form);
    const nome = String(formData.get("shopName") || "").trim();
    const descricao = String(formData.get("summary") || "").trim();
    const endereco = String(formData.get("address") || "").trim();
    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));
    let fotoUrl = String(formData.get("photoUrl") || "").trim();
    let capaUrl = String(formData.get("coverUrl") || "").trim();
    const photoFile = photoFileInput?.files?.[0] || null;
    const coverFile = coverFileInput?.files?.[0] || null;
    const formasPagamento = parseTextList(formData.get("formasPagamento")).join(", ");
    const politicaCancelamento = String(formData.get("politicaCancelamento") || "").trim();
    let fotosAdicionais = parseTextList(formData.get("fotosAdicionais")).join("\n");
    const agendaDias = readScheduleDaysFromForm();
    const agendaHorarios = parseScheduleTimes(formData.get("agendaHorarios"));
    const servicos = readServicesFromForm();
    const precoMedio = servicos.length
      ? parseFloat((servicos.reduce((acc, s) => acc + s.preco, 0) / servicos.length).toFixed(2))
      : 0;

    if (!nome || !descricao || !endereco || (!fotoUrl && !photoFile)) {
      notify("Preencha todos os campos obrigatórios do estabelecimento.", "error");
      return;
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) {
      notify("Informe latitude e longitude válidas para mostrar no mapa.", "error");
      return;
    }
    if (!editingId && !servicos.length) {
      notify("Adicione pelo menos um serviço válido para publicar.", "error");
      return;
    }
    if (!agendaDias.length) {
      setPartnerFeedback(scheduleFeedback, "Selecione pelo menos um dia de atendimento.", "invalid");
      return;
    }
    if (!agendaHorarios.length) {
      setPartnerFeedback(scheduleFeedback, "Informe pelo menos um horário válido, como 08:00.", "invalid");
      return;
    }
    scheduleTimesInput.value = agendaHorarios.join(", ");
    setPartnerFeedback(scheduleFeedback, `${agendaHorarios.length} horário${agendaHorarios.length === 1 ? "" : "s"} configurado${agendaHorarios.length === 1 ? "" : "s"}.`, "valid");

    const categoria = deriveCategoryFromServicos(servicos);

    submitButton.disabled = true;
    submitButton.textContent = "Salvando...";

    try {
      if (photoFile) {
        setPartnerFeedback(photoFeedback, "Enviando foto principal...", "warning");
        fotoUrl = await uploadImageFile(photoFile, "loja", donoFetch);
        document.getElementById("partner-photo").value = fotoUrl;
        setPartnerFeedback(photoFeedback, "Foto principal enviada.", "valid");
      }
      if (coverFile) {
        setPartnerFeedback(coverFeedback, "Enviando foto de capa...", "warning");
        capaUrl = await uploadImageFile(coverFile, "capa", donoFetch);
        document.getElementById("partner-cover").value = capaUrl;
        setPartnerFeedback(coverFeedback, "Foto de capa enviada.", "valid");
      }
      // Upload de fotos extras (slots 2, 3, 4)
      const extraUploadedUrls = [];
      for (let si = 0; si < extraPhotoSlots.length; si++) {
        const slot = extraPhotoSlots[si];
        if (slot?.file) {
          setPartnerFeedback(photoFeedback, `Enviando foto ${si + 2}...`, "warning");
          const extraUrl = await uploadImageFile(slot.file, "loja", donoFetch);
          extraUploadedUrls.push(extraUrl);
        } else if (slot?.existingUrl) {
          extraUploadedUrls.push(slot.existingUrl);
        }
      }
      if (extraUploadedUrls.length) {
        fotosAdicionais = extraUploadedUrls.filter(Boolean).join("\n");
        if (galleryInput) galleryInput.value = fotosAdicionais;
        setPartnerFeedback(photoFeedback, "Fotos enviadas com sucesso.", "valid");
      }
      if (!isValidShopImagePath(fotoUrl) || (capaUrl && !isValidShopImagePath(capaUrl))) {
        notify("Use um link de imagem válido (http/https) ou envie uma foto.", "error");
        return;
      }

      let res;
      const lojaPayload = { nome, descricao, endereco, latitude, longitude, precoMedio, categoria, fotoUrl, capaUrl: capaUrl || fotoUrl, fotosAdicionais, formasPagamento, politicaCancelamento, agendaDias, agendaHorarios,
        capacidadeSimultanea: Number(formData.get('capacidadeSimultanea')),
        agendaFechamento: String(formData.get('agendaFechamento') || ''),
        agendaBloqueios: String(formData.get('agendaBloqueios') || ''),
      };
      if (editingId) {
        res = await donoFetch(`/api/lojas/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(lojaPayload),
        });
      } else {
        res = await donoFetch("/api/lojas", {
          method: "POST",
          body: JSON.stringify({ ...lojaPayload, servicos }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.lojaId) {
          notify("Seu login já possui um lava jato publicado. Carregando para edição.", "info");
          const lojaRes = await fetch(`/api/lojas/${data.lojaId}`);
          if (lojaRes.ok) { const { loja } = await lojaRes.json(); loadShopToForm(loja); }
        } else {
          notify(data.error || "Erro ao salvar lava jato.", "error");
        }
        return;
      }

      resetPartnerForm();
      await renderOwnedShops();
      await renderReceivedBookings();
      if (editingId) notify("Lava jato atualizado com sucesso.", "success");
      // Lojas novas entram como "pendente" e só aparecem no marketplace depois da aprovação do admin.
      else if (data.loja?.statusAprovacao === "pendente") notify("Cadastro enviado para aprovação. Sua loja ficará visível no marketplace após a aprovação da equipe.", "info");
      else notify("Lava jato publicado com sucesso no marketplace.", "success");
      switchTab("estabelecimento");
      document.getElementById("partner-overview-title")?.focus({ preventScroll: true });
    } catch (err) {
      notify(err.message || "Erro de conexão. Tente novamente.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = form.dataset.editingShopId ? "Salvar alterações" : "Publicar lava jato";
    }
  }));

  // Login do dono
  loginForm?.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const login = normalizeOwnerLogin(formData.get("login"));
    const senha = String(formData.get("password") || "");

    try {
      const res = await fetch("/api/dono/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });
      const data = await res.json();
      if (!res.ok) { if (tratarPendenciaEmail(data, "dono")) return; notify(data.error || "Login ou senha inválidos.", "error"); return; }

      setDonoToken(data.token);
      loginForm.reset();
      resetPartnerForm();
      showManagementArea(data.dono);
      await renderOwnedShops();
      await renderReceivedBookings();
      switchTab(cachedShops.length ? "dashboard" : "estabelecimento");
      notify("Login realizado com sucesso.", "success");
    } catch {
      notify("Erro de conexão. Tente novamente.", "error");
    }
  }));

  // Botão Google na página do parceiro
  const partnerGoogleBtn = document.getElementById("partner-google-login-btn");
  if (partnerGoogleBtn) {
    partnerGoogleBtn.addEventListener("click", () => {
      window.location.href = "/auth/google?parceiro=1&next=cadastro-dono.html";
    });
  }

  // Callback Google OAuth → token na URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth") === "dono_google_success" && urlParams.get("token")) {
    setDonoToken(urlParams.get("token"));
    window.history.replaceState({}, "", "cadastro-dono.html");
  }

  // Logout do dono
  ownerLogoutButton.addEventListener("click", async () => {
    try {
      await logoutFromServer();
    } catch (error) {
      notify(error.message || "Não foi possível encerrar a sessão.");
      return;
    }
    clearDonoToken();
    cachedShops = [];
    cachedBookings = [];
    selectedDashboardShopId = "";
    renderPartnerDashboard();
    resetPartnerForm();
    showAuthArea();
    notify("Sessão do parceiro encerrada.", "info");
  });

  // ── Wizard de cadastro ─────────────────────────────────────────────────────
  function initWizard() {
    const panels = form.querySelectorAll(".wizard-panel");
    const progressSteps = document.querySelectorAll("#partner-wizard-progress .wizard-progress-step");
    if (!panels.length) return;

    function goToStep(n) {
      panels.forEach((p) => p.classList.toggle("hidden", parseInt(p.dataset.wizardPanel) !== n));
      progressSteps.forEach((s) => {
        const sn = parseInt(s.dataset.step);
        s.classList.toggle("is-active", sn === n);
        s.classList.toggle("is-done", sn < n);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    wizardGoToStep = goToStep;

    form.querySelectorAll("[data-wizard-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = parseInt(btn.dataset.wizardNext);
        if (step === 1) {
          const nome = (document.getElementById("partner-shop-name")?.value || "").trim();
          const desc = (document.getElementById("partner-summary")?.value || "").trim();
          const addr = (document.getElementById("partner-address")?.value || "").trim();
          if (!nome || !desc || !addr) { notify("Preencha nome, descrição e endereço antes de continuar.", "error"); return; }
          const lat = latitudeInput?.value;
          const lng = longitudeInput?.value;
          if (!lat || !lng) { notify('Clique em "Localizar no mapa" para confirmar o endereço antes de continuar.', "error"); return; }
        }
        if (step === 2) {
          const photoFile = photoFileInput?.files?.[0];
          const photoUrl = (document.getElementById("partner-photo")?.value || "").trim();
          if (!photoFile && !photoUrl) { notify("Adicione uma foto do seu lava jato para continuar.", "error"); return; }
        }
        if (step === 3) {
          const days = readScheduleDaysFromForm();
          if (!days.length) { notify("Selecione pelo menos um dia de atendimento.", "error"); return; }
        }
        goToStep(step + 1);
      });
    });

    form.querySelectorAll("[data-wizard-prev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = parseInt(btn.dataset.wizardPrev);
        goToStep(step - 1);
      });
    });
  }

  function initPhotoZone() {
    const mainZone = document.getElementById("partner-photo-zone");
    if (!mainZone) return;

    const slotDefs = [
      {
        zone: mainZone,
        input: document.getElementById("partner-photo-file"),
        preview: document.getElementById("partner-photo-preview"),
        placeholder: document.getElementById("partner-photo-placeholder"),
        adjustBtn: document.getElementById("partner-photo-adjust-main"),
        isMain: true,
      },
      ...[1, 2, 3].map((i) => {
        const zone = document.getElementById(`partner-extra-zone-${i}`);
        if (!zone) return null;
        return {
          zone,
          input: zone.querySelector("input[type='file']"),
          preview: zone.querySelector(".photo-upload-preview"),
          placeholder: zone.querySelector(".photo-upload-placeholder"),
          adjustBtn: zone.querySelector(".photo-adjust-btn"),
          isMain: false,
          extraIndex: i - 1,
        };
      }).filter(Boolean),
    ];

    const cropModal = document.getElementById("photo-crop-modal");
    const cropViewport = document.getElementById("crop-viewport");
    const cropImgWrap = document.getElementById("crop-img-wrap");
    const cropImg = document.getElementById("crop-source-img");
    const cropConfirmBtn = document.getElementById("crop-confirm-btn");
    const cropCancelBtn = document.getElementById("crop-cancel-btn");
    const cropZoomInBtn = document.getElementById("crop-zoom-in");
    const cropZoomOutBtn = document.getElementById("crop-zoom-out");
    const cropZoomLabel = document.getElementById("crop-zoom-label");

    let activeCropSlot = null;
    let originalFile = null;
    let dragStart = null;
    let lastPinchDist = null;
    let cropState = { x: 0, y: 0, scale: 1, minScale: 1, iw: 0, ih: 0 };

    function applyTransform() {
      if (!cropImgWrap || !cropImg) return;
      cropImgWrap.style.left = `${cropState.x}px`;
      cropImgWrap.style.top = `${cropState.y}px`;
      cropImg.style.transform = `scale(${cropState.scale})`;
      if (cropZoomLabel) {
        cropZoomLabel.textContent = `${Math.round((cropState.scale / cropState.minScale) * 100)}%`;
      }
    }

    function clampPosition() {
      const vw = cropViewport.clientWidth;
      const vh = cropViewport.clientHeight;
      cropState.x = Math.min(0, Math.max(vw - cropState.iw * cropState.scale, cropState.x));
      cropState.y = Math.min(0, Math.max(vh - cropState.ih * cropState.scale, cropState.y));
    }

    function zoomAround(newScale, cx, cy) {
      newScale = Math.max(cropState.minScale, Math.min(cropState.minScale * 5, newScale));
      const ratio = newScale / cropState.scale;
      cropState.x = cx - (cx - cropState.x) * ratio;
      cropState.y = cy - (cy - cropState.y) * ratio;
      cropState.scale = newScale;
      clampPosition();
      applyTransform();
    }

    function openCropModal(slotDef, file) {
      if (!cropModal || !cropImg || !cropViewport) { applyFileToSlot(slotDef, file); return; }
      activeCropSlot = slotDef;
      originalFile = file;
      cropModal.classList.remove("hidden");
      activateModal(cropModal, { initialFocus: cropModal.querySelector("#crop-cancel-btn"), onEscape: closeCropModal });
      const objectUrl = URL.createObjectURL(file);
      cropImg.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        const iw = cropImg.naturalWidth;
        const ih = cropImg.naturalHeight;
        const minScale = Math.max(vw / iw, vh / ih);
        cropState = { x: (vw - iw * minScale) / 2, y: (vh - ih * minScale) / 2, scale: minScale, minScale, iw, ih };
        applyTransform();
      };
      cropImg.src = objectUrl;
    }

    function closeCropModal() {
      if (cropModal) cropModal.classList.add("hidden");
      if (cropModal) deactivateModal(cropModal);
      activeCropSlot = null;
      originalFile = null;
      dragStart = null;
    }

    function applyFileToSlot(slotDef, file) {
      const { zone, preview, placeholder, adjustBtn, isMain, extraIndex } = slotDef;
      if (!isMain && extraIndex !== undefined) {
        extraPhotoSlots[extraIndex] = { file, existingUrl: "" };
      }
      if (isMain) {
        try { const dt = new DataTransfer(); dt.items.add(file); photoFileInput.files = dt.files; } catch (e) {}
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (preview) { preview.src = ev.target.result; preview.classList.remove("hidden"); }
        if (placeholder) placeholder.classList.add("hidden");
        zone.classList.add("has-preview");
        if (adjustBtn) adjustBtn.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    }

    // Drag events on crop viewport
    if (cropViewport) {
      cropViewport.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        cropViewport.setPointerCapture(e.pointerId);
        dragStart = { px: e.clientX, py: e.clientY, ox: cropState.x, oy: cropState.y };
      });
      cropViewport.addEventListener("pointermove", (e) => {
        if (!dragStart) return;
        cropState.x = dragStart.ox + (e.clientX - dragStart.px);
        cropState.y = dragStart.oy + (e.clientY - dragStart.py);
        clampPosition();
        applyTransform();
      });
      cropViewport.addEventListener("pointerup", () => { dragStart = null; });
      cropViewport.addEventListener("pointercancel", () => { dragStart = null; });
      cropViewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = cropViewport.getBoundingClientRect();
        zoomAround(cropState.scale * (e.deltaY > 0 ? 0.91 : 1.10), e.clientX - rect.left, e.clientY - rect.top);
      }, { passive: false });
      cropViewport.addEventListener("touchstart", (e) => {
        if (e.touches.length === 2) {
          lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });
      cropViewport.addEventListener("touchmove", (e) => {
        if (e.touches.length === 2 && lastPinchDist) {
          e.preventDefault();
          const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          const rect = cropViewport.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          zoomAround(cropState.scale * (dist / lastPinchDist), cx, cy);
          lastPinchDist = dist;
        }
      }, { passive: false });
      cropViewport.addEventListener("touchend", () => { lastPinchDist = null; });
    }

    if (cropZoomInBtn) cropZoomInBtn.addEventListener("click", () => { zoomAround(cropState.scale * 1.15, cropViewport.clientWidth / 2, cropViewport.clientHeight / 2); });
    if (cropZoomOutBtn) cropZoomOutBtn.addEventListener("click", () => { zoomAround(cropState.scale / 1.15, cropViewport.clientWidth / 2, cropViewport.clientHeight / 2); });
    if (cropCancelBtn) cropCancelBtn.addEventListener("click", closeCropModal);
    if (cropModal) cropModal.addEventListener("click", (e) => { if (e.target === cropModal) closeCropModal(); });

    if (cropConfirmBtn) {
      cropConfirmBtn.addEventListener("click", () => {
        if (!activeCropSlot || !cropImg || !cropViewport) return;
        const canvas = document.createElement("canvas");
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = vw * dpr;
        canvas.height = vh * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.drawImage(cropImg, -cropState.x / cropState.scale, -cropState.y / cropState.scale, vw / cropState.scale, vh / cropState.scale, 0, 0, vw, vh);
        canvas.toBlob((blob) => {
          if (!blob) { closeCropModal(); return; }
          const croppedFile = new File([blob], originalFile?.name || "photo.jpg", { type: "image/jpeg" });
          applyFileToSlot(activeCropSlot, croppedFile);
          closeCropModal();
        }, "image/jpeg", 0.92);
      });
    }

    // Setup each upload zone
    slotDefs.forEach((slotDef) => {
      const { zone, input, adjustBtn } = slotDef;
      if (!zone || !input) return;
      // Prevent the native input click from bubbling up and re-triggering input.click()
      input.addEventListener("click", (e) => e.stopPropagation());
      zone.addEventListener("click", (e) => {
        if (e.target.closest(".photo-adjust-btn")) return;
        if (e.target === input) return;
        if (!e.target.closest("img")) input.click();
      });
      zone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
      });
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-dragover"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("is-dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) openCropModal(slotDef, file);
      });
      input.addEventListener("change", () => {
        const file = input.files[0];
        if (file) openCropModal(slotDef, file);
      });
      adjustBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const pendingFile = slotDef.isMain
          ? (photoFileInput?.files?.[0] || null)
          : (extraPhotoSlots[slotDef.extraIndex]?.file || null);
        if (pendingFile) openCropModal(slotDef, pendingFile);
      });
    });
  }

  function initTimeTags() {
    const grid = document.getElementById("schedule-time-grid");
    if (!scheduleTimesInput || !grid) return;

    // Gera todos os horários de 00:00 até 23:30 (de 30 em 30 min)
    const allSlots = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        allSlots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }

    grid.innerHTML = allSlots
      .map((t) => `<button type="button" class="time-chip" data-add-time="${t}">${t}</button>`)
      .join("");

    const btns = grid.querySelectorAll("[data-add-time]");

    function getActiveTimes() {
      return parseScheduleTimes(scheduleTimesInput.value);
    }

    function setActiveTimes(times) {
      scheduleTimesInput.value = [...new Set(times)].sort().join(", ");
      refreshChips();
    }

    function refreshChips() {
      const active = getActiveTimes();
      btns.forEach((btn) => {
        btn.classList.toggle("is-selected", active.includes(btn.dataset.addTime));
      });
    }

    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const time = btn.dataset.addTime;
        const times = getActiveTimes();
        if (times.includes(time)) {
          setActiveTimes(times.filter((t) => t !== time));
        } else {
          setActiveTimes([...times, time]);
        }
      });
    });

    refreshChips();
    syncTimeTags = refreshChips;
  }

  initWizard();
  initPhotoZone();
  initTimeTags();

  // Verifica se já está logado via token
  const dono = getDonoFromToken();
  if (dono) {
    resetPartnerForm();
    showManagementArea(dono);
    await renderOwnedShops();
    await renderReceivedBookings();
    // Aceita ?tab=agendamentos (links dos e-mails) e #agendamentos (menu do topo).
    const requestedTab = new URLSearchParams(window.location.search).get("tab") || window.location.hash.slice(1);
    const initialTab = ["dashboard", "estabelecimento", "agendamentos"].includes(requestedTab) ? requestedTab : "dashboard";
    switchTab(cachedShops.length ? initialTab : "estabelecimento");
  } else {
    showAuthArea();
    resetPartnerForm();
  }
}

async function fetchUserFavoriteShopIds() {
  if (getDonoFromToken() || !getAuthToken()) return [];
  try {
    const res = await userFetch("/api/favoritos");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.lojas) ? data.lojas.map((loja) => loja.id) : [];
  } catch {
    return [];
  }
}

async function toggleFavoriteShop(shopId, currentlyFavorited) {
  if (!requireAuth("favoritar")) return false;
  try {
    const url = `/api/favoritos/${encodeURIComponent(shopId)}`;
    const res = await userFetch(url, {
      method: currentlyFavorited ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function createFavoriteButtonHtml(isFavorited, shopId) {
  if (getDonoFromToken()) return "";
  return `
    <button type="button" class="shop-card-favorite${isFavorited ? " is-favorited" : ""}" aria-label="${isFavorited ? "Remover favorito" : "Adicionar aos favoritos"}" data-favorite-toggle data-shop-id="${encodeURIComponent(shopId)}">
      <span aria-hidden="true">${isFavorited ? "★" : "☆"}</span>
    </button>
  `;
}

function updateFavoriteButtonState(button, isFavorited) {
  if (!button) return;
  button.classList.toggle("is-favorited", Boolean(isFavorited));
  button.setAttribute("aria-label", isFavorited ? "Remover favorito" : "Adicionar aos favoritos");
  const span = button.querySelector("span");
  if (span) span.textContent = isFavorited ? "★" : "☆";
}

async function handleFavoriteButtonClick(event) {
  const button = event.target.closest("[data-favorite-toggle]");
  if (!button) return;
  event.preventDefault();
  const shopId = Number(button.dataset.shopId);
  if (!shopId) return;
  const currentlyFavorited = button.classList.contains("is-favorited");
  const success = await toggleFavoriteShop(shopId, currentlyFavorited);
  if (!success) {
    notify("Não foi possível atualizar o favorito no momento.", "error");
    return;
  }
  updateFavoriteButtonState(button, !currentlyFavorited);
  document.querySelectorAll("[data-favorite-toggle]").forEach((other) => {
    if (Number(other.dataset.shopId) === shopId) updateFavoriteButtonState(other, !currentlyFavorited);
  });
  if (!currentlyFavorited) {
    window.location.href = "favoritos.html";
  }
}

function initFavoriteButtonHandling() {
  document.addEventListener("click", handleFavoriteButtonClick);
}

function emailCadastroValido(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && email.split("@")[0].length <= 64
    && !/[\s,;<>()[\]\\"]/.test(email)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function configurarValidacaoEmail(inputId, messageId) {
  const input = document.getElementById(inputId), message = document.getElementById(messageId);
  if (!input || !message) return () => false;
  function validar(obrigatorio = false) {
    const value = input.value.trim();
    const valido = emailCadastroValido(value);
    const state = !value && !obrigatorio ? "" : valido ? "valid" : "invalid";
    message.textContent = !value && !obrigatorio ? "" : valido
      ? "Email válido. Confirme no seu e-mail após criar a conta."
      : !value ? "Informe seu e-mail para criar a conta." : "Informe um e-mail válido, como nome@exemplo.com.";
    message.className = `empty-copy validation-msg${state ? ` is-${state}` : ""}`;
    input.setAttribute("aria-invalid", String(state === "invalid"));
    return valido;
  }
  input.addEventListener("input", () => validar());
  input.addEventListener("blur", () => validar());
  input.form?.addEventListener("reset", () => {
    message.textContent = ""; message.className = "empty-copy validation-msg";
    input.setAttribute("aria-invalid", "false");
  });
  return validar;
}

// Cadastro fica pendente até a prova de posse do e-mail; senha nunca é persistida.
function abrirVerificacaoEmail(tipo, email = "", mensagem = "", falhou = false) {
  try { if (email) sessionStorage.setItem(`autoshine:verificar:${tipo}`, email); } catch {}
  if (tipo === "dono") clearDonoToken(); else clearCurrentUser();
  redirectWithNotice(`verificar-email.html?tipo=${tipo}`, mensagem || "Confirme seu e-mail antes de entrar.", falhou ? "error" : "info");
}
function tratarPendenciaEmail(data, tipo, email = "") {
  const box = document.getElementById(tipo === "dono" ? "dono-login-pending" : "login-pending");
  if (box) box.classList.add("hidden");
  if (!["EMAIL_NAO_VERIFICADO", "EMAIL_NECESSARIO"].includes(data.code)) return false;
  try { if (email) sessionStorage.setItem(`autoshine:verificar:${tipo}`, email); } catch {}
  // O login não envia e-mail nem redireciona à confirmação. Apenas informa um cadastro incompleto.
  const message = data.code === "EMAIL_NECESSARIO"
    ? "Sua conta antiga precisa de um e-mail. Conclua o cadastro uma única vez para entrar."
    : "Seu cadastro ainda não foi confirmado. Abra o link recebido no e-mail. Depois, basta entrar com sua senha.";
  if (box) {
    box.querySelector("[data-pending-message]").textContent = message;
    box.classList.remove("hidden");
  } else notify(message, "warning");
  return true;
}

// ── Acesso do dono (login + cadastro) ───────────────────────────────────────
async function initOwnerRegisterPage() {
  const switchLogin = document.getElementById("dono-switch-login");
  const switchRegister = document.getElementById("dono-switch-register");
  const loginPanel = document.getElementById("dono-login-panel");
  const registerPanel = document.getElementById("dono-register-panel");
  const authTitle = document.getElementById("dono-auth-title");
  const authSubtitle = document.getElementById("dono-auth-subtitle");
  const loginForm = document.getElementById("dono-login-form");
  const registerForm = document.getElementById("owner-register-form");
  const googleLoginBtn = document.getElementById("dono-google-btn");
  const googleRegisterBtn = document.getElementById("dono-google-register-btn");

  if (!switchLogin || !switchRegister || !loginPanel || !registerPanel) return;
  const validarEmail = configurarValidacaoEmail("owner-register-email", "owner-email-validation-msg");

  const params = new URLSearchParams(window.location.search);

  function setMode(mode) {
    const isLogin = mode === "login";
    loginPanel.classList.toggle("hidden", !isLogin);
    registerPanel.classList.toggle("hidden", isLogin);
    switchLogin.classList.toggle("active", isLogin);
    switchRegister.classList.toggle("active", !isLogin);
    switchLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
    switchRegister.setAttribute("aria-selected", isLogin ? "false" : "true");
    if (authTitle) {
      authTitle.textContent = isLogin
        ? "Entrar"
        : "Criar conta";
    }
    if (authSubtitle) {
      authSubtitle.textContent = isLogin
        ? "Gerencie seu lava jato, serviços e agendamentos em um só lugar."
        : "Crie seu acesso de dono para publicar seu lava jato e receber pedidos.";
    }
  }

  setMode(params.get("mode") === "register" ? "register" : "login");
  switchLogin.addEventListener("click", () => {
    setMode("login");
  });
  switchRegister.addEventListener("click", () => {
    setMode("register");
  });

  // Botões Google → iniciar OAuth como parceiro
  function startGoogleAuthDono() {
    window.location.href = "/auth/google?parceiro=1&next=cadastro-dono.html";
  }
  if (googleLoginBtn) googleLoginBtn.addEventListener("click", startGoogleAuthDono);
  if (googleRegisterBtn) googleRegisterBtn.addEventListener("click", startGoogleAuthDono);

  // Tratar retorno do callback Google
  function handleGoogleCallback() {
    const auth = params.get("auth");
    const token = params.get("token");
    if (auth === "dono_google_success" && token) {
      setDonoToken(token);
      window.history.replaceState({}, "", "cadastro-dono.html");
      return true;
    }
    if (auth === "google_not_configured") {
      notify("O login com Google está indisponível no momento. Entre com e-mail e senha.", "error");
      window.history.replaceState({}, "", "cadastro-dono.html");
    }
    if (auth === "google_failed") {
      notify("Não foi possível concluir o login com Google. Tente novamente.", "error");
      window.history.replaceState({}, "", "cadastro-dono.html");
    }
    return false;
  }

  if (handleGoogleCallback()) return;

  // Se ja esta logado como dono, vai direto para o painel
  if (getDonoFromToken()) {
    return;
  }

  // Login é tratado pelo initPartnerPage() que tem acesso ao showManagementArea

  // Cadastro
    if (registerForm) {
    // Validar CNPJ em tempo real
    const loginInput = document.getElementById("owner-register-login");
    const cnpjInput = document.getElementById("owner-register-cnpj");
    const cnpjValidationMsg = document.getElementById("cnpj-validation-msg");

    if (loginInput) {
      loginInput.addEventListener("input", () => {
        const normalized = normalizeOwnerLogin(loginInput.value);
        if (loginInput.value !== normalized) loginInput.value = normalized;
      });
    }
    
    // Função para formatar CNPJ
    function formatCNPJ(value) {
      const cnpj = value.replace(/\D/g, "");
      // Limita a 14 dígitos
      const limitedCnpj = cnpj.substring(0, 14);
      if (limitedCnpj.length <= 14) {
        return limitedCnpj
          .replace(/(\d{2})(\d)/, "$1.$2")
          .replace(/(\d{3})(\d)/, "$1.$2")
          .replace(/(\d{3})(\d)/, "$1/$2")
          .replace(/(\d{4})(\d)/, "$1-$2");
      }
      return value;
    }
    
    if (cnpjInput && cnpjValidationMsg) {
      // Formatar enquanto digita e limitar a 14 dígitos
      cnpjInput.addEventListener("input", (e) => {
        const cnpjOnlyNumbers = e.target.value.replace(/\D/g, "");
        // Se tiver mais de 14 números, não permite
        if (cnpjOnlyNumbers.length > 14) {
          e.target.value = formatCNPJ(e.target.value.substring(0, e.target.value.length - 1));
        } else {
          e.target.value = formatCNPJ(e.target.value);
        }
      });

      cnpjInput.addEventListener("blur", async () => {
        const cnpj = cnpjInput.value.replace(/\D/g, "");
        if (cnpj.length === 14) {
          cnpjValidationMsg.textContent = "Validando CNPJ...";
          cnpjValidationMsg.style.color = "#666";
          try {
            const res = await fetch(`/api/validacoes/cnpj/${cnpj}`);
            if (res.ok) {
              const data = await res.json();
              cnpjValidationMsg.textContent = "CNPJ validado.";
              cnpjValidationMsg.style.color = "#2ecc71";
            } else {
              cnpjValidationMsg.textContent = "CNPJ inválido ou não encontrado";
              cnpjValidationMsg.style.color = "#e74c3c";
            }
          } catch {
            cnpjValidationMsg.textContent = "Não foi possível validar o CNPJ agora";
            cnpjValidationMsg.style.color = "#f39c12";
          }
        } else {
          cnpjValidationMsg.textContent = "";
        }
      });
    }

    registerForm.addEventListener("submit", guardAction(async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const nome = String(formData.get("name") || "").trim();
      const login = normalizeOwnerLogin(formData.get("login"));
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const cnpj = String(formData.get("cnpj") || "").replace(/\D/g, "").trim();
      const senha = String(formData.get("password") || "");
      const senhaConfirm = String(formData.get("passwordConfirm") || "");
      const termsAccepted = Boolean(formData.get("terms"));

      if (!validarEmail(true)) { document.getElementById("owner-register-email")?.focus(); return; }
      if (!nome || !login || !email || !cnpj || !senha || !senhaConfirm) {
        notify("Preencha todos os campos para criar a conta de parceiro.", "error");
        return;
      }
      if (login.length < 4) { notify("O login deve ter no mínimo 4 caracteres.", "error"); return; }
      if (!/^[a-z0-9._-]+$/i.test(login)) {
        notify("Use apenas letras, números, ponto, underline ou hífen no login.", "error");
        return;
      }
      if (cnpj.length !== 14) { notify("CNPJ deve conter 14 dígitos.", "error"); return; }
      if (AutoShinePassword.erroSenha(senha)) { notify(AutoShinePassword.erroSenha(senha), "error"); return; }
      if (senha !== senhaConfirm) { notify("As senhas não coincidem.", "error"); return; }
      if (!termsAccepted) { notify("Você precisa aceitar os termos para criar a conta de parceiro.", "error"); return; }

      // Tentar validar CNPJ antes de enviar (mas permitir mesmo se falhar)
      let cnpjValidationWarning = false;
      try {
        const cnpjRes = await fetch(`/api/validacoes/cnpj/${cnpj}`);
        const cnpjData = await cnpjRes.json();
        if (!cnpjRes.ok || !cnpjData.valido) {
          notify(cnpjData.mensagem || "CNPJ inválido.", "error");
          return;
        }
        if (cnpjData.origem !== "brasilapi") {
          cnpjValidationWarning = true;
        }
      } catch {
        cnpjValidationWarning = true;
      }

      // Se a validação falhou, avisar mas permitir continuar
      if (cnpjValidationWarning) {
        const confirmar = await confirmAction("Aviso: Não foi possível validar o CNPJ completamente. Deseja continuar mesmo assim?");
        if (!confirmar) return;
      }

      try {
        const res = await fetch("/api/dono/cadastro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, login, email: email || undefined, cnpj, senha }),
        });
        const data = await res.json();
        if (data.verificacaoPendente) {
          registerForm.reset();
          abrirVerificacaoEmail("dono", email, data.error || data.mensagem, !res.ok);
          return;
        }
        notify(data.error || "Não foi possível concluir o cadastro.", "error");
      } catch {
        notify("Erro de conexão. Tente novamente.", "error");
      }
    }));
  }
}

// ── Acesso unificado: cliente ou empresa ───────────────────────────────────
function initUnifiedOwnerLogin() {
  const loginForm = document.getElementById("dono-login-form");
  if (!loginForm || page !== "cadastro") return;

  loginForm.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const login = normalizeOwnerLogin(formData.get("login"));
    const senha = String(formData.get("password") || "");

    if (!login || !senha) {
      notify("Informe o login e a senha da empresa.", "error");
      return;
    }

    try {
      const res = await fetch("/api/dono/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (tratarPendenciaEmail(data, "dono")) return;
        notify(data.error || "Login ou senha inválidos.", "error");
        return;
      }

      setDonoToken(data.token);
      loginForm.reset();
      redirectWithNotice("cadastro-dono.html", "Login realizado com sucesso.");
    } catch {
      notify("Erro de conexão. Tente novamente.", "error");
    }
  }));
}

function initAccountTypeSelector() {
  const clientButton = document.getElementById("select-client-account");
  const companyButton = document.getElementById("select-company-account");
  const clientContent = document.getElementById("client-account-content");
  const companyContent = document.getElementById("company-account-content");

  if (!clientButton || !companyButton || !clientContent || !companyContent) return;

  const clientLoginButton = document.getElementById("switch-login");
  const clientRegisterButton = document.getElementById("switch-signup");
  const companyLoginButton = document.getElementById("dono-switch-login");
  const companyRegisterButton = document.getElementById("dono-switch-register");
  const params = new URLSearchParams(window.location.search);

  function currentIntent() {
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "signup" || mode === "register" ? "register" : "login";
  }

  function updateUrl(type, intent) {
    const url = new URL(window.location.href);
    url.searchParams.set("perfil", type);
    url.searchParams.set("mode", type === "empresa" && intent === "register" ? "register" : type === "cliente" && intent === "register" ? "signup" : "login");
    window.history.replaceState({}, "", url);
  }

  function selectAccountType(type, intent = currentIntent()) {
    const isCompany = type === "empresa";
    clientContent.classList.toggle("hidden", isCompany);
    companyContent.classList.toggle("hidden", !isCompany);
    clientButton.classList.toggle("active", !isCompany);
    companyButton.classList.toggle("active", isCompany);
    clientButton.setAttribute("aria-selected", String(!isCompany));
    companyButton.setAttribute("aria-selected", String(isCompany));

    if (isCompany) {
      (intent === "register" ? companyRegisterButton : companyLoginButton)?.click();
    } else {
      (intent === "register" ? clientRegisterButton : clientLoginButton)?.click();
    }
    updateUrl(type, intent);
  }

  clientButton.addEventListener("click", () => selectAccountType("cliente"));
  companyButton.addEventListener("click", () => selectAccountType("empresa"));

  const initialType = params.get("perfil") === "empresa" ? "empresa" : "cliente";
  const initialIntent = params.get("mode") === "signup" || params.get("mode") === "register" ? "register" : "login";
  selectAccountType(initialType, initialIntent);
}

// ── Perfil da loja ───────────────────────────────────────────────────────────
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function setupProfileCarousel(container, photos, shopName) {
  if (!container) return;

  const uniquePhotos = [];
  photos.forEach((photo) => {
    const value = String(photo || "").trim();
    if (value && isValidShopImagePath(value) && !uniquePhotos.includes(value)) uniquePhotos.push(value);
  });

  if (!uniquePhotos.length) return;

  const safeName = escapeHtml(shopName || "estabelecimento");
  container.innerHTML = `
    <div class="profile-carousel-track">
      ${uniquePhotos.map((photo, index) => `
        <img
          class="profile-carousel-slide${index === 0 ? " is-active" : ""}"
          src="${escapeHtml(photo)}"
          alt="${index === 0 ? `Capa do estabelecimento ${safeName}` : `Foto ${index + 1} de ${safeName}`}"
          ${index === 0 ? "" : 'loading="lazy"'}
        />
      `).join("")}
    </div>
    ${uniquePhotos.length > 1 ? `
      <button class="profile-carousel-control profile-carousel-prev" type="button" aria-label="Foto anterior" data-profile-carousel-prev>&#8249;</button>
      <button class="profile-carousel-control profile-carousel-next" type="button" aria-label="Pr&oacute;xima foto" data-profile-carousel-next>&#8250;</button>
      <div class="profile-carousel-dots" aria-label="Selecionar foto">
        ${uniquePhotos.map((_, index) => `
          <button
            class="profile-carousel-dot${index === 0 ? " is-active" : ""}"
            type="button"
            aria-label="Mostrar foto ${index + 1}"
            aria-current="${index === 0 ? "true" : "false"}"
            data-profile-carousel-dot="${index}"
          ></button>
        `).join("")}
      </div>
    ` : ""}
  `;

  if (uniquePhotos.length === 1) return;

  const slides = [...container.querySelectorAll(".profile-carousel-slide")];
  const dots = [...container.querySelectorAll("[data-profile-carousel-dot]")];
  const INTERVAL = 2500;
  let activeIndex = 0;
  let timerId = null;
  let hovering = false;

  const setActive = (nextIndex) => {
    activeIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === activeIndex));
    dots.forEach((d, i) => {
      d.classList.toggle("is-active", i === activeIndex);
      d.setAttribute("aria-current", i === activeIndex ? "true" : "false");
    });
  };

  const stop = () => {
    clearInterval(timerId);
    timerId = null;
  };

  const start = () => {
    if (hovering || document.hidden) return;
    stop();
    timerId = setInterval(() => setActive(activeIndex + 1), INTERVAL);
  };

  container.querySelector("[data-profile-carousel-prev]")?.addEventListener("click", () => {
    setActive(activeIndex - 1);
    start();
  });

  container.querySelector("[data-profile-carousel-next]")?.addEventListener("click", () => {
    setActive(activeIndex + 1);
    start();
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      setActive(Number(dot.dataset.profileCarouselDot || 0));
      start();
    });
  });

  container.addEventListener("mouseenter", () => { hovering = true; stop(); });
  container.addEventListener("mouseleave", () => { hovering = false; start(); });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  start();
}

async function initProfilePage() {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get("shopId");
  if (!shopId) return;

  try {
    const res = await fetch(`/api/lojas/${shopId}`);
    if (!res.ok) return;
    const { loja } = await res.json();
    const partner = getDonoFromToken();
    const partnerView = Boolean(partner);
    const ownShop = partnerView && String(loja.donoId) === String(partner.donoId);
    if (partnerView) {
      const main = document.querySelector("main");
      const notice = document.createElement("section");
      notice.className = "panel";
      notice.innerHTML = `
        <a class="booking-back-link" href="cadastro-dono.html">← Voltar ao painel do parceiro</a>
        <p class="eyebrow">${ownShop ? "Seu estabelecimento" : "Consulta de estabelecimento"}</p>
        <p class="hero-text">Você está visualizando as informações com sua conta de parceiro. Agendamentos e avaliações são exclusivos de contas de cliente.</p>`;
      main?.prepend(notice);
    }

    const heroCarousel = document.querySelector(".profile-carousel");
    const profileInfo = document.querySelector(".profile-info");
    const servicesGrid = document.querySelector(".services-grid");
    const detailsGrid = document.getElementById("profile-details");
    const sectionHead = document.querySelector("section .section-head .link");

    if (!profileInfo || !servicesGrid) return;

    // Carousel — foto principal primeiro, depois capa e fotos adicionais (deduplica e filtra quebradas)
    const extraPhotos = parseTextList(loja.fotosAdicionais).filter(isValidShopImagePath);
    const candidates = [...new Set([loja.fotoUrl, loja.capaUrl, ...extraPhotos].filter((url) => url && isValidShopImagePath(url)))];
    const checks = await Promise.all(candidates.map((url) => probeImage(url)));
    const allPhotos = candidates.filter((_, i) => checks[i]);
    if (heroCarousel) {
      setupProfileCarousel(heroCarousel, allPhotos, loja.nome);
    }

    const avaliacoes = loja.avaliacoes || [];
    let ratingLine;
    if (avaliacoes.length) {
      const avg = avaliacoes.reduce((s, a) => s + Number(a.nota || 0), 0) / avaliacoes.length;
      const totalLabel = avaliacoes.length === 1 ? "avaliação" : "avaliações";
      ratingLine = `<p><span class="stars">&#9733; ${avg.toFixed(1).replace(".", ",")}</span> (${avaliacoes.length} ${totalLabel})</p>`;
    } else {
      ratingLine = "<p>Aguardando avaliações de clientes.</p>";
    }

    const hasCoordinates = Number.isFinite(Number(loja.latitude)) && Number.isFinite(Number(loja.longitude));
    const destination = hasCoordinates
      ? `${loja.latitude},${loja.longitude}`
      : (loja.endereco || loja.nome || "");
    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    const mapUrl = `mapa.html?shop=${encodeURIComponent(loja.nome)}&shopId=${encodeURIComponent(loja.id)}`;
    const scheduleSummary = formatScheduleSummary(loja.agendaDias, loja.agendaHorarios);
    const payments = parseTextList(loja.formasPagamento || "Pix, Cartão, Dinheiro");
    const paymentChips = payments.length
      ? payments.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
      : "<span>Consultar estabelecimento</span>";
    const cancellationPolicy = String(loja.politicaCancelamentoEfetiva || loja.politicaCancelamento || "").trim() ||
      "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.";
    const avgPriceText = loja.precoMedio > 0
      ? `R$ ${Number(loja.precoMedio).toFixed(0)}`
      : "Consultar";
    profileInfo.innerHTML = `
      <h1>${escapeHtml(loja.nome)}</h1>
      ${ratingLine}
      <p class="profile-address">${escapeHtml(loja.endereco || "Endereço não informado")}</p>
      <div class="profile-actions">
        <a class="btn btn-primary" href="${routeUrl}" target="_blank" rel="noopener">Traçar rota</a>
        <a class="btn btn-ghost" href="${mapUrl}">Abrir no mapa</a>
        ${!partnerView ? `<button class="btn btn-ghost" type="button" data-report-shop="${loja.id}" data-report-label="${escapeHtml(loja.nome)}">Denunciar loja</button>` : ""}
      </div>
    `;

    if (detailsGrid) {
      const [schedDays, schedTimes] = scheduleSummary.split(" - ");
      detailsGrid.innerHTML = `
        <div class="shop-info-bar">
          <div class="shop-info-col">
            <span class="shop-info-label">Horários</span>
            <strong class="shop-info-value shop-info-days">${escapeHtml(schedDays || scheduleSummary)}</strong>
            ${schedTimes ? `<p class="shop-info-times">${escapeHtml(schedTimes)}</p>` : ""}
          </div>
          <div class="shop-info-col">
            <span class="shop-info-label">Formas de pagamento</span>
            <div class="shop-info-chips">${paymentChips}</div>
          </div>
          <div class="shop-info-col">
            <span class="shop-info-label">Cancelamento</span>
            <p class="shop-info-value">${escapeHtml(cancellationPolicy)}</p>
          </div>
        </div>
      `;
    }

    if (sectionHead) {
      sectionHead.href = `avaliacoes.html?lojaId=${loja.id}&shop=${encodeURIComponent(loja.nome)}`;
      sectionHead.textContent = "Ver avaliações";
    }

    const servicos = loja.servicos || [];
    let serviceDetailModal = document.getElementById("service-detail-modal");
    if (!serviceDetailModal) {
      document.body.insertAdjacentHTML("beforeend", `
        <div id="service-detail-modal" class="service-detail-modal hidden" aria-hidden="true">
          <div class="service-detail-backdrop" data-close-service-detail></div>
          <section class="service-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
            <header class="service-detail-header">
              <div>
                <p class="eyebrow">Detalhes do serviço</p>
                <h2 id="service-detail-title"></h2>
                <p id="service-detail-description" class="hero-text"></p>
              </div>
              <button class="service-detail-close" type="button" aria-label="Fechar detalhes" data-close-service-detail>&times;</button>
            </header>
            <div class="service-detail-summary">
              <div><span>Preço</span><strong id="service-detail-price"></strong></div>
              <div><span>Duração</span><strong id="service-detail-duration"></strong></div>
              <div><span>Garantia</span><strong id="service-detail-warranty-summary"></strong></div>
            </div>
            <div class="service-detail-tabs" role="tablist" aria-label="Informações do serviço">
              <button class="active" type="button" role="tab" aria-selected="true" data-service-detail-tab="included">O que inclui</button>
              <button type="button" role="tab" aria-selected="false" data-service-detail-tab="steps">Como funciona</button>
              <button type="button" role="tab" aria-selected="false" data-service-detail-tab="trust">Confiança</button>
            </div>
            <div class="service-detail-content">
              <div data-service-detail-panel="included"></div>
              <div class="hidden" data-service-detail-panel="steps"></div>
              <div class="hidden" data-service-detail-panel="trust"></div>
            </div>
            <footer class="service-detail-footer">
              <a id="service-detail-booking" class="btn btn-primary requires-auth" data-auth-action="agendar" href="#">Agendar este serviço</a>
            </footer>
          </section>
        </div>`);
      serviceDetailModal = document.getElementById("service-detail-modal");
    }

    const detailTitle = serviceDetailModal.querySelector("#service-detail-title");
    const detailDescription = serviceDetailModal.querySelector("#service-detail-description");
    const detailPrice = serviceDetailModal.querySelector("#service-detail-price");
    const detailDuration = serviceDetailModal.querySelector("#service-detail-duration");
    const detailWarrantySummary = serviceDetailModal.querySelector("#service-detail-warranty-summary");
    const detailBooking = serviceDetailModal.querySelector("#service-detail-booking");
    detailBooking.classList.toggle("hidden", partnerView);
    if (partnerView) {
      const note = document.createElement("p");
      note.className = "empty-copy";
      note.textContent = "Visualização de parceiro: agendamento disponível apenas para clientes.";
      detailBooking.parentElement.appendChild(note);
    }
    const detailTabs = Array.from(serviceDetailModal.querySelectorAll("[data-service-detail-tab]"));
    const detailPanels = Array.from(serviceDetailModal.querySelectorAll("[data-service-detail-panel]"));

    function detailList(value, fallback) {
      const items = parseTextList(value);
      return items.length ? items : fallback;
    }

    function closeServiceDetail() {
      serviceDetailModal.classList.add("hidden");
      deactivateModal(serviceDetailModal);
      serviceDetailModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("service-detail-open");
    }

    function selectServiceDetailTab(name) {
      detailTabs.forEach((tab) => {
        const active = tab.dataset.serviceDetailTab === name;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      detailPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.serviceDetailPanel !== name);
      });
    }

    function openServiceDetail(servico) {
      const bookingUrl = `agendamento.html?servicoId=${servico.id}&shopId=${loja.id}&servico=${encodeURIComponent(servico.nome)}&shop=${encodeURIComponent(loja.nome)}`;
      const included = detailList(servico.inclusos, [servico.descricao || "Serviço executado conforme a descrição apresentada."]);
      const steps = detailList(servico.etapas, ["Recepção e inspeção inicial", "Execução do serviço", "Conferência final e entrega"]);
      const products = String(servico.produtos || "Produtos profissionais selecionados pelo estabelecimento.").trim();
      const guidance = String(servico.orientacoes || "Consulte o estabelecimento caso o veículo precise de alguma preparação especial.").trim();
      const warranty = String(servico.garantia || "Consultar condições com o estabelecimento.").trim();

      // O selo é concedido somente quando o estabelecimento preencheu todos os
      // campos de transparência. Os textos automáticos acima continuam servindo
      // apenas como orientação visual e não contam para a obtenção do selo.
      const hasCompleteTransparency =
        parseTextList(servico.inclusos).length > 0 &&
        parseTextList(servico.etapas).length > 0 &&
        String(servico.produtos || "").trim().length > 0 &&
        String(servico.orientacoes || "").trim().length > 0 &&
        String(servico.garantia || "").trim().length > 0;

      const transparencyBadge = hasCompleteTransparency
        ? `<div class="service-transparency-badge">
            <strong>Serviço com informações completas</strong>
            <span>O estabelecimento detalhou todas as informações importantes deste serviço.</span>
          </div>`
        : "";

      detailTitle.textContent = servico.nome || "Serviço";
      detailDescription.textContent = servico.descricao || "Conheça os detalhes deste serviço.";
      detailPrice.textContent = `R$ ${Number(servico.preco || 0).toFixed(2).replace(".", ",")}`;
      detailDuration.textContent = servico.duracao || "Consultar";
      detailWarrantySummary.textContent = servico.garantia ? "Informada" : "Consultar";
      detailBooking.href = bookingUrl;

      serviceDetailModal.querySelector('[data-service-detail-panel="included"]').innerHTML = `
        <ul class="service-detail-checklist">${included.map((item) => `<li><span aria-hidden="true">&#10003;</span>${escapeHtml(item)}</li>`).join("")}</ul>`;
      serviceDetailModal.querySelector('[data-service-detail-panel="steps"]').innerHTML = `
        <ol class="service-detail-steps">${steps.map((item) => `<li><span>${escapeHtml(item)}</span></li>`).join("")}</ol>`;
      serviceDetailModal.querySelector('[data-service-detail-panel="trust"]').innerHTML = `
        ${transparencyBadge}
        <dl class="service-detail-trust-list">
          <div><dt>Produtos e equipamentos</dt><dd>${escapeHtml(products)}</dd></div>
          <div><dt>Orientações</dt><dd>${escapeHtml(guidance)}</dd></div>
          <div><dt>Garantia</dt><dd>${escapeHtml(warranty)}</dd></div>
        </dl>`;

      selectServiceDetailTab("included");
      serviceDetailModal.classList.remove("hidden");
      serviceDetailModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("service-detail-open");
      activateModal(serviceDetailModal, { initialFocus: serviceDetailModal.querySelector(".service-detail-close"), onEscape: closeServiceDetail });
    }

    detailTabs.forEach((tab) => {
      if (tab.dataset.serviceDetailBound === "1") return;
      tab.dataset.serviceDetailBound = "1";
      tab.addEventListener("click", () => selectServiceDetailTab(tab.dataset.serviceDetailTab));
    });
    serviceDetailModal.querySelectorAll("[data-close-service-detail]").forEach((button) => {
      if (button.dataset.serviceDetailBound === "1") return;
      button.dataset.serviceDetailBound = "1";
      button.addEventListener("click", closeServiceDetail);
    });

    servicesGrid.innerHTML = servicos.length
      ? servicos.map((servico) => {
        const nome = escapeHtml(servico.nome || "Serviço");
        const descricao = escapeHtml(servico.descricao || "");
        const duracao = escapeHtml(servico.duracao || "--");
        const preco = Number(servico.preco || 0).toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
        const bookingUrl = `agendamento.html?servicoId=${servico.id}&shopId=${loja.id}&servico=${encodeURIComponent(servico.nome)}&shop=${encodeURIComponent(loja.nome)}`;
        return `
          <article class="service-card">
            <h3>${nome}</h3>
            <p>${descricao}</p>
            <div class="service-meta">
              <strong>R$ ${preco}</strong>
              <span>${duracao}</span>
            </div>
            <div class="service-card-actions">
              <button class="btn btn-secondary" type="button" data-service-detail="${servico.id}">Ver detalhes</button>
              ${!partnerView ? `<a class="btn btn-primary requires-auth" data-auth-action="agendar" href="${bookingUrl}">Agendar</a>` : ""}
            </div>
          </article>`;
      })
      .join("")
      : '<article class="service-card"><p>Este estabelecimento ainda não cadastrou serviços.</p></article>';

    servicesGrid.addEventListener("click", (event) => {
      const detailButton = event.target.closest("[data-service-detail]");
      if (!detailButton) return;
      const servico = servicos.find((item) => String(item.id) === detailButton.dataset.serviceDetail);
      if (servico) openServiceDetail(servico);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !serviceDetailModal.classList.contains("hidden")) closeServiceDetail();
    });

    initializeAuthRequiredLinks();
  } catch {}
}

// ── Mapa ─────────────────────────────────────────────────────────────────────
async function initMapInteractions() {
  const mapElement = document.getElementById("map");
  const filterList = document.getElementById("map-filter-list");
  const locateButton = document.getElementById("map-locate-btn");
  const routeButton = document.getElementById("map-route-btn");
  const externalNavButton = document.getElementById("external-nav-btn");
  const mapProfileButton = document.getElementById("map-profile-btn");
  const shopName = document.getElementById("shop-name");
  const shopInfo = document.getElementById("shop-info");
  const params = new URLSearchParams(window.location.search);

  if (!mapElement || !filterList || !shopName || !shopInfo) return;

  const queryShopId = params.get("shopId");
  if (queryShopId) {
    const mainEl = document.querySelector("main.page-map");
    if (mainEl) {
      const backLink = document.createElement("a");
      backLink.href = `perfil.html?shopId=${encodeURIComponent(queryShopId)}`;
      backLink.className = "map-back-link";
      backLink.innerHTML = "&#8592; Voltar ao perfil";
      mainEl.prepend(backLink);
    }
  }

  if (typeof window.L === "undefined") {
    mapElement.classList.remove("real-map");
    mapElement.classList.add("map-fallback-canvas");
    mapElement.innerHTML = `
      <div class="map-fallback">
        <strong>Mapa indisponível</strong>
        <span>Confira sua conexão e recarregue a página para ver rotas e marcadores.</span>
      </div>`;
    shopName.textContent = "Mapa offline";
    shopInfo.textContent = "Os dados do AutoShine continuam disponíveis nas telas de busca e perfil.";
    if (locateButton) locateButton.disabled = true;
    if (routeButton) routeButton.disabled = true;
    if (externalNavButton) externalNavButton.href = "index.html";
    if (mapProfileButton) mapProfileButton.href = "index.html";
    return;
  }

  const defaultCenter = [-16.6869, -49.2648];
  const map = L.map(mapElement).setView(defaultCenter, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  function mapCategoryFromShopCategory(categoria) {
    const normalized = normalizeCategory(categoria);
    if (normalized.includes("polimento")) return "polimento";
    if (normalized.includes("higienizacao")) return "higienizacao";
    if (normalized.includes("detalhamento")) return "detalhamento";
    return "lavagem";
  }

  let apiShops = [];
  try {
    const res = await fetch("/api/lojas", { cache: "no-store" });
    if (res.ok) {
      const { lojas } = await res.json();
      apiShops = lojas
        .filter(
          (l) =>
            Number.isFinite(l.latitude) &&
            Number.isFinite(l.longitude) &&
            l.latitude >= -90 && l.latitude <= 90 &&
            l.longitude >= -180 && l.longitude <= 180,
        )
        .map((l) => {
          const av = l.avaliacoes || [];
          const servicosTexto = Array.isArray(l.servicos)
            ? l.servicos.map((servico) => `${servico.nome || ""} ${servico.descricao || ""}`).join(" ")
            : "";
          return {
            id: l.id,
            name: l.nome,
            rating: av.length ? av.reduce((s, a) => s + a.nota, 0) / av.length : null,
            category: mapCategoryFromShopCategory(l.categoria),
            searchText: normalizeCategory(`${l.nome} ${l.endereco || ""} ${l.categoria || ""} ${servicosTexto}`),
            latlng: [l.latitude, l.longitude],
            ownerCreated: true,
          };
        });
    }
  } catch {}

  const shops = [...apiShops];

  const markerEntries = shops.map((shop) => {
    const marker = L.marker(shop.latlng).addTo(map);
    marker.on("click", () => {
      const url = shop.ownerCreated && shop.id
        ? `perfil.html?shopId=${encodeURIComponent(shop.id)}`
        : "perfil.html";
      window.location.href = url;
    });
    return { shop, marker, visible: true };
  });

  let userMarker = null;
  let userCircle = null;
  let currentUserPosition = null;
  let selectedShop = null;
  let routeLayer = null;
  let lastRouteSummary = "";

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  function distanceKm(from, to) {
    const earthRadiusKm = 6371;
    const dLat = toRad(to[0] - from[0]);
    const dLng = toRad(to[1] - from[1]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(from[0])) *
        Math.cos(toRad(to[0])) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function formatDistance(from, to) {
    const km = distanceKm(from, to);
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1).replace(".", ",")} km`;
  }

  function formatRouteDistance(meters) {
    const km = meters / 1000;
    if (km < 1) return `${Math.round(meters)} m`;
    return `${km.toFixed(1).replace(".", ",")} km`;
  }

  function formatRouteDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (!remain) return `${hours}h`;
    return `${hours}h ${remain}min`;
  }

  function updateExternalNavigationLink(shop) {
    if (!externalNavButton || !shop) return;
    const destination = `${shop.latlng[0]},${shop.latlng[1]}`;
    const origin = currentUserPosition
      ? `&origin=${currentUserPosition[0]},${currentUserPosition[1]}`
      : "";
    externalNavButton.href = `https://www.google.com/maps/dir/?api=1&destination=${destination}${origin}&travelmode=driving`;
  }

  function clearRoute() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    lastRouteSummary = "";
  }

  function selectShop(shop, options = {}) {
    const { focus = false } = options;
    selectedShop = shop;
    const distance = currentUserPosition
      ? formatDistance(currentUserPosition, shop.latlng)
      : "distância indisponível";
    const ratingText =
      Number.isFinite(Number(shop.rating)) && Number(shop.rating) > 0
        ? `<span class="stars">&#9733; ${Number(shop.rating).toFixed(1).replace(".", ",")}</span> • `
        : "Sem avaliações de clientes • ";

    shopName.textContent = shop.name;
    shopInfo.innerHTML = `${ratingText}${distance}${lastRouteSummary ? ` • ${lastRouteSummary}` : ""}`;
    updateExternalNavigationLink(shop);

    if (mapProfileButton) {
      mapProfileButton.href = shop.ownerCreated
        ? `perfil.html?shopId=${encodeURIComponent(shop.id)}`
        : "perfil.html";
    }

    if (focus) {
      map.flyTo(shop.latlng, 14, { animate: true, duration: 0.8 });
    }
  }

  function applyFilter(filter) {
    markerEntries.forEach((entry) => {
      const visible = filter === "todos" || entry.shop.category === filter;
      entry.visible = visible;
      if (visible && !map.hasLayer(entry.marker)) entry.marker.addTo(map);
      if (!visible && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
    });
  }

  function selectNearestVisibleShop() {
    const visibleShops = markerEntries
      .filter((entry) => entry.visible)
      .map((entry) => entry.shop);
    if (!visibleShops.length) {
      shopName.textContent = "Nenhum lava jato neste filtro";
      shopInfo.textContent = "Ajuste o filtro para visualizar estabelecimentos.";
      selectedShop = null;
      clearRoute();
      return;
    }

    if (!currentUserPosition) {
      selectShop(visibleShops[0]);
      return;
    }

    let nearestShop = visibleShops[0];
    let nearestDistance = distanceKm(currentUserPosition, nearestShop.latlng);

    visibleShops.slice(1).forEach((shop) => {
      const d = distanceKm(currentUserPosition, shop.latlng);
      if (d < nearestDistance) { nearestDistance = d; nearestShop = shop; }
    });

    selectShop(nearestShop, { focus: false });
  }

  function setMapUserPosition(position, options = {}) {
    const { focus = false, preserveSelection = false } = options;
    if (!Array.isArray(position) || !coordinatesValid(position[0], position[1])) return false;

    currentUserPosition = [Number(position[0]), Number(position[1])];

    if (userMarker) map.removeLayer(userMarker);
    if (userCircle) map.removeLayer(userCircle);

    userMarker = L.marker(currentUserPosition, {
      icon: L.divIcon({
        className: "user-marker-wrapper",
        html: '<div class="user-marker-dot" aria-hidden="true"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map);

    userCircle = L.circle(currentUserPosition, {
      radius: 250,
      color: "#27c3ff",
      fillColor: "#27c3ff",
      fillOpacity: 0.12,
      weight: 1,
    }).addTo(map);

    if (focus) map.flyTo(currentUserPosition, 14, { animate: true, duration: 1 });
    if (!preserveSelection || !selectedShop) {
      selectNearestVisibleShop();
    } else {
      selectShop(selectedShop, { focus: false });
    }
    return true;
  }

  filterList.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    filterList.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    button.classList.add("active");
    applyFilter(button.dataset.filter || "todos");
    clearRoute();
    selectNearestVisibleShop();
  });

  function locateUser(preserveSelection = false) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
      shopInfo.textContent = "Geolocalização não suportada neste navegador.";
        resolve(false);
        return;
      }

      shopInfo.textContent = "Buscando sua localização...";

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const positionValue = [position.coords.latitude, position.coords.longitude];
          saveUserLocation(positionValue);
          setMapUserPosition(positionValue, { focus: true, preserveSelection });
          resolve(true);
        },
        () => {
          shopInfo.textContent =
            "Não foi possível capturar sua localização. Verifique as permissões.";
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  async function drawRouteToSelectedShop() {
    if (!selectedShop) selectNearestVisibleShop();
    if (!selectedShop) { shopInfo.textContent = "Selecione um lava jato para calcular a rota."; return; }

    if (!currentUserPosition) {
      const located = await locateUser(true);
      if (!located) return;
    }

    const from = currentUserPosition;
    const to = selectedShop.latlng;
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;

    try {
      shopInfo.textContent = "Calculando caminho até o lava jato...";
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.routes || !data.routes.length) throw new Error("Sem rota disponível");

      const route = data.routes[0];
      const latlngs = route.geometry.coordinates.map((c) => [c[1], c[0]]);

      clearRoute();
      routeLayer = L.polyline(latlngs, { color: "#2f7fff", weight: 5, opacity: 0.9 }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      lastRouteSummary = `rota ${formatRouteDistance(route.distance)} • ${formatRouteDuration(route.duration)}`;
      selectShop(selectedShop, { focus: false });
    } catch {
      clearRoute();
      routeLayer = L.polyline([from, to], {
        color: "#83b2ff",
        weight: 4,
        opacity: 0.75,
        dashArray: "8 10",
      }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      lastRouteSummary = `rota detalhada indisponível • distância direta ${formatDistance(from, to)}`;
      selectShop(selectedShop, { focus: false });
    }
  }

  function findShopFromQuery() {
    const queryShopName = params.get("shop");
    const queryText = normalizeCategory(params.get("q") || "");
    const destination = params.get("dest");

    if (queryShopId) {
      const matchById = shops.find((s) => String(s.id) === String(queryShopId));
      if (matchById) return matchById;
    }

    if (queryShopName) {
      const matchByName = shops.find(
        (s) => s.name.toLowerCase() === queryShopName.toLowerCase(),
      );
      if (matchByName) return matchByName;
    }

    if (queryText) {
      const matchBySearch = shops.find((s) => s.searchText?.includes(queryText));
      if (matchBySearch) return matchBySearch;
      shopName.textContent = "Nenhum lava jato encontrado";
      shopInfo.textContent = "Tente buscar pelo nome, bairro ou tipo de serviço.";
    }

    if (destination) {
      const [latText, lngText] = destination.split(",");
      const lat = Number(latText);
      const lng = Number(lngText);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const matchByCoordinate = shops.find(
          (s) => s.latlng[0] === lat && s.latlng[1] === lng,
        );
        if (matchByCoordinate) return matchByCoordinate;
      }
    }

    return null;
  }

  if (locateButton) {
    locateButton.addEventListener("click", async () => {
      const located = await locateUser();
      if (located) selectNearestVisibleShop();
    });
  }

  if (routeButton) {
    routeButton.addEventListener("click", () => drawRouteToSelectedShop());
  }

  function getStoredUserPosition() {
    try {
      const raw = sessionStorage.getItem(userLocationStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const position = [Number(parsed.latitude), Number(parsed.longitude)];
      return coordinatesValid(position[0], position[1]) ? position : null;
    } catch {
      return null;
    }
  }

  applyFilter("todos");
  const preferredShop = findShopFromQuery();
  const storedUserPosition = getStoredUserPosition();
  if (preferredShop) {
    selectShop(preferredShop, { focus: true });
    if (storedUserPosition) setMapUserPosition(storedUserPosition, { preserveSelection: true });
  } else if (storedUserPosition) {
    setMapUserPosition(storedUserPosition, { focus: true });
  } else {
    selectNearestVisibleShop();
  }

  if (params.get("route") === "1") {
    drawRouteToSelectedShop();
  }
}

// ── Agendamento ──────────────────────────────────────────────────────────────
async function initBookingForm() {
  if (showPartnerClientRestriction()) return;
  const form = document.getElementById("booking-form");
  const serviceInput = document.getElementById("servico");
  const dateInput = document.getElementById("data");
  if (!form || !serviceInput) return;
  const timeSelect = document.getElementById("horario");
  const availabilityMsg = document.getElementById("booking-availability-msg");
  const submitButton = form.querySelector('button[type="submit"]');

  const params = new URLSearchParams(window.location.search);
  const shopId = params.get("shopId") || "";
  const servicoId = params.get("servicoId") || "";
  const servicoNome = params.get("servico") || "Lavagem completa";
  const shopNameFromQuery = String(params.get("shop") || "").trim();

  let lojaData = null;
  let servicoData = null;
  let availabilityRefreshTimer = null;
  let availabilityRequestId = 0;

  if (shopId) {
    try {
      const res = await fetch(`/api/lojas/${shopId}`);
      if (res.ok) {
        const { loja } = await res.json();
        lojaData = loja;
        if (servicoId) {
          servicoData = (loja.servicos || []).find((s) => String(s.id) === String(servicoId));
        }
        const backLink = document.getElementById("booking-back-link");
        if (backLink) {
          backLink.href = `perfil.html?shopId=${encodeURIComponent(shopId)}`;
          backLink.textContent = `← Voltar para ${loja.nome}`;
          backLink.hidden = false;
        }
      }
    } catch {}
  }

  const paymentField = document.createElement('div');
  paymentField.className = 'field';
  paymentField.innerHTML = `<label for="booking-payment">Como pretende pagar?</label><select id="booking-payment" name="formaPagamento" required><option value="">Selecione</option>${lojaData ? bookingPaymentOptions(lojaData).map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('') : ''}</select><p class="empty-copy">Pagamento no estabelecimento. Esta escolha não realiza nenhuma cobrança.</p>`;
  form.querySelector('[name="observacoes"]')?.closest('.field')?.before(paymentField);
  if (!paymentField.isConnected) form.insertBefore(paymentField, submitButton);
  const paymentSelect = paymentField.querySelector('select');
  paymentSelect.addEventListener('change',updateBookingSubmitState);
  let bookingSubmitting = false;
  serviceInput.value = servicoData?.nome || servicoNome;
  const serviceSummary = document.createElement('p');
  serviceSummary.className = 'empty-copy';
  serviceSummary.textContent = servicoData
    ? `Valor do serviço: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(servicoData.preco)}. Duração: ${servicoData.duracao}. Confira antes de confirmar.`
    : 'Preço e duração indisponíveis. Selecione novamente o serviço.';
  serviceInput.after(serviceSummary);
  const selectedShopName = lojaData?.nome || shopNameFromQuery || "Lava jato";

  if (dateInput) {
    dateInput.min = bookingToday();
  }

  function setAvailabilityMessage(message = "", state = "") {
    if (!availabilityMsg) return;
    availabilityMsg.textContent = message;
    availabilityMsg.className = `empty-copy validation-msg${state ? ` is-${state}` : ""}`;
  }

  function updateBookingSubmitState() {
    if (!submitButton) return;
    submitButton.disabled = !(
      lojaData &&
      servicoData &&
      dateInput?.value &&
      timeSelect?.value &&
      !timeSelect.disabled &&
      paymentSelect.value &&
      !bookingSubmitting
    );
  }

  function resetTimeOptions(message = "Escolha uma data para ver os horários disponíveis.") {
    if (!timeSelect) return;
    timeSelect.innerHTML = '<option value="">Escolha uma data primeiro</option>';
    timeSelect.disabled = true;
    setAvailabilityMessage(message, "warning");
    updateBookingSubmitState();
  }

  async function updateAvailableTimes(options = {}) {
    const { silent = false } = options;
    if (!shopId || !dateInput || !timeSelect || !dateInput.value) {
      resetTimeOptions();
      return false;
    }
    const selected = timeSelect.value;
    const requestedDate = dateInput.value, requestId = ++availabilityRequestId;
    if (!silent) setAvailabilityMessage("Consultando horários...", "warning");
    try {
      const res = await fetch(`/api/lojas/${shopId}/disponibilidade?data=${encodeURIComponent(requestedDate)}&servicoId=${encodeURIComponent(servicoId)}&_=${Date.now()}`);
      const result = await res.json();
      if (requestId !== availabilityRequestId || dateInput.value !== requestedDate) return false;
      if (!res.ok) {
        setAvailabilityMessage(result.error || "Não foi possível carregar os horários.", "invalid");
        timeSelect.disabled = true;
        updateBookingSubmitState();
        return false;
      }
      const { horarios = [], aberto = true, mensagem = "" } = result;
      timeSelect.innerHTML = '<option value="">Selecione</option>';
      let availableCount = 0;
      let selectedStillAvailable = false;
      horarios.forEach(({ hora, disponivel, motivo, vagas }) => {
        const option = document.createElement("option");
        option.value = hora;
        option.textContent = disponivel ? `${hora}${vagas > 1 ? ` (${vagas} vagas)` : ""}` : `${hora} (${motivo || "indisponível"})`;
        option.disabled = !disponivel;
        if (disponivel && hora === selected) {
          option.selected = true;
          selectedStillAvailable = true;
        }
        if (disponivel) availableCount += 1;
        timeSelect.appendChild(option);
      });

      timeSelect.disabled = !aberto || availableCount === 0;
      if (selected && !selectedStillAvailable) {
        timeSelect.value = "";
      }

      if (!aberto) {
        setAvailabilityMessage(mensagem || "A loja não atende nesta data.", "warning");
      } else if (!availableCount) {
        setAvailabilityMessage(mensagem || "Nenhum horário disponível para a duração deste serviço.", "warning");
      } else if (selected && !selectedStillAvailable) {
        setAvailabilityMessage(`O horário ${selected} não está mais disponível para este serviço. Escolha outro horário.`, "invalid");
      } else {
        setAvailabilityMessage(
          `${availableCount} ${availableCount === 1 ? "horário disponível" : "horários disponíveis"} para toda a duração. Horários de Brasília.`,
          "valid",
        );
      }
      updateBookingSubmitState();
      return !selected || selectedStillAvailable;
    } catch {
      if (requestId !== availabilityRequestId || dateInput.value !== requestedDate) return false;
      timeSelect.disabled = true;
      setAvailabilityMessage("Erro de conexão ao consultar horários.", "invalid");
      updateBookingSubmitState();
      return false;
    }
  }

  if (dateInput) {
    dateInput.addEventListener("change", () => updateAvailableTimes());
  }
  if (timeSelect) {
    resetTimeOptions();
    timeSelect.addEventListener("change", () => {
      const selectedOption = timeSelect.options[timeSelect.selectedIndex];
      if (selectedOption && selectedOption.textContent.includes("(ocupado)")) {
        setAvailabilityMessage("Este horário está ocupado. Escolha outro horário disponível.", "invalid");
      }
      updateBookingSubmitState();
    });
    timeSelect.addEventListener("focus", () => updateAvailableTimes({ silent: true }));
  }

  window.addEventListener("focus", () => {
    if (dateInput?.value) updateAvailableTimes({ silent: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dateInput?.value) updateAvailableTimes({ silent: true });
  });
  availabilityRefreshTimer = window.setInterval(() => {
    if (!document.hidden && dateInput?.value) updateAvailableTimes({ silent: true });
  }, 15000);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (bookingSubmitting || !form.reportValidity()) return;
    if (!requireAuth("agendar")) return;
    if (!lojaData || !servicoData) {
      notify("Escolha um lava jato e serviço válidos antes de agendar.", "error");
      return;
    }
    if (!dateInput?.value || !timeSelect?.value) {
      setAvailabilityMessage("Escolha uma data e um horário disponível para confirmar.", "invalid");
      updateBookingSubmitState();
      return;
    }
    bookingSubmitting = true;
    updateBookingSubmitState();
    const horarioAindaDisponivel = await updateAvailableTimes({ silent: true });
    if (!horarioAindaDisponivel || !timeSelect.value) {
      bookingSubmitting = false;
      updateBookingSubmitState();
      return;
    }

    const formData = new FormData(form);
    const currentUser = getCurrentUser();

    try {
      const res = await userFetch("/api/agendamentos", {
        method: "POST",
        body: JSON.stringify({
          formaPagamento: paymentSelect.value,
          lojaId: lojaData.id,
          servicoId: servicoData.id,
          servicoEsperado: { nome: servicoData.nome, preco: servicoData.preco, duracao: servicoData.duracao },
          data: String(formData.get("data") || "").trim(),
          hora: String(formData.get("horario") || "").trim(),
          veiculo: String(formData.get("veiculo") || "Carro").trim(),
          notas: String(formData.get("observacoes") || "").trim() || null,
          nomeCliente: currentUser?.name || null,
          emailCliente: currentUser?.email || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearCurrentUser();
          redirectToLogin("agendar");
        } else if (res.status === 409) {
          setAvailabilityMessage(data.error || "Este horário foi ocupado por outro usuário no mesmo momento. Escolha outro horário disponível.", "invalid");
        } else {
          notify(data.error || "Erro ao confirmar agendamento.", "error");
        }
        return;
      }
    } catch {
      notify("Erro de conexão. Tente novamente.", "error");
      return;
    } finally {
      bookingSubmitting = false;
      updateBookingSubmitState();
    }

    redirectWithNotice("meus-agendamentos.html", "Solicitação de agendamento enviada. Aguarde a confirmação do estabelecimento.");
  });
}

// ── Avaliações ───────────────────────────────────────────────────────────────
async function initUserBookingsPage() {
  if (showPartnerClientRestriction()) return;
  const list = document.getElementById('user-bookings-list');
  if (!list || !requireAuth('agendar')) return;
  document.getElementById('user-bookings-empty')?.classList.add('hidden');
  const controller = createBookingListController(list, 'cliente');
  await controller.load();
}

async function initReviewsPage() {
  const reviewsTitle = document.getElementById("reviews-shop-title");
  const avgStars = document.getElementById("reviews-average-stars");
  const totalLabel = document.getElementById("reviews-total");
  const reviewsList = document.getElementById("reviews-list");
  const toggleFormButton = document.getElementById("toggle-review-form");
  const reviewForm = document.getElementById("review-form");

  if (!reviewsTitle || !avgStars || !totalLabel || !reviewsList || !toggleFormButton || !reviewForm)
    return;

  const params = new URLSearchParams(window.location.search);
  const lojaId = params.get("lojaId") || "";
  const shopName = params.get("shop") || "AutoShine";

  const partnerView = Boolean(getDonoFromToken());
  if (partnerView) {
    toggleFormButton.classList.add("hidden");
    toggleFormButton.disabled = true;
    reviewForm.classList.add("hidden");
    reviewForm.querySelectorAll("input, select, textarea, button").forEach((input) => { input.disabled = true; });
    const notice = document.createElement("p");
    notice.className = "hero-text";
    notice.textContent = "Avaliações de clientes — disponíveis para consulta. A conta de parceiro não publica avaliações.";
    toggleFormButton.before(notice);
  }

  const reviewsBackLink = document.getElementById("reviews-back-link");
  if (reviewsBackLink && partnerView) {
    reviewsBackLink.href = "cadastro-dono.html";
    reviewsBackLink.textContent = "← Voltar ao painel do parceiro";
    reviewsBackLink.hidden = false;
  } else if (reviewsBackLink && lojaId) {
    reviewsBackLink.href = `perfil.html?shopId=${encodeURIComponent(lojaId)}`;
    reviewsBackLink.textContent = `← Voltar para ${shopName}`;
    reviewsBackLink.hidden = false;
  }

  const staticReviews = [
    {
      nomeCliente: "Mariana P.",
      nota: 5,
      comentario: "Atendimento excelente e lavagem impecável. Meu carro saiu com aspecto de novo.",
      fotoUrl: "assets/img/detalhe-premium-estetica.png",
      createdAt: "2026-03-28T12:00:00.000Z",
    },
    {
      nomeCliente: "Rafael M.",
      nota: 4,
      comentario: "Gostei muito da higienização interna, só atrasou 10 minutos no horário combinado.",
      fotoUrl: "",
      createdAt: "2026-03-23T17:30:00.000Z",
    },
    {
      nomeCliente: "Camila S.",
      nota: 5,
      comentario: "Polimento com ótimo resultado, equipe atenciosa e ambiente organizado.",
      fotoUrl: "",
      createdAt: "2026-03-18T10:45:00.000Z",
    },
  ];

  function formatDateTime(isoDate) {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  function renderReviewsList(reviews) {
    if (!reviews.length) {
      reviewsList.innerHTML =
        '<article class="review-card"><p>Este estabelecimento ainda não possui comentários.</p></article>';
      return;
    }

    const sorted = reviews.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const avg = sorted.reduce((s, r) => s + Number(r.nota || 0), 0) / sorted.length;

    reviewsTitle.textContent = `Avaliações de ${shopName}`;
    avgStars.innerHTML = `&#9733; ${avg.toFixed(1).replace(".", ",")}`;
    totalLabel.textContent = `Baseado em ${sorted.length} ${sorted.length === 1 ? "avaliação" : "avaliações"}`;

    reviewsList.innerHTML = sorted
      .map((review) => {
        const safeName = escapeHtml(review.nomeCliente || review.reviewer || "Cliente");
        const safeComment = escapeHtml(review.comentario || review.comment || "");
        const safePhoto = (review.fotoUrl || review.photoUrl || "").trim();
        const photoSrc = escapeHtml(safePhoto);
        const rating = Number(review.nota || review.rating || 0).toFixed(1).replace(".", ",");
        const dateLabel = formatDateTime(review.createdAt || new Date().toISOString());

        return `
        <article class="review-card">
          <h3>${safeName}</h3>
          <p class="meta"><span class="stars">&#9733; ${rating}</span> ${dateLabel}</p>
          <p>${safeComment}</p>
          ${safePhoto ? `<img src="${photoSrc}" alt="Foto enviada pelo cliente" loading="lazy" />` : ""}
          ${review.id && !partnerView ? `<button class="btn btn-ghost" type="button" data-report-review="${review.id}" data-report-shop="${lojaId || review.lojaId || ""}" data-report-label="avaliação de ${safeName}">Denunciar avaliação</button>` : ""}
        </article>`;
      })
      .join("");
  }

  function readReviewPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) return resolve("");
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error("Formato de imagem inválido."));
      if (file.size > 1500 * 1024) return reject(new Error("A foto deve ter no máximo 1,5 MB."));

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      reader.readAsDataURL(file);
    });
  }

  // Carregar avaliações
  let currentReviews = [];
  reviewsTitle.textContent = `Avaliações de ${shopName}`;

  if (lojaId) {
    try {
      const res = await fetch(`/api/avaliacoes/loja/${lojaId}`);
      if (res.ok) {
        const { avaliacoes } = await res.json();
        currentReviews = avaliacoes;
      }
    } catch {}
  } else {
    currentReviews = staticReviews;
    toggleFormButton.style.display = "none"; // sem API, sem postagem
  }

  if (currentReviews.length) {
    const avg = currentReviews.reduce((s, r) => s + Number(r.nota || r.rating || 0), 0) / currentReviews.length;
    avgStars.innerHTML = `&#9733; ${avg.toFixed(1).replace(".", ",")}`;
    totalLabel.textContent = `Baseado em ${currentReviews.length} ${currentReviews.length === 1 ? "avaliação" : "avaliações"}`;
  } else {
    avgStars.innerHTML = "&#9733; --";
    totalLabel.textContent = "Nenhuma avaliação ainda";
  }

  renderReviewsList(currentReviews);

  toggleFormButton.addEventListener("click", () => {
    if (!requireAuth("avaliar")) return;
    reviewForm.classList.toggle("hidden");
  });

  reviewForm.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    if (!requireAuth("avaliar")) return;

    const formData = new FormData(reviewForm);
    const reviewer = String(formData.get("reviewerName") || "").trim();
    const nota = Number(formData.get("rating"));
    const comentario = String(formData.get("comment") || "").trim();
    const fotoUrl = String(formData.get("photoUrl") || "").trim();
    const photoFile = formData.get("photoFile");

    if (!reviewer || !comentario || !nota) {
      notify("Preencha nome, nota e comentário para publicar sua avaliação.", "error");
      return;
    }
    if (fotoUrl && !/^https?:\/\//i.test(fotoUrl)) {
      notify("Informe uma URL de foto válida com http ou https.", "error");
      return;
    }

    let fotoPayload = fotoUrl || null;
    if (photoFile && photoFile.size) {
      try {
        fotoPayload = await uploadImageFile(photoFile, "avaliacao", userFetch);
      } catch (err) {
        notify(err.message || "Não foi possível usar a foto enviada.", "error");
        return;
      }
    }

    if (lojaId) {
      try {
        const res = await userFetch("/api/avaliacoes", {
          method: "POST",
          body: JSON.stringify({
            lojaId: Number(lojaId),
            nota,
            comentario,
            fotoUrl: fotoPayload,
            nomeCliente: reviewer,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            clearCurrentUser();
            redirectToLogin("avaliar");
          } else {
            notify(data.error || "Erro ao publicar avaliação.", "error");
          }
          return;
        }

        // Recarregar lista da API
        const listRes = await fetch(`/api/avaliacoes/loja/${lojaId}`);
        if (listRes.ok) {
          const { avaliacoes } = await listRes.json();
          currentReviews = avaliacoes;
          renderReviewsList(currentReviews);
        }
      } catch {
        notify("Erro de conexão. Tente novamente.", "error");
        return;
      }
    }

    reviewForm.reset();
    reviewForm.classList.add("hidden");
  }));
}

// ── Autenticação do cliente ──────────────────────────────────────────────────
function initAuthPage() {
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const googleSignupButton = document.getElementById("google-signup-btn");
  const googleLoginButton = document.getElementById("google-login-btn");
  const cpfInput = document.getElementById("signup-cpf");
  const cpfValidationMsg = document.getElementById("cpf-validation-msg");
  const phoneInput = document.getElementById("signup-phone");
  const switchLogin = document.getElementById("switch-login");
  const switchSignup = document.getElementById("switch-signup");
  const loginPanel = document.getElementById("login-panel");
  const signupPanel = document.getElementById("signup-panel");
  const authTitle = document.getElementById("auth-title");
  const authSubtitle = document.getElementById("auth-subtitle");

  if (
    !signupForm || !loginForm || !googleSignupButton || !googleLoginButton ||
    !cpfInput || !phoneInput || !switchLogin || !switchSignup ||
    !loginPanel || !signupPanel || !authTitle || !authSubtitle
  ) return;

  const validarEmail = configurarValidacaoEmail("signup-email", "email-validation-msg");
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "servicos.html";

  function normalizedNextUrl() {
    try {
      const target = new URL(next, window.location.origin);
      if (target.origin !== window.location.origin) return "servicos.html";
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return "servicos.html";
    }
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function cpfHasValidDigits(cpf) {
    const digits = onlyDigits(cpf);
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
    const calc = (base) => {
      let sum = 0;
      for (let i = 0; i < base.length; i += 1) sum += Number(base[i]) * (base.length + 1 - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return calc(digits.slice(0, 9)) === Number(digits[9]) && calc(digits.slice(0, 10)) === Number(digits[10]);
  }

  function setCpfValidation(message, state = "") {
    if (!cpfValidationMsg) return;
    cpfValidationMsg.textContent = message || "";
    cpfValidationMsg.className = `empty-copy validation-msg${state ? ` is-${state}` : ""}`;
  }

  async function validateCpfField() {
    const cpf = onlyDigits(cpfInput.value);
    if (!cpf) {
      setCpfValidation("");
      return false;
    }
    if (cpf.length !== 11) {
      setCpfValidation("Informe os 11 dígitos do CPF.", "warning");
      return false;
    }
    if (!cpfHasValidDigits(cpf)) {
      setCpfValidation("CPF inválido.", "invalid");
      return false;
    }

    setCpfValidation("Validando CPF...", "warning");
    try {
      const response = await fetch(`/api/validacoes/cpf/${cpf}`);
      const data = await response.json();
      if (response.ok && data.valido) {
        setCpfValidation(
          data.origem === "serpro" ? "CPF validado na base oficial." : "CPF validado.",
          "valid",
        );
        return true;
      }
      setCpfValidation(data.mensagem || "CPF inválido.", "invalid");
      return false;
    } catch {
      setCpfValidation("CPF válido pelo formato. Consulta oficial indisponível agora.", "warning");
      return true;
    }
  }

  function formatPhone(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }

  function setMode(mode) {
    const isLogin = mode === "login";
    loginPanel.classList.toggle("hidden", !isLogin);
    signupPanel.classList.toggle("hidden", isLogin);
    switchLogin.classList.toggle("active", isLogin);
    switchSignup.classList.toggle("active", !isLogin);
    switchLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
    switchSignup.setAttribute("aria-selected", isLogin ? "false" : "true");

    if (isLogin) {
      authTitle.textContent = "Entrar para usar os serviços";
      authSubtitle.textContent =
        "Você pode ver os lava jatos sem login, mas para agendar e avaliar é necessário entrar na conta.";
    } else {
      authTitle.textContent = "Crie sua conta para usar o app";
      authSubtitle.textContent =
        "Cadastro rápido para pesquisar lava jatos, agendar serviços e avaliar estabelecimentos.";
    }
  }

  function upsertGoogleUser(name, email, token) {
    if (!email) return;
    const users = getUsersFromStorage();
    const existingIndex = users.findIndex((u) => u.email === email);
    const payload = {
      name: name || email.split("@")[0],
      email,
      cpf: "",
      phone: "",
      authProvider: "google",
      createdAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      users[existingIndex] = { ...users[existingIndex], ...payload };
    } else {
      users.push(payload);
    }
    saveUsersToStorage(users);
    setCurrentUser({ name: payload.name, email: payload.email, authProvider: "google" }, token);
  }

  function handleAuthQueryFeedback() {
    if (params.get("auth") === "session_expired") notify("Sua sessão foi encerrada. Faça login novamente.", "warning");
    if (params.get("auth") === "password_changed") notify("Senha atualizada. Faça login com a nova senha.", "success");
    const auth = params.get("auth");
    if (!auth) return;

    if (auth === "success" && params.get("provider") === "google") {
      const name = String(params.get("name") || "").trim() || "Usuário Google";
      const email = String(params.get("email") || "").trim().toLowerCase();
      const token = params.get("token");
      if (!token) {
        notify("Não foi possível concluir o login com Google. Tente novamente ou entre com e-mail e senha.", "error");
        return;
      }
      upsertGoogleUser(name, email, token);
      window.history.replaceState({}, "", "cadastro.html");
      redirectWithNotice(normalizedNextUrl(), "Login com Google realizado com sucesso.");
      return;
    }

    if (auth === "google_not_configured") {
      notify(
        "O login com Google está indisponível no momento. Entre com e-mail e senha.", "error");
      window.history.replaceState({}, "", "cadastro.html");
      return;
    }

    if (auth === "google_failed") {
      notify("Não foi possível concluir login com Google. Tente novamente.", "error");
      window.history.replaceState({}, "", "cadastro.html");
    }
  }

  const reason = params.get("reason");
  if (reason === "agendar") {
    notify("Para agendar um serviço, faça login primeiro.", "info");
    setMode("login");
  } else if (reason === "avaliar") {
    notify("Para avaliar o estabelecimento, faça login primeiro.", "info");
    setMode("login");
  } else {
    setMode(params.get("mode") === "signup" ? "signup" : "login");
  }

  switchLogin.addEventListener("click", () => {
    setMode("login");
  });
  switchSignup.addEventListener("click", () => {
    setMode("signup");
  });

  cpfInput.addEventListener("input", () => {
    cpfInput.value = formatCpf(cpfInput.value);
    if (onlyDigits(cpfInput.value).length < 11) setCpfValidation("");
  });
  cpfInput.addEventListener("blur", validateCpfField);
  phoneInput.addEventListener("input", () => { phoneInput.value = formatPhone(phoneInput.value); });

  loginForm.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    if (!email || !password) { notify("Informe e-mail e senha para entrar.", "error"); return; }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha: password }),
      });
      const data = await response.json();
      if (!response.ok) { if (tratarPendenciaEmail(data, "usuario", email)) return; notify(data.error || "E-mail ou senha inválidos.", "error"); return; }

      setCurrentUser(
        { name: data.user.nome, email: data.user.email, authProvider: "email" },
        data.token,
      );
      redirectWithNotice(normalizedNextUrl(), "Login realizado com sucesso.");
    } catch {
      notify("Erro ao conectar com o servidor. Tente novamente.", "error");
    }
  }));

  signupForm.addEventListener("submit", guardAction(async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const cpf = onlyDigits(formData.get("cpf"));
    const phone = onlyDigits(formData.get("phone"));
    const password = String(formData.get("password") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");
    const termsAccepted = Boolean(formData.get("terms"));

    if (!validarEmail(true)) { document.getElementById("signup-email")?.focus(); return; }
    if (!name || !email || !cpf || !phone || !password || !passwordConfirm) {
      notify("Preencha todos os campos obrigatórios.", "error");
      return;
    }
    if (cpf.length !== 11) { notify("Informe um CPF válido com 11 dígitos.", "error"); return; }
    if (!(await validateCpfField())) { notify("Informe um CPF válido para continuar.", "error"); return; }
    if (phone.length < 10) { notify("Informe um telefone válido.", "error"); return; }
    if (AutoShinePassword.erroSenha(password)) { notify(AutoShinePassword.erroSenha(password), "error"); return; }
    if (password !== passwordConfirm) { notify("As senhas não coincidem.", "error"); return; }
    if (!termsAccepted) { notify("Você precisa aceitar os termos para criar a conta.", "error"); return; }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: name, email, cpf, telefone: phone, senha: password }),
      });
      const data = await response.json();
      if (data.verificacaoPendente) {
        signupForm.reset();
        abrirVerificacaoEmail("usuario", email, data.error || data.mensagem, !response.ok);
        return;
      }
      notify(data.error || "Não foi possível concluir o cadastro.", "error");
    } catch {
      notify("Erro ao conectar com o servidor. Tente novamente.", "error");
    }
  }));

  function startGoogleAuth() {
    const nextUrl = encodeURIComponent(normalizedNextUrl());
    window.location.href = `/auth/google?next=${nextUrl}`;
  }

  googleSignupButton.addEventListener("click", () => {
    const servicesUrl = encodeURIComponent("servicos.html");
    window.location.href = `/auth/google?next=${servicesUrl}`;
  });
  googleLoginButton.addEventListener("click", startGoogleAuth);

  handleAuthQueryFeedback();
}

const adminTokenKey = "autoshine:admin-token";

// ── Recuperação de senha ─────────────────────────────────────────────────────
function initResetSenhaPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const tipo = params.get("tipo") === "dono" ? "dono" : "usuario";

  const requestPanel = document.getElementById("reset-request-panel");
  const confirmPanel = document.getElementById("reset-confirm-panel");
  const requestForm = document.getElementById("reset-request-form");
  const requestSuccess = document.getElementById("reset-request-success");
  const confirmForm = document.getElementById("reset-confirm-form");
  const confirmSuccess = document.getElementById("reset-confirm-success");
  const invalidToken = document.getElementById("reset-invalid-token");
  const loginLink = document.getElementById("reset-login-link");
  const tipoInput = document.getElementById("reset-tipo");
  const newLink = document.getElementById("reset-new-link");
  if (newLink) newLink.href = `reset-senha.html?tipo=${tipo}`;
  let confirmando = false, solicitando = false;

  if (token) {
    requestPanel?.classList.add("hidden");
    confirmPanel?.classList.remove("hidden");
    if (tipoInput) tipoInput.value = tipo;
    if (loginLink) {
      loginLink.href = tipo === "dono"
        ? "cadastro.html?perfil=empresa&mode=login"
        : "cadastro.html?perfil=cliente&mode=login";
    }

    confirmForm?.addEventListener("submit", guardAction(async (e) => {
      e.preventDefault();
      if (confirmando) return;
      const novaSenha = document.getElementById("reset-new-password")?.value || "";
      const novaSenhaConfirm = document.getElementById("reset-confirm-password")?.value || "";
      if (AutoShinePassword.erroSenha(novaSenha)) { notify(AutoShinePassword.erroSenha(novaSenha), "error"); return; }
      if (novaSenha !== novaSenhaConfirm) { notify("As senhas não coincidem.", "error"); return; }

      confirmando = true;
      const btn = confirmForm.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      try {
        const res = await fetch("/api/reset-senha/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, novaSenha, tipo }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "RESET_TOKEN_INVALIDO") {
            confirmForm.classList.add("hidden");
            invalidToken?.classList.remove("hidden");
          } else {
            notify(data.error || "Erro ao redefinir senha.", "error");
          }
          return;
        }
        if (tipo === "dono") clearDonoToken();
        else clearCurrentUser();
        confirmForm.reset();
        window.history.replaceState({}, "", `reset-senha.html?tipo=${tipo}`);
        confirmForm.classList.add("hidden");
        confirmSuccess?.classList.remove("hidden");
      } catch {
        notify("Erro de conexão. Tente novamente.", "error");
      } finally {
        confirmando = false;
        if (btn) btn.disabled = false;
      }
    }));
  } else {
    if (tipoInput) tipoInput.value = tipo;

    requestForm?.addEventListener("submit", guardAction(async (e) => {
      e.preventDefault();
      if (solicitando) return;
      const email = document.getElementById("reset-email")?.value.trim() || "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        notify("Informe um email válido.", "error");
        return;
      }

      solicitando = true;
      const btn = requestForm.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      try {
        const res = await fetch("/api/reset-senha/solicitar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, tipo }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify(data.error || "Erro ao enviar email.", "error");
          return;
        }
        requestForm.classList.add("hidden");
        requestSuccess?.classList.remove("hidden");
      } catch {
        notify("Erro de conexão. Tente novamente.", "error");
      } finally {
        solicitando = false;
        if (btn) btn.disabled = false;
      }
    }));
  }
}

// ── Inicialização por página ─────────────────────────────────────────────────
if (page === "home" || page === "servicos") {
  renderOwnerShopsOnHome();
  initCategoryFilter();
  initUseLocation();
  initSortBar();
}

if (page === "mapa") {
  initMapInteractions();
}

if (page === "agendamento") {
  initBookingForm();
}

if (page === "meus-agendamentos") {
  initUserBookingsPage();
}

if (page === "avaliacoes") {
  initReviewsPage();
}

if (page === "cadastro") {
  initAuthPage();
  initOwnerRegisterPage();
  initUnifiedOwnerLogin();
  initAccountTypeSelector();
}

if (page === "perfil") {
  initProfilePage();
}
if (page === "perfil-usuario") initUserProfilePage();
if (page === "perfil-dono") initOwnerProfilePage();

if (page === "parceiro") {
  initPartnerPage();
}

if (page === "cadastro-dono") {
  initOwnerRegisterPage();
  initPartnerPage();
}

if (page === "admin") {
  initAdminPage();
}

if (page === "favoritos") {
  initFavoritesPage();
}

if (page === "reset-senha") {
  initResetSenhaPage();
}

initializePasswordVisibilityToggles();
initializeAuthRequiredLinks();
setActiveNavLink();
updateNavAuthState();
updatePartnerNavState();
initializeSiteFooter();
updateNavAuthState();
initializeReportActions();
initFavoriteButtonHandling();
initHamburgerMenu();

// ── Menu hamburger mobile ────────────────────────────────────────────────────
function initHamburgerMenu() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;

  function openMenu() {
    document.querySelectorAll(".topbar > .user-menu .user-menu-panel").forEach((panel) => {
      panel.hidden = true;
      panel.closest(".user-menu")?.querySelector(".user-menu-button")?.setAttribute("aria-expanded", "false");
    });
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  toggle.addEventListener("click", () => {
    nav.classList.contains("is-open") ? closeMenu() : openMenu();
  });

  nav.querySelectorAll("a, .nav-logout").forEach((el) => {
    el.addEventListener("click", closeMenu);
  });

  nav.addEventListener("click", (e) => {
    if (e.target === nav) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) closeMenu();
  });

  // Ensure toggle stays above overlay
  toggle.style.position = "relative";
  toggle.style.zIndex = "350";
}

// ── Painel Admin ─────────────────────────────────────────────────────────────
function getAdminToken() {
  const token = localStorage.getItem(adminTokenKey);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.role === "admin" && payload.adminRole) || (!payload.role && payload.adminRole) ? token : null;
  } catch {
    return null;
  }
}
function setAdminToken(t) {
  localStorage.removeItem(currentUserStorageKey);
  localStorage.removeItem(authTokenStorageKey);
  localStorage.removeItem(donoTokenKey);
  localStorage.setItem(adminTokenKey, t);
  updateNavAuthState();
  updatePartnerNavState();
}
function clearAdminToken() {
  localStorage.removeItem(adminTokenKey);
  updateNavAuthState();
  updatePartnerNavState();
}

function adminFetch(path, options = {}) {
  const token = getAdminToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

async function initAdminPage() {
  const authShell = document.getElementById("admin-auth-shell");
  const managementShell = document.getElementById("admin-management-shell");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const sessionLabel = document.getElementById("admin-session-label");
  const tbody = document.getElementById("admin-shops-tbody");
  const countLabel = document.getElementById("admin-shops-count");
  const emptyMsg = document.getElementById("admin-empty");
  const refreshBtn = document.getElementById("admin-refresh-btn");
  const shopHealthFilterButtons = document.querySelectorAll("[data-health-filter]");
  const shopApprovalFilter = document.getElementById("admin-shop-approval-filter");
  const adminPeriodButtons = document.querySelectorAll("[data-admin-period]");
  const adminCustomDateForm = document.getElementById("admin-custom-date-form");
  const adminCustomDateStart = document.getElementById("admin-custom-date-start");
  const adminCustomDateEnd = document.getElementById("admin-custom-date-end");
  const adminDashboardRefreshBtn = document.getElementById("admin-dashboard-refresh-btn");
  const adminDashboardError = document.getElementById("admin-dashboard-error");
  const adminBookingChart = document.getElementById("admin-booking-chart");
  const adminRevenueChart = document.getElementById("admin-revenue-chart");
  const adminChartModeButtons = document.querySelectorAll("[data-admin-chart-type]");
  const adminChartModes = { revenue: "pie", bookings: "pie" };
  let rerenderAdminCharts = () => {};
  const adminDashboardRange = document.getElementById("admin-dashboard-range");
  const adminTrendRevenueTotal = document.getElementById("admin-trend-revenue-total");
  const adminTrendBookingsTotal = document.getElementById("admin-trend-bookings-total");
  const adminRankingBookings = document.getElementById("admin-ranking-bookings");
  const adminRankingRatings = document.getElementById("admin-ranking-ratings");
  const adminRankingFavorites = document.getElementById("admin-ranking-favorites");
  const adminPendingReports = document.getElementById("admin-pending-reports");
  const adminPendingShops = document.getElementById("admin-pending-shops");
  const adminPendingBookings = document.getElementById("admin-pending-bookings");
  const adminQuickLinks = document.querySelectorAll("[data-admin-go-tab]");
  const adminKpiSignups = document.getElementById("admin-kpi-signups");
  const adminKpiBookings = document.getElementById("admin-kpi-bookings");
  const adminKpiCancellations = document.getElementById("admin-kpi-cancellations");
  const adminKpiRating = document.getElementById("admin-kpi-rating");
  const adminKpiRatingCount = document.getElementById("admin-kpi-rating-count");
  const adminKpiGmv = document.getElementById("admin-kpi-gmv");
  const adminKpiPlatformRevenue = document.getElementById("admin-kpi-platform-revenue");
  const adminKpiPlatformRate = document.getElementById("admin-kpi-platform-rate");
  const adminKpiAverageTicket = document.getElementById("admin-kpi-average-ticket");
  const adminFinanceNote = document.getElementById("admin-finance-note");
  const editPanel = document.getElementById("admin-edit-panel");
  const shopForm = document.getElementById("admin-shop-form");
  const formTitle = document.getElementById("admin-form-title");
  const shopIdInput = document.getElementById("admin-shop-id");
  const ownerNameInput = document.getElementById("admin-owner-name");
  const ownerLoginInput = document.getElementById("admin-owner-login");
  const ownerCnpjInput = document.getElementById("admin-owner-cnpj");
  const ownerPasswordInput = document.getElementById("admin-owner-password");
  const shopNameInput = document.getElementById("admin-shop-name");
  const shopSummaryInput = document.getElementById("admin-shop-summary");
  const shopAddressInput = document.getElementById("admin-shop-address");
  const shopLatitudeInput = document.getElementById("admin-shop-latitude");
  const shopLongitudeInput = document.getElementById("admin-shop-longitude");
  const shopCategoryInput = document.getElementById("admin-shop-category");
  const shopPriceInput = document.getElementById("admin-shop-price");
  const shopPhotoInput = document.getElementById("admin-shop-photo");
  const shopCoverInput = document.getElementById("admin-shop-cover");
  const shopGalleryInput = document.getElementById("admin-shop-gallery");
  const shopPaymentsInput = document.getElementById("admin-shop-payments");
  const shopCancellationInput = document.getElementById("admin-shop-cancellation");
  const shopBlockedInput = document.getElementById("admin-shop-blocked");
  const servicesList = document.getElementById("admin-services-list");
  const addServiceBtn = document.getElementById("admin-add-service");
  const submitBtn = document.getElementById("admin-submit-btn");
  const cancelEditBtn = document.getElementById("admin-cancel-edit");
  const formFeedback = document.getElementById("admin-form-feedback");
  const adminTabs = document.querySelectorAll("[data-admin-tab]");
  const adminSections = document.querySelectorAll("[data-admin-section]");
  const usersTbody = document.getElementById("admin-users-tbody");
  const ownersTbody = document.getElementById("admin-owners-tbody");
  const bookingsTbody = document.getElementById("admin-bookings-tbody");
  const reviewsTbody = document.getElementById("admin-reviews-tbody");
  const reportsTbody = document.getElementById("admin-reports-tbody");
  const usersCount = document.getElementById("admin-users-count");
  const ownersCount = document.getElementById("admin-owners-count");
  const bookingsCount = document.getElementById("admin-bookings-count");
  const reviewsCount = document.getElementById("admin-reviews-count");
  const reportsCount = document.getElementById("admin-reports-count");
  const usersEmpty = document.getElementById("admin-users-empty");
  const ownersEmpty = document.getElementById("admin-owners-empty");
  const bookingsEmpty = document.getElementById("admin-bookings-empty");
  const reviewsEmpty = document.getElementById("admin-reviews-empty");
  const reportsEmpty = document.getElementById("admin-reports-empty");
  const reportDialog = document.getElementById("admin-report-dialog");
  const reportDialogTitle = document.getElementById("admin-report-dialog-title");
  const reportAccusation = document.getElementById("admin-report-accusation");
  const reportDefense = document.getElementById("admin-report-defense");
  const reportOpinion = document.getElementById("admin-report-opinion");
  let selectedAdminReport = null;
  let adminReports = [];
  let adminAttachmentObjectUrls = [];
  const userEditPanel = document.getElementById("admin-user-edit-panel");
  const userForm = document.getElementById("admin-user-form");
  const userFormTitle = document.getElementById("admin-user-form-title");
  const userIdInput = document.getElementById("admin-user-id");
  const userNameInput = document.getElementById("admin-user-name");
  const userEmailInput = document.getElementById("admin-user-email");
  const userCpfInput = document.getElementById("admin-user-cpf");
  const userPhoneInput = document.getElementById("admin-user-phone");
  const userPasswordInput = document.getElementById("admin-user-password");
  const userSubmitBtn = document.getElementById("admin-user-submit");
  const userCancelBtn = document.getElementById("admin-user-cancel");
  const userFeedback = document.getElementById("admin-user-feedback");
  const ownerEditPanel = document.getElementById("admin-owner-edit-panel");
  const ownerForm = document.getElementById("admin-owner-form");
  const ownerFormTitle = document.getElementById("admin-owner-form-title");
  const ownerEditIdInput = document.getElementById("admin-owner-edit-id");
  const ownerEditNameInput = document.getElementById("admin-owner-edit-name");
  const ownerEditLoginInput = document.getElementById("admin-owner-edit-login");
  const ownerEditCnpjInput = document.getElementById("admin-owner-edit-cnpj");
  const ownerEditPasswordInput = document.getElementById("admin-owner-edit-password");
  const ownerSubmitBtn = document.getElementById("admin-owner-submit");
  const ownerCancelBtn = document.getElementById("admin-owner-cancel");
  const ownerFeedback = document.getElementById("admin-owner-feedback");
  const reviewEditPanel = document.getElementById("admin-review-edit-panel");
  const reviewForm = document.getElementById("admin-review-form");
  const reviewFormTitle = document.getElementById("admin-review-form-title");
  const reviewContext = document.getElementById("admin-review-context");
  const reviewIdInput = document.getElementById("admin-review-id");
  const reviewRatingInput = document.getElementById("admin-review-rating");
  const reviewCustomerNameInput = document.getElementById("admin-review-customer-name");
  const reviewPhotoInput = document.getElementById("admin-review-photo");
  const reviewCommentInput = document.getElementById("admin-review-comment");
  const reviewSubmitBtn = document.getElementById("admin-review-submit");
  const reviewCancelBtn = document.getElementById("admin-review-cancel");
  const reviewFeedback = document.getElementById("admin-review-feedback");

  if (!authShell || !managementShell || !loginForm || !tbody) return;
  let adminPeriod = 7;
  let adminCustomDateRange = null;
  const hojeDashboard = new Date();
  const hojeDashboardLocal = new Date(hojeDashboard.getTime() - hojeDashboard.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const inicioPadraoDashboard = new Date(hojeDashboard);
  inicioPadraoDashboard.setDate(inicioPadraoDashboard.getDate() - 6);
  const inicioPadraoDashboardLocal = new Date(inicioPadraoDashboard.getTime() - inicioPadraoDashboard.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (adminCustomDateStart) {
    adminCustomDateStart.value = inicioPadraoDashboardLocal;
    adminCustomDateStart.max = hojeDashboardLocal;
  }
  if (adminCustomDateEnd) {
    adminCustomDateEnd.value = hojeDashboardLocal;
    adminCustomDateEnd.max = hojeDashboardLocal;
  }

  function onlyDigitsAdmin(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeNumberAdmin(value) {
    const raw = String(value || "").replace(",", ".").trim();
    return raw ? Number(raw) : 0;
  }

  function setFeedback(message, type = "") {
    if (!formFeedback) return;
    formFeedback.textContent = message || "";
    formFeedback.className = `admin-feedback${type ? ` is-${type}` : ""}`;
  }

  function setResourceFeedback(element, message, type = "") {
    if (!element) return;
    element.textContent = message || "";
    element.className = `admin-feedback${type ? ` is-${type}` : ""}`;
  }

  function emailAdminValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function showAuth() {
    authShell.classList.remove("hidden");
    managementShell.classList.add("hidden");
    hideEditPanel();
    hideAdminResourcePanels();
  }

  function showPanel() {
    authShell.classList.add("hidden");
    managementShell.classList.remove("hidden");
    if (sessionLabel) sessionLabel.textContent = "Administrador";
  }

  function hideEditPanel() {
    editPanel?.classList.add("hidden");
    shopForm?.reset();
    if (shopIdInput) shopIdInput.value = "";
    if (servicesList) servicesList.innerHTML = "";
    setFeedback("");
  }

  function hideUserEditPanel() {
    userEditPanel?.classList.add("hidden");
    userForm?.reset();
    if (userIdInput) userIdInput.value = "";
    setResourceFeedback(userFeedback, "");
  }

  function hideOwnerEditPanel() {
    ownerEditPanel?.classList.add("hidden");
    ownerForm?.reset();
    if (ownerEditIdInput) ownerEditIdInput.value = "";
    setResourceFeedback(ownerFeedback, "");
  }

  function hideReviewEditPanel() {
    reviewEditPanel?.classList.add("hidden");
    reviewForm?.reset();
    if (reviewIdInput) reviewIdInput.value = "";
    if (reviewContext) reviewContext.textContent = "";
    setResourceFeedback(reviewFeedback, "");
  }

  function hideAdminResourcePanels() {
    hideUserEditPanel();
    hideOwnerEditPanel();
    hideReviewEditPanel();
  }

  function formatAdminDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function statusBadge(status) {
    const value = String(status || "-");
    const normalized = value.toLowerCase();
    const labels = {
      ativo: "Ativo",
      aberta: "Pendente",
      pendente: "Pendente",
      bloqueado: "Bloqueado",
      em_analise: "Em análise",
      aguardando_defesa: "Aguardando defesa",
      contestada: "Contestada",
      resolvida: "Resolvida",
      procedente: "Procedente",
      rejeitada: "Rejeitada",
      arquivada: "Arquivada",
    };
    const safe = escapeHtml(labels[normalized] || value);
    const className = normalized === "finalizado" || normalized === "resolvida" || normalized === "procedente" || normalized === "ativo"
      ? "admin-status-active"
      : normalized === "cancelado" || normalized === "expirado" || normalized === "arquivada" || normalized === "rejeitada" || normalized === "bloqueado"
        ? "admin-status-blocked"
        : "admin-status-pending";
    return `<span class="admin-status ${className}">${safe}</span>`;
  }

  function setAdminSection(name) {
    adminTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === name));
    adminSections.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.adminSection !== name);
      section.classList.toggle("active", section.dataset.adminSection === name);
    });
  }

  function buildServiceRow(servico = {}) {
    if (!servicesList) return;
    const row = document.createElement("div");
    row.className = "admin-service-row";
    const preco = Number.isFinite(Number(servico.preco)) ? Number(servico.preco) : "";
    row.innerHTML = `
      <input type="hidden" data-admin-service-id value="${servico.id ? escapeHtml(servico.id) : ""}" />
      <div class="field-grid">
        <div class="field">
          <label>Nome do serviço</label>
          <input data-admin-service-field="nome" type="text" value="${escapeHtml(servico.nome || "")}" required />
        </div>
        <div class="field">
          <label>Preço</label>
          <input data-admin-service-field="preco" type="number" min="0" step="0.01" value="${escapeHtml(preco)}" required />
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label>Duração</label>
          <input data-admin-service-field="duracao" type="text" value="${escapeHtml(servico.duracao || "")}" placeholder="Ex: 45 min" required />
        </div>
        <div class="field admin-service-remove-field">
          <label>&nbsp;</label>
          <button class="btn btn-ghost admin-action-btn" type="button" data-admin-remove-service>Remover</button>
        </div>
      </div>
      <div class="field">
        <label>Descrição</label>
        <textarea data-admin-service-field="descricao" rows="2" required>${escapeHtml(servico.descricao || "")}</textarea>
      </div>
    `;
    servicesList.appendChild(row);
  }

  function ensureServiceRow() {
    if (servicesList && !servicesList.querySelector(".admin-service-row")) buildServiceRow();
  }

  function readServices() {
    if (!servicesList) return [];
    return [...servicesList.querySelectorAll(".admin-service-row")]
      .map((row) => {
        const id = row.querySelector("[data-admin-service-id]")?.value.trim();
        const nome = row.querySelector('[data-admin-service-field="nome"]')?.value.trim() || "";
        const descricao = row.querySelector('[data-admin-service-field="descricao"]')?.value.trim() || "";
        const precoRaw = row.querySelector('[data-admin-service-field="preco"]')?.value.trim() || "";
        const duracao = row.querySelector('[data-admin-service-field="duracao"]')?.value.trim() || "";
        if (!id && !nome && !descricao && !precoRaw && !duracao) return null;
        return {
          ...(id ? { id: Number(id) } : {}),
          nome,
          descricao,
          preco: precoRaw ? Number(precoRaw.replace(",", ".")) : NaN,
          duracao,
        };
      })
      .filter(Boolean);
  }

  function fillEditForm(loja) {
    editPanel?.classList.remove("hidden");
    if (shopIdInput) shopIdInput.value = loja.id || "";
    if (formTitle) formTitle.textContent = `Editar ${loja.nome || "loja"}`;
    if (ownerNameInput) ownerNameInput.value = loja.dono?.nome || "";
    if (ownerLoginInput) ownerLoginInput.value = loja.dono?.login || "";
    if (ownerCnpjInput) ownerCnpjInput.value = loja.dono?.cnpj || "";
    if (ownerPasswordInput) ownerPasswordInput.value = "";
    if (shopNameInput) shopNameInput.value = loja.nome || "";
    if (shopSummaryInput) shopSummaryInput.value = loja.descricao || "";
    if (shopAddressInput) shopAddressInput.value = loja.endereco || "";
    if (shopLatitudeInput) shopLatitudeInput.value = loja.latitude ?? "";
    if (shopLongitudeInput) shopLongitudeInput.value = loja.longitude ?? "";
    if (shopCategoryInput) shopCategoryInput.value = loja.categoria || "";
    if (shopPriceInput) shopPriceInput.value = loja.precoMedio ?? "";
    if (shopPhotoInput) shopPhotoInput.value = loja.fotoUrl || "";
    if (shopCoverInput) shopCoverInput.value = loja.capaUrl || "";
    if (shopGalleryInput) shopGalleryInput.value = parseTextList(loja.fotosAdicionais).join("\n");
    if (shopPaymentsInput) shopPaymentsInput.value = loja.formasPagamento || "";
    if (shopCancellationInput) shopCancellationInput.value = loja.politicaCancelamento || "";
    if (shopBlockedInput) shopBlockedInput.checked = Boolean(loja.bloqueado);

    if (servicesList) {
      servicesList.innerHTML = "";
      (loja.servicos || []).forEach(buildServiceRow);
      ensureServiceRow();
    }
    setFeedback("Editando loja selecionada.", "success");
    editPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillUserEditForm(usuario) {
    userEditPanel?.classList.remove("hidden");
    if (userIdInput) userIdInput.value = usuario.id || "";
    if (userFormTitle) userFormTitle.textContent = `Editar ${usuario.nome || "usuário"}`;
    if (userNameInput) userNameInput.value = usuario.nome || "";
    if (userEmailInput) userEmailInput.value = usuario.email || "";
    if (userCpfInput) userCpfInput.value = usuario.cpf || "";
    if (userPhoneInput) userPhoneInput.value = usuario.telefone || "";
    if (userPasswordInput) userPasswordInput.value = "";
    setResourceFeedback(userFeedback, "Editando usuário selecionado.", "success");
    userEditPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillOwnerEditForm(dono) {
    ownerEditPanel?.classList.remove("hidden");
    if (ownerEditIdInput) ownerEditIdInput.value = dono.id || "";
    if (ownerFormTitle) ownerFormTitle.textContent = `Editar ${dono.nome || "parceiro"}`;
    if (ownerEditNameInput) ownerEditNameInput.value = dono.nome || "";
    if (ownerEditLoginInput) ownerEditLoginInput.value = dono.login || "";
    if (ownerEditCnpjInput) ownerEditCnpjInput.value = dono.cnpj || "";
    if (ownerEditPasswordInput) ownerEditPasswordInput.value = "";
    setResourceFeedback(ownerFeedback, "Editando parceiro selecionado.", "success");
    ownerEditPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillReviewEditForm(review) {
    const cliente = review.usuario?.nome || review.nomeCliente || "Cliente";
    reviewEditPanel?.classList.remove("hidden");
    if (reviewIdInput) reviewIdInput.value = review.id || "";
    if (reviewFormTitle) reviewFormTitle.textContent = `Editar avaliação #${review.id || ""}`.trim();
    if (reviewContext) reviewContext.textContent = `${review.loja?.nome || "Loja"} / ${cliente}`;
    if (reviewRatingInput) reviewRatingInput.value = review.nota || "";
    if (reviewCustomerNameInput) reviewCustomerNameInput.value = review.nomeCliente || "";
    if (reviewPhotoInput) reviewPhotoInput.value = review.fotoUrl || "";
    if (reviewCommentInput) reviewCommentInput.value = review.comentario || "";
    setResourceFeedback(reviewFeedback, "Editando avaliação selecionada.", "success");
    reviewEditPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAdminRanking(list, entries, valueLabel) {
    if (!list) return;
    if (!entries.length) {
      list.innerHTML = `<li>Sem dados para este período.</li>`;
      return;
    }
    list.innerHTML = entries.map((entry) => `
      <li>
        <strong title="${escapeHtml(entry.nome)}">${escapeHtml(entry.nome)}</strong>
        <span>${valueLabel(entry)}</span>
      </li>
    `).join("");
  }

  function renderAdminTrendChart(container, series, key, color, formatValue, metricLabel, chartType = "line") {
    if (!container) return;
    if (!series.length) {
      container.innerHTML = `<p class="admin-trend-empty">Sem dados para este período.</p>`;
      return;
    }

    if (chartType === "pie") {
      const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      const formatDayMonth = (date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucketsByMonth = new Map();
      series.forEach((item) => {
        const [year, month, day] = item.data.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        let bucket = bucketsByMonth.get(monthKey);
        if (!bucket) {
          bucket = {
            label: monthFormatter.format(date),
            firstDate: date,
            lastDate: date,
            value: 0,
          };
          bucketsByMonth.set(monthKey, bucket);
        }
        bucket.lastDate = date;
        bucket.value += Number(item[key]) || 0;
      });
      const buckets = [...bucketsByMonth.values()].map((bucket) => ({
        ...bucket,
        dateRange: `${formatDayMonth(bucket.firstDate)} a ${formatDayMonth(bucket.lastDate)}`,
      }));

      const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
      if (!total) {
        container.innerHTML = `<p class="admin-trend-empty">Sem ${escapeHtml(metricLabel)} neste período.</p>`;
        return;
      }

      const colors = ["#4dabf7", "#2dd4bf", "#fbbf24", "#c084fc", "#fb7185", "#22d3ee", "#a3e635", "#818cf8", "#f97316", "#14b8a6", "#e879f9", "#84cc16"];
      const circumference = 2 * Math.PI * 72;
      let offset = 0;
      const segments = buckets.map((bucket, index) => {
        if (bucket.value <= 0) return "";
        const segmentLength = (bucket.value / total) * circumference;
        const visibleLength = Math.max(0, segmentLength - 1.5);
        const percentage = (bucket.value / total) * 100;
        const percentageLabel = `${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
        const description = `${bucket.label}, dias ${bucket.dateRange}: ${formatValue(bucket.value)} de ${metricLabel}, ${percentageLabel} do total`;
        const segment = `
          <circle class="admin-pie-segment" cx="100" cy="100" r="72" stroke="${colors[index % colors.length]}"
            stroke-dasharray="${visibleLength} ${circumference - visibleLength}" stroke-dashoffset="${-offset}"
            tabindex="0" role="img" aria-label="${escapeHtml(description)}">
            <title>${escapeHtml(description)}</title>
          </circle>`;
        offset += segmentLength;
        return segment;
      }).join("");
      const legend = buckets.map((bucket, index) => {
        if (bucket.value <= 0) return "";
        const percentage = (bucket.value / total) * 100;
        return `
          <li>
            <span class="admin-pie-swatch" style="--admin-pie-color:${colors[index % colors.length]}"></span>
            <span class="admin-pie-legend-copy">
              <strong>${escapeHtml(bucket.label)}</strong>
              <small>Dias ${escapeHtml(bucket.dateRange)} · ${escapeHtml(formatValue(bucket.value))} · ${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total</small>
            </span>
          </li>`;
      }).join("");

      container.innerHTML = `
        <div class="admin-pie-layout">
          <div class="admin-pie-visual">
            <svg class="admin-pie-svg" viewBox="0 0 200 200" role="group" aria-label="Distribuição mensal de ${escapeHtml(metricLabel)} em ${buckets.length} meses. Passe o foco sobre uma fatia para consultar o mês, os dias incluídos, o valor e a porcentagem.">
              <circle class="admin-pie-track" cx="100" cy="100" r="72"></circle>
              <g transform="rotate(-90 100 100)">${segments}</g>
            </svg>
            <div class="admin-pie-center"><strong>${escapeHtml(formatValue(total))}</strong><span>Total no período</span></div>
          </div>
          <div class="admin-pie-details">
            <p class="admin-pie-help">Cada cor representa um mês. “Dias” mostra o intervalo somado: quando o mês inteiro estiver selecionado, vai do dia 01 até o último dia do mês. O valor e o percentual mostram a participação desse intervalo no total.</p>
            <ul class="admin-pie-legend">${legend}</ul>
          </div>
        </div>`;
      return;
    }

    const width = Math.max(680, series.length * 22 + 60);
    const height = 230;
    const margin = { top: 20, right: 18, bottom: 42, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(1, ...series.map((item) => Number(item[key]) || 0));
    const points = series.map((item, index) => {
      const value = Number(item[key]) || 0;
      const x = margin.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
      const y = margin.top + plotHeight - (value / maxValue) * plotHeight;
      return { item, value, x, y };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `${margin.left},${margin.top + plotHeight} ${line} ${margin.left + plotWidth},${margin.top + plotHeight}`;
    const labelStride = Math.max(1, Math.ceil(series.length / 7));
    const grid = [0, 0.5, 1].map((fraction) => {
      const y = margin.top + plotHeight * fraction;
      const value = maxValue * (1 - fraction);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" class="admin-trend-gridline" />
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="admin-trend-axis-label">${escapeHtml(formatValue(value))}</text>`;
    }).join("");
    const dateLabels = points.map((point, index) => {
      if (index % labelStride !== 0 && index !== points.length - 1) return "";
      return `<text x="${point.x}" y="${height - 12}" text-anchor="middle" class="admin-trend-axis-label">${escapeHtml(point.item.label)}</text>`;
    }).join("");
    const dots = points.map(({ item, value, x, y }) => {
      const description = `${item.label}: ${formatValue(value)} ${metricLabel}`;
      return `<circle cx="${x}" cy="${y}" r="4" class="admin-trend-point" tabindex="0" aria-label="${escapeHtml(description)}"><title>${escapeHtml(description)}</title></circle>`;
    }).join("");
    const gradientId = `admin-trend-gradient-${key}`;

    container.innerHTML = `
      <div class="admin-trend-scroll">
        <svg class="admin-trend-svg" style="--admin-trend-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricLabel)} ao longo de ${series.length} dias">
          <defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".3" /><stop offset="100%" stop-color="${color}" stop-opacity="0" /></linearGradient></defs>
          ${grid}
          <polygon points="${area}" fill="url(#${gradientId})" />
          <polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          ${dots}
          ${dateLabels}
        </svg>
      </div>`;
  }

  async function loadDashboard() {
    try {
      const dashboardQuery = adminCustomDateRange
        ? `inicio=${encodeURIComponent(adminCustomDateRange.inicio)}&fim=${encodeURIComponent(adminCustomDateRange.fim)}`
        : `periodo=${adminPeriod}`;
      const res = await adminFetch(`/api/admin/dashboard?${dashboardQuery}`);
      if (res.status === 401 || res.status === 403) {
        clearAdminToken();
        showAuth();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar o painel.");
      const indicadores = data.indicadores || {};
      const pendencias = data.pendencias || {};
      const rankings = data.rankings || {};
      const serieDiaria = Array.isArray(data.agendamentosPorDia) ? data.agendamentosPorDia : [];
      const formatCurrency = (value) => Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      if (adminDashboardError) adminDashboardError.textContent = "";
      if (adminKpiSignups) adminKpiSignups.textContent = Number(indicadores.novosCadastros || 0).toLocaleString("pt-BR");
      if (adminKpiBookings) adminKpiBookings.textContent = Number(indicadores.agendamentos || 0).toLocaleString("pt-BR");
      if (adminKpiCancellations) adminKpiCancellations.textContent = `${Number(indicadores.taxaCancelamento || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
      if (adminKpiRating) adminKpiRating.textContent = indicadores.notaMedia == null ? "—" : Number(indicadores.notaMedia).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      if (adminKpiRatingCount) {
        const total = Number(indicadores.totalAvaliacoes || 0);
        adminKpiRatingCount.textContent = `${total} avaliação${total === 1 ? "" : "s"} no período`;
      }
      if (adminKpiGmv) adminKpiGmv.textContent = formatCurrency(indicadores.gmvEstimado);
      if (adminKpiPlatformRevenue) adminKpiPlatformRevenue.textContent = formatCurrency(indicadores.receitaPlataformaEstimada);
      if (adminKpiPlatformRate) {
        const rate = Number(indicadores.taxaComissaoSimuladaPercent || 0);
        adminKpiPlatformRate.textContent = `Comissão simulada: ${rate.toLocaleString("pt-BR")}%`;
      }
      if (adminKpiAverageTicket) adminKpiAverageTicket.textContent = formatCurrency(indicadores.ticketMedioEstimado);
      if (adminFinanceNote) {
        const legacyBookings = Number(indicadores.agendamentosSemValorHistorico || 0);
        adminFinanceNote.textContent = legacyBookings
          ? `Reservas canceladas ficam fora da soma. Não há pagamentos integrados; ${legacyBookings} reserva(s) sem preço histórico usa(m) o valor atual do serviço. A comissão é uma simulação.`
          : "Reservas canceladas ficam fora da soma. Não há pagamentos integrados; o valor usa o preço salvo na reserva e a comissão é uma simulação.";
      }
      if (adminDashboardRange && data.intervalo) {
        const formatDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
        adminDashboardRange.textContent = `Dados de ${formatDate(data.intervalo.inicio)} a ${formatDate(data.intervalo.fim)}`;
      }
      if (adminPendingReports) adminPendingReports.textContent = String(pendencias.denunciasAbertas ?? 0);
      if (adminPendingShops) adminPendingShops.textContent = String(pendencias.lojasPendentes ?? 0);
      if (adminPendingBookings) adminPendingBookings.textContent = String(pendencias.agendamentosAntigos ?? 0);
      rerenderAdminCharts = () => {
        renderAdminTrendChart(adminRevenueChart, serieDiaria, "receita", "#55a7ff", formatCurrency, "faturamento estimado", adminChartModes.revenue);
        renderAdminTrendChart(adminBookingChart, serieDiaria, "total", "#50d6ae", (value) => Math.round(value).toLocaleString("pt-BR"), "agendamentos", adminChartModes.bookings);
      };
      rerenderAdminCharts();
      if (adminTrendRevenueTotal) adminTrendRevenueTotal.textContent = formatCurrency(indicadores.gmvEstimado);
      if (adminTrendBookingsTotal) adminTrendBookingsTotal.textContent = `${Number(indicadores.agendamentos || 0).toLocaleString("pt-BR")} agendamentos`;
      renderAdminRanking(adminRankingBookings, rankings.agendamentos || [], (item) => `${item.total} agendamento${item.total === 1 ? "" : "s"}`);
      renderAdminRanking(adminRankingRatings, rankings.avaliacoes || [], (item) => `★ ${Number(item.nota).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ${item.total}`);
      renderAdminRanking(adminRankingFavorites, rankings.favoritos || [], (item) => `${item.total} favorito${item.total === 1 ? "" : "s"}`);
    } catch {
      if (adminDashboardError) adminDashboardError.textContent = "Não foi possível carregar os indicadores. Tente atualizar o painel.";
    }
  }

  async function loadShops() {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Carregando...</td></tr>`;
    if (emptyMsg) emptyMsg.classList.add("hidden");
    try {
      const filters = new URLSearchParams();
      const selectedHealth = document.querySelector("[data-health-filter].is-active")?.dataset.healthFilter;
      if (selectedHealth) filters.set("health", selectedHealth);
      if (shopApprovalFilter?.value) filters.set("statusAprovacao", shopApprovalFilter.value);
      const query = filters.toString();
      const res = await adminFetch(`/api/admin/stores${query ? `?${query}` : ""}`);
      if (res.status === 401 || res.status === 403) {
        clearAdminToken();
        showAuth();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar lojas.");
      const lojas = Array.isArray(data.lojas) ? data.lojas : [];
      const healthCounts = data.healthCounts || {};
      const totalHealthCount = ["healthy", "warning", "critical"]
        .reduce((total, status) => total + Number(healthCounts[status] || 0), 0);
      document.querySelectorAll("[data-health-count]").forEach((counter) => {
        const status = counter.dataset.healthCount;
        counter.textContent = String(status === "all" ? totalHealthCount : Number(healthCounts[status] || 0));
      });

      const healthLabels = { HEALTHY: "Saudáveis", WARNING: "Em atenção", CRITICAL: "Críticas" };
      const approvalLabels = { aprovada: "Aprovadas", pendente: "Pendentes", rejeitada: "Rejeitadas" };
      const activeFilters = [
        selectedHealth ? healthLabels[selectedHealth] : "",
        shopApprovalFilter?.value ? `Aprovação: ${approvalLabels[shopApprovalFilter.value]}` : "",
      ].filter(Boolean);
      if (countLabel) {
        countLabel.textContent = activeFilters.length
          ? `${lojas.length} de ${totalHealthCount} lojas · ${activeFilters.join(" · ")}`
          : `${lojas.length} lava jato${lojas.length !== 1 ? "s" : ""} no total`;
      }

      if (!lojas || !lojas.length) {
        tbody.innerHTML = "";
        if (emptyMsg) emptyMsg.classList.remove("hidden");
        if (emptyMsg) {
          emptyMsg.textContent = activeFilters.length
            ? "Nenhuma loja corresponde aos filtros selecionados."
            : "Nenhum lava jato cadastrado ainda.";
        }
        return;
      }

      if (emptyMsg) emptyMsg.classList.add("hidden");

      tbody.innerHTML = lojas.map((loja) => {
        const avg = loja.avaliacoes?.length
          ? (loja.avaliacoes.reduce((s, a) => s + a.nota, 0) / loja.avaliacoes.length).toFixed(1)
          : "-";
        const totalServicos = loja._count?.servicos ?? loja.servicos?.length ?? 0;
        const healthMeta = {
          healthy: { label: "Saudável", emoji: "🟢", className: "admin-health-healthy" },
          warning: { label: "Em atenção", emoji: "🟡", className: "admin-health-warning" },
          critical: { label: "Crítica", emoji: "🔴", className: "admin-health-critical" },
        };
        const health = healthMeta[loja.healthStatus] || { label: "Indisponível", emoji: "⚪", className: "admin-health-unknown" };
        const healthReasons = Array.isArray(loja.healthReasons) ? loja.healthReasons.join("\n") : "";
        const inativoAte = loja.inativoAte ? new Date(loja.inativoAte) : null;
        const temporariamenteInativa = inativoAte && inativoAte > new Date();
        const statusClass = loja.bloqueado || temporariamenteInativa || loja.statusAprovacao === "pendente" ? "admin-status-blocked" : "admin-status-active";
        const statusLabel = loja.bloqueado
          ? "Bloqueado"
          : temporariamenteInativa
            ? `Inativo até ${inativoAte.toLocaleDateString("pt-BR")}`
            : loja.statusAprovacao === "pendente"
              ? "Aguardando aprovação"
              : "Ativo";
        const toggleBtn = loja.bloqueado || temporariamenteInativa
          ? `<button class="btn btn-secondary admin-action-btn" data-action="desbloquear" data-id="${loja.id}">${temporariamenteInativa && !loja.bloqueado ? "Reativar" : "Desbloquear"}</button>`
          : `<button class="btn btn-secondary admin-action-btn" data-action="bloquear" data-id="${loja.id}">Bloquear</button>`;
        const inactivateBtn = !loja.bloqueado && !temporariamenteInativa
          ? `<button class="btn btn-danger admin-action-btn" data-action="inativar" data-id="${loja.id}" data-nome="${escapeHtml(loja.nome)}">Inativar 30 dias</button>`
          : "";
        const approvalBtn = loja.statusAprovacao === "pendente"
          ? `<button class="btn btn-secondary admin-action-btn" data-action="aprovar" data-id="${loja.id}">Aprovar</button>`
          : "";

        return `
          <tr data-shop-row="${loja.id}">
            <td>
              <div class="admin-shop-cell">
                <img class="admin-shop-thumb" src="${escapeHtml(loja.fotoUrl)}" alt="" />
                <div>
                  <strong>${escapeHtml(loja.nome)}</strong>
                  <p class="empty-copy">${escapeHtml(loja.endereco || "")}</p>
                </div>
              </div>
            </td>
            <td>
              <strong>${escapeHtml(loja.dono?.nome || "-")}</strong>
              <p class="empty-copy">${escapeHtml(loja.dono?.login || "")}</p>
            </td>
            <td>${totalServicos}</td>
            <td>${avg !== "-" ? `&#9733; ${avg}` : "-"}</td>
            <td><span class="admin-health-badge ${health.className}" title="${escapeHtml(healthReasons || "Indicadores operacionais dentro da normalidade.")}">${health.emoji} ${health.label}</span></td>
            <td><span class="admin-status ${statusClass}">${statusLabel}</span></td>
            <td class="admin-actions">
              <button class="btn btn-secondary admin-action-btn" data-action="editar" data-id="${loja.id}">Editar</button>
              ${approvalBtn}
              ${toggleBtn}
              ${inactivateBtn}
            </td>
          </tr>`;
      }).join("");
    } catch {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Erro ao carregar lojas.</td></tr>`;
    }
  }

  async function loadUsers() {
    if (!usersTbody) return;
    usersTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/usuarios");
      const { usuarios } = await res.json();
      if (!res.ok) throw new Error();
      if (usersCount) usersCount.textContent = `${usuarios.length} usuário${usuarios.length !== 1 ? "s" : ""} no total`;
      usersEmpty?.classList.toggle("hidden", Boolean(usuarios.length));
      usersTbody.innerHTML = usuarios.length ? usuarios.map((usuario) => {
        const suspenso = usuario.suspensoAte && new Date(usuario.suspensoAte) > new Date();
        const status = usuario.bloqueado ? "Bloqueado" : suspenso ? `Suspenso até ${formatAdminDate(usuario.suspensoAte)}` : "Ativo";
        const suspensionAction = !usuario.bloqueado
          ? `<button class="btn ${suspenso ? "btn-secondary" : "btn-danger"} admin-action-btn" data-admin-resource-action="${suspenso ? "unsuspend-user" : "suspend-user"}" data-id="${usuario.id}" data-name="${escapeHtml(usuario.nome)}">${suspenso ? "Remover suspensão" : "Suspender 30 dias"}</button>`
          : "";
        return `
        <tr>
          <td><strong>${escapeHtml(usuario.nome)}</strong><p class="empty-copy">#${usuario.id}</p></td>
          <td>${escapeHtml(usuario.email)}<p class="empty-copy">${escapeHtml(usuario.telefone || "-")}</p></td>
          <td>${usuario._count?.agendamentos || 0} agend. / ${usuario._count?.avaliacoes || 0} aval.</td>
          <td>${formatAdminDate(usuario.createdAt)}</td>
          <td>${statusBadge(status)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-user" data-id="${usuario.id}">Editar</button>
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="toggle-user-block" data-blocked="${usuario.bloqueado}" data-id="${usuario.id}" data-name="${escapeHtml(usuario.nome)}">${usuario.bloqueado ? "Desbloquear" : "Bloquear"}</button>
            ${suspensionAction}
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-user" data-id="${usuario.id}" data-name="${escapeHtml(usuario.nome)}">Excluir</button>
          </td>
        </tr>`;
      }).join("") : "";
    } catch {
      usersTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar usuários.</td></tr>`;
    }
  }

  async function loadOwners() {
    if (!ownersTbody) return;
    ownersTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/donos");
      const { donos } = await res.json();
      if (!res.ok) throw new Error();
      if (ownersCount) ownersCount.textContent = `${donos.length} parceiro${donos.length !== 1 ? "s" : ""} no total`;
      ownersEmpty?.classList.toggle("hidden", Boolean(donos.length));
      ownersTbody.innerHTML = donos.length ? donos.map((dono) => {
        const suspenso = dono.suspensoAte && new Date(dono.suspensoAte) > new Date();
        const status = dono.bloqueado ? "Bloqueado" : suspenso ? `Suspenso até ${formatAdminDate(dono.suspensoAte)}` : "Ativo";
        const suspensionAction = !dono.bloqueado
          ? `<button class="btn ${suspenso ? "btn-secondary" : "btn-danger"} admin-action-btn" data-admin-resource-action="${suspenso ? "unsuspend-owner" : "suspend-owner"}" data-id="${dono.id}" data-name="${escapeHtml(dono.nome)}">${suspenso ? "Remover suspensão" : "Suspender 30 dias"}</button>`
          : "";
        return `
        <tr>
          <td><strong>${escapeHtml(dono.nome)}</strong><p class="empty-copy">#${dono.id}</p></td>
          <td>${escapeHtml(dono.login)}<p class="empty-copy">${escapeHtml(dono.cnpj || "-")}</p></td>
          <td>${dono._count?.lojas || 0}</td>
          <td>${formatAdminDate(dono.createdAt)}</td>
          <td>${statusBadge(status)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-owner" data-id="${dono.id}">Editar</button>
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="toggle-owner-block" data-blocked="${dono.bloqueado}" data-id="${dono.id}" data-name="${escapeHtml(dono.nome)}">${dono.bloqueado ? "Desbloquear" : "Bloquear"}</button>
            ${suspensionAction}
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-owner" data-id="${dono.id}" data-name="${escapeHtml(dono.nome)}">Excluir</button>
          </td>
        </tr>`;
      }).join("") : "";
    } catch {
      ownersTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar parceiros.</td></tr>`;
    }
  }

  async function loadBookingsAdmin() {
    if (!bookingsTbody) return;
    bookingsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/agendamentos");
      const { agendamentos } = await res.json();
      if (!res.ok) throw new Error();
      if (bookingsCount) bookingsCount.textContent = `${agendamentos.length} agendamento${agendamentos.length !== 1 ? "s" : ""} listados`;
      bookingsEmpty?.classList.toggle("hidden", Boolean(agendamentos.length));
      bookingsTbody.innerHTML = agendamentos.length ? agendamentos.map((item) => `
        <tr>
          <td><strong>${escapeHtml(item.usuario?.nome || item.nomeCliente || "Cliente")}</strong><p class="empty-copy">${escapeHtml(item.usuario?.email || item.emailCliente || "-")}</p></td>
          <td>${escapeHtml(item.loja?.nome || "-")}</td>
          <td>${escapeHtml(bookingServiceName(item))}<p class="empty-copy">${escapeHtml(bookingPriceLabel(item))} · ${escapeHtml(bookingDurationLabel(item))}</p></td>
          <td>${escapeHtml(item.data)} ${escapeHtml(item.hora)}</td>
          <td>${statusBadge(item.status)}</td>
          <td class="admin-actions">
            ${item.regras?.podeConfirmar ? `<button class="btn btn-secondary" data-admin-resource-action="booking-status" data-status="confirmado" data-revision="${item.revisao}" data-id="${item.id}">Confirmar</button>` : ''}
            ${item.regras?.podeFinalizar ? `<button class="btn btn-secondary" data-admin-resource-action="booking-status" data-status="finalizado" data-revision="${item.revisao}" data-id="${item.id}">Finalizar</button>` : ''}
            ${item.regras?.podeCancelar ? `<button class="btn btn-ghost" data-admin-resource-action="booking-status" data-status="cancelado" data-revision="${item.revisao}" data-exception="${item.regras.exigeExcecaoPrazo}" data-id="${item.id}">Cancelar</button>` : ''}
            ${item.regras?.motivoFinalizar ? `<p class="empty-copy">${escapeHtml(item.regras.motivoFinalizar)}</p>` : ''}
            ${bookingHistoryHtml(item, 'admin')}
          </td>
        </tr>`).join("") : "";
    } catch {
      bookingsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar agendamentos.</td></tr>`;
    }
  }

  async function loadReviewsAdmin() {
    if (!reviewsTbody) return;
    reviewsTbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/avaliacoes");
      const { avaliacoes } = await res.json();
      if (!res.ok) throw new Error();
      if (reviewsCount) reviewsCount.textContent = `${avaliacoes.length} avaliação${avaliacoes.length !== 1 ? "es" : ""} listadas`;
      reviewsEmpty?.classList.toggle("hidden", Boolean(avaliacoes.length));
      reviewsTbody.innerHTML = avaliacoes.length ? avaliacoes.map((review) => `
        <tr>
          <td><strong>${escapeHtml(review.usuario?.nome || review.nomeCliente || "Cliente")}</strong><p class="empty-copy">${escapeHtml(review.usuario?.email || "-")}</p></td>
          <td>${escapeHtml(review.loja?.nome || "-")}</td>
          <td><span class="stars">&#9733; ${Number(review.nota || 0).toFixed(1)}</span></td>
          <td>${escapeHtml(review.comentario || "-")}</td>
          <td>${review._count?.denuncias || 0}</td>
          <td>${statusBadge(review.bloqueado ? "Bloqueado" : "Ativo")}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-review" data-id="${review.id}">Editar</button>
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="toggle-review-block" data-blocked="${review.bloqueado}" data-id="${review.id}">${review.bloqueado ? "Desbloquear" : "Bloquear"}</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-review" data-id="${review.id}">Excluir</button>
          </td>
        </tr>`).join("") : "";
    } catch {
      reviewsTbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Erro ao carregar avaliações.</td></tr>`;
    }
  }

  async function loadReportsAdmin() {
    if (!reportsTbody) return;
    reportsTbody.innerHTML = `<tr><td colspan="8" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/denuncias");
      const { denuncias } = await res.json();
      if (!res.ok) throw new Error();
      adminReports = Array.isArray(denuncias) ? denuncias : [];
      if (reportsCount) reportsCount.textContent = `${denuncias.length} denúncia${denuncias.length !== 1 ? "s" : ""} registradas`;
      reportsEmpty?.classList.toggle("hidden", Boolean(denuncias.length));
      reportsTbody.innerHTML = denuncias.length ? denuncias.map((report) => {
        const target = report.avaliacao ? `Avaliação #${report.avaliacao.id}` : report.agendamento ? `Agendamento #${report.agendamento.id}` : "Loja";
        const closed = ["procedente", "rejeitada", "resolvida", "arquivada"].includes(String(report.status || "").toLowerCase());
        return `
        <tr>
          <td><strong>${escapeHtml(report.tipo)}</strong><p class="empty-copy">${escapeHtml(report.usuario?.email || "sem usuário")}</p></td>
          <td>${escapeHtml(report.loja?.nome || target)}</td>
          <td>${escapeHtml(report.motivo)}</td>
          <td>${formatAdminDate(report.createdAt)}</td>
          <td>${statusBadge(report.status)}</td>
          <td>${String(report.status).toLowerCase() === "contestada" ? `<button class="btn btn-secondary admin-action-btn" data-admin-resource-action="view-report-defense" data-id="${report.id}">Ver defesa</button>` : "-"}</td>
          <td><details><summary>Ver detalhes</summary><p>${escapeHtml(report.detalhes || "Nenhum detalhe adicional.")}</p></details></td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="view-report-defense" data-id="${report.id}">${String(report.status).toLowerCase() === "contestada" ? "Ver defesa e decidir" : "Ver detalhes e decidir"}</button>
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="report-status" data-status="em_analise" data-id="${report.id}">Analisar</button>
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="report-status" data-status="resolvida" data-id="${report.id}">Resolver</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-report" data-id="${report.id}">Excluir</button>
          </td>
        </tr>`;
      }).join("") : "";
    } catch {
      reportsTbody.innerHTML = `<tr><td colspan="8" class="admin-loading">Erro ao carregar denúncias.</td></tr>`;
    }
  }

  async function refreshAdminData() {
    await Promise.all([
      loadDashboard(),
      loadShops(),
      loadUsers(),
      loadOwners(),
      loadBookingsAdmin(),
      loadReviewsAdmin(),
      loadReportsAdmin(),
    ]);
  }

  async function loadShopForEdit(id) {
    setFeedback("Carregando loja para edição...");
    try {
      const res = await adminFetch(`/api/admin/lojas/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || "Erro ao carregar loja.", "error");
        return;
      }
      fillEditForm(data.loja);
    } catch {
      setFeedback("Erro ao conectar com o servidor.", "error");
    }
  }

  async function loadUserForEdit(id) {
    setResourceFeedback(userFeedback, "Carregando usuário...");
    try {
      const res = await adminFetch(`/api/admin/usuarios/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(userFeedback, data.error || "Erro ao carregar usuário.", "error");
        return;
      }
      fillUserEditForm(data.usuario);
    } catch {
      setResourceFeedback(userFeedback, "Erro ao conectar com o servidor.", "error");
    }
  }

  async function loadOwnerForEdit(id) {
    setResourceFeedback(ownerFeedback, "Carregando parceiro...");
    try {
      const res = await adminFetch(`/api/admin/donos/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(ownerFeedback, data.error || "Erro ao carregar parceiro.", "error");
        return;
      }
      fillOwnerEditForm(data.dono);
    } catch {
      setResourceFeedback(ownerFeedback, "Erro ao conectar com o servidor.", "error");
    }
  }

  async function loadReviewForEdit(id) {
    setResourceFeedback(reviewFeedback, "Carregando avaliação...");
    try {
      const res = await adminFetch(`/api/admin/avaliacoes/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(reviewFeedback, data.error || "Erro ao carregar avaliação.", "error");
        return;
      }
      fillReviewEditForm(data.avaliacao);
    } catch {
      setResourceFeedback(reviewFeedback, "Erro ao conectar com o servidor.", "error");
    }
  }

  tbody.addEventListener("click", guardAction(async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const nome = btn.dataset.nome || "este lava jato";

    if (action === "editar") {
      await loadShopForEdit(id);
      return;
    }

    if (action === "inativar") {
      if (!(await confirmAction(`Inativar "${nome}" por 30 dias? Os dados e agendamentos serão preservados, e a loja voltará a aparecer automaticamente após esse prazo.`, { danger: true, confirmLabel: "Inativar" }))) return;
      const res = await adminFetch(`/api/admin/lojas/${id}/inativar`, { method: "PUT" });
      if (res.ok) {
        await refreshAdminData();
        notify("Lava jato inativado por 30 dias.", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        notify(data.error || "Erro ao inativar loja.", "error");
      }
      return;
    }

    if (action === "aprovar") {
      const res = await adminFetch(`/api/admin/lojas/${id}/aprovar`, { method: "PUT" });
      if (res.ok) {
        await refreshAdminData();
        notify("Loja aprovada e visível no marketplace.", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        notify(data.error || "Erro ao aprovar loja.", "error");
      }
      return;
    }

    if (action === "bloquear" || action === "desbloquear") {
      const res = await adminFetch(`/api/admin/lojas/${id}/${action}`, { method: "PUT" });
      if (res.ok) {
        await refreshAdminData();
        notify(action === "bloquear" ? "Lava jato bloqueado." : "Lava jato desbloqueado.", "success");
      } else {
        notify(`Erro ao ${action} loja.`, "error");
      }
    }
  }, '[data-action]'));

  shopForm?.addEventListener("submit", guardAction(async (e) => {
    e.preventDefault();
    const lojaId = shopIdInput?.value.trim();
    if (!lojaId) {
      setFeedback("Clique em Editar em uma loja antes de salvar.", "error");
      return;
    }

    const servicos = readServices();
    if (!servicos.length) {
      setFeedback("Adicione pelo menos um serviço.", "error");
      return;
    }

    const payload = {
      dono: {
        nome: ownerNameInput?.value.trim(),
        login: normalizeOwnerLogin(ownerLoginInput?.value),
        cnpj: onlyDigitsAdmin(ownerCnpjInput?.value),
        senha: ownerPasswordInput?.value || "",
      },
      loja: {
        nome: shopNameInput?.value.trim(),
        descricao: shopSummaryInput?.value.trim(),
        endereco: shopAddressInput?.value.trim(),
        latitude: normalizeNumberAdmin(shopLatitudeInput?.value),
        longitude: normalizeNumberAdmin(shopLongitudeInput?.value),
        precoMedio: normalizeNumberAdmin(shopPriceInput?.value),
        categoria: shopCategoryInput?.value.trim() || "serviços gerais",
        fotoUrl: shopPhotoInput?.value.trim(),
        capaUrl: shopCoverInput?.value.trim(),
        fotosAdicionais: parseTextList(shopGalleryInput?.value).join("\n"),
        formasPagamento: parseTextList(shopPaymentsInput?.value).join(", "),
        politicaCancelamento: shopCancellationInput?.value.trim(),
        bloqueado: Boolean(shopBlockedInput?.checked),
      },
      servicos,
    };

    setFeedback("Salvando alterações...");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await adminFetch(`/api/admin/lojas/${lojaId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || "Não foi possível salvar.", "error");
        return;
      }
      hideEditPanel();
      await refreshAdminData();
    } catch {
      setFeedback("Erro ao conectar com o servidor.", "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }));

  userForm?.addEventListener("submit", guardAction(async (e) => {
    e.preventDefault();
    const id = userIdInput?.value.trim();
    const nome = userNameInput?.value.trim() || "";
    const email = userEmailInput?.value.trim().toLowerCase() || "";
    const cpf = onlyDigitsAdmin(userCpfInput?.value);
    const telefone = onlyDigitsAdmin(userPhoneInput?.value);
    const senha = userPasswordInput?.value || "";

    if (!id) {
      setResourceFeedback(userFeedback, "Clique em Editar em um usuário antes de salvar.", "error");
      return;
    }
    if (!nome || !email || !emailAdminValido(email)) {
      setResourceFeedback(userFeedback, "Informe nome e email válido.", "error");
      return;
    }
    if (cpf && cpf.length !== 11) {
      setResourceFeedback(userFeedback, "CPF deve ter 11 dígitos.", "error");
      return;
    }
    if (telefone && telefone.length < 10) {
      setResourceFeedback(userFeedback, "Telefone deve ter ao menos 10 dígitos.", "error");
      return;
    }
    if (senha && AutoShinePassword.erroSenha(senha)) {
      setResourceFeedback(userFeedback, AutoShinePassword.erroSenha(senha), "error");
      return;
    }

    setResourceFeedback(userFeedback, "Salvando usuário...");
    if (userSubmitBtn) userSubmitBtn.disabled = true;
    try {
      const res = await adminFetch(`/api/admin/usuarios/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nome, email, cpf, telefone, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(userFeedback, data.error || "Não foi possível salvar usuário.", "error");
        return;
      }
      hideUserEditPanel();
      await refreshAdminData();
    } catch {
      setResourceFeedback(userFeedback, "Erro ao conectar com o servidor.", "error");
    } finally {
      if (userSubmitBtn) userSubmitBtn.disabled = false;
    }
  }));

  ownerForm?.addEventListener("submit", guardAction(async (e) => {
    e.preventDefault();
    const id = ownerEditIdInput?.value.trim();
    const nome = ownerEditNameInput?.value.trim() || "";
    const login = normalizeOwnerLogin(ownerEditLoginInput?.value);
    const cnpj = onlyDigitsAdmin(ownerEditCnpjInput?.value);
    const senha = ownerEditPasswordInput?.value || "";

    if (!id) {
      setResourceFeedback(ownerFeedback, "Clique em Editar em um parceiro antes de salvar.", "error");
      return;
    }
    if (!nome || login.length < 4) {
      setResourceFeedback(ownerFeedback, "Informe nome e login com pelo menos 4 caracteres.", "error");
      return;
    }
    if (cnpj && cnpj.length !== 14) {
      setResourceFeedback(ownerFeedback, "CNPJ deve ter 14 dígitos.", "error");
      return;
    }
    if (senha && AutoShinePassword.erroSenha(senha)) {
      setResourceFeedback(ownerFeedback, AutoShinePassword.erroSenha(senha), "error");
      return;
    }

    setResourceFeedback(ownerFeedback, "Salvando parceiro...");
    if (ownerSubmitBtn) ownerSubmitBtn.disabled = true;
    try {
      const res = await adminFetch(`/api/admin/donos/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nome, login, cnpj, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(ownerFeedback, data.error || "Não foi possível salvar parceiro.", "error");
        return;
      }
      hideOwnerEditPanel();
      await refreshAdminData();
    } catch {
      setResourceFeedback(ownerFeedback, "Erro ao conectar com o servidor.", "error");
    } finally {
      if (ownerSubmitBtn) ownerSubmitBtn.disabled = false;
    }
  }));

  reviewForm?.addEventListener("submit", guardAction(async (e) => {
    e.preventDefault();
    const id = reviewIdInput?.value.trim();
    const nota = Number(reviewRatingInput?.value);
    const nomeCliente = reviewCustomerNameInput?.value.trim() || "";
    const fotoUrl = reviewPhotoInput?.value.trim() || "";
    const comentario = reviewCommentInput?.value.trim() || "";

    if (!id) {
      setResourceFeedback(reviewFeedback, "Clique em Editar em uma avaliação antes de salvar.", "error");
      return;
    }
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      setResourceFeedback(reviewFeedback, "Nota deve ser um número inteiro entre 1 e 5.", "error");
      return;
    }

    setResourceFeedback(reviewFeedback, "Salvando avaliação...");
    if (reviewSubmitBtn) reviewSubmitBtn.disabled = true;
    try {
      const res = await adminFetch(`/api/admin/avaliacoes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nota, nomeCliente, fotoUrl, comentario }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResourceFeedback(reviewFeedback, data.error || "Não foi possível salvar avaliação.", "error");
        return;
      }
      hideReviewEditPanel();
      await refreshAdminData();
    } catch {
      setResourceFeedback(reviewFeedback, "Erro ao conectar com o servidor.", "error");
    } finally {
      if (reviewSubmitBtn) reviewSubmitBtn.disabled = false;
    }
  }));

  servicesList?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-admin-remove-service]");
    if (!removeBtn) return;
    removeBtn.closest(".admin-service-row")?.remove();
    ensureServiceRow();
  });

  addServiceBtn?.addEventListener("click", () => buildServiceRow());
  cancelEditBtn?.addEventListener("click", hideEditPanel);
  userCancelBtn?.addEventListener("click", hideUserEditPanel);
  ownerCancelBtn?.addEventListener("click", hideOwnerEditPanel);
  reviewCancelBtn?.addEventListener("click", hideReviewEditPanel);
  refreshBtn?.addEventListener("click", refreshAdminData);
  shopHealthFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      shopHealthFilterButtons.forEach((filterButton) => {
        const selected = filterButton === button;
        filterButton.classList.toggle("is-active", selected);
        filterButton.setAttribute("aria-pressed", String(selected));
      });
      loadShops();
    });
  });
  shopApprovalFilter?.addEventListener("change", loadShops);
  adminDashboardRefreshBtn?.addEventListener("click", refreshAdminData);
  adminChartModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const metric = button.dataset.adminChartType;
      const mode = button.dataset.chartMode;
      if (!(metric in adminChartModes) || !["pie", "line"].includes(mode)) return;
      adminChartModes[metric] = mode;
      adminChartModeButtons.forEach((modeButton) => {
        if (modeButton.dataset.adminChartType !== metric) return;
        const active = modeButton === button;
        modeButton.classList.toggle("active", active);
        modeButton.setAttribute("aria-pressed", String(active));
      });
      rerenderAdminCharts();
    });
  });

  adminPeriodButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.adminPeriod === "custom") {
        adminPeriodButtons.forEach((periodButton) => {
          const active = periodButton === button;
          periodButton.classList.toggle("active", active);
          periodButton.setAttribute("aria-pressed", String(active));
        });
        adminCustomDateForm?.classList.remove("hidden");
        adminCustomDateStart?.focus();
        return;
      }
      adminPeriod = Number(button.dataset.adminPeriod);
      adminCustomDateRange = null;
      adminCustomDateForm?.classList.add("hidden");
      adminPeriodButtons.forEach((periodButton) => {
        const active = periodButton === button;
        periodButton.classList.toggle("active", active);
        periodButton.setAttribute("aria-pressed", String(active));
      });
      await loadDashboard();
    });
  });

  adminCustomDateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (adminDashboardError) adminDashboardError.textContent = "";
    const inicio = adminCustomDateStart?.value;
    const fim = adminCustomDateEnd?.value;
    if (!inicio || !fim) {
      if (adminDashboardError) adminDashboardError.textContent = "Informe as datas inicial e final.";
      return;
    }
    if (inicio > fim) {
      if (adminDashboardError) adminDashboardError.textContent = "A data inicial deve ser anterior ou igual à data final.";
      return;
    }
    if (fim > hojeDashboardLocal) {
      if (adminDashboardError) adminDashboardError.textContent = "A data final não pode estar no futuro.";
      return;
    }
    const duracaoDias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000 + 1;
    if (duracaoDias > 366) {
      if (adminDashboardError) adminDashboardError.textContent = "O intervalo personalizado deve ter no máximo 366 dias.";
      return;
    }
    adminCustomDateRange = { inicio, fim };
    adminPeriodButtons.forEach((periodButton) => {
      const active = periodButton.dataset.adminPeriod === "custom";
      periodButton.classList.toggle("active", active);
      periodButton.setAttribute("aria-pressed", String(active));
    });
    adminCustomDateForm.classList.add("hidden");
    await loadDashboard();
  });

  adminQuickLinks.forEach((button) => {
    button.addEventListener("click", () => setAdminSection(button.dataset.adminGoTab));
  });

  adminTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAdminSection(tab.dataset.adminTab));
  });

  managementShell.addEventListener("click", guardAction(async (event) => {
    const closeReportButton = event.target.closest("[data-close-admin-report]");
    if (closeReportButton) {
      reportDialog?.close();
      adminAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      adminAttachmentObjectUrls = [];
      return;
    }
    const actionBtn = event.target.closest("[data-admin-resource-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.adminResourceAction;
    const id = actionBtn.dataset.id || String(selectedAdminReport?.id || "");

    try {
      const suspensionResource = {
        "suspend-user": { endpoint: "usuarios", label: "usuário", verb: "suspender" },
        "unsuspend-user": { endpoint: "usuarios", label: "usuário", verb: "reativar" },
        "suspend-owner": { endpoint: "donos", label: "parceiro", verb: "suspender" },
        "unsuspend-owner": { endpoint: "donos", label: "parceiro", verb: "reativar" },
      }[action];
      if (suspensionResource) {
        const name = actionBtn.dataset.name || `esta ${suspensionResource.label}`;
        const confirmMessage = suspensionResource.verb === "suspender"
          ? `Suspender "${name}" por 30 dias? O acesso será restaurado automaticamente ao fim do prazo.`
          : `Remover a suspensão de "${name}" e restaurar o acesso imediatamente?`;
        const confirmLabel = suspensionResource.verb === "suspender" ? "Suspender" : "Reativar";
        if (!(await confirmAction(confirmMessage, { danger: suspensionResource.verb === "suspender", confirmLabel }))) return;
        const res = await adminFetch(`/api/admin/${suspensionResource.endpoint}/${id}/suspensao/${suspensionResource.verb}`, { method: "PUT" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Não foi possível ${suspensionResource.verb} o ${suspensionResource.label}.`);
        notify(suspensionResource.verb === "suspender"
          ? `${suspensionResource.label.charAt(0).toUpperCase()}${suspensionResource.label.slice(1)} suspenso por 30 dias.`
          : `Suspensão do ${suspensionResource.label} removida.`);
        await refreshAdminData();
        return;
      }

      const blockResource = {
        "toggle-user-block": { endpoint: "usuarios", label: "usuário" },
        "toggle-owner-block": { endpoint: "donos", label: "parceiro" },
        "toggle-review-block": { endpoint: "avaliacoes", label: "avaliação" },
      }[action];
      if (blockResource) {
        const blocked = actionBtn.dataset.blocked === "true";
        const verb = blocked ? "desbloquear" : "bloquear";
        const name = actionBtn.dataset.name || `esta ${blockResource.label}`;
        if (!blocked && !(await confirmAction(`Bloquear ${blockResource.label} "${name}"?`, { danger: true, confirmLabel: "Bloquear" }))) return;
        const res = await adminFetch(`/api/admin/${blockResource.endpoint}/${id}/${verb}`, { method: "PUT" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Não foi possível ${verb} ${blockResource.label}.`);
        notify(`${blockResource.label.charAt(0).toUpperCase()}${blockResource.label.slice(1)} ${blocked ? "desbloqueado" : "bloqueado"} com sucesso.`);
        await refreshAdminData();
        return;
      }

      if (action === "view-report-defense") {
        selectedAdminReport = adminReports.find((report) => String(report.id) === String(id));
        if (!selectedAdminReport) throw new Error("Não foi possível carregar os detalhes desta denúncia.");
        const report = selectedAdminReport;
        const date = formatAdminDate(report.createdAt);
        if (reportDialogTitle) reportDialogTitle.textContent = `${report.loja?.nome || "Denúncia"} · ${report.motivo}`;
        if (reportAccusation) {
          reportAccusation.innerHTML = `<p><strong>Cliente:</strong> ${escapeHtml(report.usuario?.nome || "Não identificado")}</p><p><strong>Data:</strong> ${escapeHtml(date)}</p><p><strong>Motivo:</strong> ${escapeHtml(report.motivo)}</p><p>${escapeHtml(report.detalhes || "Sem detalhes adicionais informados.")}</p>`;
        }
        if (reportDefense) {
          let attachments = [];
          try {
            attachments = JSON.parse(report.anexosResposta || "[]");
          } catch {}
          const safeAttachments = Array.isArray(attachments) ? attachments.filter((filename) => typeof filename === "string" && /^[a-f0-9-]+\.(png|jpg|pdf)$/i.test(filename)) : [];
          const attachmentHtml = safeAttachments.map((filename) => {
            const safeUrl = `/api/admin/denuncias/${report.id}/anexos/${encodeURIComponent(filename)}`;
            const name = escapeHtml(filename);
            return /\.(png|jpg)$/i.test(filename)
              ? `<a class="admin-defense-attachment" href="#" data-private-admin-url="${safeUrl}" target="_blank" rel="noopener"><img data-private-admin-preview alt="Anexo da defesa ${name}" /><span>${name}</span></a>`
              : `<a class="admin-defense-file" href="#" data-private-admin-url="${safeUrl}" target="_blank" rel="noopener">Abrir ${name}</a>`;
          }).join("");
          reportDefense.innerHTML = report.respostaLoja
            ? `<p><strong>Enviada:</strong> ${escapeHtml(formatAdminDate(report.dataResposta))}</p><p>${escapeHtml(report.respostaLoja)}</p><div class="admin-defense-attachments">${attachmentHtml || "<span>Sem anexos.</span>"}</div>${report.parecerAdmin ? `<p><strong>Parecer anterior:</strong> ${escapeHtml(report.parecerAdmin)}</p>` : ""}`
            : '<p>A loja ainda não enviou defesa.</p>';
          adminAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
          adminAttachmentObjectUrls = [];
          reportDefense?.querySelectorAll("[data-private-admin-url]").forEach(async (link) => {
            try {
              const response = await adminFetch(link.dataset.privateAdminUrl);
              if (!response.ok) throw new Error("Anexo indisponível");
              const objectUrl = URL.createObjectURL(await response.blob());
              adminAttachmentObjectUrls.push(objectUrl);
              link.href = objectUrl;
              link.querySelector("[data-private-admin-preview]")?.setAttribute("src", objectUrl);
            } catch {
              link.textContent = "Anexo indisponível";
              link.removeAttribute("href");
            }
          });
        }
        if (reportOpinion) reportOpinion.value = report.parecerAdmin || "";
        reportDialog?.querySelectorAll("[data-admin-resource-action]").forEach((button) => {
          button.dataset.id = String(report.id);
          button.dataset.shopId = String(report.loja?.id || "");
          button.disabled = !report.loja && ["report-status", "report-block-shop"].includes(button.dataset.adminResourceAction);
        });
        reportDialog?.showModal();
        return;
      }

      if (action === "edit-user") {
        await loadUserForEdit(id);
        return;
      }

      if (action === "edit-owner") {
        await loadOwnerForEdit(id);
        return;
      }

      if (action === "edit-review") {
        await loadReviewForEdit(id);
        return;
      }

      if (action === "delete-user") {
    if (!(await confirmAction(`Excluir o usuário "${actionBtn.dataset.name || id}"? O histórico será mantido sem vínculo de conta.`, { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/usuarios/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir usuário.");
      }

      if (action === "delete-owner") {
    if (!(await confirmAction(`Excluir o parceiro "${actionBtn.dataset.name || id}" e todas as lojas relacionadas?`, { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/donos/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir parceiro.");
      }

      if (action === "booking-status") {
        const confirmation = await confirmAction(`Alterar o agendamento #${id} para "${actionBtn.dataset.status}"? O motivo será compartilhado com cliente e estabelecimento.`, {
          title: "Atualizar agendamento", confirmLabel: "Atualizar", requireReason: true,
          allowDeadlineException: actionBtn.dataset.exception === 'true',
        });
        if (!confirmation) return;
        const res = await adminFetch(`/api/admin/agendamentos/${id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: actionBtn.dataset.status, revisao: Number(actionBtn.dataset.revision), ...confirmation }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao atualizar agendamento.");
      }

      if (action === "delete-review") {
    if (!(await confirmAction("Excluir esta avaliação permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/avaliacoes/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir avaliação.");
      }

      if (action === "report-status") {
        const status = actionBtn.dataset.status;
        const parecerAdmin = reportOpinion?.value.trim() || "";
        if (["procedente", "rejeitada"].includes(status) && parecerAdmin.length < 10) {
          reportOpinion?.focus();
          throw new Error("Informe um parecer com pelo menos 10 caracteres antes de concluir.");
        }
        let res = await adminFetch(`/api/admin/denuncias/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, parecerAdmin }),
        });
        if (res.status === 404 || res.status === 405) {
          const legacyStatus = { procedente: "resolvida", rejeitada: "arquivada", aguardando_defesa: "em_analise", contestada: "em_analise" }[status] || status;
          res = await adminFetch(`/api/admin/denuncias/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: legacyStatus, parecerAdmin }),
          });
          if (res.ok && status === "procedente" && actionBtn.dataset.shopId) {
            const blockRes = await adminFetch(`/api/admin/lojas/${actionBtn.dataset.shopId}/bloquear`, { method: "PUT" });
            if (!blockRes.ok) throw new Error("Status atualizado, mas não foi possível bloquear a loja.");
          }
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao atualizar denúncia.");
      }

      if (action === "report-block-shop") {
        if (!(await confirmAction("Bloquear a loja vinculada a esta denúncia?", { danger: true, confirmLabel: "Bloquear loja" }))) return;
        const parecerAdmin = reportOpinion?.value.trim() || "";
        if (parecerAdmin.length < 10) {
          reportOpinion?.focus();
          throw new Error("Informe um parecer com pelo menos 10 caracteres antes de bloquear.");
        }
        let res = await adminFetch(`/api/admin/denuncias/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "procedente", bloquearLoja: true, parecerAdmin }),
        });
        if (res.status === 404 || res.status === 405) {
          res = await adminFetch(`/api/admin/lojas/${actionBtn.dataset.shopId}/bloquear`, { method: "PUT" });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao bloquear loja.");
      }

      if (action === "delete-report") {
    if (!(await confirmAction("Excluir esta denúncia permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/denuncias/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir denúncia.");
      }

      if (["report-status", "report-block-shop"].includes(action)) reportDialog?.close();
      await refreshAdminData();
      const messages = {
        "delete-user": "Usuário excluído com sucesso.", "delete-owner": "Parceiro excluído com sucesso.",
        "booking-status": "Situação do agendamento atualizada.",
        "delete-review": "Avaliação excluída com sucesso.", "report-status": "Situação da denúncia atualizada.",
        "delete-report": "Denúncia excluída com sucesso.",
      };
      if (messages[action]) notify(messages[action], "success");
    } catch (err) {
      notify(err.message || "Não foi possível concluir a ação.", "error");
    }
  }, '[data-admin-resource-action]'));

  ownerLoginInput?.addEventListener("input", () => {
    ownerLoginInput.value = normalizeOwnerLogin(ownerLoginInput.value);
  });

  ownerCnpjInput?.addEventListener("input", () => {
    ownerCnpjInput.value = onlyDigitsAdmin(ownerCnpjInput.value).slice(0, 14);
  });

  userCpfInput?.addEventListener("input", () => {
    userCpfInput.value = onlyDigitsAdmin(userCpfInput.value).slice(0, 11);
  });

  userPhoneInput?.addEventListener("input", () => {
    userPhoneInput.value = onlyDigitsAdmin(userPhoneInput.value).slice(0, 15);
  });

  ownerEditLoginInput?.addEventListener("input", () => {
    ownerEditLoginInput.value = normalizeOwnerLogin(ownerEditLoginInput.value);
  });

  ownerEditCnpjInput?.addEventListener("input", () => {
    ownerEditCnpjInput.value = onlyDigitsAdmin(ownerEditCnpjInput.value).slice(0, 14);
  });

  loginForm.addEventListener("submit", guardAction(async (e) => {
    e.preventDefault();
    if (loginError) {
      loginError.textContent = "";
      loginError.classList.add("hidden");
    }
    const login = loginForm.querySelector('[name="login"]').value.trim();
    const senha = loginForm.querySelector('[name="senha"]').value;
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (loginError) {
          loginError.textContent = data.error || "Credenciais inválidas.";
          loginError.classList.remove("hidden");
        }
        return;
      }
      setAdminToken(data.token);
      showPanel();
      hideEditPanel();
      hideAdminResourcePanels();
      await refreshAdminData();
    } catch {
      if (loginError) {
        loginError.textContent = "Erro ao conectar com o servidor.";
        loginError.classList.remove("hidden");
      }
    }
  }));

  logoutBtn?.addEventListener("click", async () => {
    try {
      await logoutFromServer();
    } catch (error) {
      notify(error.message || "Não foi possível encerrar a sessão.");
      return;
    }
    clearAdminToken();
    loginForm.reset();
    showAuth();
  });

  hideEditPanel();
  hideAdminResourcePanels();
  if (getAdminToken()) {
    showPanel();
    await refreshAdminData();
  } else {
    showAuth();
  }
}

// Consumido uma única vez, após a inicialização da página de destino.
consumeNotice();
