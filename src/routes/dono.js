const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { gerarTokenDono } = require("../utils/tokens");
const { setAuthCookie, autenticarDono } = require("../middlewares/auth");
const { normalizarLoginDono, normalizarCnpj, normalizarEmail, emailValido, cnpjTemDigitoValido } = require("../utils/validators");
const { consultarCnpjBrasilApi } = require("../utils/geocode");
const { limitarAuth } = require("../middlewares/security");

const router = express.Router();

function serializarDono(dono) {
  return {
    id: dono.id,
    nome: dono.nome,
    login: dono.login,
    email: dono.email || null,
    cnpj: dono.cnpj || null,
    createdAt: dono.createdAt,
    hasPassword: Boolean(dono.senha),
    googleLinked: Boolean(dono.googleId),
    totalLojas: dono._count?.lojas || 0,
  };
}

router.post("/cadastro", limitarAuth, async (req, res) => {
  try {
    const { nome, login, cnpj, email, senha } = req.body;
    if (!nome || !login || !cnpj || !senha) return res.status(400).json({ error: "Preencha todos os campos." });
    const loginNorm = normalizarLoginDono(login);
    const cnpjNorm = normalizarCnpj(cnpj);
    const emailNorm = email ? normalizarEmail(email) : null;
    if (loginNorm.length < 4) return res.status(400).json({ error: "Login deve ter pelo menos 4 caracteres." });
    if (!cnpjTemDigitoValido(cnpjNorm)) return res.status(400).json({ error: "CNPJ invalido." });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    if (emailNorm && !emailValido(emailNorm)) return res.status(400).json({ error: "Email invalido." });
    try {
      const cnpjValidado = await consultarCnpjBrasilApi(cnpjNorm);
      if (!cnpjValidado.valido) console.warn(`Aviso: CNPJ ${cnpjNorm} nao encontrado na Receita Federal, mas permitindo cadastro.`);
    } catch (err) {
      console.warn(`Aviso: Erro ao validar CNPJ com BrasilAPI: ${err.message}`);
    }
    const existente = await prisma.dono.findUnique({ where: { login: loginNorm } });
    if (existente) return res.status(409).json({ error: "Este login ja esta em uso." });
    const cnpjExistente = await prisma.dono.findFirst({ where: { cnpj: cnpjNorm } });
    if (cnpjExistente) return res.status(409).json({ error: "Este CNPJ ja esta cadastrado no sistema." });
    if (emailNorm) {
      const emailExistente = await prisma.dono.findUnique({ where: { email: emailNorm } });
      if (emailExistente) return res.status(409).json({ error: "Este email ja esta em uso." });
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const dono = await prisma.dono.create({ data: { nome: String(nome).trim(), login: loginNorm, cnpj: cnpjNorm, email: emailNorm, senha: senhaHash } });
    const token = gerarTokenDono(dono);
    setAuthCookie(res, token);
    res.status(201).json({ token, dono: { id: dono.id, nome: dono.nome, login: dono.login, cnpj: dono.cnpj } });
  } catch (err) {
    console.error("Erro no cadastro do dono:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

router.post("/login", limitarAuth, async (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({ error: "Informe login e senha." });
    const loginNorm = String(login).trim().toLowerCase();
    const dono = await prisma.dono.findUnique({ where: { login: loginNorm } });
    if (!dono) return res.status(401).json({ error: "Login ou senha inválidos." });
    if (dono.bloqueado) return res.status(403).json({ error: "Conta de parceiro bloqueada. Entre em contato com o suporte." });
    if (dono.suspensoAte && dono.suspensoAte > new Date()) return res.status(403).json({ error: `Conta de parceiro suspensa até ${dono.suspensoAte.toLocaleDateString("pt-BR")}.` });
    if (!dono.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, dono.senha))) return res.status(401).json({ error: "Login ou senha invalidos." });
    const token = gerarTokenDono(dono);
    setAuthCookie(res, token);
    res.json({ token, dono: { id: dono.id, nome: dono.nome, login: dono.login } });
  } catch (err) {
    console.error("Erro no login do dono:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/me", autenticarDono, async (req, res) => {
  try {
    const dono = await prisma.dono.findUnique({
      where: { id: req.dono.donoId },
      select: {
        id: true,
        nome: true,
        login: true,
        email: true,
        cnpj: true,
        googleId: true,
        senha: true,
        createdAt: true,
        _count: { select: { lojas: true } },
      },
    });
    if (!dono) return res.status(404).json({ error: "Dono nao encontrado." });
    res.json({ dono: serializarDono(dono) });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/notificacoes", autenticarDono, async (req, res) => {
  try {
    const where = { loja: { donoId: req.dono.donoId } };
    const [notificacoes, naoLidas] = await Promise.all([
      prisma.notificacao.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.notificacao.count({ where: { ...where, lida: false } }),
    ]);
    res.json({ notificacoes, naoLidas });
  } catch (err) {
    console.error("Erro ao carregar notificações do parceiro:", err);
    res.status(500).json({ error: "Erro ao carregar notificações." });
  }
});

router.patch("/notificacoes/:id/lida", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID de notificação inválido." });
    const atualizada = await prisma.notificacao.updateMany({
      where: { id, loja: { donoId: req.dono.donoId } },
      data: { lida: true },
    });
    if (!atualizada.count) return res.status(404).json({ error: "Notificação não encontrada." });
    res.json({ ok: true, message: "Notificação marcada como lida." });
  } catch (err) {
    console.error("Erro ao marcar notificação como lida:", err);
    res.status(500).json({ error: "Erro ao atualizar notificação." });
  }
});

router.get("/denuncias", autenticarDono, async (req, res) => {
  try {
    const denuncias = await prisma.denuncia.findMany({
      where: { tipo: "loja", loja: { donoId: req.dono.donoId } },
      include: {
        loja: { select: { id: true, nome: true } },
        usuario: { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ denuncias });
  } catch (err) {
    console.error("Erro ao carregar denúncias do parceiro:", err);
    res.status(500).json({ error: "Erro ao carregar denúncias recebidas." });
  }
});

router.put("/me", autenticarDono, async (req, res) => {
  try {
    const atual = await prisma.dono.findUnique({ where: { id: req.dono.donoId } });
    if (!atual) return res.status(404).json({ error: "Dono nao encontrado." });

    const nome = String(req.body?.nome || atual.nome).trim();
    const email = req.body?.email !== undefined ? normalizarEmail(req.body.email) : atual.email;
    const cnpj = req.body?.cnpj !== undefined ? normalizarCnpj(req.body.cnpj) : atual.cnpj;

    if (nome.length < 2) return res.status(400).json({ error: "Informe um nome valido." });
    if (email && !emailValido(email)) return res.status(400).json({ error: "Email invalido." });
    if (cnpj && !cnpjTemDigitoValido(cnpj)) return res.status(400).json({ error: "CNPJ invalido." });

    if (email && email !== atual.email) {
      const emailExistente = await prisma.dono.findUnique({ where: { email } });
      if (emailExistente && emailExistente.id !== atual.id) return res.status(409).json({ error: "Este email ja esta em uso." });
    }

    if (cnpj && cnpj !== atual.cnpj) {
      const cnpjExistente = await prisma.dono.findFirst({ where: { cnpj } });
      if (cnpjExistente && cnpjExistente.id !== atual.id) return res.status(409).json({ error: "Este CNPJ ja esta em uso." });
    }

    const dono = await prisma.dono.update({
      where: { id: atual.id },
      data: { nome, email: email || null, cnpj: cnpj || null },
      select: {
        id: true,
        nome: true,
        login: true,
        email: true,
        cnpj: true,
        googleId: true,
        senha: true,
        createdAt: true,
        _count: { select: { lojas: true } },
      },
    });
    const token = gerarTokenDono(dono);

    res.json({ dono: serializarDono(dono), token, message: "Perfil do parceiro atualizado com sucesso." });
  } catch (err) {
    console.error("Erro ao atualizar perfil do dono:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

module.exports = router;
