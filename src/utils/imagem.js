const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { cloudinaryV2, cloudinaryAtivo } = require("../config/cloudinary");
const { criarErroHttp } = require("./validators");

const imageModerationEnabled = process.env.IMAGE_MODERATION_ENABLED !== "false";
const imageModerationRequired = process.env.IMAGE_MODERATION_REQUIRED === "true";
const imageModerationApiUrl = process.env.IMAGE_MODERATION_API_URL || "";
const imageModerationApiToken = process.env.IMAGE_MODERATION_API_TOKEN || "";
const imageModerationTimeoutMs = Number(process.env.IMAGE_MODERATION_TIMEOUT_MS || 8000);
const imageModerationBlockThreshold = Number(process.env.IMAGE_MODERATION_BLOCK_THRESHOLD || 0.8);
const imageMaxPixels = Number(process.env.IMAGE_MAX_PIXELS || 25000000);
const imageModerationBlockedCategories = new Set(
  String(process.env.IMAGE_MODERATION_BLOCK_CATEGORIES || "adult,nudity,porn,sexual,violence,gore,hate,self-harm,weapon,drugs,illegal,child-safety")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
);

const uploadsDir = path.join(__dirname, "..", "..", "assets", "uploads");

function detectarMimeImagem(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "";
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function extrairDimensoesImagem(buffer, mimeType) {
  if (mimeType === "image/png" && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 8 < buffer.length) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      if (!length || length < 2) break;
      offset += 2 + length;
    }
  }
  if (mimeType === "image/webp" && buffer.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
    if (chunk === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const [b1, b2, b3, b4] = [buffer[21], buffer[22], buffer[23], buffer[24]];
      return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
    }
  }
  return null;
}

function prepararImagemUpload({ imagem, nomeArquivo = "imagem", escopo = "geral" }) {
  const dataUrl = String(imagem || "");
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw criarErroHttp("Envie uma imagem PNG, JPG ou WEBP.", 400);
  const mimeType = `image/${match[1].toLowerCase()}`;
  const mimeNormalizado = mimeType === "image/jpeg" ? "image/jpeg" : mimeType;
  const extensao = mimeNormalizado === "image/jpeg" ? "jpg" : mimeNormalizado.replace("image/", "");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw criarErroHttp("A imagem deve ter no maximo 5 MB.", 400);
  const mimeDetectado = detectarMimeImagem(buffer);
  if (!mimeDetectado || mimeDetectado !== mimeNormalizado) throw criarErroHttp("O conteudo do arquivo nao corresponde ao formato informado.", 400);
  const dimensoes = extrairDimensoesImagem(buffer, mimeDetectado);
  const maxPixels = Number.isFinite(imageMaxPixels) && imageMaxPixels > 0 ? imageMaxPixels : 25000000;
  if (dimensoes) {
    const pixels = dimensoes.width * dimensoes.height;
    if (!dimensoes.width || !dimensoes.height || pixels > maxPixels) throw criarErroHttp("A imagem tem dimensoes invalidas ou grandes demais.", 400);
  }
  return { dataUrl, buffer, extensao, mimeType: mimeDetectado, dimensoes, nomeArquivo, escopo };
}

function normalizarCategoriaModeracao(categoria) {
  return String(categoria || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function categoriaModeracaoBloqueada(categoria) {
  const normalizada = normalizarCategoriaModeracao(categoria);
  if (!normalizada) return false;
  return [...imageModerationBlockedCategories].some((bloqueada) => normalizada === bloqueada || normalizada.startsWith(`${bloqueada}-`) || normalizada.startsWith(`${bloqueada}/`));
}

function coletarCategoriasModeracao(dados = {}) {
  const categorias = new Set();
  const source = dados.categories || dados.categorias || dados.flags || {};
  const scores = dados.category_scores || dados.categoryScores || dados.scores || dados.pontuacoes || {};
  if (Array.isArray(source)) { source.forEach((item) => categorias.add(normalizarCategoriaModeracao(item))); }
  else if (source && typeof source === "object") { Object.entries(source).forEach(([categoria, valor]) => { if (valor === true || (typeof valor === "number" && valor >= imageModerationBlockThreshold)) categorias.add(normalizarCategoriaModeracao(categoria)); }); }
  if (scores && typeof scores === "object") { Object.entries(scores).forEach(([categoria, valor]) => { if (Number(valor) >= imageModerationBlockThreshold) categorias.add(normalizarCategoriaModeracao(categoria)); }); }
  return [...categorias].filter(Boolean);
}

function normalizarResultadoModeracao(dados = {}, origem = "externa") {
  const categorias = coletarCategoriasModeracao(dados);
  const score = Number(dados.score ?? dados.riskScore ?? dados.unsafeScore ?? dados.risco ?? dados.confidence ?? 0);
  const bloqueadaPorStatus = dados.allowed === false || dados.aprovada === false || dados.blocked === true || dados.bloqueada === true || dados.flagged === true || dados.rejected === true || dados.unsafe === true;
  const bloqueadaPorScore = Number.isFinite(score) && score >= imageModerationBlockThreshold;
  const bloqueadaPorCategoria = categorias.some(categoriaModeracaoBloqueada);
  const bloqueada = Boolean(bloqueadaPorStatus || bloqueadaPorScore || bloqueadaPorCategoria);
  const motivos = Array.isArray(dados.reasons || dados.motivos) ? (dados.reasons || dados.motivos).map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (bloqueadaPorCategoria) motivos.push("Categoria bloqueada pela politica de upload.");
  if (bloqueadaPorScore) motivos.push("Pontuacao de risco acima do limite permitido.");
  return { aprovada: !bloqueada, bloqueada, origem, score: Number.isFinite(score) ? score : 0, categorias, motivos: [...new Set(motivos)], mensagem: bloqueada ? "A imagem foi bloqueada pela moderacao de conteudo." : "Imagem aprovada pela moderacao." };
}

async function consultarModeracaoImagemExterna(upload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(imageModerationTimeoutMs) ? imageModerationTimeoutMs : 8000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (imageModerationApiToken) headers.Authorization = `Bearer ${imageModerationApiToken}`;
    const resposta = await fetch(imageModerationApiUrl, { method: "POST", headers, signal: controller.signal, body: JSON.stringify({ imagem: upload.dataUrl, mimeType: upload.mimeType, nomeArquivo: upload.nomeArquivo, escopo: upload.escopo, tamanhoBytes: upload.buffer.length, dimensoes: upload.dimensoes }) });
    if (!resposta.ok) throw new Error(`moderacao respondeu ${resposta.status}`);
    return normalizarResultadoModeracao(await resposta.json(), "externa");
  } finally {
    clearTimeout(timeout);
  }
}

async function moderarImagemUpload(upload) {
  if (!imageModerationEnabled) return { aprovada: true, bloqueada: false, origem: "desativada", score: 0, categorias: [], motivos: [], mensagem: "Moderacao de imagem desativada por configuracao." };
  if (!imageModerationApiUrl) {
    if (imageModerationRequired) throw criarErroHttp("Moderacao de imagem indisponivel. Tente novamente mais tarde.", 503);
    return { aprovada: true, bloqueada: false, origem: "local", score: 0, categorias: [], motivos: ["Validacao local de formato aprovada."], mensagem: "Imagem aprovada pela validacao local." };
  }
  try {
    return await consultarModeracaoImagemExterna(upload);
  } catch (err) {
    console.warn(`Aviso: moderacao de imagem indisponivel: ${err.message}`);
    if (imageModerationRequired) throw criarErroHttp("Nao foi possivel moderar a imagem agora. Tente novamente mais tarde.", 503);
    return { aprovada: true, bloqueada: false, origem: "fallback-local", score: 0, categorias: [], motivos: ["Servico externo indisponivel; validacao local de formato aprovada."], mensagem: "Imagem aprovada pela validacao local." };
  }
}

async function exigirImagemPermitida(upload) {
  const moderacao = await moderarImagemUpload(upload);
  if (moderacao.bloqueada) throw criarErroHttp("Upload bloqueado: a imagem viola a politica de conteudo.", 422, { moderacao });
  return moderacao;
}

async function salvarImagemUpload({ imagem, nomeArquivo = "imagem", escopo = "geral" }) {
  const upload = prepararImagemUpload({ imagem, nomeArquivo, escopo });
  const moderacao = await exigirImagemPermitida(upload);
  const escopoSeguro = String(escopo || "geral").toLowerCase().replace(/[^a-z0-9-]/g, "") || "geral";
  if (cloudinaryAtivo) {
    const resultado = await new Promise((resolve, reject) => {
      const stream = cloudinaryV2.uploader.upload_stream({ folder: `autoshine/${escopoSeguro}`, resource_type: "image" }, (error, result) => (error ? reject(error) : resolve(result)));
      stream.end(upload.buffer);
    });
    return { url: resultado.secure_url, moderacao };
  }
  const baseSeguro = path.basename(String(nomeArquivo || "imagem")).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 48) || "imagem";
  const nomeFinal = `${escopoSeguro}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${baseSeguro}.${upload.extensao}`;
  const destino = path.join(uploadsDir, nomeFinal);
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(destino, upload.buffer);
  return { url: `assets/uploads/${nomeFinal}`, moderacao };
}

module.exports = { prepararImagemUpload, moderarImagemUpload, exigirImagemPermitida, salvarImagemUpload };
