const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");

const router = express.Router();

router.get("/", autenticarUsuario, async (req, res) => {
  try {
    const favoritos = await prisma.$queryRaw`
      SELECT f."lojaId"
      FROM "Favorito" f
      INNER JOIN "Loja" l ON l."id" = f."lojaId"
      WHERE f."usuarioId" = ${req.usuario.id}
        AND l."bloqueado" = false
      ORDER BY f."createdAt" DESC
    `;
    const lojaIds = favoritos.map((item) => item.lojaId);
    const lojasEncontradas = lojaIds.length
      ? await prisma.loja.findMany({ where: { id: { in: lojaIds }, bloqueado: false }, include: { servicos: true, avaliacoes: { select: { nota: true } } } })
      : [];
    const lojasPorId = new Map(lojasEncontradas.map((loja) => [loja.id, loja]));
    const lojas = lojaIds.map((id) => lojasPorId.get(id)).filter(Boolean);
    res.json({ lojas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar favoritos." });
  }
});

router.post("/:lojaId", autenticarUsuario, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    if (!lojaId) return res.status(400).json({ error: "ID de loja inválido." });
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, bloqueado: false } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    await prisma.favorito.upsert({
      where: { usuarioId_lojaId: { usuarioId: req.usuario.id, lojaId } },
      create: { usuarioId: req.usuario.id, lojaId },
      update: {},
    });
    res.status(201).json({ favoritado: true, lojaId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao favoritar loja." });
  }
});

router.delete("/:lojaId", autenticarUsuario, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    if (!lojaId) return res.status(400).json({ error: "ID de loja inválido." });
    await prisma.$executeRaw`
      DELETE FROM "Favorito"
      WHERE "usuarioId" = ${req.usuario.id}
        AND "lojaId" = ${lojaId}
    `;
    res.json({ favoritado: false, lojaId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao remover favorito." });
  }
});

module.exports = router;
