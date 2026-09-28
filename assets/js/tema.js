/* Tema compartilhado: aplica antes da renderização e sincroniza os dois botões. */
(function () {
  const key = "autoshine-theme";
  const root = document.documentElement;
  function readPreference() {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  const system = window.matchMedia?.("(prefers-color-scheme: light)");
  function apply(theme, persist = false) {
    const next = theme === "light" ? "light" : "dark";
    root.dataset.theme = next;
    if (persist) { try { localStorage.setItem(key, next); } catch {} }
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.setAttribute("aria-pressed", String(next === "light"));
      button.setAttribute("aria-label", next === "light" ? "Ativar modo escuro" : "Ativar modo claro");
      button.title = button.getAttribute("aria-label");
      button.querySelector(".theme-icon-sun").hidden = next !== "light";
      button.querySelector(".theme-icon-moon").hidden = next === "light";
    }
    window.dispatchEvent(new CustomEvent("autoshine:themechange", { detail: { theme: next } }));
  }
  function toggle() { apply(root.dataset.theme === "light" ? "dark" : "light", true); }
  window.AutoShineTheme = { apply, toggle };
  const saved = readPreference();
  apply(saved === "light" || saved === "dark" ? saved : system?.matches ? "light" : "dark");
  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector(".topbar, .navbar");
    const button = document.createElement("button");
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.type = "button";
    button.innerHTML = '<span class="theme-icon-sun" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"/></svg></span><span class="theme-icon-moon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg></span>';
    if (host) {
      const logo = host.querySelector(".logo, .brand");
      if (logo) logo.insertAdjacentElement("afterend", button);
      else host.prepend(button);
    } else {
      button.classList.add("theme-toggle-floating");
      document.body.appendChild(button);
    }
    button.addEventListener("click", toggle);
    apply(root.dataset.theme);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key) apply(event.newValue || (system?.matches ? "light" : "dark"));
  });
  system?.addEventListener?.("change", (event) => {
    if (!readPreference()) apply(event.matches ? "light" : "dark");
  });
})();
