const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");
const { criptografar, criarIndice } = require("../utils/crypto");
const { registrarDenuncia } = require("../utils/audit");

const router = express.Router();

router.post("/", autenticarUsuario, async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const motivo = String(req.body?.motivo || "").trim();
    const detalhes = String(req.body?.detalhes || "").trim();
    const anonima = req.body?.anonima === true;
    const lojaId = req.body?.lojaId ? Number(req.body.lojaId) : null;
    const avaliacaoId = req.body?.avaliacaoId ? Number(req.body.avaliacaoId) : null;
    const agendamentoId = req.body?.agendamentoId ? Number(req.body.agendamentoId) : null;

    if (!["loja", "avaliacao", "agendamento"].includes(tipo)) return res.status(400).json({ error: "Tipo de den�ncia inv�lido." });
    if (motivo.length < 4) return res.status(400).json({ error: "Informe um motivo para a den�ncia." });

    const data = { tipo, motivo: null, motivoCipher: criptografar(motivo.slice(0, 120)), motivoIndex: criarIndice(motivo.slice(0, 120)), detalhes: null, detalhesCipher: detalhes ? criptografar(detalhes.slice(0, 600)) : null, anonima, usuarioId: anonima ? null : req.usuario.id };

    if (tipo === "loja") {
      if (!lojaId) return res.status(400).json({ error: "Informe a loja denunciada." });
      const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { id: true } });
      if (!loja) return res.status(404).json({ error: "Loja n�o encontrada." });
      data.lojaId = loja.id;
    }

    if (tipo === "avaliacao") {
      if (!avaliacaoId) return res.status(400).json({ error: "Informe a avalia��o denunciada." });
      const avaliacao = await prisma.avaliacao.findUnique({ where: { id: avaliacaoId }, select: { id: true, lojaId: true } });
      if (!avaliacao) return res.status(404).json({ error: "Avalia��o n�o encontrada." });
      data.avaliacaoId = avaliacao.id;
      data.lojaId = avaliacao.lojaId;
    }

    if (tipo === "agendamento") {
      if (!agendamentoId) return res.status(400).json({ error: "Informe o agendamento denunciado." });
      const agendamento = await prisma.agendamento.findFirst({ where: { id: agendamentoId, usuarioId: req.usuario.id }, select: { id: true, lojaId: true } });
      if (!agendamento) return res.status(404).json({ error: "Agendamento n�o encontrado." });
      data.agendamentoId = agendamento.id;
      data.lojaId = agendamento.lojaId;
    }

    const denuncia = await prisma.denuncia.create({ data });
    await registrarDenuncia({ denunciaId: denuncia.id, usuarioId: data.usuarioId, tipo, lojaId: data.lojaId, enderecoIp: anonima ? undefined : req.ip });
    res.status(201).json({ denuncia: { id: denuncia.id, tipo: denuncia.tipo, status: denuncia.status, anonima: denuncia.anonima, createdAt: denuncia.createdAt } });
  } catch (err) {
    console.error("Erro ao criar den�ncia:", err);
    res.status(500).json({ error: "Erro ao criar den�ncia." });
  }
});

module.exports = router;
