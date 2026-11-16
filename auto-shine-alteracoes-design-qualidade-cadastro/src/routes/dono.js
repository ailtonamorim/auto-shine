const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { gerarTokenDono } = require("../utils/tokens");
const { normalizarLoginDono, normalizarCnpj, normalizarEmail, emailValido, cnpjTemDigitoValido } = require("../utils/validators");
const { consultarCnpjBrasilApi } = require("../utils/geocode");
const { autenticarDono } = require("../middlewares/auth");
const { limitarAuth } = require("../middlewares/security");

const router = express.Router();

router.post("/cadastro", limitarAuth, async (req, res) => {
  try {
    const { nome, login, cnpj, email, senha } = req.body;
    if (!nome || !login || !cnpj || !senha) return res.status(400).json({ error: "Preencha todos os campos." });
    const loginNorm = normalizarLoginDono(login);
    const cnpjNorm = normalizarCnpj(cnpj);
    const emailNorm = email ? normalizarEmail(email) : null;
    if (loginNorm.length < 4) return res.status(400).json({ error: "Login deve ter pelo menos 4 caracteres." });
    if (!cnpjTemDigitoValido(cnpjNorm)) return res.status(400).json({ error: "CNPJ inválido." });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    if (emailNorm && !emailValido(emailNorm)) return res.status(400).json({ error: "Email inválido." });
    try {
      const cnpjValidado = await consultarCnpjBrasilApi(cnpjNorm);
      if (!cnpjValidado.valido) console.warn(`Aviso: CNPJ ${cnpjNorm} não encontrado na Receita Federal, mas permitindo cadastro.`);
    } catch (err) {
      console.warn(`Aviso: Erro ao validar CNPJ com BrasilAPI: ${err.message}`);
    }
    const existente = await prisma.dono.findUnique({ where: { login: loginNorm } });
    if (existente) return res.status(409).json({ error: "Este login ja esta em uso." });
    const cnpjExistente = await prisma.dono.findFirst({ where: { cnpj: cnpjNorm } });
    if (cnpjExistente) return res.status(409).json({ error: "Este CNPJ ja esta cadastrado no sistema." });
    if (emailNorm) {
      const emailExistente = await prisma.dono.findUnique({ where: { email: emailNorm } });
      if (emailExistente) return res.status(409).json({ error: "Este email já está em uso." });
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const dono = await prisma.dono.create({ data: { nome: String(nome).trim(), login: loginNorm, cnpj: cnpjNorm, email: emailNorm, senha: senhaHash } });
    const token = gerarTokenDono(dono);
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
    if (!dono.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, dono.senha))) return res.status(401).json({ error: "Login ou senha inválidos." });
    const token = gerarTokenDono(dono);
    res.json({ token, dono: { id: dono.id, nome: dono.nome, login: dono.login } });
  } catch (err) {
    console.error("Erro no login do dono:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/me", autenticarDono, async (req, res) => {
  try {
    const dono = await prisma.dono.findUnique({ where: { id: req.dono.donoId }, select: { id: true, nome: true, login: true } });
    if (!dono) return res.status(404).json({ error: "Dono não encontrado." });
    res.json({ dono });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

module.exports = router;
