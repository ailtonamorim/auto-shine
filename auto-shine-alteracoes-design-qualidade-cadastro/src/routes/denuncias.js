const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");

const router = express.Router();

router.post("/", autenticarUsuario, async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const motivo = String(req.body?.motivo || "").trim();
    const detalhes = String(req.body?.detalhes || "").trim();
    const lojaId = req.body?.lojaId ? Number(req.body.lojaId) : null;
    const avaliacaoId = req.body?.avaliacaoId ? Number(req.body.avaliacaoId) : null;
    const agendamentoId = req.body?.agendamentoId ? Number(req.body.agendamentoId) : null;

    if (!["loja", "avaliacao", "agendamento"].includes(tipo)) return res.status(400).json({ error: "Tipo de denúncia inválido." });
    if (motivo.length < 4) return res.status(400).json({ error: "Informe um motivo para a denúncia." });

    const data = { tipo, motivo: motivo.slice(0, 120), detalhes: detalhes ? detalhes.slice(0, 600) : null, usuarioId: req.usuario.id };

    if (tipo === "loja") {
      if (!lojaId) return res.status(400).json({ error: "Informe a loja denunciada." });
      const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { id: true } });
      if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
      data.lojaId = loja.id;
    }

    if (tipo === "avaliacao") {
      if (!avaliacaoId) return res.status(400).json({ error: "Informe a avaliação denunciada." });
      const avaliacao = await prisma.avaliacao.findUnique({ where: { id: avaliacaoId }, select: { id: true, lojaId: true } });
      if (!avaliacao) return res.status(404).json({ error: "Avaliação não encontrada." });
      data.avaliacaoId = avaliacao.id;
      data.lojaId = avaliacao.lojaId;
    }

    if (tipo === "agendamento") {
      if (!agendamentoId) return res.status(400).json({ error: "Informe o agendamento denunciado." });
      const agendamento = await prisma.agendamento.findFirst({ where: { id: agendamentoId, usuarioId: req.usuario.id }, select: { id: true, lojaId: true } });
      if (!agendamento) return res.status(404).json({ error: "Agendamento não encontrado." });
      data.agendamentoId = agendamento.id;
      data.lojaId = agendamento.lojaId;
    }

    const denuncia = await prisma.denuncia.create({ data });
    res.status(201).json({ denuncia });
  } catch (err) {
    console.error("Erro ao criar denúncia:", err);
    res.status(500).json({ error: "Erro ao criar denúncia." });
  }
});

module.exports = router;
