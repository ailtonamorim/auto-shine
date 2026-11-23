const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { normalizarEmail, emailValido, normalizarLoginDono } = require("../utils/validators");
const { hashTokenRecuperacao } = require("../utils/senha");
const { limitarVerificacao } = require("../middlewares/security");
const { exigirEnvioEmail, solicitarVerificacao, mensagemVerificacao, camposLimparVerificacao } = require("../utils/verificacao-email");
const router = express.Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const invalido = { code: "EMAIL_TOKEN_INVALIDO", error: "Link inválido, expirado ou já utilizado. Solicite um novo link de confirmação." };

router.post("/solicitar", limitarVerificacao, async (req, res) => {
  const { email, tipo } = req.body || {};
  if (!["usuario", "dono"].includes(tipo) || typeof email !== "string" || !emailValido(email)) return res.status(400).json({ error: "Informe um e-mail válido e o tipo de conta." });
  try {
    exigirEnvioEmail();
    const conta = await prisma[tipo].findUnique({ where: { email: normalizarEmail(email) } });
    if (conta) await solicitarVerificacao(conta, tipo);
    return res.json({ ok: true, mensagem: mensagemVerificacao });
  } catch {
    return res.status(503).json({ error: "Não foi possível solicitar a confirmação. Tente novamente mais tarde." });
  }
});

// GET não consome links: scanners de e-mail não ativam contas automaticamente.
router.post("/confirmar", limitarVerificacao, async (req, res) => {
  const { token, tipo } = req.body || {};
  if (!["usuario", "dono"].includes(tipo) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json(invalido);
  try {
    const result = await prisma[tipo].updateMany({ where: {
      emailVerificacaoToken: hashTokenRecuperacao(token), emailVerificadoEm: null,
      emailVerificacaoExpiraEm: { gt: new Date() },
    }, data: {
      emailVerificadoEm: new Date(), ...camposLimparVerificacao,
      resetToken: null, resetTokenExpiry: null, authVersion: { increment: 1 },
    } });
    if (result.count !== 1) return res.status(400).json(invalido);
    return res.json({ ok: true, mensagem: "E-mail confirmado! Agora você pode entrar ou recuperar sua senha." });
  } catch {
    return res.status(503).json({ error: "Não foi possível confirmar agora. Tente novamente." });
  }
});

// Somente parceiros legados sem e-mail. Não permite substituir um endereço existente.
router.post("/vincular", limitarVerificacao, async (req, res) => {
  const { login, senha, email } = req.body || {};
  if (typeof login !== "string" || typeof senha !== "string" || typeof email !== "string" || !emailValido(email)) return res.status(400).json({ error: "Informe login, senha e um e-mail válido." });
  try {
    exigirEnvioEmail();
    const conta = await prisma.dono.findUnique({ where: { login: normalizarLoginDono(login) } });
    if (!conta?.senha || !(await bcrypt.compare(senha, conta.senha))) return res.status(401).json({ error: "Login ou senha inválidos." });
    if (conta.email) return res.status(409).json({ error: "Esta conta já tem e-mail. Use a opção de reenviar confirmação." });
    const emailNorm = normalizarEmail(email);
    const result = await prisma.dono.updateMany({ where: { id: conta.id, email: null, senha: conta.senha, authVersion: conta.authVersion }, data: { email: emailNorm, emailVerificadoEm: null, authVersion: { increment: 1 }, resetToken: null, resetTokenExpiry: null } });
    if (result.count !== 1) return res.status(409).json({ error: "A conta foi atualizada. Tente novamente." });
    try {
      await solicitarVerificacao({ ...conta, email: emailNorm, authVersion: conta.authVersion + 1 }, "dono");
      return res.json({ ok: true, mensagem: "E-mail vinculado. Confira sua caixa de entrada para confirmá-lo." });
    } catch {
      return res.status(503).json({ error: "E-mail vinculado, mas o envio falhou. Use a opção de reenviar confirmação." });
    }
  } catch (err) {
    return res.status(err.code === "P2002" ? 409 : 503).json({ error: err.code === "P2002" ? "Este e-mail já está em uso." : "Não foi possível vincular o e-mail agora." });
  }
});
module.exports = router;
