const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { enviarEmailReset } = require("../config/email");
const { normalizarEmail, emailValido } = require("../utils/validators");
const { limitarReset } = require("../middlewares/security");

const router = express.Router();

router.post("/solicitar", limitarReset, async (req, res) => {
  try {
    const { email, tipo } = req.body;
    if (!email || !["usuario", "dono"].includes(tipo)) return res.status(400).json({ error: "Informe email e tipo de conta." });
    const emailNorm = normalizarEmail(email);
    if (!emailValido(emailNorm)) return res.status(400).json({ error: "Email inválido." });
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    try {
      if (tipo === "usuario") {
        const usuario = await prisma.usuario.findUnique({ where: { email: emailNorm } });
        if (usuario) {
          await prisma.usuario.update({ where: { id: usuario.id }, data: { resetToken: token, resetTokenExpiry: expiry } });
          await enviarEmailReset({ para: emailNorm, nome: usuario.nome, token, tipo: "usuario" });
        }
      } else {
        const dono = await prisma.dono.findUnique({ where: { email: emailNorm } });
        if (dono) {
          await prisma.dono.update({ where: { id: dono.id }, data: { resetToken: token, resetTokenExpiry: expiry } });
          await enviarEmailReset({ para: emailNorm, nome: dono.nome, token, tipo: "dono" });
        }
      }
    } catch (dbErr) {
      console.warn("Aviso reset-senha:", dbErr.message?.split("\n")[0]);
    }
    res.json({ ok: true, mensagem: "Se este email estiver cadastrado, você receberá um link de recuperação em breve." });
  } catch (err) {
    console.error("Erro ao solicitar reset:", err);
    res.status(500).json({ error: "Erro interno ao solicitar recuperação." });
  }
});

router.post("/confirmar", limitarReset, async (req, res) => {
  try {
    const { token, novaSenha, tipo } = req.body;
    if (!token || !novaSenha || !["usuario", "dono"].includes(tipo)) return res.status(400).json({ error: "Dados inválidos." });
    if (String(novaSenha).length < 6) return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
    const agora = new Date();
    try {
      if (tipo === "usuario") {
        const usuario = await prisma.usuario.findUnique({ where: { resetToken: token } });
        if (!usuario || !usuario.resetTokenExpiry || usuario.resetTokenExpiry < agora) return res.status(400).json({ error: "Link de recuperação inválido ou expirado." });
        await prisma.usuario.update({ where: { id: usuario.id }, data: { senha: await bcrypt.hash(novaSenha, 10), resetToken: null, resetTokenExpiry: null } });
      } else {
        const dono = await prisma.dono.findUnique({ where: { resetToken: token } });
        if (!dono || !dono.resetTokenExpiry || dono.resetTokenExpiry < agora) return res.status(400).json({ error: "Link de recuperação inválido ou expirado." });
        await prisma.dono.update({ where: { id: dono.id }, data: { senha: await bcrypt.hash(novaSenha, 10), resetToken: null, resetTokenExpiry: null } });
      }
    } catch (dbErr) {
      console.warn("Aviso reset-confirmar:", dbErr.message?.split("\n")[0]);
    }
    res.json({ ok: true, mensagem: "Senha alterada com sucesso! Você já pode fazer login." });
  } catch (err) {
    console.error("Erro ao confirmar reset:", err);
    res.status(500).json({ error: "Erro interno ao redefinir senha." });
  }
});

module.exports = router;
