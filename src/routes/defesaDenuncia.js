const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");
const prisma = require("../config/database");
const { autenticarDono } = require("../middlewares/auth");

const router = express.Router();
const uploadsDir = path.join(__dirname, "../../uploads/denuncias");
const maxFileSize = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 4 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["image/png", "image/jpeg", "application/pdf"]);
    if (!allowed.has(file.mimetype)) return callback(new Error("Anexe apenas imagens PNG/JPG ou arquivos PDF."));
    callback(null, true);
  },
});

function uploadedExtension(file) {
  const buffer = file.buffer;
  if (file.mimetype === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  if (file.mimetype === "image/jpeg" && buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return ".jpg";
  if (file.mimetype === "application/pdf" && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return ".pdf";
  return null;
}

function handleUpload(req, res, next) {
  upload.array("anexos", 4)(req, res, (err) => {
    if (!err) return next();
    const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
      ? "Cada anexo pode ter no máximo 5 MB."
      : err instanceof multer.MulterError && err.code === "LIMIT_FILE_COUNT"
        ? "Anexe no máximo 4 arquivos."
        : err.message || "Não foi possível receber os anexos.";
    res.status(400).json({ error: message });
  });
}

router.post("/:id/responder", autenticarDono, handleUpload, async (req, res) => {
  const gravados = [];
  try {
    const id = Number(req.params.id);
    const respostaLoja = String(req.body?.respostaLoja || "").trim();
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID de denúncia inválido." });
    if (respostaLoja.length < 20) return res.status(400).json({ error: "Escreva uma defesa com pelo menos 20 caracteres." });
    if (respostaLoja.length > 5000) return res.status(400).json({ error: "A defesa deve ter no máximo 5.000 caracteres." });

    const denuncia = await prisma.denuncia.findFirst({
      where: { id, tipo: "loja", loja: { donoId: req.dono.donoId } },
      select: { id: true, status: true, lojaId: true },
    });
    if (!denuncia) return res.status(404).json({ error: "Denúncia não encontrada para as lojas deste parceiro." });
    if (["procedente", "rejeitada"].includes(String(denuncia.status).toLowerCase())) {
      return res.status(409).json({ error: "Esta denúncia já foi concluída e não aceita novas respostas." });
    }

    const files = req.files || [];
    const extensions = files.map(uploadedExtension);
    if (extensions.some((extension) => !extension)) return res.status(400).json({ error: "Um dos arquivos não corresponde a PNG, JPG ou PDF válido." });
    const anexos = [];
    for (const [index, file] of files.entries()) {
      const extension = extensions[index];
      await fs.mkdir(uploadsDir, { recursive: true });
      const filename = `${crypto.randomUUID()}${extension}`;
      await fs.writeFile(path.join(uploadsDir, filename), file.buffer, { flag: "wx" });
      anexos.push(filename);
      gravados.push(path.join(uploadsDir, filename));
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const updated = await tx.denuncia.update({
        where: { id },
        data: {
          respostaLoja,
          anexosResposta: JSON.stringify(anexos),
          dataResposta: new Date(),
          status: "contestada",
        },
      });
      await tx.notificacao.create({
        data: {
          lojaId: denuncia.lojaId,
          titulo: "Defesa enviada",
          mensagem: "Sua contestação foi protocolada e encaminhada para análise da equipe.",
          tipo: "DEFESA_ENVIADA",
        },
      });
      return updated;
    });

    res.status(200).json({ denuncia: atualizada, message: "Defesa enviada para análise." });
  } catch (err) {
    await Promise.all(gravados.map((filePath) => fs.unlink(filePath).catch(() => {})));
    console.error("Erro ao receber defesa da denúncia:", err);
    res.status(500).json({ error: "Não foi possível enviar a defesa. Tente novamente." });
  }
});

router.get("/:id/anexos/:filename", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const filename = path.basename(req.params.filename);
    if (!Number.isInteger(id) || id < 1 || filename !== req.params.filename) return res.status(400).json({ error: "Anexo inválido." });
    const denuncia = await prisma.denuncia.findFirst({
      where: { id, tipo: "loja", loja: { donoId: req.dono.donoId } },
      select: { anexosResposta: true },
    });
    if (!denuncia) return res.status(404).json({ error: "Denúncia não encontrada." });
    let anexos = [];
    try { anexos = JSON.parse(denuncia.anexosResposta || "[]"); } catch {}
    if (!Array.isArray(anexos) || !anexos.includes(filename)) return res.status(404).json({ error: "Anexo não encontrado." });
    res.sendFile(path.join(uploadsDir, filename));
  } catch (err) {
    console.error("Erro ao carregar anexo da defesa:", err);
    res.status(500).json({ error: "Não foi possível carregar o anexo." });
  }
});

module.exports = router;