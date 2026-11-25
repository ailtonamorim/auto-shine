const { solicitarVerificacao } = require("../utils/verificacao-email");
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { enviarEmailReset, emailTransporter } = require("../config/email");
const { normalizarEmail, emailValido } = require("../utils/validators");
const { erroSenha, hashTokenRecuperacao, dadosTrocaSenha } = require("../utils/senha");
const { limitarReset } = require("../middlewares/security");

const router = express.Router();
const mensagemSolicitacao = "Se houver uma conta com este e-mail, você receberá as instruções. Caso o endereço ainda não esteja confirmado, confirme-o primeiro e solicite a recuperação novamente.";
const linkInvalido = { error: "Link de recuperação inválido ou expirado.", code: "RESET_TOKEN_INVALIDO" };
const modelo = (tipo) => tipo === "usuario" ? prisma.usuario : prisma.dono;

router.post("/solicitar", limitarReset, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { email, tipo } = req.body || {};
  if (typeof email !== "string" || !["usuario", "dono"].includes(tipo)) {
    return res.status(400).json({ error: "Informe email e tipo de conta." });
  }
  const emailNorm = normalizarEmail(email);
  if (!emailValido(emailNorm)) return res.status(400).json({ error: "Email inválido." });
  if (!emailTransporter) {
    return res.status(503).json({ error: "A recuperação de senha está temporariamente indisponível. Tente novamente mais tarde." });
  }
  try {
    const conta = await modelo(tipo).findUnique({ where: { email: emailNorm } });
    if (conta && !conta.emailVerificadoEm) {
      await solicitarVerificacao(conta, tipo);
    } else if (conta) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashTokenRecuperacao(token);
      const reservado = await modelo(tipo).updateMany({ where: { id: conta.id, email: emailNorm, emailVerificadoEm: conta.emailVerificadoEm, authVersion: conta.authVersion }, data: {
        resetToken: tokenHash, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      } });
      if (reservado.count !== 1) return res.json({ ok: true, mensagem: mensagemSolicitacao });
      try {
        await enviarEmailReset({ para: emailNorm, nome: conta.nome, token, tipo });
      } catch {
        // Não remova um link mais recente se duas solicitações concorrerem.
        await modelo(tipo).updateMany({
          where: { id: conta.id, resetToken: tokenHash },
          data: { resetToken: null, resetTokenExpiry: null },
        });
        throw new Error("RESET_EMAIL_FAILURE");
      }
    }
    return res.json({ ok: true, mensagem: mensagemSolicitacao });
  } catch {
    console.error("Falha ao solicitar recuperação de senha.");
    return res.status(503).json({ error: "Não foi possível concluir a solicitação. Tente novamente mais tarde." });
  }
});

router.post("/confirmar", limitarReset, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { token, novaSenha, tipo } = req.body || {};
  if (!["usuario", "dono"].includes(tipo)) return res.status(400).json({ error: "Tipo de conta inválido." });
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json(linkInvalido);
  const erro = erroSenha(novaSenha);
  if (erro) return res.status(400).json({ error: erro });
  try {
    const tokenHash = hashTokenRecuperacao(token);
    const conta = await modelo(tipo).findUnique({ where: { resetToken: tokenHash } });
    if (!conta || !conta.emailVerificadoEm || !conta.resetTokenExpiry || conta.resetTokenExpiry <= new Date()) {
      return res.status(400).json(linkInvalido);
    }
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    // Escrita atômica: apenas uma confirmação pode consumir o link.
    // A expiração é conferida de novo depois do cálculo do hash.
    const result = await modelo(tipo).updateMany({
      where: {
        id: conta.id, resetToken: tokenHash, resetTokenExpiry: { gt: new Date() },
        authVersion: conta.authVersion, email: conta.email, emailVerificadoEm: conta.emailVerificadoEm,
      },
      data: dadosTrocaSenha(senhaHash),
    });
    if (result.count !== 1) return res.status(400).json(linkInvalido);
    return res.json({ ok: true, mensagem: "Senha alterada com sucesso! Faça login novamente." });
  } catch {
    console.error("Falha ao gravar a nova senha.");
    return res.status(500).json({ error: "Não foi possível alterar a senha. Tente novamente." });
  }
});
module.exports = router;
