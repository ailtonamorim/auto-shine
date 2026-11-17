async function initUserProfilePage() {
  if (!requireAuth("perfil")) return;

  const form = document.getElementById("profile-form");
  const passwordForm = document.getElementById("profile-password-form");
  const addressForm = document.getElementById("profile-address-form");
  const addressList = document.getElementById("profile-address-list");
  const addressAddButton = document.getElementById("profile-address-add-btn");
  const addressCancelButton = document.getElementById("profile-address-cancel-btn");
  const nameInput = document.getElementById("profile-name");
  const emailInput = document.getElementById("profile-email");
  const phoneInput = document.getElementById("profile-phone");
  const userNameLabel = document.getElementById("profile-user-name");
  const avatarLabel = document.getElementById("profile-avatar");
  const photoPreview = document.getElementById("profile-photo-preview");
  const photoInput = document.getElementById("profile-photo-input");
  const photoTrigger = document.getElementById("profile-photo-trigger");
  const photoRemoveButton = document.getElementById("profile-photo-remove");
  const historyCount = document.getElementById("profile-history-count");
  const lastBooking = document.getElementById("profile-last-booking");
  const profileThemeToggle = document.getElementById("profile-theme-toggle");

  if (!form || !passwordForm || !addressForm || !addressList) return;

  const state = { addresses: [], editingAddressId: null };

  function setSubmitState(button, loading, text) {
    if (!button) return;
    button.disabled = loading;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
    } else if (button.dataset.originalText) {
      button.textContent = text || button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function capitalizeInitials(value) {
    const text = String(value || "").trim();
    if (!text) return "U";
    return text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase() || "")
      .join("") || "U";
  }

  function setUserSummary(user) {
    const nome = user?.nome || "Usuário";
    const initials = capitalizeInitials(nome);
    const fotoPerfilUrl = String(user?.fotoPerfilUrl || "").trim();

    if (userNameLabel) userNameLabel.textContent = nome;
    if (avatarLabel) {
      avatarLabel.textContent = fotoPerfilUrl ? "" : initials;
      avatarLabel.style.backgroundImage = fotoPerfilUrl ? `url("${fotoPerfilUrl}")` : "";
      avatarLabel.classList.toggle("has-photo", Boolean(fotoPerfilUrl));
    }

    if (photoPreview) {
      photoPreview.textContent = fotoPerfilUrl ? "" : initials;
      photoPreview.style.backgroundImage = fotoPerfilUrl ? `url("${fotoPerfilUrl}")` : "";
      photoPreview.classList.toggle("has-photo", Boolean(fotoPerfilUrl));
    }

    if (nameInput) nameInput.value = nome;
    if (emailInput) emailInput.value = user?.email || "";
    if (phoneInput) phoneInput.value = user?.telefone || "";
  }

  async function uploadProfilePhoto(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      notify("Use uma imagem PNG, JPG ou WEBP.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("A imagem deve ter no máximo 5 MB.", "error");
      return;
    }

    try {
      const imagem = await readFileAsDataUrl(file);
      const response = await userFetch("/api/profile/avatar", {
        method: "POST",
        body: JSON.stringify({ imagem, nomeArquivo: file.name, escopo: "perfil" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a foto de perfil.");

      const currentUser = getCurrentUser() || {};
      setCurrentUser({ ...currentUser, fotoPerfilUrl: data.fotoPerfilUrl || "" }, getAuthToken());
      notify(data.message || "Foto de perfil atualizada com sucesso.", "success");
      await loadProfile();
    } catch (error) {
      notify(error.message || "Erro ao atualizar a foto de perfil.", "error");
    } finally {
      if (photoInput) photoInput.value = "";
    }
  }

  if (photoTrigger) {
    photoTrigger.addEventListener("click", () => photoInput?.click());
  }

  if (photoInput) {
    photoInput.addEventListener("change", async (event) => {
      const [file] = event.target.files || [];
      if (!file) return;
      await uploadProfilePhoto(file);
    });
  }

  if (photoRemoveButton) {
    photoRemoveButton.addEventListener("click", async () => {
      try {
        const response = await userFetch("/api/profile/avatar", { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível remover a foto de perfil.");

        const currentUser = getCurrentUser() || {};
        setCurrentUser({ ...currentUser, fotoPerfilUrl: "" }, getAuthToken());
        notify(data.message || "Foto removida com sucesso.", "success");
        await loadProfile();
      } catch (error) {
        notify(error.message || "Erro ao remover a foto de perfil.", "error");
      }
    });
  }

  function renderAddressList() {
    if (!state.addresses.length) {
      addressList.innerHTML = `
        <div class="profile-address-item">
          <strong>Você ainda não cadastrou nenhum endereço.</strong>
          <p>Adicione um endereço para agilizar o agendamento de serviços e entregas.</p>
        </div>
      `;
      return;
    }

    addressList.innerHTML = state.addresses.map((address) => `
      <article class="profile-address-item" data-address-id="${address.id}">
        <div class="profile-address-top">
          <div class="profile-address-name">
            <span>${escapeHtml(address.nome)}</span>
            ${address.principal ? '<span class="profile-address-badge">Principal</span>' : ""}
          </div>
        </div>
        <p>${escapeHtml(address.logradouro)}, ${escapeHtml(address.numero)}${address.complemento ? `, ${escapeHtml(address.complemento)}` : ""}</p>
        <p>${escapeHtml(address.bairro)} - ${escapeHtml(address.cidade)}/${escapeHtml(address.uf)}${address.cep ? ` • ${escapeHtml(address.cep)}` : ""}</p>
        ${address.referencia ? `<p>Referência: ${escapeHtml(address.referencia)}</p>` : ""}
        <div class="profile-address-actions">
          <button class="btn btn-secondary" type="button" data-address-action="edit" data-address-id="${address.id}">Editar</button>
          <button class="btn btn-ghost" type="button" data-address-action="delete" data-address-id="${address.id}">Excluir</button>
        </div>
      </article>
    `).join("");
  }

  function resetAddressForm() {
    addressForm.reset();
    state.editingAddressId = null;
    document.getElementById("profile-address-submit-btn").textContent = "Salvar endereço";
    document.getElementById("profile-address-form").classList.add("hidden");
  }

  function openAddressForm(address = null) {
    addressForm.classList.remove("hidden");
    if (!address) {
      addressForm.reset();
      state.editingAddressId = null;
      document.getElementById("profile-address-submit-btn").textContent = "Salvar endereço";
      return;
    }

    state.editingAddressId = address.id;
    document.getElementById("address-name").value = address.nome || "";
    document.getElementById("address-cep").value = address.cep || "";
    document.getElementById("address-logradouro").value = address.logradouro || "";
    document.getElementById("address-number").value = address.numero || "";
    document.getElementById("address-complemento").value = address.complemento || "";
    document.getElementById("address-bairro").value = address.bairro || "";
    document.getElementById("address-cidade").value = address.cidade || "";
    document.getElementById("address-uf").value = address.uf || "";
    document.getElementById("address-referencia").value = address.referencia || "";
    document.getElementById("address-principal").checked = Boolean(address.principal);
    document.getElementById("profile-address-submit-btn").textContent = "Atualizar endereço";
  }

  async function loadProfile() {
    try {
      const response = await userFetch("/api/profile");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o perfil.");

      setUserSummary(data.user || {});
      state.addresses = Array.isArray(data.addresses) ? data.addresses : [];
      renderAddressList();

      // Contas Google sem senha não podem usar a troca de senha atual.
      passwordForm.querySelectorAll("input, button").forEach((control) => {
        control.disabled = !data.user?.hasPassword;
      });
      const passwordHint = document.getElementById("profile-password-hint");
      if (passwordHint) passwordHint.textContent = data.user?.hasPassword
        ? "Use pelo menos 8 caracteres com letras e números."
        : "Sua conta usa login social e não possui senha cadastrada.";
    } catch (error) {
      notify(error.message || "Não foi possível carregar os dados do perfil.", "error");
    }
  }

  function syncThemeToggle() {
    if (!profileThemeToggle) return;
    const light = document.documentElement.dataset.theme === "light";
    profileThemeToggle.setAttribute("aria-pressed", String(light));
    profileThemeToggle.textContent = light ? "Tema claro ativo" : "Tema escuro ativo";
  }
  profileThemeToggle?.addEventListener("click", () => window.AutoShineTheme.toggle());
  window.addEventListener("autoshine:themechange", syncThemeToggle);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nome = nameInput.value.trim();
    const telefone = phoneInput.value.trim();

    if (!nome || nome.length < 2) {
      notify("Informe um nome válido para continuar.", "error");
      return;
    }

    if (!/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(telefone || "")) {
      notify("Telefone inválido. Use o formato (DD) 99999-9999.", "error");
      return;
    }

    const saveButton = document.getElementById("profile-save-btn");
    setSubmitState(saveButton, true, "Salvando...");

    try {
      const response = await userFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ nome, telefone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar os dados pessoais.");

      const currentUser = getCurrentUser() || {};
      setCurrentUser({ ...currentUser, nome, email: currentUser.email || emailInput.value }, getAuthToken());
      notify(data.message || "Dados atualizados com sucesso.", "success");
      await loadProfile();
    } catch (error) {
      notify(error.message || "Erro ao salvar dados pessoais.", "error");
    } finally {
      setSubmitState(document.getElementById("profile-save-btn"), false, "Salvar alterações");
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(passwordForm);
    const payload = {
      senhaAtual: String(formData.get("senhaAtual") || "").trim(),
      novaSenha: String(formData.get("novaSenha") || "").trim(),
      confirmarSenha: String(formData.get("confirmarSenha") || "").trim(),
    };

    if (!payload.senhaAtual || !payload.novaSenha || !payload.confirmarSenha) {
      notify("Preencha a senha atual, a nova senha e a confirmação.", "error");
      return;
    }

    if (payload.novaSenha.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(payload.novaSenha)) {
      notify("A nova senha precisa ter pelo menos 8 caracteres com letras e números.", "error");
      return;
    }

    if (payload.novaSenha !== payload.confirmarSenha) {
      notify("A confirmação da nova senha não confere.", "error");
      return;
    }

    const button = document.getElementById("profile-password-btn");
    setSubmitState(button, true, "Atualizando...");

    try {
      const response = await userFetch("/api/profile/password", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a senha.");
      notify(data.message || "Senha atualizada com sucesso.", "success");
      passwordForm.reset();
    } catch (error) {
      notify(error.message || "Erro ao atualizar a senha.", "error");
    } finally {
      setSubmitState(button, false, "Atualizar senha");
    }
  });

  addressAddButton.addEventListener("click", () => openAddressForm());
  addressCancelButton.addEventListener("click", resetAddressForm);

  addressForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(addressForm);
    const payload = {
      nome: String(formData.get("nome") || "").trim(),
      cep: String(formData.get("cep") || "").trim(),
      logradouro: String(formData.get("logradouro") || "").trim(),
      numero: String(formData.get("numero") || "").trim(),
      complemento: String(formData.get("complemento") || "").trim(),
      bairro: String(formData.get("bairro") || "").trim(),
      cidade: String(formData.get("cidade") || "").trim(),
      uf: String(formData.get("uf") || "").trim().toUpperCase(),
      referencia: String(formData.get("referencia") || "").trim(),
      principal: Boolean(formData.get("principal")),
    };

    if (!payload.nome || !payload.logradouro || !payload.numero || !payload.bairro || !payload.cidade || !payload.uf) {
      notify("Preencha todos os campos obrigatórios do endereço.", "error");
      return;
    }

    if (payload.cep && !/^\d{5}-?\d{3}$/.test(payload.cep)) {
      notify("CEP inválido. Use o formato 00000-000.", "error");
      return;
    }

    const button = document.getElementById("profile-address-submit-btn");
    setSubmitState(button, true, state.editingAddressId ? "Atualizando..." : "Salvando...");

    try {
      const url = state.editingAddressId ? `/api/profile/address/${state.editingAddressId}` : "/api/profile/address";
      const method = state.editingAddressId ? "PUT" : "POST";
      const response = await userFetch(url, {
        method,
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o endereço.");

      notify(data.message || "Endereço salvo com sucesso.", "success");
      await loadProfile();
      resetAddressForm();
    } catch (error) {
      notify(error.message || "Erro ao salvar endereço.", "error");
    } finally {
      setSubmitState(button, false, state.editingAddressId ? "Atualizar endereço" : "Salvar endereço");
    }
  });

  addressList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-address-action]");
    if (!button) return;

    const addressId = Number(button.dataset.addressId);
    const action = button.dataset.addressAction;
    const address = state.addresses.find((item) => item.id === addressId);

    if (!address) return;

    if (action === "edit") openAddressForm(address);
    if (action === "delete") {
      const confirmed = window.confirm("Deseja remover este endereço da sua conta?");
      if (!confirmed) return;

      try {
        const response = await userFetch(`/api/profile/address/${addressId}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível remover o endereço.");
        notify(data.message || "Endereço removido com sucesso.", "success");
        await loadProfile();
      } catch (error) {
        notify(error.message || "Erro ao remover endereço.", "error");
      }
    }
  });

  document.querySelectorAll("[data-profile-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.dataset.profileTab;
      document.querySelectorAll("[data-profile-tab]").forEach((item) => item.classList.toggle("is-active", item === tab));
      document.querySelectorAll("[data-profile-panel]").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.profilePanel === section);
      });
    });
  });

  syncThemeToggle();
  await loadProfile();
  try {
    const response = await userFetch("/api/agendamentos/me");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar o histórico.");
    const bookings = Array.isArray(data.agendamentos) ? data.agendamentos : [];
    if (historyCount) historyCount.textContent = String(bookings.filter((item) => item.status === "finalizado").length);
    const latest = [...bookings].sort((a, b) => String(b.createdAt || `${b.data}T${b.hora}`).localeCompare(String(a.createdAt || `${a.data}T${a.hora}`)))[0];
    if (lastBooking) {
      const date = latest?.data?.split("-").reverse().join("/");
      lastBooking.textContent = latest ? `${date} às ${latest.hora}` : "Sem registros";
    }
  } catch (error) {
    if (historyCount) historyCount.textContent = "—";
    if (lastBooking) lastBooking.textContent = "Indisponível";
    notify(error.message || "Não foi possível carregar o histórico.", "error");
  }
}

