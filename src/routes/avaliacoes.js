const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");
const { fotoAvaliacaoValida } = require("../utils/validators");

const router = express.Router();

router.get("/loja/:lojaId", async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const avaliacoes = await prisma.avaliacao.findMany({ where: { lojaId }, orderBy: { createdAt: "desc" } });
    res.json({ avaliacoes });
  } catch {
    res.status(500).json({ error: "Erro ao buscar avaliações." });
  }
});

router.post("/", autenticarUsuario, async (req, res) => {
  try {
    const { lojaId, nota, comentario, fotoUrl, nomeCliente } = req.body;
    if (!lojaId || !nota) return res.status(400).json({ error: "Loja e nota são obrigatórios." });
    if (Number(nota) < 1 || Number(nota) > 5) return res.status(400).json({ error: "Nota deve ser entre 1 e 5." });
    if (String(comentario || "").trim().length < 8) return res.status(400).json({ error: "Comentário deve ter pelo menos 8 caracteres." });
    if (!fotoAvaliacaoValida(fotoUrl)) return res.status(400).json({ error: "Foto deve ser uma URL http/https ou imagem PNG, JPG ou WEBP de ate 2 MB." });
    const loja = await prisma.loja.findFirst({ where: { id: Number(lojaId), bloqueado: false }, select: { id: true } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    const existente = await prisma.avaliacao.findFirst({ where: { lojaId: Number(lojaId), usuarioId: req.usuario.id }, select: { id: true } });
    if (existente) return res.status(409).json({ error: "Voce ja avaliou este estabelecimento." });
    const agendamentoFinalizado = await prisma.agendamento.findFirst({
      where: { lojaId: Number(lojaId), usuarioId: req.usuario.id, status: "finalizado", avaliacao: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!agendamentoFinalizado) return res.status(403).json({ error: "Voce so pode avaliar depois de ter um agendamento finalizado nesta loja." });
    const avaliacao = await prisma.avaliacao.create({
      data: {
        lojaId: Number(lojaId),
        nota: Number(nota),
        comentario: String(comentario || "").trim(),
        fotoUrl: fotoUrl || null,
        nomeCliente: String(nomeCliente || "").trim() || null,
        usuarioId: req.usuario.id,
        agendamentoId: agendamentoFinalizado.id,
      },
    });
    res.status(201).json({ avaliacao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar avaliação." });
  }
});

module.exports = router;
