async function initOwnerProfilePage() {
  const defaults = {
    days: ["1", "2", "3", "4", "5", "6"],
    times: ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"],
  };

  if (!getDonoToken()) {
    window.location.href = "cadastro.html?perfil=empresa&mode=login&next=perfil-dono.html";
    return;
  }

  const state = {
    dono: null,
    lojas: [],
    selectedShopId: "",
    mainPhotoFile: null,
    coverPhotoFile: null,
    gallerySlots: [
      { file: null, existingUrl: "" },
      { file: null, existingUrl: "" },
      { file: null, existingUrl: "" },
    ],
  };

  const accountForm = document.getElementById("owner-account-form");
  const shopForm = document.getElementById("owner-shop-form");
  const serviceForm = document.getElementById("owner-service-form");
  const shopsList = document.getElementById("owner-shops-list");
  const servicesList = document.getElementById("owner-services-list");
  const shopSelect = document.getElementById("owner-shop-select");
  const shopPreview = document.getElementById("owner-shop-preview");
  const themeToggle = document.getElementById("owner-theme-toggle");
  const locationFeedback = document.getElementById("owner-location-feedback");
  const photoFeedback = document.getElementById("owner-photo-feedback");
  const mainPhotoInput = document.getElementById("owner-shop-photo-file");
  const coverPhotoInput = document.getElementById("owner-shop-cover-file");

  if (!accountForm || !shopForm || !serviceForm || !shopsList || !servicesList || !shopSelect) return;

  function setButtonState(button, loading, loadingText) {
    if (!button) return;
    button.disabled = loading;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function setFeedback(element, message = "", stateName = "") {
    if (!element) return;
    element.textContent = message;
    element.className = `owner-feedback${stateName ? ` is-${stateName}` : ""}`;
  }

  function cssUrl(value) {
    return String(value || "").replace(/[\\'"()]/g, "");
  }

  function initials(value) {
    const text = String(value || "").trim();
    if (!text) return "P";
    return text.split(/\s+/).slice(0, 2).map((item) => item[0]?.toUpperCase() || "").join("") || "P";
  }

  function selectedShop() {
    return state.lojas.find((loja) => String(loja.id) === String(state.selectedShopId)) || state.lojas[0] || null;
  }

  function averageRating(lojas) {
    const notas = lojas.flatMap((loja) => Array.isArray(loja.avaliacoes) ? loja.avaliacoes.map((a) => Number(a.nota || 0)) : []);
    if (!notas.length) return "--";
    const media = notas.reduce((sum, nota) => sum + nota, 0) / notas.length;
    return media.toFixed(1).replace(".", ",");
  }

  function updateOwnerSummary() {
    const dono = state.dono || getDonoFromToken() || {};
    const avatar = document.getElementById("owner-profile-avatar");
    const name = document.getElementById("owner-profile-name");
    const login = document.getElementById("owner-profile-login");
    const shopCount = document.getElementById("owner-profile-shop-count");
    const serviceCount = document.getElementById("owner-profile-service-count");
    const rating = document.getElementById("owner-profile-rating");
    const totalServices = state.lojas.reduce((sum, loja) => sum + (Array.isArray(loja.servicos) ? loja.servicos.length : 0), 0);

    if (avatar) avatar.textContent = initials(dono.nome || dono.login);
    if (name) name.textContent = dono.nome || "Parceiro";
    if (login) login.textContent = dono.login ? `@${dono.login}` : "Parceiro";
    if (shopCount) shopCount.textContent = String(state.lojas.length);
    if (serviceCount) serviceCount.textContent = String(totalServices);
    if (rating) rating.textContent = averageRating(state.lojas);
  }

  function fillAccountForm() {
    const dono = state.dono || {};
    document.getElementById("owner-account-name").value = dono.nome || "";
    document.getElementById("owner-account-login").value = dono.login || "";
    document.getElementById("owner-account-email").value = dono.email || "";
    document.getElementById("owner-account-cnpj").value = dono.cnpj || "";
  }

  function switchTab(name) {
    if (!Array.from(document.querySelectorAll("[data-owner-panel]")).some((panel) => panel.dataset.ownerPanel === name)) return;
    document.querySelectorAll("[data-owner-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.ownerTab === name);
    });
    document.querySelectorAll("[data-owner-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.ownerPanel === name);
    });
  }

  function syncShopSelect() {
    if (!state.lojas.length) {
      shopSelect.innerHTML = '<option value="">Nenhuma loja publicada</option>';
      shopSelect.disabled = true;
      return;
    }
    shopSelect.disabled = false;
    shopSelect.innerHTML = state.lojas.map((loja) => (
      `<option value="${escapeHtml(String(loja.id))}" ${String(loja.id) === String(state.selectedShopId) ? "selected" : ""}>${escapeHtml(loja.nome)}</option>`
    )).join("");
  }

  function readDaysFromForm() {
    return Array.from(shopForm.querySelectorAll('input[name="agendaDias"]:checked')).map((input) => input.value);
  }

  function writeDaysToForm(value) {
    const days = parseScheduleDays(value || defaults.days);
    shopForm.querySelectorAll('input[name="agendaDias"]').forEach((input) => {
      input.checked = days.includes(input.value);
    });
  }

  function setPhotoPreview(element, url) {
    if (!element) return;
    const cleanUrl = cssUrl(url);
    element.style.backgroundImage = cleanUrl ? `url("${cleanUrl}")` : "";
    element.classList.toggle("has-image", Boolean(cleanUrl));
  }

  function resetPendingImages(loja) {
    state.mainPhotoFile = null;
    state.coverPhotoFile = null;
    state.gallerySlots = parseTextList(loja?.fotosAdicionais || "")
      .slice(0, 3)
      .map((url) => ({ file: null, existingUrl: url }));
    while (state.gallerySlots.length < 3) state.gallerySlots.push({ file: null, existingUrl: "" });

    if (mainPhotoInput) mainPhotoInput.value = "";
    if (coverPhotoInput) coverPhotoInput.value = "";
    document.querySelectorAll("[data-gallery-file]").forEach((input) => {
      input.value = "";
    });
  }

  function refreshPhotoPreviews(loja) {
    setPhotoPreview(document.getElementById("owner-main-photo-preview"), loja?.fotoUrl || "");
    setPhotoPreview(document.getElementById("owner-cover-photo-preview"), loja?.capaUrl || loja?.fotoUrl || "");
    state.gallerySlots.forEach((slot, index) => {
      setPhotoPreview(document.querySelector(`[data-gallery-preview="${index}"]`), slot.file ? URL.createObjectURL(slot.file) : slot.existingUrl);
    });
  }

  function fillShopForm() {
    const loja = selectedShop();
    syncShopSelect();
    serviceForm.classList.add("hidden");
    setFeedback(locationFeedback);
    setFeedback(photoFeedback);

    if (!loja) {
      shopForm.querySelectorAll("input, textarea, button").forEach((control) => {
        control.disabled = true;
      });
      shopPreview.innerHTML = '<div class="owner-empty-state"><strong>Nenhuma loja publicada.</strong><p>Cadastre uma loja no painel do parceiro para editar o perfil por aqui.</p><a class="btn btn-primary" href="cadastro-dono.html">Cadastrar loja</a></div>';
      servicesList.innerHTML = '<div class="owner-empty-state"><p>Nenhum serviço para exibir.</p></div>';
      return;
    }

    shopForm.querySelectorAll("input, textarea, button").forEach((control) => {
      control.disabled = false;
    });

    resetPendingImages(loja);
    document.getElementById("owner-shop-name").value = loja.nome || "";
    document.getElementById("owner-shop-category").value = loja.categoria || "";
    document.getElementById("owner-shop-description").value = loja.descricao || "";
    document.getElementById("owner-shop-address").value = loja.endereco || "";
    document.getElementById("owner-shop-latitude").value = loja.latitude ?? "";
    document.getElementById("owner-shop-longitude").value = loja.longitude ?? "";
    document.getElementById("owner-shop-photo").value = loja.fotoUrl || "";
    document.getElementById("owner-shop-cover").value = loja.capaUrl || "";
    document.getElementById("owner-shop-gallery").value = parseTextList(loja.fotosAdicionais).join("\n");
    document.getElementById("owner-shop-payments").value = loja.formasPagamento || "";
    document.getElementById("owner-shop-times").value = parseScheduleTimes(loja.agendaHorarios || defaults.times).join(", ");
    document.getElementById("owner-shop-policy").value = loja.politicaCancelamento || "";
    writeDaysToForm(loja.agendaDias || defaults.days);
    refreshPhotoPreviews(loja);

    shopPreview.innerHTML = `
      <div class="owner-shop-preview-media" style="background-image:url('${escapeHtml(cssUrl(loja.capaUrl || loja.fotoUrl || ""))}')"></div>
      <div class="owner-shop-preview-copy">
        <span class="profile-user-kicker">${escapeHtml(loja.categoria || "serviços gerais")}</span>
        <h3>${escapeHtml(loja.nome || "Loja")}</h3>
        <p>${escapeHtml(loja.endereco || "Endereço não informado")}</p>
        <p>${escapeHtml(formatScheduleSummary(loja.agendaDias || defaults.days, loja.agendaHorarios || defaults.times))}</p>
      </div>
    `;

    renderServices();
  }

  function renderShops() {
    if (!state.lojas.length) {
      shopsList.innerHTML = '<div class="owner-empty-state"><strong>Nenhuma loja publicada.</strong><p>Abra o painel para cadastrar sua primeira estética automotiva.</p><a class="btn btn-primary" href="cadastro-dono.html">Cadastrar loja</a></div>';
      return;
    }

    shopsList.innerHTML = state.lojas.map((loja) => {
      const servicos = Array.isArray(loja.servicos) ? loja.servicos : [];
      const selected = String(loja.id) === String(state.selectedShopId);
      return `
        <article class="owner-shop-card">
          <div class="owner-shop-thumb" style="background-image:url('${escapeHtml(cssUrl(loja.fotoUrl || loja.capaUrl || ""))}')"></div>
          <div class="owner-shop-main">
            <div class="owner-shop-title-row">
              <div>
                <h3>${escapeHtml(loja.nome)}</h3>
                <p class="owner-shop-meta">${escapeHtml(loja.endereco || "Endereço não informado")}</p>
              </div>
              <span class="owned-shop-badge">${selected ? "Selecionada" : escapeHtml(loja.categoria || "Loja")}</span>
            </div>
            <p class="owner-shop-meta">${escapeHtml(formatScheduleSummary(loja.agendaDias || defaults.days, loja.agendaHorarios || defaults.times))}</p>
            <p class="owner-shop-meta">${servicos.length} serviço${servicos.length === 1 ? "" : "s"} cadastrado${servicos.length === 1 ? "" : "s"}</p>
            <div class="owner-shop-actions">
              <button class="btn btn-secondary" type="button" data-select-owner-shop="${escapeHtml(String(loja.id))}">Editar perfil</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderServices() {
    const loja = selectedShop();
    if (!loja) return;
    const servicos = Array.isArray(loja.servicos) ? loja.servicos : [];
    if (!servicos.length) {
      servicesList.innerHTML = '<div class="owner-empty-state"><p>Esta loja ainda não possui serviços.</p><button class="btn btn-primary" type="button" data-owner-service-empty>Novo serviço</button></div>';
      return;
    }

    servicesList.innerHTML = servicos.map((servico) => `
      <article class="owner-service-card">
        <div class="owner-service-copy">
          <div class="owner-service-title-row">
            <h3>${escapeHtml(servico.nome)}</h3>
            <strong>${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(servico.preco) || 0)}</strong>
          </div>
          <p class="owner-service-meta">${escapeHtml(servico.duracao || "Duração não informada")}</p>
          <p>${escapeHtml(servico.descricao || "Sem descrição.")}</p>
        </div>
        <div class="owner-service-actions">
          <button class="btn btn-secondary" type="button" data-edit-owner-service="${escapeHtml(String(servico.id))}">Editar</button>
          <button class="btn btn-ghost" type="button" data-delete-owner-service="${escapeHtml(String(servico.id))}">Excluir</button>
        </div>
      </article>
    `).join("");
  }

  function openServiceForm(servico = null) {
    const titleButton = document.getElementById("owner-service-save");
    document.getElementById("owner-service-id").value = servico?.id || "";
    document.getElementById("owner-service-name").value = servico?.nome || "";
    document.getElementById("owner-service-price").value = servico?.preco ?? "";
    document.getElementById("owner-service-duration").value = servico?.duracao || "";
    document.getElementById("owner-service-description").value = servico?.descricao || "";
    document.getElementById("owner-service-included").value = servico?.inclusos || "";
    document.getElementById("owner-service-steps").value = servico?.etapas || "";
    document.getElementById("owner-service-products").value = servico?.produtos || "";
    document.getElementById("owner-service-warranty").value = servico?.garantia || "";
    document.getElementById("owner-service-guidance").value = servico?.orientacoes || "";
    if (titleButton) titleButton.textContent = servico ? "Atualizar serviço" : "Salvar serviço";
    serviceForm.classList.remove("hidden");
    serviceForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadData() {
    const [ownerRes, shopsRes] = await Promise.all([
      donoFetch("/api/dono/me"),
      donoFetch("/api/lojas/minhas"),
    ]);

    if (ownerRes.status === 401 || shopsRes.status === 401) {
      clearDonoToken();
      window.location.href = "cadastro.html?perfil=empresa&mode=login&next=perfil-dono.html";
      return;
    }

    const ownerData = await ownerRes.json();
    const shopsData = await shopsRes.json();
    if (!ownerRes.ok) throw new Error(ownerData.error || "Não foi possível carregar o parceiro.");
    if (!shopsRes.ok) throw new Error(shopsData.error || "Não foi possível carregar as lojas.");

    state.dono = ownerData.dono || {};
    state.lojas = Array.isArray(shopsData.lojas) ? shopsData.lojas : [];
    if (!state.selectedShopId || !state.lojas.some((loja) => String(loja.id) === String(state.selectedShopId))) {
      state.selectedShopId = state.lojas[0] ? String(state.lojas[0].id) : "";
    }

    updateOwnerSummary();
    fillAccountForm();
    renderShops();
    fillShopForm();
  }

  async function geocodeAddress() {
    const addressInput = document.getElementById("owner-shop-address");
    const endereco = addressInput.value.trim();
    if (endereco.length < 6) {
      setFeedback(locationFeedback, "Informe um endereço mais completo.", "warning");
      return;
    }

    setFeedback(locationFeedback, "Localizando endereço...", "warning");
    try {
      const res = await fetch(`/api/geocode?endereco=${encodeURIComponent(endereco)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Endereço não encontrado.");
      const best = data.melhor || {};
      document.getElementById("owner-shop-latitude").value = best.latitude ?? "";
      document.getElementById("owner-shop-longitude").value = best.longitude ?? "";
      if (best.endereco) addressInput.value = best.endereco;
      setFeedback(locationFeedback, "Endereço localizado e pronto para salvar.", "valid");
    } catch (error) {
      setFeedback(locationFeedback, error.message || "Não foi possível localizar o endereço agora.", "invalid");
    }
  }

  async function reverseGeocode(latitude, longitude) {
    const res = await fetch(`/api/geocode/reverso?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível buscar o endereço.");
    return data.resultado || {};
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setFeedback(locationFeedback, "Seu navegador não permite capturar localização.", "invalid");
      return;
    }

    setFeedback(locationFeedback, "Aguardando permissão de localização...", "warning");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        document.getElementById("owner-shop-latitude").value = latitude;
        document.getElementById("owner-shop-longitude").value = longitude;
        try {
          const result = await reverseGeocode(latitude, longitude);
          if (result.endereco) document.getElementById("owner-shop-address").value = result.endereco;
          setFeedback(locationFeedback, "Localização capturada. Confira o endereço antes de salvar.", "valid");
        } catch {
          setFeedback(locationFeedback, "Localização capturada. Confira o endereço antes de salvar.", "warning");
        }
      },
      () => setFeedback(locationFeedback, "Não foi possível capturar sua localização.", "invalid"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handleImageSelection(file, target, index = null) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      notify("Use uma imagem PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("A imagem deve ter no máximo 5 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (target === "main") {
      state.mainPhotoFile = file;
      setPhotoPreview(document.getElementById("owner-main-photo-preview"), objectUrl);
    }
    if (target === "cover") {
      state.coverPhotoFile = file;
      setPhotoPreview(document.getElementById("owner-cover-photo-preview"), objectUrl);
    }
    if (target === "gallery" && index !== null) {
      state.gallerySlots[index] = { file, existingUrl: state.gallerySlots[index]?.existingUrl || "" };
      setPhotoPreview(document.querySelector(`[data-gallery-preview="${index}"]`), objectUrl);
    }
    setFeedback(photoFeedback, "Imagem selecionada. Ela será enviada ao salvar.", "valid");
  }

  async function resolveImagesBeforeSave(payload) {
    let fotoUrl = payload.fotoUrl;
    let capaUrl = payload.capaUrl;
    const galleryUrls = [];

    if (state.mainPhotoFile) {
      setFeedback(photoFeedback, "Enviando foto principal...", "warning");
      fotoUrl = await uploadImageFile(state.mainPhotoFile, "loja", donoFetch);
    }

    if (state.coverPhotoFile) {
      setFeedback(photoFeedback, "Enviando foto de capa...", "warning");
      capaUrl = await uploadImageFile(state.coverPhotoFile, "capa", donoFetch);
    }

    for (let index = 0; index < state.gallerySlots.length; index += 1) {
      const slot = state.gallerySlots[index];
      if (slot.file) {
        setFeedback(photoFeedback, `Enviando foto ${index + 2}...`, "warning");
        galleryUrls.push(await uploadImageFile(slot.file, "loja", donoFetch));
      } else if (slot.existingUrl) {
        galleryUrls.push(slot.existingUrl);
      }
    }

    setFeedback(photoFeedback, "");
    return {
      ...payload,
      fotoUrl,
      capaUrl: capaUrl || fotoUrl,
      fotosAdicionais: galleryUrls.filter(Boolean).join("\n"),
    };
  }

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("owner-account-save");
    const payload = {
      nome: document.getElementById("owner-account-name").value.trim(),
      email: document.getElementById("owner-account-email").value.trim(),
      cnpj: document.getElementById("owner-account-cnpj").value.trim(),
    };

    if (payload.nome.length < 2) {
      notify("Informe um nome válido.");
      return;
    }

    setButtonState(button, true, "Salvando...");
    try {
      const res = await donoFetch("/api/dono/me", { method: "PUT", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar o parceiro.");
      if (data.token) setDonoToken(data.token);
      state.dono = { ...state.dono, ...(data.dono || {}) };
      updateOwnerSummary();
      notify(data.message || "Dados salvos com sucesso.", "success");
    } catch (error) {
      notify(error.message || "Erro ao salvar dados.");
    } finally {
      setButtonState(button, false);
    }
  });

  shopForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const loja = selectedShop();
    if (!loja) return;

    const agendaDias = readDaysFromForm();
    const agendaHorarios = parseScheduleTimes(document.getElementById("owner-shop-times").value);
    let payload = {
      nome: document.getElementById("owner-shop-name").value.trim(),
      categoria: document.getElementById("owner-shop-category").value.trim() || "serviços gerais",
      descricao: document.getElementById("owner-shop-description").value.trim(),
      endereco: document.getElementById("owner-shop-address").value.trim(),
      latitude: Number(document.getElementById("owner-shop-latitude").value),
      longitude: Number(document.getElementById("owner-shop-longitude").value),
      fotoUrl: document.getElementById("owner-shop-photo").value.trim(),
      capaUrl: document.getElementById("owner-shop-cover").value.trim(),
      fotosAdicionais: document.getElementById("owner-shop-gallery").value.trim(),
      formasPagamento: parseTextList(document.getElementById("owner-shop-payments").value).join(", "),
      politicaCancelamento: document.getElementById("owner-shop-policy").value.trim(),
      agendaDias,
      agendaHorarios,
    };

    if (!payload.nome || !payload.descricao || !payload.endereco) {
      notify("Preencha nome, descrição e endereço.");
      return;
    }
    if (!coordinatesValid(payload.latitude, payload.longitude)) {
      notify("Localize o endereço antes de salvar.");
      setFeedback(locationFeedback, "Clique em “Localizar endereço” para confirmar a posição no mapa.", "warning");
      return;
    }
    if (!payload.fotoUrl && !state.mainPhotoFile) {
      notify("Adicione uma foto principal da loja.");
      return;
    }
    if (!agendaDias.length || !agendaHorarios.length) {
      notify("Configure pelo menos um dia e um horário de atendimento.");
      return;
    }

    const button = document.getElementById("owner-shop-save");
    setButtonState(button, true, "Salvando...");
    try {
      payload = await resolveImagesBeforeSave(payload);
      if (!isValidShopImagePath(payload.fotoUrl) || (payload.capaUrl && !isValidShopImagePath(payload.capaUrl))) {
        throw new Error("As imagens precisam ser arquivos enviados ou URLs válidas.");
      }

      const res = await donoFetch(`/api/lojas/${loja.id}`, { method: "PUT", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a loja.");
      notify("Perfil da loja atualizado com sucesso.", "success");
      await loadData();
    } catch (error) {
      notify(error.message || "Erro ao salvar loja.");
      setFeedback(photoFeedback, "");
    } finally {
      setButtonState(button, false);
    }
  });

  serviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const loja = selectedShop();
    if (!loja) return;

    const serviceId = document.getElementById("owner-service-id").value;
    const payload = {
      nome: document.getElementById("owner-service-name").value.trim(),
      preco: Number(document.getElementById("owner-service-price").value),
      duracao: document.getElementById("owner-service-duration").value.trim(),
      descricao: document.getElementById("owner-service-description").value.trim(),
      inclusos: document.getElementById("owner-service-included").value.trim(),
      etapas: document.getElementById("owner-service-steps").value.trim(),
      produtos: document.getElementById("owner-service-products").value.trim(),
      garantia: document.getElementById("owner-service-warranty").value.trim(),
      orientacoes: document.getElementById("owner-service-guidance").value.trim(),
    };

    if (!payload.nome || !payload.descricao || !payload.duracao || !Number.isFinite(payload.preco)) {
      notify("Preencha nome, preço, duração e descrição do serviço.");
      return;
    }

    const button = document.getElementById("owner-service-save");
    setButtonState(button, true, "Salvando...");
    try {
      const url = serviceId ? `/api/lojas/${loja.id}/servicos/${serviceId}` : `/api/lojas/${loja.id}/servicos`;
      const method = serviceId ? "PUT" : "POST";
      const res = await donoFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar o serviço.");
      notify(serviceId ? "Serviço atualizado com sucesso." : "Serviço criado com sucesso.", "success");
      serviceForm.reset();
      serviceForm.classList.add("hidden");
      await loadData();
    } catch (error) {
      notify(error.message || "Erro ao salvar serviço.");
    } finally {
      setButtonState(button, false);
    }
  });

  document.getElementById("owner-geocode-address")?.addEventListener("click", geocodeAddress);
  document.getElementById("owner-use-location")?.addEventListener("click", useCurrentLocation);
  mainPhotoInput?.addEventListener("change", (event) => handleImageSelection(event.target.files?.[0], "main"));
  coverPhotoInput?.addEventListener("change", (event) => handleImageSelection(event.target.files?.[0], "cover"));
  document.querySelectorAll("[data-gallery-file]").forEach((input) => {
    input.addEventListener("change", (event) => {
      handleImageSelection(event.target.files?.[0], "gallery", Number(input.dataset.galleryFile));
    });
  });

  document.getElementById("owner-service-new")?.addEventListener("click", () => openServiceForm());
  document.getElementById("owner-service-cancel")?.addEventListener("click", () => {
    serviceForm.reset();
    serviceForm.classList.add("hidden");
  });

  document.getElementById("owner-logout-btn")?.addEventListener("click", async () => {
    try {
      await logoutFromServer();
    } catch (error) {
      notify(error.message || "Não foi possível encerrar a sessão.");
      return;
    }
    clearDonoToken();
    window.location.href = "index.html";
  });

  shopsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-owner-shop]");
    if (!button) return;
    state.selectedShopId = button.dataset.selectOwnerShop;
    renderShops();
    fillShopForm();
    switchTab("perfil-loja");
  });

  shopSelect.addEventListener("change", () => {
    state.selectedShopId = shopSelect.value;
    renderShops();
    fillShopForm();
  });

  servicesList.addEventListener("click", async (event) => {
    if (event.target.closest("[data-owner-service-empty]")) {
      openServiceForm();
      return;
    }

    const loja = selectedShop();
    if (!loja) return;

    const editButton = event.target.closest("[data-edit-owner-service]");
    if (editButton) {
      const servico = (loja.servicos || []).find((item) => String(item.id) === String(editButton.dataset.editOwnerService));
      if (servico) openServiceForm(servico);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-owner-service]");
    if (!deleteButton) return;
    const confirmed = window.confirm("Deseja excluir este serviço?");
    if (!confirmed) return;

    try {
      const res = await donoFetch(`/api/lojas/${loja.id}/servicos/${deleteButton.dataset.deleteOwnerService}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o serviço.");
      notify("Serviço removido com sucesso.", "success");
      await loadData();
    } catch (error) {
      notify(error.message || "Erro ao excluir serviço.");
    }
  });

  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-owner-tab]");
    if (!tab) return;
    if (tab.tagName === "A") event.preventDefault();
    switchTab(tab.dataset.ownerTab);
    if (tab.tagName === "A") {
      window.history.replaceState(null, "", `#${tab.dataset.ownerTab}`);
    }
  });
  const initialTab = window.location.hash.slice(1);
  if (initialTab) switchTab(initialTab);

  function syncThemeToggle() {
    if (!themeToggle) return;
    const light = document.documentElement.dataset.theme === "light";
    themeToggle.setAttribute("aria-pressed", String(light));
    themeToggle.textContent = light ? "Tema claro ativo" : "Tema escuro ativo";
  }

  themeToggle?.addEventListener("click", () => window.AutoShineTheme.toggle());
  window.addEventListener("autoshine:themechange", syncThemeToggle);

  try {
    await loadData();
    syncThemeToggle();
  } catch (error) {
    notify(error.message || "Não foi possível carregar o perfil do parceiro.");
  }
}
