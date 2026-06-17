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

function setCurrentUser(user, token) {
  localStorage.setItem(currentUserStorageKey, JSON.stringify(user));
  if (token) localStorage.setItem(authTokenStorageKey, token);
  else localStorage.removeItem(authTokenStorageKey);
  updateNavAuthState();
}

function clearCurrentUser() {
  localStorage.removeItem(currentUserStorageKey);
  localStorage.removeItem(authTokenStorageKey);
  updateNavAuthState();
}

function getAuthToken() {
  return localStorage.getItem(authTokenStorageKey);
}

// ── Dono (parceiro) ─────────────────────────────────────────────────────────
function getDonoToken() {
  return localStorage.getItem(donoTokenKey);
}

function setDonoToken(token) {
  localStorage.setItem(donoTokenKey, token);
}

function clearDonoToken() {
  localStorage.removeItem(donoTokenKey);
}

function getDonoFromToken() {
  const token = getDonoToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}

// ── Helpers de fetch autenticado ────────────────────────────────────────────
function donoFetch(path, options = {}) {
  const token = getDonoToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

function userFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
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

// Feedback visual
const toastTimers = new WeakMap();

function ensureToastRoot() {
  let root = document.querySelector("[data-toast-root]");
  if (root) return root;
  root = document.createElement("div");
  root.className = "toast-stack";
  root.dataset.toastRoot = "true";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "false");
  document.body.appendChild(root);
  return root;
}

function showToast(message, type = "info", options = {}) {
  const root = ensureToastRoot();
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" aria-label="Fechar aviso">&times;</button>
  `;
  root.appendChild(toast);

  const close = () => {
    const timer = toastTimers.get(toast);
    if (timer) window.clearTimeout(timer);
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  };

  toast.querySelector("button")?.addEventListener("click", close);
  const timer = window.setTimeout(close, options.duration || 4200);
  toastTimers.set(toast, timer);
  return toast;
}

function toastFromMessage(message, fallbackType = "info") {
  const text = String(message || "");
  if (/sucesso|realizado|publicado|atualizado|removido|conclu[ií]do|salvo/i.test(text)) return "success";
  if (/erro|inv[aá]lido|n[aã]o foi|n[aã]o conseguiu|ocupado|falha|precisa|preencha|informe|verifique/i.test(text)) return "error";
  if (/aviso|aten[cç][aã]o|confira|configure|sess[aã]o|login/i.test(text)) return "warning";
  return fallbackType;
}

function notify(message, type) {
  showToast(message, type || toastFromMessage(message));
}

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

    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    const refreshButtonState = () => {
      const visible = input.type === "text";
      icon.textContent = visible ? "🙈" : "👁";
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
    <article class="confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <h2 id="confirm-dialog-title">Confirmar ação</h2>
      <p data-confirm-message></p>
      <div class="confirm-dialog-actions">
        <button class="btn btn-ghost" type="button" data-confirm-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-confirm-ok>Confirmar</button>
      </div>
    </article>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

function confirmAction(message, options = {}) {
  const dialog = ensureConfirmDialog();
  const title = dialog.querySelector("#confirm-dialog-title");
  const text = dialog.querySelector("[data-confirm-message]");
  const okButton = dialog.querySelector("[data-confirm-ok]");
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (title) title.textContent = options.title || "Confirmar ação";
  if (text) text.textContent = message;
  if (okButton) {
    okButton.textContent = options.confirmLabel || "Confirmar";
    okButton.classList.toggle("btn-danger", Boolean(options.danger));
  }

  dialog.classList.remove("hidden");
  okButton?.focus();

  return new Promise((resolve) => {
    const close = (result) => {
      dialog.classList.add("hidden");
      dialog.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
      resolve(result);
    };
    const onClick = (event) => {
      if (event.target.closest("[data-confirm-ok]")) close(true);
      if (event.target.closest("[data-confirm-cancel]")) close(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };
    dialog.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
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
    mapa: "mapa.html",
    "meus-agendamentos": "meus-agendamentos.html",
    favoritos: "favoritos.html",
  };
  const target = map[page];
  if (!target) return;
  document.querySelectorAll(".topbar nav a").forEach((a) => {
    const matches = a.getAttribute("href")?.includes(target);
    a.classList.toggle("active", Boolean(matches));
  });
}

function updateNavAuthState() {
  const logged = Boolean(getCurrentUser() && getAuthToken());

  document.querySelectorAll('nav a[href*="cadastro.html"]').forEach((link) => {
    link.classList.toggle("hidden", logged);
  });

  document.querySelectorAll("[data-client-session-link]").forEach((item) => item.remove());

  if (!logged) return;

  document.querySelectorAll(".topbar nav").forEach((nav) => {
    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.className = "nav-logout";
    logoutButton.dataset.clientSessionLink = "logout";
    logoutButton.textContent = "Sair";
    logoutButton.addEventListener("click", () => {
      clearCurrentUser();
      window.location.href = "index.html";
    });
    nav.appendChild(logoutButton);
  });
}

function requireAuth(reason = "login_required") {
  if (getCurrentUser() && getAuthToken()) return true;
  clearCurrentUser();
  redirectToLogin(reason);
  return false;
}

function initializeAuthRequiredLinks() {
  document.querySelectorAll("a.requires-auth").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (getCurrentUser() && getAuthToken()) return;
      event.preventDefault();
      clearCurrentUser();
      redirectToLogin(link.dataset.authAction || "login_required");
    });
  });
}

// ── Rodape do site ───────────────────────────────────────────────────────────
function initializeSiteFooter() {
  if (page === "admin" || document.querySelector(".site-footer")) return;

  const year = new Date().getFullYear();
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container site-footer-inner">
      <section>
        <h2>Sobre Nós</h2>
        <p>Marketplace para encontrar lava jatos, comparar avalia&ccedil;&otilde;es e agendar servi&ccedil;os automotivos com praticidade.</p>
      </section>
      <section>
        <h3>Para Você</h3>
        <nav class="footer-links" aria-label="Links do AutoShine">
          <a href="index.html">In&iacute;cio</a>
          <a href="mapa.html">Mapa</a>
          <a href="meus-agendamentos.html">Agendamentos</a>
        </nav>
      </section>
      <section>
        <h3>Para Empresas</h3>
        <nav class="footer-links" aria-label="Links para parceiros">
          <a href="cadastro-dono.html">Cadastrar lava jato</a>
          <a href="cadastro-dono.html">Painel do parceiro</a>
          <a href="cadastro.html?mode=login">Acessar conta</a>
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
        <span class="report-dialog-kicker">Central de confianca</span>
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
          <button id="report-dialog-submit" class="btn btn-primary" type="submit">Enviar denuncia</button>
        </div>
      </form>
      <div id="report-dialog-success" class="report-dialog-success hidden" role="status">
        <strong>Denuncia enviada</strong>
        <p>Nossa equipe vai analisar o caso no painel administrativo.</p>
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
    modal.classList.add("hidden");
    reportPayload = null;
    form?.reset();
    setReportFeedback("");
    form?.classList.remove("hidden");
    successBox?.classList.add("hidden");
    if (submitButton) submitButton.disabled = false;
    if (lastFocusedButton) lastFocusedButton.focus();
  }

  function openReportDialog({ isReview, label, payload, trigger }) {
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
    window.setTimeout(() => reasonSelect?.focus(), 0);
  }

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-report-close]")) closeReportDialog();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeReportDialog();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!reportPayload) return;
    const motivo = reasonSelect?.value.trim() || "";
    const detalhes = detailsInput?.value.trim() || "";
    if (motivo.length < 4) {
      setReportFeedback("Selecione um motivo para continuar.", "error");
      reasonSelect?.focus();
      return;
    }

    setReportFeedback("Enviando denúncia...");
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
      if (submitButton) submitButton.disabled = false;
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

  const safeName = escapeHtml(loja.nome);
  const safePhoto = escapeHtml(loja.fotoUrl);
  const safeAddress = escapeHtml(loja.endereco || "Endereço não informado");
  const profileUrl = `perfil.html?shopId=${encodeURIComponent(loja.id)}`;

  const avaliacoes = loja.avaliacoes || [];
  const metaHtml = avaliacoes.length
    ? `<p class="meta"><span class="stars">&#9733; ${(avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length).toFixed(1)}</span></p>`
    : `<p class="meta">Aguardando avaliações de clientes</p>`;

  article.innerHTML = `
    ${createFavoriteButtonHtml(isFavorited, loja.id)}
    <img src="${safePhoto}" alt="Foto do lava jato ${safeName}" loading="lazy" />
    <div class="shop-content">
      <h3>${safeName}</h3>
      ${metaHtml}
      <p class="shop-address">${safeAddress}</p>
      <p class="shop-distance" data-shop-distance hidden></p>
      <a class="btn btn-secondary" href="${profileUrl}">Serviços</a>
    </div>
  `;
  return article;
}

async function renderOwnerShopsOnHome() {
  const shopGrid = document.getElementById("shop-grid");
  if (!shopGrid) return;

  shopGrid.querySelectorAll('[data-owner-created="1"]').forEach((card) => card.remove());

  try {
    const favoriteIds = await fetchUserFavoriteShopIds();
    const res = await fetch("/api/lojas");
    if (!res.ok) return;
    const { lojas } = await res.json();
    lojas.forEach((loja) => {
      loja.isFavorited = favoriteIds.includes(loja.id);
      shopGrid.appendChild(buildHomeCard(loja));
    });
    if (homeUserPosition) applyHomeLocationRanking();
    else applyHomeFilters();
  } catch {}
}

async function initFavoritesPage() {
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
async function initPartnerPage() {
  const authShell = document.getElementById("partner-auth-shell") || document.getElementById("dono-auth-shell");
  const managementShell = document.getElementById("partner-management-shell");
  const loginForm = document.getElementById("owner-login-form");
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

  // loja em memória para edição rápida (evita fetch extra)
  let cachedShops = [];
  let cachedBookings = [];
  let selectedDashboardShopId = "";
  let ownerSidebarCollapsed = localStorage.getItem("autoshine:owner-sidebar-collapsed") === "1";

  function switchTab(name) {
    tabButtons.forEach((t) => t.classList.toggle("active", t.dataset.partnerTab === name));
    tabPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.partnerPanel !== name));
    if (cancelEditButton) {
      cancelEditButton.classList.toggle(
        "hidden",
        name !== "cadastro" || !form.dataset.editingShopId,
      );
    }
  }

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
    authShell.classList.remove("hidden");
    managementShell.classList.add("hidden");
  }

  function showManagementArea(dono) {
    authShell.classList.add("hidden");
    managementShell.classList.remove("hidden");
    ownerSessionLabel.textContent = `Conectado como: ${dono.nome} (${dono.login})`;
  }

  function localDateKey(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function shiftDateKey(dateKey, days) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDateKey(date);
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

  function renderPartnerDashboard() {
    if (!dashboardRoot) return;

    if (!cachedShops.length) {
      selectedDashboardShopId = "";
      dashboardRoot.innerHTML = `
        <div class="owner-dashboard-empty">
          <h2>Dashboard do lava jato</h2>
          <p class="empty-copy">Cadastre seu lava jato para acompanhar agendamentos, faturamento, serviços e avaliações por aqui.</p>
          <button class="btn btn-primary" type="button" data-go-tab="cadastro">Cadastrar lava jato</button>
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
    const todayBookings = lojaBookings.filter((booking) => booking.data === hoje && booking.status !== "cancelado");
    const yesterdayBookings = lojaBookings.filter((booking) => booking.data === ontem && booking.status !== "cancelado");
    const activeTodayBookings = todayBookings.filter((booking) => activeStatuses.has(booking.status || "pendente"));
    const finishedTodayBookings = todayBookings.filter((booking) => booking.status === "finalizado");
    const finishedYesterdayBookings = yesterdayBookings.filter((booking) => booking.status === "finalizado");
    const dailyRevenue = finishedTodayBookings.reduce((sum, booking) => sum + bookingPrice(booking), 0);
    const yesterdayRevenue = finishedYesterdayBookings.reduce((sum, booking) => sum + bookingPrice(booking), 0);
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
    const profileUrl = `perfil.html?shopId=${encodeURIComponent(loja.id)}`;
    const reviewsUrl = `avaliacoes.html?lojaId=${encodeURIComponent(loja.id)}&shop=${encodeURIComponent(loja.nome)}`;
    const scheduleTimes = parseScheduleTimes(loja.agendaHorarios || defaultBookingTimes);
    const scheduleDays = parseScheduleDays(loja.agendaDias || defaultScheduleDays);
    const todayDay = String(new Date(`${hoje}T12:00:00`).getDay());
    const isOpenToday = scheduleDays.includes(todayDay);
    const weekKeys = Array.from({ length: 6 }, (_, index) => shiftDateKey(hoje, index - 5));
    const weeklyCounts = weekKeys.map((dateKey) => lojaBookings.filter((booking) => booking.data === dateKey && booking.status !== "cancelado").length);
    const weeklyRevenue = weekKeys.map((dateKey) => lojaBookings
      .filter((booking) => booking.data === dateKey && booking.status === "finalizado")
      .reduce((sum, booking) => sum + bookingPrice(booking), 0));
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
    const revenueTrend = toTrend(dailyRevenue, yesterdayRevenue, "real", "reais");

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
            const active = activeTodayBookings.find((booking) => booking.hora === hora);
            const done = finishedTodayBookings.find((booking) => booking.hora === hora);
            const label = active ? "Ocupado" : done ? "Finalizado" : "Livre";
            const className = active ? "is-busy" : done ? "is-done" : "is-free";
            const booking = active || done;
            const detail = booking
              ? `${escapeHtml(booking.nomeCliente || booking.usuario?.nome || "Cliente")} - ${escapeHtml(booking.servico?.nome || "Serviço")}`
              : "Sem agendamento";
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
      const height = value ? Math.max(18, Math.round((value / maxWeeklyRevenue) * 118)) : 12;
      const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
      return `
        <div class="owner-performance-bar is-revenue" style="--bar-h:${height}px" aria-label="${weekLabels[dayIndex]}: ${formatMoney(value)} de faturamento">
          <span>${value ? formatMoney(value).replace("R$", "").trim() : "0,00"}</span>
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
            <button class="owner-dashboard-nav" type="button" data-dashboard-edit-shop="${escapeHtml(lojaId)}"><span class="owner-nav-icon">ED</span><span>Editar</span></button>
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
              <span class="owner-plan-badge">Plano Premium</span>
              ${selectorHtml}
              <a class="btn btn-ghost" href="${profileUrl}">Ir para marketplace</a>
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
              <p>Faturamento do dia</p>
              <strong>${formatMoney(dailyRevenue)}</strong>
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
              <h3>Agenda do dia</h3>
              <button class="btn btn-ghost" type="button" data-go-tab="agendamentos">Ver todos os agendamentos</button>
            </div>
            <ul class="owner-timeline-grid">${slotHtml}</ul>
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
              <h3>Faturamento semanal</h3>
              <div class="owner-performance-chart">${revenueBarsHtml}</div>
            </article>
          </div>
        </section>
      </div>`;
  }

  function createServiceRow(initialData = null) {
    const fragment = serviceTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".partner-service-item");
    const removeButton = fragment.querySelector(".remove-partner-service");
    const nameInput = fragment.querySelector('[data-service-field="name"]');
    const priceInput = fragment.querySelector('[data-service-field="price"]');
    const durationInput = fragment.querySelector('[data-service-field="duration"]');
    const descriptionInput = fragment.querySelector('[data-service-field="description"]');

    if (initialData) {
      nameInput.value = initialData.nome || initialData.name || "";
      priceInput.value = initialData.preco ?? initialData.price ?? "";
      durationInput.value = initialData.duracao || initialData.duration || "";
      descriptionInput.value = initialData.descricao || initialData.description || "";
    }

    removeButton.addEventListener("click", () => {
      if (servicesList.querySelectorAll(".partner-service-item").length <= 1) {
        notify("Você precisa manter pelo menos um serviço.");
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
        preco: Number(row.querySelector('[data-service-field="price"]').value),
        duracao: row.querySelector('[data-service-field="duration"]').value.trim(),
        descricao: row.querySelector('[data-service-field="description"]').value.trim(),
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
    submitButton.textContent = "Salvar lava jato";
    form.dataset.editingShopId = "";
    if (cancelEditButton) cancelEditButton.classList.add("hidden");
  }

  function loadShopToForm(loja) {
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
    const categorySelect = document.getElementById("partner-category");
    if (categorySelect) categorySelect.value = loja.categoria || "";
    latitudeInput.value = Number.isFinite(Number(loja.latitude)) ? loja.latitude : "";
    longitudeInput.value = Number.isFinite(Number(loja.longitude)) ? loja.longitude : "";
    setScheduleDays(loja.agendaDias || defaultScheduleDays);
    scheduleTimesInput.value = parseScheduleTimes(loja.agendaHorarios || defaultBookingTimes).join(", ");

    servicesList.innerHTML = "";
    if (Array.isArray(loja.servicos) && loja.servicos.length) {
      loja.servicos.forEach((s) => createServiceRow(s));
    } else {
      createServiceRow();
    }

    submitButton.textContent = "Salvar alteracoes";
    switchTab("cadastro");
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
      if (!selectedDashboardShopId || !cachedShops.some((loja) => String(loja.id) === String(selectedDashboardShopId))) {
        selectedDashboardShopId = cachedShops[0] ? String(cachedShops[0].id) : "";
      }
      renderPartnerDashboard();

      if (!cachedShops.length) {
        ownedList.innerHTML = `
          <div class="partner-empty-state">
            <p class="empty-copy">Você ainda não publicou nenhum lava jato.</p>
            <button type="button" class="btn btn-primary" data-go-tab="cadastro">Ir para Cadastrar</button>
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
                    <label>Nome do serviço</label>
                    <input type="text" data-inline-service-field="name" placeholder="Ex: Lavagem completa" />
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

  async function renderReceivedBookings() {
    if (!bookingsList) return;
    try {
      const res = await donoFetch("/api/agendamentos/dono");
      if (!res.ok) {
        bookingsList.innerHTML = '<p class="empty-copy">Erro ao carregar agendamentos.</p>';
        cachedBookings = [];
        renderPartnerDashboard();
        return;
      }
      const { agendamentos } = await res.json();
      cachedBookings = Array.isArray(agendamentos) ? agendamentos : [];
      renderPartnerDashboard();

      if (!cachedBookings.length) {
        bookingsList.innerHTML =
          '<p class="empty-copy">Ainda não existem agendamentos para seus lava jatos.</p>';
        return;
      }

      bookingsList.innerHTML = cachedBookings
        .map((ag) => {
          const safeShopName = escapeHtml(ag.loja?.nome || "Lava jato");
          const safeService = escapeHtml(ag.servico?.nome || "Serviço");
          const safeDate = escapeHtml(ag.data || "--/--/----");
          const safeTime = escapeHtml(ag.hora || "--:--");
          const safeVehicle = escapeHtml(ag.veiculo || "não informado");
          const customerName = ag.usuario?.nome || ag.nomeCliente || "Cliente";
          const customerEmail = ag.usuario?.email || ag.emailCliente || "não informado";
          const safeNotes = escapeHtml(ag.notas || "");
          const status = ag.status || "pendente";
          const statusClass =
            status === "finalizado"
              ? "booking-status-done"
              : status === "cancelado"
                ? "booking-status-canceled"
                : "booking-status-pending";
          const safeId = escapeHtml(String(ag.id));

          return `
          <article class="booking-received-item">
            <div class="booking-item-head">
              <h3>${safeShopName}</h3>
              <span class="booking-status-badge ${statusClass}">${escapeHtml(status)}</span>
            </div>
            <p><strong>Serviço:</strong> ${safeService}</p>
            <p><strong>Data:</strong> ${safeDate} as ${safeTime}</p>
            <p><strong>Veículo:</strong> ${safeVehicle}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail)})</p>
            ${safeNotes ? `<p><strong>Obs:</strong> ${safeNotes}</p>` : ""}
            <div class="booking-item-actions">
              ${status !== "finalizado" ? `<button class="btn btn-secondary" type="button" data-finish-booking="${safeId}">Marcar como finalizado</button>` : ""}
              ${status === "finalizado" ? `<button class="btn btn-secondary" type="button" data-reopen-booking="${safeId}">Reabrir agendamento</button>` : ""}
              <button class="btn btn-ghost" type="button" data-delete-booking="${safeId}">Excluir agendamento</button>
            </div>
          </article>`;
        })
        .join("");
    } catch {
      bookingsList.innerHTML = '<p class="empty-copy">Erro ao carregar agendamentos.</p>';
      cachedBookings = [];
      renderPartnerDashboard();
    }
  }

  // Ações nos agendamentos recebidos
  if (bookingsList) {
    bookingsList.addEventListener("click", async (event) => {
      if (!getDonoFromToken()) return;

      const deleteBtn = event.target.closest("[data-delete-booking]");
      if (deleteBtn) {
        if (!(await confirmAction("Excluir este agendamento permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const id = deleteBtn.dataset.deleteBooking;
        try {
          const res = await donoFetch(`/api/agendamentos/${id}`, { method: "DELETE" });
          if (!res.ok) { const d = await res.json(); notify(d.error || "Erro ao excluir."); return; }
          await renderReceivedBookings();
        } catch { notify("Erro de conexão."); }
        return;
      }

      const finishBtn = event.target.closest("[data-finish-booking]");
      if (finishBtn) {
        const id = finishBtn.dataset.finishBooking;
        try {
          const res = await donoFetch(`/api/agendamentos/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: "finalizado" }),
          });
          if (!res.ok) { const d = await res.json(); notify(d.error || "Erro ao atualizar."); return; }
          await renderReceivedBookings();
        } catch { notify("Erro de conexão."); }
        return;
      }

      const reopenBtn = event.target.closest("[data-reopen-booking]");
      if (reopenBtn) {
        const id = reopenBtn.dataset.reopenBooking;
        try {
          const res = await donoFetch(`/api/agendamentos/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: "pendente" }),
          });
          if (!res.ok) {
            const d = await res.json();
            notify(d.error || "Erro ao reabrir agendamento.");
            return;
          }
          await renderReceivedBookings();
        } catch {
          notify("Erro de conexão.");
        }
      }
    });
  }

  if (dashboardRoot) {
    dashboardRoot.addEventListener("change", (event) => {
      const select = event.target.closest("[data-dashboard-shop]");
      if (!select) return;
      selectedDashboardShopId = select.value;
      renderPartnerDashboard();
    });

    dashboardRoot.addEventListener("click", (event) => {
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
      notify("Geolocalização não suportada neste navegador.");
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
  ownedList.addEventListener("click", async (event) => {
    if (!getDonoFromToken()) { showAuthArea(); return; }

    // Excluir loja
    const removeShopBtn = event.target.closest("[data-remove-owner-shop]");
    if (removeShopBtn) {
      if (!(await confirmAction("Excluir este lava jato permanentemente? Todos os serviços e agendamentos também serão removidos.", { danger: true, confirmLabel: "Excluir" }))) return;
      const shopId = removeShopBtn.dataset.removeOwnerShop;
      try {
        const res = await donoFetch(`/api/lojas/${shopId}`, { method: "DELETE" });
        if (!res.ok) { const d = await res.json(); notify(d.error || "Erro ao excluir."); return; }
        if (form.dataset.editingShopId === shopId) resetPartnerForm();
        await renderOwnedShops();
        await renderReceivedBookings();
        if (!cachedShops.length) switchTab("cadastro");
        notify("Lava jato removido do marketplace.");
      } catch { notify("Erro de conexão."); }
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
            body: JSON.stringify({ nome, preco, duracao, descricao }),
          });
        } else {
          res = await donoFetch(`/api/lojas/${shopId}/servicos`, {
            method: "POST",
            body: JSON.stringify({ nome, preco, duracao, descricao }),
          });
        }
        if (!res.ok) {
          const d = await res.json();
          if (fb) fb.textContent = d.error || "Erro ao salvar serviço.";
          return;
        }
        editor.classList.add("hidden");
        await renderOwnedShops();
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
      if (!(await confirmAction("Excluir este serviço?", { danger: true, confirmLabel: "Excluir" }))) return;
      const shopId = removeServiceBtn.dataset.removeOwnerService;
      const serviceId = removeServiceBtn.dataset.serviceId;
      try {
        const res = await donoFetch(`/api/lojas/${shopId}/servicos/${serviceId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const d = await res.json();
          notify(d.error || "Erro ao excluir serviço.");
          return;
        }
        await renderOwnedShops();
        notify("Serviço removido com sucesso.");
      } catch { notify("Erro de conexão."); }
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
          else notify("Não foi possível carregar o lava jato.");
        } catch { notify("Erro de conexão."); }
      }
    }
  });

  // Submeter formulário de loja
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!getDonoFromToken()) { showAuthArea(); notify("Faça login no painel do dono para continuar."); return; }

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
    const fotosAdicionais = parseTextList(formData.get("fotosAdicionais")).join("\n");
    const agendaDias = readScheduleDaysFromForm();
    const agendaHorarios = parseScheduleTimes(formData.get("agendaHorarios"));
    const servicos = readServicesFromForm();
    const precoMedio = servicos.length
      ? Math.round(servicos.reduce((acc, s) => acc + s.preco, 0) / servicos.length)
      : 0;

    if (!nome || !descricao || !endereco || (!fotoUrl && !photoFile)) {
      notify("Preencha todos os campos obrigatórios do estabelecimento.");
      return;
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) {
      notify("Informe latitude e longitude válidas para mostrar no mapa.");
      return;
    }
    if (!servicos.length) {
      notify("Adicione pelo menos um serviço válido para publicar.");
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

    const categorySelect = document.getElementById("partner-category");
    const categoria = (categorySelect?.value || "").trim() || deriveCategoryFromServicos(servicos);
    const editingId = form.dataset.editingShopId || "";

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
      if (!isValidShopImagePath(fotoUrl) || (capaUrl && !isValidShopImagePath(capaUrl))) {
        notify("As fotos precisam ser URLs http/https ou arquivos em assets/img ou assets/uploads.");
        return;
      }
      const fotosExtrasInvalidas = parseTextList(fotosAdicionais).filter((foto) => !isValidShopImagePath(foto));
      if (fotosExtrasInvalidas.length) {
        notify("As fotos adicionais precisam ser URLs http/https ou arquivos em assets/img ou assets/uploads.");
        return;
      }

      let res;
      const lojaPayload = { nome, descricao, endereco, latitude, longitude, precoMedio, categoria, fotoUrl, capaUrl: capaUrl || null, fotosAdicionais, formasPagamento, politicaCancelamento, agendaDias, agendaHorarios };
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
          notify("Seu login já possui um lava jato publicado. Carregando para edição.");
          const lojaRes = await fetch(`/api/lojas/${data.lojaId}`);
          if (lojaRes.ok) { const { loja } = await lojaRes.json(); loadShopToForm(loja); }
        } else {
          notify(data.error || "Erro ao salvar lava jato.");
        }
        return;
      }

      resetPartnerForm();
      await renderOwnedShops();
      await renderReceivedBookings();
      notify(editingId ? "Lava jato atualizado com sucesso." : "Lava jato publicado com sucesso no marketplace.");
      switchTab("dashboard");
    } catch (err) {
      notify(err.message || "Erro de conexão. Tente novamente.");
    } finally {
      submitButton.disabled = false;
      if (!form.dataset.editingShopId) submitButton.textContent = "Salvar lava jato";
    }
  });

  // Login do dono
  loginForm?.addEventListener("submit", async (event) => {
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
      if (!res.ok) { notify(data.error || "Login ou senha inválidos."); return; }

      setDonoToken(data.token);
      loginForm.reset();
      resetPartnerForm();
      showManagementArea(data.dono);
      await renderOwnedShops();
      await renderReceivedBookings();
      switchTab(cachedShops.length ? "dashboard" : "cadastro");
    } catch {
      notify("Erro de conexão. Tente novamente.");
    }
  });

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
  ownerLogoutButton.addEventListener("click", () => {
    clearDonoToken();
    cachedShops = [];
    cachedBookings = [];
    selectedDashboardShopId = "";
    renderPartnerDashboard();
    resetPartnerForm();
    showAuthArea();
    notify("Sessão do dono encerrada.");
  });

  // Verifica se já está logado via token
  const dono = getDonoFromToken();
  if (dono) {
    resetPartnerForm();
    showManagementArea(dono);
    await renderOwnedShops();
    await renderReceivedBookings();
    switchTab(cachedShops.length ? "dashboard" : "cadastro");
  } else {
    showAuthArea();
    resetPartnerForm();
  }
}

async function fetchUserFavoriteShopIds() {
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
    notify("Não foi possível atualizar o favorito no momento.");
    return;
  }
  updateFavoriteButtonState(button, !currentlyFavorited);
  if (!currentlyFavorited) {
    window.location.href = "favoritos.html";
  }
}

function initFavoriteButtonHandling() {
  document.addEventListener("click", handleFavoriteButtonClick);
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
      notify("Login Google ainda não configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env e reinicie o servidor.");
      window.history.replaceState({}, "", "cadastro-dono.html");
    }
    if (auth === "google_failed") {
      notify("Não foi possível concluir o login com Google. Tente novamente.");
      window.history.replaceState({}, "", "cadastro-dono.html");
    }
    return false;
  }

  if (handleGoogleCallback()) return;

  // Se ja esta logado como dono, vai direto para o painel
  if (getDonoFromToken()) {
    return;
  }

  // Login
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const login = normalizeOwnerLogin(formData.get("login"));
      const senha = String(formData.get("password") || "");

      if (!login || !senha) { notify("Informe login e senha para entrar."); return; }

      try {
        const res = await fetch("/api/dono/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, senha }),
        });
        const data = await res.json();
        if (!res.ok) { notify(data.error || "Login ou senha inválidos."); return; }
        setDonoToken(data.token);
        window.location.href = "cadastro-dono.html";
      } catch {
        notify("Erro de conexão. Tente novamente.");
      }
    });
  }

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

    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const nome = String(formData.get("name") || "").trim();
      const login = normalizeOwnerLogin(formData.get("login"));
      const cnpj = String(formData.get("cnpj") || "").replace(/\D/g, "").trim();
      const senha = String(formData.get("password") || "");
      const senhaConfirm = String(formData.get("passwordConfirm") || "");
      const termsAccepted = Boolean(formData.get("terms"));

      if (!nome || !login || !cnpj || !senha || !senhaConfirm) {
        notify("Preencha todos os campos para criar a conta de dono.");
        return;
      }
      if (login.length < 4) { notify("O login deve ter no mínimo 4 caracteres."); return; }
      if (!/^[a-z0-9._-]+$/i.test(login)) {
        notify("Use apenas letras, números, ponto, underline ou hífen no login.");
        return;
      }
      if (cnpj.length !== 14) { notify("CNPJ deve conter 14 dígitos."); return; }
      if (senha.length < 6) { notify("A senha deve ter no mínimo 6 caracteres."); return; }
      if (senha !== senhaConfirm) { notify("As senhas não coincidem."); return; }
      if (!termsAccepted) { notify("Você precisa aceitar os termos para criar a conta de parceiro."); return; }

      // Tentar validar CNPJ antes de enviar (mas permitir mesmo se falhar)
      let cnpjValidationWarning = false;
      try {
        const cnpjRes = await fetch(`/api/validacoes/cnpj/${cnpj}`);
        const cnpjData = await cnpjRes.json();
        if (!cnpjRes.ok || !cnpjData.valido) {
          notify(cnpjData.mensagem || "CNPJ inválido.");
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
          body: JSON.stringify({ nome, login, cnpj, senha }),
        });
        const data = await res.json();
        if (!res.ok) { notify(data.error || "Erro ao criar conta."); return; }
        setDonoToken(data.token);
        registerForm.reset();
        window.location.href = "cadastro-dono.html";
      } catch {
        notify("Erro de conexão. Tente novamente.");
      }
    });
  }
}

// ── Perfil da loja ───────────────────────────────────────────────────────────
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
            ${index === 0 ? 'aria-current="true"' : ""}
            data-profile-carousel-dot="${index}"
          ></button>
        `).join("")}
      </div>
    ` : ""}
  `;

  if (uniquePhotos.length === 1) return;

  const slides = [...container.querySelectorAll(".profile-carousel-slide")];
  const dots = [...container.querySelectorAll("[data-profile-carousel-dot]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let timerId = null;

  const setActive = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => slide.classList.toggle("is-active", index === activeIndex));
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      if (index === activeIndex) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };

  const stop = () => {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  };

  const start = () => {
    stop();
    if (!reducedMotion.matches) {
      timerId = window.setInterval(() => setActive(activeIndex + 1), 4200);
    }
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

  container.addEventListener("mouseenter", stop);
  container.addEventListener("mouseleave", start);
  container.addEventListener("focusin", stop);
  container.addEventListener("focusout", () => {
    if (!container.contains(document.activeElement)) start();
  });
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

    const heroCarousel = document.querySelector(".profile-carousel");
    const heroImage = document.querySelector(".profile-hero img");
    const profileInfo = document.querySelector(".profile-info");
    const servicesGrid = document.querySelector(".services-grid");
    const detailsGrid = document.getElementById("profile-details");
    const sectionHead = document.querySelector("section .section-head .link");

    if ((!heroCarousel && !heroImage) || !profileInfo || !servicesGrid) return;

    const extraPhotos = parseTextList(loja.fotosAdicionais).filter(isValidShopImagePath);
    const carouselPhotos = [loja.capaUrl, loja.fotoUrl, ...extraPhotos];
    if (heroCarousel) {
      setupProfileCarousel(heroCarousel, carouselPhotos, loja.nome);
    } else if (heroImage) {
      heroImage.src = loja.capaUrl || loja.fotoUrl;
      heroImage.alt = `Capa do estabelecimento ${loja.nome}`;
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
    const mapUrl = `mapa.html?shop=${encodeURIComponent(loja.nome)}`;
    const scheduleSummary = formatScheduleSummary(loja.agendaDias, loja.agendaHorarios);
    const payments = parseTextList(loja.formasPagamento || "Pix, Cartão, Dinheiro");
    const paymentChips = payments.length
      ? payments.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
      : "<span>Consultar estabelecimento</span>";
    const cancellationPolicy = String(loja.politicaCancelamento || "").trim() ||
      "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.";
    profileInfo.innerHTML = `
      <h1>${escapeHtml(loja.nome)}</h1>
      ${ratingLine}
      <p>${escapeHtml(loja.endereco || "Endereço não informado")}</p>
      <p>${escapeHtml(loja.categoria || "categoria não informada")}</p>
      <div class="profile-actions">
        <a class="btn btn-primary" href="${routeUrl}" target="_blank" rel="noopener">Traçar rota</a>
        <a class="btn btn-ghost" href="${mapUrl}">Abrir no mapa</a>
        <button class="btn btn-ghost" type="button" data-report-shop="${loja.id}" data-report-label="${escapeHtml(loja.nome)}">Denunciar loja</button>
      </div>
    `;

    if (detailsGrid) {
      detailsGrid.innerHTML = "";
    }

    if (sectionHead) {
      sectionHead.href = `avaliacoes.html?lojaId=${loja.id}&shop=${encodeURIComponent(loja.nome)}`;
      sectionHead.textContent = "Ver avaliações";
    }

    const servicos = loja.servicos || [];
    servicesGrid.innerHTML = servicos.length
      ? servicos.map((servico) => {
        const nome = escapeHtml(servico.nome || "Serviço");
        const descricao = escapeHtml(servico.descricao || "");
        const duracao = escapeHtml(servico.duracao || "--");
        const preco = Number(servico.preco || 0).toFixed(0);
        const bookingUrl = `agendamento.html?servicoId=${servico.id}&shopId=${loja.id}&servico=${encodeURIComponent(servico.nome)}&shop=${encodeURIComponent(loja.nome)}`;
        return `
          <article class="service-card">
            <h3>${nome}</h3>
            <p>${descricao}</p>
            <div class="service-meta">
              <strong>R$ ${preco}</strong>
              <span>${duracao}</span>
            </div>
            <a class="btn btn-primary requires-auth" data-auth-action="agendar" href="${bookingUrl}">Agendar</a>
          </article>`;
      })
      .join("")
      : '<article class="service-card"><p>Este estabelecimento ainda não cadastrou serviços.</p></article>';

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
    const res = await fetch("/api/lojas");
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

  if (shopId) {
    try {
      const res = await fetch(`/api/lojas/${shopId}`);
      if (res.ok) {
        const { loja } = await res.json();
        lojaData = loja;
        if (servicoId) {
          servicoData = (loja.servicos || []).find((s) => String(s.id) === String(servicoId));
        }
      }
    } catch {}
  }

  serviceInput.value = servicoData?.nome || servicoNome;
  const selectedShopName = lojaData?.nome || shopNameFromQuery || "Lava jato";

  if (dateInput) {
    dateInput.min = new Date().toISOString().slice(0, 10);
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
      !timeSelect.disabled
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
    if (!silent) setAvailabilityMessage("Consultando horários...", "warning");
    try {
      const res = await fetch(`/api/lojas/${shopId}/disponibilidade?data=${encodeURIComponent(dateInput.value)}&_=${Date.now()}`);
      if (!res.ok) {
        setAvailabilityMessage("Não foi possível carregar os horários.", "invalid");
        timeSelect.disabled = true;
        updateBookingSubmitState();
        return false;
      }
      const { horarios = [], aberto = true, mensagem = "" } = await res.json();
      timeSelect.innerHTML = '<option value="">Selecione</option>';
      let availableCount = 0;
      let selectedStillAvailable = false;
      horarios.forEach(({ hora, disponivel }) => {
        const option = document.createElement("option");
        option.value = hora;
        option.textContent = disponivel ? hora : `${hora} (ocupado)`;
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
        setAvailabilityMessage("Nenhum horário disponível nesta data. Todos estão ocupados por outros usuários.", "warning");
      } else if (selected && !selectedStillAvailable) {
        setAvailabilityMessage(`O horário ${selected} acabou de ser ocupado. Escolha outro horário disponível.`, "invalid");
      } else {
        setAvailabilityMessage(
          `${availableCount} ${availableCount === 1 ? "horário disponível" : "horários disponíveis"} nesta data.`,
          "valid",
        );
      }
      updateBookingSubmitState();
      return !selected || selectedStillAvailable;
    } catch {
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
    if (!requireAuth("agendar")) return;
    if (!lojaData || !servicoData) {
      notify("Escolha um lava jato e serviço válidos antes de agendar.");
      return;
    }
    if (!dateInput?.value || !timeSelect?.value) {
      setAvailabilityMessage("Escolha uma data e um horário disponível para confirmar.", "invalid");
      updateBookingSubmitState();
      return;
    }
    const horarioAindaDisponivel = await updateAvailableTimes({ silent: true });
    if (!horarioAindaDisponivel || !timeSelect.value) {
      return;
    }

    const formData = new FormData(form);
    const currentUser = getCurrentUser();

    try {
      const res = await userFetch("/api/agendamentos", {
        method: "POST",
        body: JSON.stringify({
          lojaId: lojaData.id,
          servicoId: servicoData.id,
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
          notify(data.error || "Erro ao confirmar agendamento.");
        }
        return;
      }
    } catch {
      notify("Erro de conexão. Tente novamente.");
      return;
    }

    const summary = [
      `Lava jato: ${selectedShopName}`,
      `Serviço: ${serviceInput.value}`,
      `Data: ${formData.get("data")}`,
      `Horário: ${formData.get("horario")}`,
      `Veículo: ${formData.get("veiculo")}`,
    ].join("\n");

    notify(`Agendamento confirmado com sucesso.\n\n${summary}`);
    form.reset();
    serviceInput.value = servicoData?.nome || servicoNome;
    if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
    resetTimeOptions();
  });
}

// ── Avaliações ───────────────────────────────────────────────────────────────
async function initUserBookingsPage() {
  const list = document.getElementById("user-bookings-list");
  const empty = document.getElementById("user-bookings-empty");
  if (!list) return;
  if (!requireAuth("agendar")) return;

  const today = new Date().toISOString().slice(0, 10);

  function optionList(selected, ag = null) {
    const times = parseScheduleTimes(ag?.loja?.agendaHorarios || defaultBookingTimes);
    if (selected && !times.includes(selected)) times.push(selected);
    return times.sort((a, b) => a.localeCompare(b))
      .map((hora) => `<option value="${hora}" ${hora === selected ? "selected" : ""}>${hora}</option>`)
      .join("");
  }

  function statusClass(status) {
    if (status === "finalizado") return "booking-status-done";
    if (status === "cancelado") return "booking-status-canceled";
    return "booking-status-pending";
  }

  function renderBookings(agendamentos) {
    if (!agendamentos.length) {
      list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }

    if (empty) empty.classList.add("hidden");
    list.innerHTML = agendamentos
      .map((ag) => {
        const locked = ["finalizado", "cancelado"].includes(ag.status);
        const safeId = escapeHtml(String(ag.id));
        return `
          <article class="user-booking-card" data-user-booking="${safeId}">
            <div class="booking-item-head">
              <div>
                <h3>${escapeHtml(ag.loja?.nome || "Lava jato")}</h3>
                <p class="empty-copy">${escapeHtml(ag.servico?.nome || "Serviço")} &bull; ${escapeHtml(ag.loja?.endereco || "")}</p>
              </div>
              <span class="booking-status-badge ${statusClass(ag.status)}">${escapeHtml(ag.status || "pendente")}</span>
            </div>
            <div class="field-grid">
              <div class="field">
                <label>Data</label>
                <input type="date" data-booking-date data-booking-id="${safeId}" data-shop-id="${escapeHtml(String(ag.loja?.id || ""))}" min="${today}" value="${escapeHtml(ag.data || "")}" ${locked ? "disabled" : ""} />
              </div>
              <div class="field">
                <label>Horário</label>
                <select data-booking-time ${locked ? "disabled" : ""}>${optionList(ag.hora, ag)}</select>
                <p class="empty-copy validation-msg" data-booking-availability-msg></p>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label>Veículo</label>
                <select data-booking-vehicle ${locked ? "disabled" : ""}>
                  <option value="carro" ${ag.veiculo === "carro" ? "selected" : ""}>Carro</option>
                  <option value="moto" ${ag.veiculo === "moto" ? "selected" : ""}>Moto</option>
                  <option value="caminhonete" ${ag.veiculo === "caminhonete" ? "selected" : ""}>Caminhonete</option>
                </select>
              </div>
              <div class="field">
                <label>Observações</label>
                <input type="text" data-booking-notes value="${escapeHtml(ag.notas || "")}" ${locked ? "disabled" : ""} />
              </div>
            </div>
            <div class="booking-item-actions">
              ${locked ? "" : `<button class="btn btn-secondary" type="button" data-save-user-booking="${safeId}">Salvar</button>`}
              ${locked ? "" : `<button class="btn btn-ghost" type="button" data-cancel-user-booking="${safeId}">Cancelar</button>`}
            </div>
          </article>`;
      })
      .join("");
  }

  async function loadBookings() {
    list.innerHTML = '<p class="empty-copy">Carregando agendamentos...</p>';
    try {
      const res = await userFetch("/api/agendamentos/me");
      if (res.status === 401 || res.status === 403) {
        clearCurrentUser();
        redirectToLogin("agendar");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        list.innerHTML = `<p class="empty-copy">${escapeHtml(data.error || "Erro ao carregar agendamentos.")}</p>`;
        return;
      }
      renderBookings(data.agendamentos || []);
    } catch {
      list.innerHTML = '<p class="empty-copy">Erro de conexão ao carregar agendamentos.</p>';
    }
  }

  async function refreshBookingCardAvailability(card) {
    const dateInput = card.querySelector("[data-booking-date]");
    const timeSelect = card.querySelector("[data-booking-time]");
    const msg = card.querySelector("[data-booking-availability-msg]");
    const shopId = dateInput?.dataset.shopId || "";
    const bookingId = dateInput?.dataset.bookingId || "";
    if (!dateInput?.value || !timeSelect || !shopId) return;

    const selected = timeSelect.value;
    if (msg) msg.textContent = "Consultando horários...";
    try {
      const url = `/api/lojas/${shopId}/disponibilidade?data=${encodeURIComponent(dateInput.value)}&ignorarAgendamentoId=${encodeURIComponent(bookingId)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        if (msg) msg.textContent = data.error || "Não foi possível carregar horários.";
        return;
      }
      timeSelect.innerHTML = '<option value="">Selecione</option>';
      let availableCount = 0;
      (data.horarios || []).forEach(({ hora, disponivel }) => {
        const option = document.createElement("option");
        option.value = hora;
        option.textContent = disponivel ? hora : `${hora} (ocupado)`;
        option.disabled = !disponivel;
        if (disponivel && hora === selected) option.selected = true;
        if (disponivel) availableCount += 1;
        timeSelect.appendChild(option);
      });
      if (msg) {
        msg.textContent = data.aberto === false
          ? (data.mensagem || "A loja não atende nesta data.")
          : availableCount
            ? `${availableCount} ${availableCount === 1 ? "horário disponível" : "horários disponíveis"}. Horários com (ocupado) estão reservados por outros usuários.`
            : "Nenhum horário disponível nesta data.";
      }
    } catch {
      if (msg) msg.textContent = "Erro ao consultar horários.";
    }
  }

  list.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("[data-save-user-booking]");
    const cancelBtn = event.target.closest("[data-cancel-user-booking]");
    if (!saveBtn && !cancelBtn) return;

    const id = saveBtn?.dataset.saveUserBooking || cancelBtn?.dataset.cancelUserBooking;
    const card = event.target.closest("[data-user-booking]");
    if (!id || !card) return;

    try {
      let res;
      if (cancelBtn) {
        if (!(await confirmAction("Cancelar este agendamento?", { confirmLabel: "Cancelar agendamento" }))) return;
        res = await userFetch(`/api/agendamentos/${id}/cancelar`, { method: "PUT" });
      } else {
        res = await userFetch(`/api/agendamentos/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            data: card.querySelector("[data-booking-date]").value,
            hora: card.querySelector("[data-booking-time]").value,
            veiculo: card.querySelector("[data-booking-vehicle]").value,
            notas: card.querySelector("[data-booking-notes]").value.trim() || null,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          notify("Este horário foi ocupado por outro usuário. Por favor, escolha outro horário disponível.");
        } else {
          notify(data.error || "Não foi possível atualizar o agendamento.");
        }
        return;
      }
      await loadBookings();
    } catch {
      notify("Erro de conexão. Tente novamente.");
    }
  });

  list.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-booking-date]")) return;
    const card = event.target.closest("[data-user-booking]");
    if (card) await refreshBookingCardAvailability(card);
  });

  await loadBookings();
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
          ${review.id ? `<button class="btn btn-ghost" type="button" data-report-review="${review.id}" data-report-shop="${lojaId || review.lojaId || ""}" data-report-label="avaliação de ${safeName}">Denunciar avaliação</button>` : ""}
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

  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAuth("avaliar")) return;

    const formData = new FormData(reviewForm);
    const reviewer = String(formData.get("reviewerName") || "").trim();
    const nota = Number(formData.get("rating"));
    const comentario = String(formData.get("comment") || "").trim();
    const fotoUrl = String(formData.get("photoUrl") || "").trim();
    const photoFile = formData.get("photoFile");

    if (!reviewer || !comentario || !nota) {
      notify("Preencha nome, nota e comentário para publicar sua avaliação.");
      return;
    }
    if (fotoUrl && !/^https?:\/\//i.test(fotoUrl)) {
      notify("Informe uma URL de foto válida com http ou https.");
      return;
    }

    let fotoPayload = fotoUrl || null;
    if (photoFile && photoFile.size) {
      try {
        fotoPayload = await uploadImageFile(photoFile, "avaliacao", userFetch);
      } catch (err) {
        notify(err.message || "Não foi possível usar a foto enviada.");
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
            notify(data.error || "Erro ao publicar avaliação.");
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
        notify("Erro de conexão. Tente novamente.");
        return;
      }
    }

    reviewForm.reset();
    reviewForm.classList.add("hidden");
  });
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

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "index.html";

  function normalizedNextUrl() {
    if (!next || next.startsWith("http")) return "index.html";
    return next;
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

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const auth = params.get("auth");
    if (!auth) return;

    if (auth === "success" && params.get("provider") === "google") {
      const name = String(params.get("name") || "").trim() || "Usuário Google";
      const email = String(params.get("email") || "").trim().toLowerCase();
      const token = params.get("token");
      if (!token) {
        notify("Login com Google concluído sem token de acesso. Tente novamente.");
        return;
      }
      upsertGoogleUser(name, email, token);
      notify("Login com Google realizado com sucesso.");
      window.history.replaceState({}, "", "cadastro.html");
      window.location.href = normalizedNextUrl();
      return;
    }

    if (auth === "google_not_configured") {
      notify(
        "Login Google ainda não configurado no servidor. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env.",
      );
      window.history.replaceState({}, "", "cadastro.html");
      return;
    }

    if (auth === "google_failed") {
      notify("Não foi possível concluir login com Google. Tente novamente.");
      window.history.replaceState({}, "", "cadastro.html");
    }
  }

  const reason = params.get("reason");
  if (reason === "agendar") {
    notify("Para agendar um serviço, faça login primeiro.");
    setMode("login");
  } else if (reason === "avaliar") {
    notify("Para avaliar o estabelecimento, faça login primeiro.");
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

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    if (!email || !password) { notify("Informe e-mail e senha para entrar."); return; }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha: password }),
      });
      const data = await response.json();
      if (!response.ok) { notify(data.error || "E-mail ou senha inválidos."); return; }

      setCurrentUser(
        { name: data.user.nome, email: data.user.email, authProvider: "email" },
        data.token,
      );
      notify("Login realizado com sucesso.");
      window.location.href = normalizedNextUrl();
    } catch {
      notify("Erro ao conectar com o servidor. Tente novamente.");
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const cpf = onlyDigits(formData.get("cpf"));
    const phone = onlyDigits(formData.get("phone"));
    const password = String(formData.get("password") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");
    const termsAccepted = Boolean(formData.get("terms"));

    if (!name || !email || !cpf || !phone || !password || !passwordConfirm) {
      notify("Preencha todos os campos obrigatórios.");
      return;
    }
    if (!isValidEmail(email)) { notify("Informe um e-mail válido."); return; }
    if (cpf.length !== 11) { notify("Informe um CPF válido com 11 dígitos."); return; }
    if (!(await validateCpfField())) { notify("Informe um CPF válido para continuar."); return; }
    if (phone.length < 10) { notify("Informe um telefone válido."); return; }
    if (password.length < 6) { notify("A senha precisa ter no mínimo 6 caracteres."); return; }
    if (password !== passwordConfirm) { notify("As senhas não coincidem."); return; }
    if (!termsAccepted) { notify("Você precisa aceitar os termos para criar a conta."); return; }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: name, email, cpf, telefone: phone, senha: password }),
      });
      const data = await response.json();
      if (!response.ok) { notify(data.error || "Erro ao criar conta."); return; }

      setCurrentUser(
        { name: data.user.nome, email: data.user.email, authProvider: "email" },
        data.token,
      );
      notify("Cadastro realizado com sucesso. Bem-vindo ao AutoShine.");
      signupForm.reset();
      window.location.href = normalizedNextUrl();
    } catch {
      notify("Erro ao conectar com o servidor. Tente novamente.");
    }
  });

  function startGoogleAuth() {
    const nextUrl = encodeURIComponent(normalizedNextUrl());
    window.location.href = `/auth/google?next=${nextUrl}`;
  }

  googleSignupButton.addEventListener("click", startGoogleAuth);
  googleLoginButton.addEventListener("click", startGoogleAuth);

  handleAuthQueryFeedback();
}

const adminTokenKey = "autoshine:admin-token";

// ── Inicialização por página ─────────────────────────────────────────────────
if (page === "home") {
  renderOwnerShopsOnHome();
  initCategoryFilter();
  initUseLocation();
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
}

if (page === "perfil") {
  initProfilePage();
}

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

initializePasswordVisibilityToggles();
initializeAuthRequiredLinks();
setActiveNavLink();
updateNavAuthState();
initializeSiteFooter();
initializeReportActions();
initFavoriteButtonHandling();
initHamburgerMenu();

// ── Menu hamburger mobile ────────────────────────────────────────────────────
function initHamburgerMenu() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;

  function openMenu() {
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
function getAdminToken() { return localStorage.getItem(adminTokenKey); }
function setAdminToken(t) { localStorage.setItem(adminTokenKey, t); }
function clearAdminToken() { localStorage.removeItem(adminTokenKey); }

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
  const favoritesList = document.getElementById("admin-favorites-list");
  const favoritesSummary = document.getElementById("admin-favorites-summary");
  const favoritesEmpty = document.getElementById("admin-favorites-empty");
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

  const statFields = {
    lojas: document.getElementById("admin-stat-shops"),
    bloqueadas: document.getElementById("admin-stat-blocked"),
    donos: document.getElementById("admin-stat-owners"),
    usuarios: document.getElementById("admin-stat-users"),
    agendamentos: document.getElementById("admin-stat-bookings"),
    pendentes: document.getElementById("admin-stat-pending"),
    avaliacoes: document.getElementById("admin-stat-reviews"),
    denuncias: document.getElementById("admin-stat-reports"),
    denunciasAbertas: document.getElementById("admin-stat-open-reports"),
  };

  if (!authShell || !managementShell || !loginForm || !tbody) return;

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

  function renderStat(key, value) {
    if (statFields[key]) statFields[key].textContent = String(value ?? 0);
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
    const safe = escapeHtml(value);
    const normalized = value.toLowerCase();
    const className = normalized === "finalizado" || normalized === "resolvida"
      ? "admin-status-active"
      : normalized === "cancelado" || normalized === "arquivada"
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

  async function loadSummary() {
    try {
      const res = await adminFetch("/api/admin/resumo");
      if (res.status === 401 || res.status === 403) {
        clearAdminToken();
        showAuth();
        return;
      }
      const data = await res.json();
      Object.entries(data.resumo || {}).forEach(([key, value]) => renderStat(key, value));
    } catch {
      Object.keys(statFields).forEach((key) => renderStat(key, "-"));
    }
  }

  async function loadShops() {
    tbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/lojas");
      if (res.status === 401 || res.status === 403) {
        clearAdminToken();
        showAuth();
        return;
      }
      const { lojas } = await res.json();

      if (!lojas || !lojas.length) {
        tbody.innerHTML = "";
        if (emptyMsg) emptyMsg.classList.remove("hidden");
        if (countLabel) countLabel.textContent = "Nenhum lava jato cadastrado.";
        return;
      }

      if (emptyMsg) emptyMsg.classList.add("hidden");
      if (countLabel) countLabel.textContent = `${lojas.length} lava jato${lojas.length !== 1 ? "s" : ""} no total`;

      tbody.innerHTML = lojas.map((loja) => {
        const avg = loja.avaliacoes?.length
          ? (loja.avaliacoes.reduce((s, a) => s + a.nota, 0) / loja.avaliacoes.length).toFixed(1)
          : "-";
        const totalServicos = loja._count?.servicos ?? loja.servicos?.length ?? 0;
        const statusClass = loja.bloqueado ? "admin-status-blocked" : "admin-status-active";
        const statusLabel = loja.bloqueado ? "Bloqueado" : "Ativo";
        const toggleBtn = loja.bloqueado
          ? `<button class="btn btn-secondary admin-action-btn" data-action="desbloquear" data-id="${loja.id}">Desbloquear</button>`
          : `<button class="btn btn-ghost admin-action-btn" data-action="bloquear" data-id="${loja.id}">Bloquear</button>`;

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
            <td><span class="admin-status ${statusClass}">${statusLabel}</span></td>
            <td class="admin-actions">
              <button class="btn btn-secondary admin-action-btn" data-action="editar" data-id="${loja.id}">Editar</button>
              ${toggleBtn}
              <button class="btn btn-danger admin-action-btn" data-action="excluir" data-id="${loja.id}" data-nome="${escapeHtml(loja.nome)}">Excluir</button>
            </td>
          </tr>`;
      }).join("");
    } catch {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar lojas.</td></tr>`;
    }
  }

  async function loadFavoritedShopsAdmin() {
    if (!favoritesList || !favoritesSummary || !favoritesEmpty) return;
    favoritesList.innerHTML = `<li class="admin-loading">Carregando lojas favoritadas...</li>`;
    favoritesEmpty.classList.add("hidden");
    favoritesSummary.textContent = "Carregando favoritos...";

    try {
      const res = await adminFetch("/api/admin/lojas-favoritadas");
      if (res.status === 401 || res.status === 403) {
        clearAdminToken();
        showAuth();
        return;
      }

      const data = await res.json();
      const lojas = Array.isArray(data.lojas) ? data.lojas : [];
      const totalFavoritos = Number(data.totalFavoritos || 0);
      const totalLojasFavoritadas = Number(data.totalLojasFavoritadas || lojas.length || 0);

      favoritesSummary.textContent = `${totalFavoritos} favorito${totalFavoritos !== 1 ? "s" : ""} em ${totalLojasFavoritadas} loja${totalLojasFavoritadas !== 1 ? "s" : ""}.`;

      if (!lojas.length) {
        favoritesList.innerHTML = "";
        favoritesEmpty.classList.remove("hidden");
        return;
      }

      favoritesEmpty.classList.add("hidden");
      favoritesList.innerHTML = lojas.map((loja, index) => `
        <li class="admin-favorites-item">
          <span class="admin-favorites-rank">${index + 1}</span>
          <div class="admin-favorites-main">
            <strong>${escapeHtml(loja.nome || "Loja")}</strong>
            <p class="empty-copy">${escapeHtml(loja.endereco || "Sem endereço")}</p>
          </div>
          <div>
            <span class="admin-favorites-count">${Number(loja.totalFavoritos || 0)} favorito${Number(loja.totalFavoritos || 0) !== 1 ? "s" : ""}</span>
          </div>
        </li>
      `).join("");
    } catch {
      favoritesSummary.textContent = "Não foi possível carregar as lojas favoritadas.";
      favoritesList.innerHTML = `<li class="admin-loading">Erro ao carregar favoritos.</li>`;
    }
  }

  async function loadUsers() {
    if (!usersTbody) return;
    usersTbody.innerHTML = `<tr><td colspan="5" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/usuarios");
      const { usuarios } = await res.json();
      if (!res.ok) throw new Error();
      if (usersCount) usersCount.textContent = `${usuarios.length} usuário${usuarios.length !== 1 ? "s" : ""} no total`;
      usersEmpty?.classList.toggle("hidden", Boolean(usuarios.length));
      usersTbody.innerHTML = usuarios.length ? usuarios.map((usuario) => `
        <tr>
          <td><strong>${escapeHtml(usuario.nome)}</strong><p class="empty-copy">#${usuario.id}</p></td>
          <td>${escapeHtml(usuario.email)}<p class="empty-copy">${escapeHtml(usuario.telefone || "-")}</p></td>
          <td>${usuario._count?.agendamentos || 0} agend. / ${usuario._count?.avaliacoes || 0} aval.</td>
          <td>${formatAdminDate(usuario.createdAt)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-user" data-id="${usuario.id}">Editar</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-user" data-id="${usuario.id}" data-name="${escapeHtml(usuario.nome)}">Excluir</button>
          </td>
        </tr>`).join("") : "";
    } catch {
      usersTbody.innerHTML = `<tr><td colspan="5" class="admin-loading">Erro ao carregar usuários.</td></tr>`;
    }
  }

  async function loadOwners() {
    if (!ownersTbody) return;
    ownersTbody.innerHTML = `<tr><td colspan="5" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/donos");
      const { donos } = await res.json();
      if (!res.ok) throw new Error();
      if (ownersCount) ownersCount.textContent = `${donos.length} parceiro${donos.length !== 1 ? "s" : ""} no total`;
      ownersEmpty?.classList.toggle("hidden", Boolean(donos.length));
      ownersTbody.innerHTML = donos.length ? donos.map((dono) => `
        <tr>
          <td><strong>${escapeHtml(dono.nome)}</strong><p class="empty-copy">#${dono.id}</p></td>
          <td>${escapeHtml(dono.login)}<p class="empty-copy">${escapeHtml(dono.cnpj || "-")}</p></td>
          <td>${dono._count?.lojas || 0}</td>
          <td>${formatAdminDate(dono.createdAt)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-owner" data-id="${dono.id}">Editar</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-owner" data-id="${dono.id}" data-name="${escapeHtml(dono.nome)}">Excluir</button>
          </td>
        </tr>`).join("") : "";
    } catch {
      ownersTbody.innerHTML = `<tr><td colspan="5" class="admin-loading">Erro ao carregar parceiros.</td></tr>`;
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
          <td>${escapeHtml(item.servico?.nome || "-")}</td>
          <td>${escapeHtml(item.data)} ${escapeHtml(item.hora)}</td>
          <td>${statusBadge(item.status)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="booking-status" data-status="finalizado" data-id="${item.id}">Finalizar</button>
            <button class="btn btn-ghost admin-action-btn" data-admin-resource-action="booking-status" data-status="cancelado" data-id="${item.id}">Cancelar</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-booking" data-id="${item.id}">Excluir</button>
          </td>
        </tr>`).join("") : "";
    } catch {
      bookingsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar agendamentos.</td></tr>`;
    }
  }

  async function loadReviewsAdmin() {
    if (!reviewsTbody) return;
    reviewsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
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
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="edit-review" data-id="${review.id}">Editar</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-review" data-id="${review.id}">Excluir</button>
          </td>
        </tr>`).join("") : "";
    } catch {
      reviewsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar avaliações.</td></tr>`;
    }
  }

  async function loadReportsAdmin() {
    if (!reportsTbody) return;
    reportsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Carregando...</td></tr>`;
    try {
      const res = await adminFetch("/api/admin/denuncias");
      const { denuncias } = await res.json();
      if (!res.ok) throw new Error();
      if (reportsCount) reportsCount.textContent = `${denuncias.length} denúncia${denuncias.length !== 1 ? "s" : ""} registradas`;
      reportsEmpty?.classList.toggle("hidden", Boolean(denuncias.length));
      reportsTbody.innerHTML = denuncias.length ? denuncias.map((report) => {
        const target = report.avaliacao
          ? `Avaliação #${report.avaliacao.id}`
          : report.agendamento
            ? `Agendamento #${report.agendamento.id}`
            : report.loja?.nome || "-";
        return `
        <tr>
          <td><strong>${escapeHtml(report.tipo)}</strong><p class="empty-copy">${escapeHtml(report.usuario?.email || "sem usuário")}</p></td>
          <td>${escapeHtml(target)}<p class="empty-copy">${escapeHtml(report.loja?.nome || "")}</p></td>
          <td>${escapeHtml(report.motivo)}</td>
          <td>${escapeHtml(report.detalhes || "-")}</td>
          <td>${statusBadge(report.status)}</td>
          <td class="admin-actions">
            <button class="btn btn-secondary admin-action-btn" data-admin-resource-action="report-status" data-status="em_analise" data-id="${report.id}">Analisar</button>
            <button class="btn btn-ghost admin-action-btn" data-admin-resource-action="report-status" data-status="resolvida" data-id="${report.id}">Resolver</button>
            <button class="btn btn-danger admin-action-btn" data-admin-resource-action="delete-report" data-id="${report.id}">Excluir</button>
          </td>
        </tr>`;
      }).join("") : "";
    } catch {
      reportsTbody.innerHTML = `<tr><td colspan="6" class="admin-loading">Erro ao carregar denúncias.</td></tr>`;
    }
  }

  async function refreshAdminData() {
    await Promise.all([
      loadSummary(),
      loadShops(),
      loadFavoritedShopsAdmin(),
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

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const nome = btn.dataset.nome || "este lava jato";

    if (action === "editar") {
      await loadShopForEdit(id);
      return;
    }

    if (action === "excluir") {
      if (!(await confirmAction(`Excluir permanentemente "${nome}"? Esta ação não pode ser desfeita.`, { danger: true, confirmLabel: "Excluir" }))) return;
      const res = await adminFetch(`/api/admin/lojas/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (shopIdInput?.value === id) hideEditPanel();
        await refreshAdminData();
      } else {
        notify("Erro ao excluir loja.");
      }
      return;
    }

    if (action === "bloquear" || action === "desbloquear") {
      const res = await adminFetch(`/api/admin/lojas/${id}/${action}`, { method: "PUT" });
      if (res.ok) {
        await refreshAdminData();
      } else {
        notify(`Erro ao ${action} loja.`);
      }
    }
  });

  shopForm?.addEventListener("submit", async (e) => {
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
  });

  userForm?.addEventListener("submit", async (e) => {
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
    if (senha && senha.length < 6) {
      setResourceFeedback(userFeedback, "Nova senha deve ter pelo menos 6 caracteres.", "error");
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
  });

  ownerForm?.addEventListener("submit", async (e) => {
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
    if (senha && senha.length < 6) {
      setResourceFeedback(ownerFeedback, "Nova senha deve ter pelo menos 6 caracteres.", "error");
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
  });

  reviewForm?.addEventListener("submit", async (e) => {
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
  });

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

  adminTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAdminSection(tab.dataset.adminTab));
  });

  managementShell.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest("[data-admin-resource-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.adminResourceAction;
    const id = actionBtn.dataset.id;

    try {
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
        const res = await adminFetch(`/api/admin/agendamentos/${id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: actionBtn.dataset.status }),
        });
        if (!res.ok) throw new Error("Erro ao atualizar agendamento.");
      }

      if (action === "delete-booking") {
    if (!(await confirmAction("Excluir este agendamento permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/agendamentos/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir agendamento.");
      }

      if (action === "delete-review") {
    if (!(await confirmAction("Excluir esta avaliação permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/avaliacoes/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir avaliação.");
      }

      if (action === "report-status") {
        const res = await adminFetch(`/api/admin/denuncias/${id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: actionBtn.dataset.status }),
        });
        if (!res.ok) throw new Error("Erro ao atualizar denúncia.");
      }

      if (action === "delete-report") {
    if (!(await confirmAction("Excluir esta denúncia permanentemente?", { danger: true, confirmLabel: "Excluir" }))) return;
        const res = await adminFetch(`/api/admin/denuncias/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao excluir denúncia.");
      }

      await refreshAdminData();
    } catch (err) {
      notify(err.message || "Não foi possível concluir a ação.");
    }
  });

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

  loginForm.addEventListener("submit", async (e) => {
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
  });

  logoutBtn?.addEventListener("click", () => {
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
