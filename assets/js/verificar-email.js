function initVerificarEmailPage() {
  const el = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  let token = new URLSearchParams(window.location.hash.slice(1)).get("token") || params.get("token");
  const tipo = el("email-tipo");
  tipo.value = params.get("tipo") === "dono" ? "dono" : "usuario";
  const confirm = el("email-confirm-form"), request = el("email-request-form"), link = el("email-link-form");
  const feedback = el("email-feedback");
  function message(text, error = false) {
    feedback.textContent = text;
    feedback.setAttribute("role", error ? "alert" : "status");
  }
  function sync() {
    el("email-login-link").href = `cadastro.html?perfil=${tipo.value === "dono" ? "empresa" : "cliente"}&mode=login`;
    el("email-reset-link").href = `reset-senha.html?tipo=${tipo.value}`;
    el("email-legacy-panel").classList.toggle("hidden", tipo.value !== "dono" || Boolean(token));
    try { el("email-address").value = sessionStorage.getItem(`autoshine:verificar:${tipo.value}`) || ""; } catch {}
    window.history.replaceState({}, "", `verificar-email.html?tipo=${tipo.value}`);
  }
  tipo.disabled = Boolean(token);
  confirm.classList.toggle("hidden", !token);
  request.classList.toggle("hidden", Boolean(token));
  sync(); // Retira o segredo da URL sem consumi-lo; só existe em memória.
  tipo.addEventListener("change", sync);
  let pending = false;
  async function send(form, route, body, success) {
    if (pending) return;
    pending = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message("Processando…");
    try {
      const res = await fetch(`/api/verificacao-email/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        message(data.error || "Não foi possível concluir. Tente novamente.", true);
        if (data.code === "EMAIL_TOKEN_INVALIDO") {
          token = null; tipo.disabled = false;
          confirm.classList.add("hidden"); request.classList.remove("hidden"); sync();
        }
        return;
      }
      message(data.mensagem);
      if (success) success();
    } catch {
      message("Não foi possível conectar. Tente novamente.", true);
    } finally { pending = false; button.disabled = false; }
  }
  function confirmarEmail() {
    return send(confirm, "confirmar", { token, tipo: tipo.value }, () => {
      token = null;
      confirm.classList.add("hidden");
      tipo.disabled = true;
      try { sessionStorage.removeItem(`autoshine:verificar:${tipo.value}`); } catch {}
      redirectWithNotice(el("email-login-link").href, "E-mail confirmado! Entre com sua senha. Não será necessário confirmar novamente.", "success");
    });
  }
  confirm.addEventListener("submit", event => {
    event.preventDefault();
    return confirmarEmail();
  });
  request.addEventListener("submit", event => {
    event.preventDefault();
    return send(request, "solicitar", { email: el("email-address").value.trim(), tipo: tipo.value });
  });
  link.addEventListener("submit", event => {
    event.preventDefault();
    return send(link, "vincular", { login: el("email-login").value.trim(), senha: el("email-password").value, email: el("email-new-address").value.trim() }, () => {
      el("email-address").value = el("email-new-address").value.trim();
      link.reset(); el("email-legacy-panel").open = false;
    });
  });
  // O token vem do link recebido no e-mail. Abrir o cadastro sem token não envia nada.
  if (token) return confirmarEmail();
}
if (document.body.dataset.page === "verificar-email") initVerificarEmailPage();
