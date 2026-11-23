/* Menu de conta do colega, integrado à navegação atual de cliente e parceiro. */
(function () {
  window.createUserProfileMenu = function (user, onLogout) {
    const menu = document.createElement("div");
    menu.className = "user-menu";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-menu-button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Abrir menu da minha conta");
    const label = document.createElement("span");
    label.className = "user-menu-label";
    label.textContent = `Olá, ${user?.nome || user?.name || "Usuário"}`;
    button.append(label);
    const panel = document.createElement("div");
    panel.className = "user-menu-panel";
    panel.hidden = true;
    for (const [title, href] of [["Meu Perfil", "perfil-usuario.html"], ["Meus Agendamentos", "meus-agendamentos.html"], ["Favoritos", "favoritos.html"]]) {
      const link = document.createElement("a");
      link.className = "user-menu-item";
      link.href = href;
      link.textContent = title;
      if (location.pathname.endsWith(href)) link.setAttribute("aria-current", "page");
      panel.append(link);
    }
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "user-menu-item user-menu-logout";
    logout.textContent = "Sair";
    logout.addEventListener("click", onLogout);
    panel.append(logout);
    button.addEventListener("click", () => {
      if (panel.hidden && !menu.closest(".main-nav")) {
        const nav = menu.closest(".topbar")?.querySelector(".main-nav.is-open");
        const toggle = nav?.parentElement.querySelector(".nav-toggle");
        if (toggle) toggle.click();
      }
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    });
    menu.addEventListener("focusout", (event) => {
      if (!menu.contains(event.relatedTarget)) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    menu.append(button, panel);
    return menu;
  };
  document.addEventListener("click", (event) => {
    document.querySelectorAll(".user-menu").forEach((menu) => {
      if (!menu.contains(event.target)) {
        menu.querySelector(".user-menu-panel").hidden = true;
        menu.querySelector(".user-menu-button").setAttribute("aria-expanded", "false");
      }
    });
  });
  // A home possui JS próprio: acrescenta a conta sem carregar a lógica de Serviços.
  document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".navbar");
    if (!header) return;
    let user = null;
    let token = null;
    let partner = null;
    let adminToken = null;
    try {
      user = JSON.parse(localStorage.getItem("autoshine:current-user") || "null");
      token = localStorage.getItem("autoshine:token");
      const partnerToken = localStorage.getItem("autoshine:dono-token");
      const savedAdminToken = localStorage.getItem("autoshine:admin-token");
      if (partnerToken) {
        try {
          const payload = JSON.parse(atob(partnerToken.split(".")[1]));
          if ((payload.role === "partner" && payload.donoId) || (!payload.role && payload.donoId)) partner = payload;
        } catch {}
      }
      if (savedAdminToken) {
        try {
          const payload = JSON.parse(atob(savedAdminToken.split(".")[1]));
          if ((payload.role === "admin" && payload.adminRole) || (!payload.role && payload.adminRole)) adminToken = savedAdminToken;
        } catch {}
      }
    } catch {}
    const clientToken = (() => {
      if (!token) return false;
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return (payload.role === "client" && payload.id) || (!payload.role && payload.id && !payload.donoId && !payload.adminRole);
      } catch {
        return false;
      }
    })();
    const client = !partner && !adminToken && user && clientToken;
    header.querySelectorAll('a[href*="perfil-dono.html"], a[href*="cadastro-dono.html"]').forEach((link) => {
      link.hidden = !partner;
    });
    header.querySelectorAll('a[href*="admin.html"]').forEach((link) => {
      link.hidden = !adminToken;
    });
    header.querySelectorAll('a[href*="perfil-usuario.html"], a[href*="meus-agendamentos.html"], a[href*="favoritos.html"]').forEach((link) => {
      link.hidden = !client;
    });
    const access = header.querySelector(".btn-acessar");
    if (access) access.hidden = Boolean(client || partner || adminToken);
    if (client) {
      const menu = window.createUserProfileMenu(user, () => {
        localStorage.removeItem("autoshine:current-user");
        localStorage.removeItem("autoshine:token");
        location.href = "/auth/logout";
      });
      if (access) access.insertAdjacentElement("afterend", menu);
      else header.append(menu);
    }
    if (partner) {
      const link = document.createElement("a");
      link.href = "cadastro-dono.html";
      link.textContent = "Painel do parceiro";
      header.querySelector(".nav-links")?.append(link);
    }
  });
})();
