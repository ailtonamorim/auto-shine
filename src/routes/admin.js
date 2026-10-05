const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { autenticarAdmin } = require("../middlewares/auth");
const { limitarAuth } = require("../middlewares/security");
const { gerarTokenAdmin, definirCookieAuth, limparCookieAuth } = require("../utils/tokens");
const { normalizarLoginDono, normalizarCnpj, normalizarEmail, normalizarCpf, normalizarTelefone, emailValido, cnpjTemDigitoValido, cpfTemDigitoValido, fotoAvaliacaoValida, serializarFotosAdicionais, serializarListaTexto, coordenadasValidas, imagemLojaValida } = require("../utils/validators");
const { serializarAgendaDias, serializarAgendaHorarios, diasPadraoAgenda, horariosPadrao } = require("../utils/agenda");
const { deletarLojaComRelacionados, prepararLojaAdmin, prepararServicosAdmin } = require("../utils/loja");
const { criptografar, descriptografarSeNecessario, criarIndice } = require("../utils/crypto");
const { buscarAudits, resumoSuspeitas, registrarAudit, TiposAcao } = require("../utils/audit");
const { removerCamposCriptografados, sanitizarTexto, mascararEmail, mascararNomeCliente } = require("../utils/masking");
const { serializarUsuarioAdmin, serializarDonoAdmin, serializarLojaAdmin } = require("../utils/serializers");

const router = express.Router();

const adminLogin = process.env.ADMIN_LOGIN;
const adminSenha = process.env.ADMIN_SENHA;

const usuarioAdminSelect = {
  id: true, nome: true, email: true, cpf: true, telefone: true, createdAt: true,
  _count: { select: { agendamentos: true, avaliacoes: true, denuncias: true } },
};

const donoAdminSelect = {
  id: true, nome: true, login: true, cnpj: true, createdAt: true,
  _count: { select: { lojas: true } },
};

const avaliacaoAdminInclude = {
  usuario: { select: { id: true, nome: true, email: true } },
  loja: { select: { id: true, nome: true } },
  _count: { select: { denuncias: true } },
};

function avaliacaoProtegida(avaliacao) {
  if (!avaliacao?.usuario) return avaliacao;
  return { ...avaliacao, usuario: { ...avaliacao.usuario, email: avaliacao.usuario.email ? mascararEmail(descriptografarSeNecessario(avaliacao.usuario.email)) : null } };
}

function serializarAgendamentoAdmin(item) {
  const nomeCliente = descriptografarSeNecessario(item.nomeCliente);
  const emailCliente = descriptografarSeNecessario(item.emailCliente);
  const usuarioEmail = item.usuario ? descriptografarSeNecessario(item.usuario.email) : null;

  return {
    ...removerCamposCriptografados(item),
    notas: sanitizarTexto(descriptografarSeNecessario(item.notas)),
    nomeCliente: nomeCliente ? mascararNomeCliente(nomeCliente, item.usuarioId || item.id) : null,
    emailCliente: emailCliente ? mascararEmail(emailCliente) : null,
    usuario: item.usuario ? { ...item.usuario, email: usuarioEmail ? mascararEmail(usuarioEmail) : null } : null,
  };
}

router.post("/login", limitarAuth, async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) return res.status(401).json({ error: "Login ou senha incorretos." });
  try {
    const loginOk = crypto.timingSafeEqual(Buffer.from(login), Buffer.from(adminLogin));
    const senhaOk = crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(adminSenha));
    if (!loginOk || !senhaOk) return res.status(401).json({ error: "Login ou senha incorretos." });
  } catch {
    return res.status(401).json({ error: "Login ou senha incorretos." });
  }
  definirCookieAuth(res, "admin", gerarTokenAdmin());
  res.json({ ok: true });
});

router.get("/session", autenticarAdmin, (_req, res) => res.json({ authenticated: true }));
router.post("/logout", (_req, res) => {
  limparCookieAuth(res, "admin");
  res.json({ ok: true });
});

router.get("/resumo", autenticarAdmin, async (_req, res) => {
  try {
    const [lojas, bloqueadas, donos, usuarios, agendamentos, pendentes, avaliacoes, denuncias, denunciasAbertas] = await Promise.all([
      prisma.loja.count(), prisma.loja.count({ where: { bloqueado: true } }), prisma.dono.count(), prisma.usuario.count(),
      prisma.agendamento.count(), prisma.agendamento.count({ where: { status: "pendente" } }),
      prisma.avaliacao.count(), prisma.denuncia.count(), prisma.denuncia.count({ where: { status: "aberta" } }),
    ]);
    res.json({ resumo: { lojas, bloqueadas, donos, usuarios, agendamentos, pendentes, avaliacoes, denuncias, denunciasAbertas } });
  } catch {
    res.status(500).json({ error: "Erro ao carregar resumo admin." });
  }
});

router.get("/auditoria", autenticarAdmin, async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 1000);
    const diasRetro = Math.min(Math.max(Number(req.query.diasRetro) || 30, 1), 365);
    const [audits, suspeitas] = await Promise.all([
      buscarAudits({ acao: req.query.acao || null, tabela: req.query.tabela || null, diasRetro, limite }),
      resumoSuspeitas(diasRetro),
    ]);
    res.json({ audits, suspeitas });
  } catch {
    res.status(500).json({ error: "Erro ao carregar auditoria." });
  }
});

router.get("/lojas", autenticarAdmin, async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      include: { dono: { select: { id: true, nome: true, login: true, cnpj: true } }, servicos: true, _count: { select: { servicos: true, avaliacoes: true } }, avaliacoes: { select: { nota: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas: lojas.map((loja) => serializarLojaAdmin(loja)) });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/lojas-favoritadas", autenticarAdmin, async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({ select: { id: true, nome: true, endereco: true, fotoUrl: true, bloqueado: true, _count: { select: { favoritos: true } } } });
    const lojasFavoritadas = lojas
      .map((loja) => ({ id: loja.id, nome: loja.nome, endereco: loja.endereco, fotoUrl: loja.fotoUrl, bloqueado: loja.bloqueado, totalFavoritos: loja._count?.favoritos || 0 }))
      .filter((loja) => loja.totalFavoritos > 0)
      .sort((a, b) => b.totalFavoritos !== a.totalFavoritos ? b.totalFavoritos - a.totalFavoritos : a.nome.localeCompare(b.nome, "pt-BR"));
    const totalFavoritos = lojasFavoritadas.reduce((acc, loja) => acc + loja.totalFavoritos, 0);
    res.json({ lojas: lojasFavoritadas, totalLojasFavoritadas: lojasFavoritadas.length, totalFavoritos });
  } catch {
    res.status(500).json({ error: "Erro ao carregar lojas favoritadas." });
  }
});

router.get("/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findUnique({
      where: { id },
      include: { dono: { select: { id: true, nome: true, login: true, cnpj: true } }, servicos: { orderBy: { id: "asc" } }, avaliacoes: { select: { nota: true } } },
    });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json({ loja: serializarLojaAdmin(loja, { cnpjDonoCompleto: true }) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar loja." });
  }
});

router.put("/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.loja.findUnique({ where: { id }, include: { dono: { select: { id: true, nome: true, login: true, cnpj: true } } } });
    if (!atual) return res.status(404).json({ error: "Loja não encontrada." });

    const { dono: donoInput, loja: lojaInput, servicos: servicosInput } = req.body || {};
    const donoNome = String(donoInput?.nome || atual.dono.nome).trim();
    const donoLogin = normalizarLoginDono(donoInput?.login || atual.dono.login);
    const cnpjAtual = normalizarCnpj(descriptografarSeNecessario(atual.dono.cnpj));
    const cnpj = normalizarCnpj(donoInput?.cnpj ?? cnpjAtual);
    const cnpjAlterado = cnpj !== cnpjAtual;

    if (!donoNome || !donoLogin) return res.status(400).json({ error: "Informe nome e login do parceiro." });
    if (donoLogin.length < 4) return res.status(400).json({ error: "Login do parceiro deve ter pelo menos 4 caracteres." });
    if (cnpjAlterado && cnpj && !cnpjTemDigitoValido(cnpj)) return res.status(400).json({ error: "CNPJ inválido." });

    if (donoLogin !== atual.dono.login) {
      const loginExistente = await prisma.dono.findUnique({ where: { login: donoLogin } });
      if (loginExistente && loginExistente.id !== atual.donoId) return res.status(409).json({ error: "Este login ja pertence a outro parceiro." });
    }
    if (cnpj && cnpjAlterado) {
      const cnpjExistente = await prisma.dono.findFirst({ where: { cnpjIndex: criarIndice(cnpj) } });
      if (cnpjExistente && cnpjExistente.id !== atual.donoId) return res.status(409).json({ error: "Este CNPJ ja pertence a outro parceiro." });
    }

    const cnpjCipher = cnpj ? criptografar(cnpj) : null;
    const donoUpdate = { nome: donoNome, login: donoLogin, cnpj: cnpjCipher, cnpjCipher, cnpjIndex: criarIndice(cnpj) };
    const novaSenha = String(donoInput?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      donoUpdate.senha = await bcrypt.hash(novaSenha, 10);
    }

    const lojaData = prepararLojaAdmin({ ...atual, ...(lojaInput || {}) });
    const servicos = prepararServicosAdmin(servicosInput);
    if (Array.isArray(servicosInput) && !servicos.length) return res.status(400).json({ error: "Adicione pelo menos um serviço para a loja." });
    for (const servico of servicos) {
      if (!servico.nome || !servico.descricao || !servico.duracao || !Number.isFinite(servico.preco) || servico.preco < 0) {
        return res.status(400).json({ error: "Preencha nome, descrição, preço e duração dos serviços." });
      }
    }

    const completa = await prisma.$transaction(async (tx) => {
      await tx.dono.update({ where: { id: atual.donoId }, data: donoUpdate });
      const loja = await tx.loja.update({ where: { id }, data: lojaData });
      const idsMantidos = [];
      for (const servico of servicos) {
        const { id: servicoId, ...servicoData } = servico;
        if (servicoId) {
          const existente = await tx.servicoLoja.findFirst({ where: { id: servicoId, lojaId: id } });
          if (existente) { await tx.servicoLoja.update({ where: { id: servicoId }, data: servicoData }); idsMantidos.push(servicoId); }
        } else {
          const criado = await tx.servicoLoja.create({ data: { ...servicoData, lojaId: id } });
          idsMantidos.push(criado.id);
        }
      }
      if (Array.isArray(servicosInput)) {
        const whereRemovidos = { lojaId: id, ...(idsMantidos.length ? { id: { notIn: idsMantidos } } : {}) };
        const removidosComAgendamento = await tx.servicoLoja.findFirst({ where: { ...whereRemovidos, agendamentos: { some: {} } }, select: { nome: true } });
        if (removidosComAgendamento) {
          const erro = new Error(`O serviço "${removidosComAgendamento.nome}" possui agendamentos e não pode ser removido pelo editor admin.`);
          erro.status = 400;
          throw erro;
        }
        await tx.servicoLoja.deleteMany({ where: whereRemovidos });
      }
      return tx.loja.findUnique({ where: { id: loja.id }, include: { dono: { select: { id: true, nome: true, login: true, cnpj: true } }, servicos: true } });
    });
    res.json({ loja: serializarLojaAdmin(completa) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao atualizar loja pelo admin." });
  }
});

router.put("/lojas/:id/bloquear", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.update({ where: { id }, data: { bloqueado: true } });
    res.json({ loja: serializarLojaAdmin(loja) });
  } catch {
    res.status(500).json({ error: "Erro ao bloquear loja." });
  }
});

router.put("/lojas/:id/desbloquear", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.update({ where: { id }, data: { bloqueado: false } });
    res.json({ loja: serializarLojaAdmin(loja) });
  } catch {
    res.status(500).json({ error: "Erro ao desbloquear loja." });
  }
});

router.delete("/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findUnique({ where: { id }, select: { nome: true, donoId: true } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    await deletarLojaComRelacionados(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir loja." });
  }
});

router.get("/usuarios", autenticarAdmin, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: usuarioAdminSelect,
      orderBy: { createdAt: "desc" },
    });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Usuario", enderecoIp: req.ip, detalhes: { quantidade: usuarios.length, ator: "admin" } });
    res.json({ usuarios: usuarios.map((usuario) => serializarUsuarioAdmin(usuario)) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar usuários." });
  }
});

router.get("/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: usuarioAdminSelect });
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado." });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Usuario", recordId: id, enderecoIp: req.ip, detalhes: { ator: "admin" } });
    res.json({ usuario: serializarUsuarioAdmin(usuario, { cpfCompleto: true }) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar usuario." });
  }
});

router.put("/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.usuario.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Usuario nao encontrado." });
    const nome = String(req.body?.nome ?? atual.nome).trim();
    const emailAtual = descriptografarSeNecessario(atual.email);
    const cpfAtual = descriptografarSeNecessario(atual.cpf);
    const telefoneAtual = descriptografarSeNecessario(atual.telefone);
    const email = normalizarEmail(req.body?.email ?? emailAtual);
    const cpf = req.body?.cpf === undefined ? cpfAtual : normalizarCpf(req.body.cpf);
    const telefone = req.body?.telefone === undefined ? telefoneAtual : normalizarTelefone(req.body.telefone);
    const cpfAlterado = cpf !== (atual.cpf || "");
    const telefoneAlterado = telefone !== (atual.telefone || "");
    if (!nome || !email) return res.status(400).json({ error: "Informe nome e email." });
    if (!emailValido(email)) return res.status(400).json({ error: "Email invalido." });
    if (cpfAlterado && cpf && !cpfTemDigitoValido(cpf)) return res.status(400).json({ error: "CPF invalido." });
    if (telefoneAlterado && telefone && telefone.length < 10) return res.status(400).json({ error: "Telefone invalido." });
    if (email !== emailAtual) {
      const emailExistente = await prisma.usuario.findUnique({ where: { emailIndex: criarIndice(email) } });
      if (emailExistente && emailExistente.id !== id) return res.status(409).json({ error: "Este email ja pertence a outro usuario." });
    }
    if (cpf && cpfAlterado) {
      const cpfExistente = await prisma.usuario.findFirst({ where: { cpfIndex: criarIndice(cpf) } });
      if (cpfExistente && cpfExistente.id !== id) return res.status(409).json({ error: "Este CPF ja pertence a outro usuario." });
    }
    const emailCipher = criptografar(email);
    const cpfCipher = cpf ? criptografar(cpf) : null;
    const telefoneCipher = telefone ? criptografar(telefone) : null;
    const data = { nome, email: emailCipher, emailCipher, emailIndex: criarIndice(email), cpf: cpfCipher, cpfCipher, cpfIndex: criarIndice(cpf), telefone: telefoneCipher, telefoneCipher, telefoneIndex: criarIndice(telefone) };
    const novaSenha = String(req.body?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      data.senha = await bcrypt.hash(novaSenha, 10);
    }
    const usuario = await prisma.usuario.update({ where: { id }, data, select: usuarioAdminSelect });
    res.json({ usuario: serializarUsuarioAdmin(usuario) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar usuario." });
  }
});

router.delete("/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.$transaction([
      prisma.agendamento.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.avaliacao.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.denuncia.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.usuario.delete({ where: { id } }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

router.get("/donos", autenticarAdmin, async (req, res) => {
  try {
    const donos = await prisma.dono.findMany({
      select: donoAdminSelect,
      orderBy: { createdAt: "desc" },
    });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Dono", enderecoIp: req.ip, detalhes: { quantidade: donos.length, ator: "admin" } });
    res.json({ donos: donos.map((dono) => serializarDonoAdmin(dono)) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar parceiros." });
  }
});

router.get("/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const dono = await prisma.dono.findUnique({ where: { id }, select: donoAdminSelect });
    if (!dono) return res.status(404).json({ error: "Parceiro nao encontrado." });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Dono", recordId: id, enderecoIp: req.ip, detalhes: { ator: "admin" } });
    res.json({ dono: serializarDonoAdmin(dono, { cnpjCompleto: true }) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar parceiro." });
  }
});

router.put("/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.dono.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Parceiro nao encontrado." });
    const nome = String(req.body?.nome ?? atual.nome).trim();
    const login = normalizarLoginDono(req.body?.login ?? atual.login);
    const cnpjAtual = descriptografarSeNecessario(atual.cnpj);
    const cnpj = req.body?.cnpj === undefined ? cnpjAtual : normalizarCnpj(req.body.cnpj);
    const cnpjAlterado = cnpj !== (cnpjAtual || "");
    if (!nome || !login) return res.status(400).json({ error: "Informe nome e login do parceiro." });
    if (login.length < 4) return res.status(400).json({ error: "Login do parceiro deve ter pelo menos 4 caracteres." });
    if (cnpjAlterado && cnpj && !cnpjTemDigitoValido(cnpj)) return res.status(400).json({ error: "CNPJ invalido." });
    if (login !== atual.login) {
      const loginExistente = await prisma.dono.findUnique({ where: { login } });
      if (loginExistente && loginExistente.id !== id) return res.status(409).json({ error: "Este login ja pertence a outro parceiro." });
    }
    if (cnpj && cnpjAlterado) {
      const cnpjExistente = await prisma.dono.findFirst({ where: { cnpjIndex: criarIndice(cnpj) } });
      if (cnpjExistente && cnpjExistente.id !== id) return res.status(409).json({ error: "Este CNPJ ja pertence a outro parceiro." });
    }
    const cnpjCipher = cnpj ? criptografar(cnpj) : null;
    const data = { nome, login, cnpj: cnpjCipher, cnpjCipher, cnpjIndex: criarIndice(cnpj) };
    const novaSenha = String(req.body?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      data.senha = await bcrypt.hash(novaSenha, 10);
    }
    const dono = await prisma.dono.update({ where: { id }, data, select: donoAdminSelect });
    res.json({ dono: serializarDonoAdmin(dono) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar parceiro." });
  }
});

router.delete("/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const lojas = await prisma.loja.findMany({ where: { donoId: id }, select: { id: true } });
    for (const loja of lojas) await deletarLojaComRelacionados(loja.id);
    await prisma.dono.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir parceiro." });
  }
});

router.get("/agendamentos", autenticarAdmin, async (req, res) => {
  try {
    const agendamentos = await prisma.agendamento.findMany({
      include: { usuario: { select: { id: true, nome: true, email: true } }, loja: { select: { id: true, nome: true } }, servico: { select: { id: true, nome: true, preco: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Agendamento", enderecoIp: req.ip, detalhes: { quantidade: agendamentos.length, ator: "admin" } });
    res.json({ agendamentos: agendamentos.map(serializarAgendamentoAdmin) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar agendamentos." });
  }
});

router.put("/agendamentos/:id/status", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!id || !["pendente", "finalizado", "cancelado"].includes(status)) return res.status(400).json({ error: "Status invalido." });
    const agendamento = await prisma.agendamento.update({ where: { id }, data: { status } });
    await registrarAudit({ acao: TiposAcao.ATUALIZAR, tabela: "Agendamento", recordId: id, enderecoIp: req.ip, detalhes: { status, ator: "admin" } });
    res.json({ agendamento: serializarAgendamentoAdmin(agendamento) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

router.delete("/agendamentos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.deleteMany({ where: { agendamentoId: id } });
    await prisma.avaliacao.deleteMany({ where: { agendamentoId: id } });
    await prisma.agendamento.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir agendamento." });
  }
});

router.get("/avaliacoes", autenticarAdmin, async (req, res) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      include: { usuario: { select: { id: true, nome: true, email: true } }, loja: { select: { id: true, nome: true } }, _count: { select: { denuncias: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Avaliacao", enderecoIp: req.ip, detalhes: { quantidade: avaliacoes.length, ator: "admin" } });
    res.json({ avaliacoes: avaliacoes.map(avaliacaoProtegida) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar avaliações." });
  }
});

router.get("/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const avaliacao = await prisma.avaliacao.findUnique({ where: { id }, include: avaliacaoAdminInclude });
    if (!avaliacao) return res.status(404).json({ error: "Avaliacao nao encontrada." });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Avaliacao", recordId: id, enderecoIp: req.ip, detalhes: { ator: "admin" } });
    res.json({ avaliacao: avaliacaoProtegida(avaliacao) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar avaliacao." });
  }
});

router.put("/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.avaliacao.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Avaliacao nao encontrada." });
    const nota = req.body?.nota === undefined ? atual.nota : Number(req.body.nota);
    const comentario = req.body?.comentario === undefined ? atual.comentario : String(req.body.comentario || "").trim();
    const fotoUrl = req.body?.fotoUrl === undefined ? atual.fotoUrl : String(req.body.fotoUrl || "").trim();
    const nomeCliente = req.body?.nomeCliente === undefined ? atual.nomeCliente : String(req.body.nomeCliente || "").trim();
    if (req.body?.aprovado !== undefined && typeof req.body.aprovado !== "boolean") return res.status(400).json({ error: "Estado de aprovação inválido." });
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) return res.status(400).json({ error: "Nota deve ser um inteiro entre 1 e 5." });
    if (!fotoAvaliacaoValida(fotoUrl)) return res.status(400).json({ error: "Foto deve ser uma URL http/https ou imagem PNG, JPG ou WEBP de ate 2 MB." });
    const avaliacao = await prisma.avaliacao.update({
      where: { id },
      data: { nota, comentario: comentario || null, fotoUrl: fotoUrl || null, nomeCliente: nomeCliente || null, aprovado: req.body?.aprovado ?? atual.aprovado },
      include: avaliacaoAdminInclude,
    });
    await registrarAudit({ acao: TiposAcao.ATUALIZAR, tabela: "Avaliacao", recordId: id, enderecoIp: req.ip, detalhes: { aprovado: avaliacao.aprovado, ator: "admin" } });
    res.json({ avaliacao: avaliacaoProtegida(avaliacao) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar avaliacao." });
  }
});

router.patch("/avaliacoes/:id/aprovacao", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || typeof req.body?.aprovado !== "boolean") return res.status(400).json({ error: "Informe se a avaliação deve ser aprovada." });
    const avaliacao = await prisma.avaliacao.update({ where: { id }, data: { aprovado: req.body.aprovado } });
    await registrarAudit({ acao: TiposAcao.ATUALIZAR, tabela: "Avaliacao", recordId: id, enderecoIp: req.ip, detalhes: { aprovado: avaliacao.aprovado } });
    res.json({ avaliacao: { id: avaliacao.id, aprovado: avaliacao.aprovado } });
  } catch {
    res.status(500).json({ error: "Erro ao moderar avaliação." });
  }
});

router.delete("/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.deleteMany({ where: { avaliacaoId: id } });
    await prisma.avaliacao.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir avaliação." });
  }
});

router.get("/denuncias", autenticarAdmin, async (_req, res) => {
  try {
    const denuncias = await prisma.denuncia.findMany({
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        loja: { select: { id: true, nome: true } },
        avaliacao: { select: { id: true, comentario: true, nota: true } },
        agendamento: { select: { id: true, data: true, hora: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Denuncia", enderecoIp: _req.ip, detalhes: { quantidade: denuncias.length } });
    res.json({ denuncias: denuncias.map(({ motivo, motivoCipher, detalhes, detalhesCipher, ...denuncia }) => ({
      ...denuncia,
      motivo: descriptografarSeNecessario(motivoCipher || motivo),
      detalhes: descriptografarSeNecessario(detalhesCipher || detalhes),
      usuario: denuncia.anonima || !denuncia.usuario ? null : { ...denuncia.usuario, email: descriptografarSeNecessario(denuncia.usuario.email) },
    })) });
  } catch {
    res.status(500).json({ error: "Erro ao carregar denúncias." });
  }
});

router.put("/denuncias/:id/status", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!id || !["aberta", "em_analise", "resolvida", "arquivada"].includes(status)) return res.status(400).json({ error: "Status invalido." });
    const denuncia = await prisma.denuncia.update({ where: { id }, data: { status } });
    await registrarAudit({ acao: TiposAcao.ATUALIZAR, tabela: "Denuncia", recordId: id, enderecoIp: req.ip, detalhes: { status, ator: "admin" } });
    const { motivoCipher, detalhesCipher, ...dadosDenuncia } = denuncia;
    res.json({ denuncia: { ...dadosDenuncia, motivo: descriptografarSeNecessario(motivoCipher || denuncia.motivo), detalhes: descriptografarSeNecessario(detalhesCipher || denuncia.detalhes) } });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar denúncia." });
  }
});

router.delete("/denuncias/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir denúncia." });
  }
});

module.exports = router;
