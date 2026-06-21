const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinaryV2 = require("cloudinary").v2;

dotenv.config();

cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const cloudinaryAtivo = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const prisma = new PrismaClient();
const requiredConfig = ["JWT_SECRET", "SESSION_SECRET", "ADMIN_LOGIN", "ADMIN_SENHA"];
const missingConfig = requiredConfig.filter((key) => !process.env[key]);
if (missingConfig.length) {
  console.error(`Configuracao obrigatoria ausente: ${missingConfig.join(", ")}. Confira o arquivo .env.`);
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = "7d";
const app = express();
const PORT = process.env.PORT || 3000;
const baseDir = __dirname;
const uploadsDir = path.join(baseDir, "assets", "uploads");
const publicPages = new Set([
  "index.html",
  "mapa.html",
  "perfil.html",
  "agendamento.html",
  "meus-agendamentos.html",
  "avaliacoes.html",
  "cadastro.html",
  "cadastro-dono.html",
  "admin.html",
  "termos.html",
  "privacidade.html",
  "favoritos.html",
  "login.html",
  "reset-senha.html",
]);

fs.mkdir(uploadsDir, { recursive: true }).catch((err) => {
  console.error("Não foi possível preparar a pasta de uploads:", err);
});

app.disable("x-powered-by");

function aplicarHeadersSeguranca(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  next();
}

function criarLimitador({ janelaMs, maximo }) {
  const acessos = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = `${req.ip}:${req.method}:${req.path}`;
    const registro = acessos.get(chave) || { inicio: agora, total: 0 };

    if (agora - registro.inicio > janelaMs) {
      registro.inicio = agora;
      registro.total = 0;
    }

    registro.total += 1;
    acessos.set(chave, registro);

    if (registro.total > maximo) {
      return res.status(429).json({ error: "Muitas tentativas. Aguarde um pouco e tente novamente." });
    }

    next();
  };
}

const limitarAuth = criarLimitador({ janelaMs: 15 * 60 * 1000, maximo: 30 });
const limitarValidacoes = criarLimitador({ janelaMs: 10 * 60 * 1000, maximo: 60 });
const limitarUploads = criarLimitador({ janelaMs: 10 * 60 * 1000, maximo: 40 });

app.use(aplicarHeadersSeguranca);

// ── Credenciais admin ───────────────────────────────────────────────────────
const adminLogin = process.env.ADMIN_LOGIN;
const adminSenha = process.env.ADMIN_SENHA;

// ── Configuracao OAuth ──────────────────────────────────────────────────────
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;
const sessionSecret = process.env.SESSION_SECRET;
const googleOAuthConfigured = Boolean(googleClientId && googleClientSecret);
const serproCpfApiUrl = process.env.SERPRO_CPF_API_URL || "";
const serproCpfBearerToken = process.env.SERPRO_CPF_BEARER_TOKEN || "";
const serproCpfConsumerKey = process.env.SERPRO_CPF_CONSUMER_KEY || "";
const serproCpfConsumerSecret = process.env.SERPRO_CPF_CONSUMER_SECRET || "";
const serproCpfTokenUrl = process.env.SERPRO_CPF_TOKEN_URL || "https://gateway.apiserpro.serpro.gov.br/token";
const geocodingUserAgent = process.env.GEOCODING_USER_AGENT || "AutoShine Marketplace/1.0";
const imageModerationEnabled = process.env.IMAGE_MODERATION_ENABLED !== "false";
const imageModerationRequired = process.env.IMAGE_MODERATION_REQUIRED === "true";
const imageModerationApiUrl = process.env.IMAGE_MODERATION_API_URL || "";
const imageModerationApiToken = process.env.IMAGE_MODERATION_API_TOKEN || "";
const imageModerationTimeoutMs = Number(process.env.IMAGE_MODERATION_TIMEOUT_MS || 8000);
const imageModerationBlockThreshold = Number(process.env.IMAGE_MODERATION_BLOCK_THRESHOLD || 0.8);
const imageMaxPixels = Number(process.env.IMAGE_MAX_PIXELS || 25000000);
const imageModerationBlockedCategories = new Set(
  String(process.env.IMAGE_MODERATION_BLOCK_CATEGORIES || "adult,nudity,porn,sexual,violence,gore,hate,self-harm,weapon,drugs,illegal,child-safety")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
let serproCpfTokenCache = { token: "", expiresAt: 0 };

const emailUser = process.env.EMAIL_USER || "";
const emailPass = process.env.EMAIL_PASS || "";
const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

let emailTransporter = null;
if (emailUser && emailPass) {
  emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
  });
}

async function enviarEmailReset({ para, nome, token, tipo }) {
  if (!emailTransporter) {
    console.warn("EMAIL_USER/EMAIL_PASS não configurados — email de reset não enviado.");
    return;
  }
  const paginaReset = tipo === "dono"
    ? `${appUrl}/reset-senha.html?token=${token}&tipo=dono`
    : `${appUrl}/reset-senha.html?token=${token}&tipo=usuario`;
  await emailTransporter.sendMail({
    from: `"AutoShine" <${emailUser}>`,
    to: para,
    subject: "Recuperação de senha — AutoShine",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Redefinir sua senha</h2>
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no AutoShine.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${paginaReset}"
           style="display:inline-block;margin:16px 0;padding:12px 28px;background:#2f7fff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
        <p style="color:#666;font-size:0.85rem">Se você não solicitou a redefinição, ignore este email. Sua senha permanece a mesma.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="color:#999;font-size:0.8rem">AutoShine — Marketplace de lava jato em Goiânia</p>
      </div>
    `,
  });
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 },
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json({ limit: "8mb" }));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy(
    { clientID: googleClientId, clientSecret: googleClientSecret, callbackURL: googleCallbackUrl },
    (_at, _rt, profile, done) => {
      const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : "";
      done(null, { id: profile.id, name: profile.displayName || "Usuario Google", email, provider: "google" });
    },
  ));
}

// ── Helpers de token ────────────────────────────────────────────────────────
function gerarTokenUsuario(usuario) {
  return jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenDono(dono) {
  return jwt.sign({ donoId: dono.id, nome: dono.nome, login: dono.login }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenAdmin() {
  return jwt.sign({ adminRole: true }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function normalizarLoginDono(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function normalizarCnpj(cnpj) {
  return String(cnpj || "").replace(/\D/g, "");
}

function cnpjTemDigitoValido(cnpj) {
  const digits = normalizarCnpj(cnpj);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calcular = (base, pesos) => {
    const soma = base.split("").reduce((total, digit, index) => total + Number(digit) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcular(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcular(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(digits[12]) && segundo === Number(digits[13]);
}

function normalizarCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function cpfTemDigitoValido(cpf) {
  const digits = normalizarCpf(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = calcularDigito(digits.slice(0, 9));
  const segundo = calcularDigito(digits.slice(0, 10));
  return primeiro === Number(digits[9]) && segundo === Number(digits[10]);
}

async function obterSerproCpfBearerToken() {
  if (serproCpfBearerToken) return serproCpfBearerToken;
  if (!serproCpfConsumerKey || !serproCpfConsumerSecret) return "";
  if (serproCpfTokenCache.token && serproCpfTokenCache.expiresAt > Date.now() + 60000) {
    return serproCpfTokenCache.token;
  }

  const credenciais = Buffer.from(`${serproCpfConsumerKey}:${serproCpfConsumerSecret}`).toString("base64");
  const resposta = await fetch(serproCpfTokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credenciais}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resposta.ok) throw new Error(`SERPRO token respondeu ${resposta.status}`);
  const dados = await resposta.json();
  const token = dados.access_token || dados.token;
  if (!token) throw new Error("SERPRO não retornou access_token");

  serproCpfTokenCache = {
    token,
    expiresAt: Date.now() + (Number(dados.expires_in) || 3600) * 1000,
  };
  return token;
}

async function consultarCpfSerpro(cpf) {
  const token = await obterSerproCpfBearerToken();
  if (!serproCpfApiUrl || !token) return null;

  const url = serproCpfApiUrl.includes("{cpf}")
    ? serproCpfApiUrl.replace("{cpf}", cpf)
    : `${serproCpfApiUrl.replace(/\/$/, "")}/${cpf}`;
  const resposta = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (resposta.status === 404) return { valido: false, origem: "serpro", mensagem: "CPF não encontrado na base oficial." };
  if (!resposta.ok) throw new Error(`SERPRO respondeu ${resposta.status}`);

  const dados = await resposta.json();
  const situacao = String(
    dados.situacao?.descricao ||
    dados.situacao ||
    dados.situacaoCadastral ||
    dados.status ||
    "",
  ).toLowerCase();
  const valido = !situacao || situacao.includes("regular") || situacao.includes("ativo");

  return {
    valido,
    origem: "serpro",
    mensagem: valido ? "CPF validado na base oficial." : "CPF encontrado, mas com situação cadastral irregular.",
    dados: {
      situacao: dados.situacao?.descricao || dados.situacao || dados.situacaoCadastral || dados.status || null,
    },
  };
}

async function consultarCnpjBrasilApi(cnpj) {
  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (resposta.status === 404) return { valido: false, origem: "brasilapi", mensagem: "CNPJ não encontrado na Receita Federal." };
  if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status}`);

  const dados = await resposta.json();
  return {
    valido: true,
    origem: "brasilapi",
    mensagem: "CNPJ validado na base da Receita Federal.",
    dados: {
      razaoSocial: dados.razao_social || null,
      nomeFantasia: dados.nome_fantasia || null,
      situacao: dados.descricao_situacao_cadastral || dados.situacao_cadastral || null,
    },
  };
}

async function consultarGeocodingNominatim(endereco) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", endereco);

  const resposta = await fetch(url, {
    headers: {
      "User-Agent": geocodingUserAgent,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
    },
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const dados = await resposta.json();
  return dados
    .map((item) => ({
      endereco: item.display_name || endereco,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      importancia: Number(item.importance || 0),
    }))
    .filter((item) => coordenadasValidas(item.latitude, item.longitude));
}

async function consultarReverseGeocodingNominatim(latitude, longitude) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const resposta = await fetch(url, {
    headers: {
      "User-Agent": geocodingUserAgent,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
    },
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const dados = await resposta.json();
  return {
    endereco: dados.display_name || "",
    latitude,
    longitude,
  };
}

function criarErroHttp(message, status = 400, extras = {}) {
  const erro = new Error(message);
  erro.status = status;
  Object.assign(erro, extras);
  return erro;
}

function detectarMimeImagem(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function extrairDimensoesImagem(buffer, mimeType) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      );
      if (isSof && offset + 8 < buffer.length) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (!length || length < 2) break;
      offset += 2 + length;
    }
  }

  if (mimeType === "image/webp" && buffer.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) {
      return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
    }
    if (chunk === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
  }

  return null;
}

function prepararImagemUpload({ imagem, nomeArquivo = "imagem", escopo = "geral" }) {
  const dataUrl = String(imagem || "");
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    throw criarErroHttp("Envie uma imagem PNG, JPG ou WEBP.", 400);
  }

  const mimeType = `image/${match[1].toLowerCase()}`;
  const mimeNormalizado = mimeType === "image/jpeg" ? "image/jpeg" : mimeType;
  const extensao = mimeNormalizado === "image/jpeg" ? "jpg" : mimeNormalizado.replace("image/", "");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw criarErroHttp("A imagem deve ter no maximo 5 MB.", 400);
  }

  const mimeDetectado = detectarMimeImagem(buffer);
  if (!mimeDetectado || mimeDetectado !== mimeNormalizado) {
    throw criarErroHttp("O conteudo do arquivo nao corresponde ao formato informado.", 400);
  }

  const dimensoes = extrairDimensoesImagem(buffer, mimeDetectado);
  const maxPixels = Number.isFinite(imageMaxPixels) && imageMaxPixels > 0 ? imageMaxPixels : 25000000;
  if (dimensoes) {
    const pixels = dimensoes.width * dimensoes.height;
    if (!dimensoes.width || !dimensoes.height || pixels > maxPixels) {
      throw criarErroHttp("A imagem tem dimensoes invalidas ou grandes demais.", 400);
    }
  }

  return { dataUrl, buffer, extensao, mimeType: mimeDetectado, dimensoes, nomeArquivo, escopo };
}

function normalizarCategoriaModeracao(categoria) {
  return String(categoria || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function categoriaModeracaoBloqueada(categoria) {
  const normalizada = normalizarCategoriaModeracao(categoria);
  if (!normalizada) return false;
  return [...imageModerationBlockedCategories].some((bloqueada) => (
    normalizada === bloqueada ||
    normalizada.startsWith(`${bloqueada}-`) ||
    normalizada.startsWith(`${bloqueada}/`)
  ));
}

function coletarCategoriasModeracao(dados = {}) {
  const categorias = new Set();
  const source = dados.categories || dados.categorias || dados.flags || {};
  const scores = dados.category_scores || dados.categoryScores || dados.scores || dados.pontuacoes || {};

  if (Array.isArray(source)) {
    source.forEach((item) => categorias.add(normalizarCategoriaModeracao(item)));
  } else if (source && typeof source === "object") {
    Object.entries(source).forEach(([categoria, valor]) => {
      if (valor === true || (typeof valor === "number" && valor >= imageModerationBlockThreshold)) {
        categorias.add(normalizarCategoriaModeracao(categoria));
      }
    });
  }

  if (scores && typeof scores === "object") {
    Object.entries(scores).forEach(([categoria, valor]) => {
      if (Number(valor) >= imageModerationBlockThreshold) categorias.add(normalizarCategoriaModeracao(categoria));
    });
  }

  return [...categorias].filter(Boolean);
}

function normalizarResultadoModeracao(dados = {}, origem = "externa") {
  const categorias = coletarCategoriasModeracao(dados);
  const score = Number(
    dados.score ??
    dados.riskScore ??
    dados.unsafeScore ??
    dados.risco ??
    dados.confidence ??
    0,
  );
  const bloqueadaPorStatus = (
    dados.allowed === false ||
    dados.aprovada === false ||
    dados.blocked === true ||
    dados.bloqueada === true ||
    dados.flagged === true ||
    dados.rejected === true ||
    dados.unsafe === true
  );
  const bloqueadaPorScore = Number.isFinite(score) && score >= imageModerationBlockThreshold;
  const bloqueadaPorCategoria = categorias.some(categoriaModeracaoBloqueada);
  const bloqueada = Boolean(bloqueadaPorStatus || bloqueadaPorScore || bloqueadaPorCategoria);

  const motivos = Array.isArray(dados.reasons || dados.motivos)
    ? (dados.reasons || dados.motivos).map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (bloqueadaPorCategoria) motivos.push("Categoria bloqueada pela politica de upload.");
  if (bloqueadaPorScore) motivos.push("Pontuacao de risco acima do limite permitido.");

  return {
    aprovada: !bloqueada,
    bloqueada,
    origem,
    score: Number.isFinite(score) ? score : 0,
    categorias,
    motivos: [...new Set(motivos)],
    mensagem: bloqueada
      ? "A imagem foi bloqueada pela moderacao de conteudo."
      : "Imagem aprovada pela moderacao.",
  };
}

async function consultarModeracaoImagemExterna(upload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(imageModerationTimeoutMs) ? imageModerationTimeoutMs : 8000);

  try {
    const headers = { "Content-Type": "application/json" };
    if (imageModerationApiToken) headers.Authorization = `Bearer ${imageModerationApiToken}`;

    const resposta = await fetch(imageModerationApiUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        imagem: upload.dataUrl,
        mimeType: upload.mimeType,
        nomeArquivo: upload.nomeArquivo,
        escopo: upload.escopo,
        tamanhoBytes: upload.buffer.length,
        dimensoes: upload.dimensoes,
      }),
    });

    if (!resposta.ok) throw new Error(`moderacao respondeu ${resposta.status}`);
    return normalizarResultadoModeracao(await resposta.json(), "externa");
  } finally {
    clearTimeout(timeout);
  }
}

async function moderarImagemUpload(upload) {
  if (!imageModerationEnabled) {
    return {
      aprovada: true,
      bloqueada: false,
      origem: "desativada",
      score: 0,
      categorias: [],
      motivos: [],
      mensagem: "Moderacao de imagem desativada por configuracao.",
    };
  }

  if (!imageModerationApiUrl) {
    if (imageModerationRequired) {
      throw criarErroHttp("Moderacao de imagem indisponivel. Tente novamente mais tarde.", 503);
    }
    return {
      aprovada: true,
      bloqueada: false,
      origem: "local",
      score: 0,
      categorias: [],
      motivos: ["Validacao local de formato aprovada. Configure IMAGE_MODERATION_API_URL para classificar conteudo."],
      mensagem: "Imagem aprovada pela validacao local.",
    };
  }

  try {
    return await consultarModeracaoImagemExterna(upload);
  } catch (err) {
    console.warn(`Aviso: moderacao de imagem indisponivel: ${err.message}`);
    if (imageModerationRequired) {
      throw criarErroHttp("Nao foi possivel moderar a imagem agora. Tente novamente mais tarde.", 503);
    }
    return {
      aprovada: true,
      bloqueada: false,
      origem: "fallback-local",
      score: 0,
      categorias: [],
      motivos: ["Servico externo indisponivel; validacao local de formato aprovada."],
      mensagem: "Imagem aprovada pela validacao local.",
    };
  }
}

async function exigirImagemPermitida(upload) {
  const moderacao = await moderarImagemUpload(upload);
  if (moderacao.bloqueada) {
    throw criarErroHttp("Upload bloqueado: a imagem viola a politica de conteudo.", 422, { moderacao });
  }
  return moderacao;
}

async function salvarImagemUpload({ imagem, nomeArquivo = "imagem", escopo = "geral" }) {
  const upload = prepararImagemUpload({ imagem, nomeArquivo, escopo });
  const moderacao = await exigirImagemPermitida(upload);
  const escopoSeguro = String(escopo || "geral").toLowerCase().replace(/[^a-z0-9-]/g, "") || "geral";

  if (cloudinaryAtivo) {
    const resultado = await new Promise((resolve, reject) => {
      const stream = cloudinaryV2.uploader.upload_stream(
        { folder: `autoshine/${escopoSeguro}`, resource_type: "image" },
        (error, result) => (error ? reject(error) : resolve(result))
      );
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

function redirecionamentoSeguro(valor, fallback = "index.html") {
  const texto = String(valor || "").trim();
  if (!texto || texto.startsWith("http") || texto.startsWith("//") || texto.includes("\\") || texto.includes("..")) {
    return fallback;
  }
  return texto.startsWith("/") ? texto : `/${texto}`;
}

const horariosPadrao = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
const diasPadraoAgenda = ["1", "2", "3", "4", "5", "6"];
const statusValidos = new Set(["pendente", "confirmado", "finalizado", "cancelado"]);
const statusBloqueiamHorario = ["pendente", "confirmado"];

function dataEhPassado(dataTexto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataTexto || ""))) return true;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(`${dataTexto}T00:00:00`);
  return Number.isNaN(data.getTime()) || data < hoje;
}

function fotoAvaliacaoValida(fotoUrl) {
  if (!fotoUrl) return true;
  const valor = String(fotoUrl);
  if (valor.length > 2 * 1024 * 1024) return false;
  return (
    /^https?:\/\//i.test(valor) ||
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(valor) ||
    /^assets\/uploads\/[a-z0-9._-]+\.(png|jpe?g|webp)$/i.test(valor)
  );
}

function imagemLojaValida(valor) {
  const imagem = String(valor || "").trim();
  if (/^https?:\/\//i.test(imagem)) return true;
  return /^assets\/(img|uploads)\/[a-z0-9._/-]+\.(svg|png|jpe?g|webp)$/i.test(imagem) && !imagem.includes("..");
}

function normalizarListaTexto(valor) {
  if (Array.isArray(valor)) return valor.map((item) => String(item || "").trim()).filter(Boolean);
  return String(valor || "")
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializarListaTexto(valor) {
  return normalizarListaTexto(valor).join(", ");
}

function normalizarFotosAdicionais(valor) {
  return normalizarListaTexto(valor).filter((foto) => imagemLojaValida(foto)).slice(0, 6);
}

function serializarFotosAdicionais(valor) {
  return normalizarFotosAdicionais(valor).join("\n");
}

function coordenadasValidas(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function erroHorarioReservado(err) {
  return err?.code === "P2002" || /Agendamento_lojaId_data_hora_ativo_key/i.test(String(err?.message || ""));
}

async function garantirIndicesBanco() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Agendamento_lojaId_data_hora_ativo_key"
      ON "Agendamento" ("lojaId", "data", "hora")
      WHERE "status" IN ('pendente', 'confirmado')
    `);
  } catch (err) {
    console.warn("Aviso: não foi possível criar índice de agendamento:", err?.message);
  }
}

function normalizarHorariosAgenda(valor) {
  const lista = Array.isArray(valor)
    ? valor
    : String(valor || "")
      .split(/[,\n;]/)
      .map((item) => item.trim());

  const unicos = new Set();
  lista.forEach((item) => {
    const match = String(item || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return;
    unicos.add(`${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`);
  });

  return [...unicos].sort((a, b) => a.localeCompare(b));
}

function normalizarDiasAgenda(valor) {
  const lista = Array.isArray(valor)
    ? valor
    : String(valor || "")
      .split(/[,\n;]/)
      .map((item) => item.trim());

  const unicos = new Set();
  lista.forEach((item) => {
    const dia = Number(item);
    if (Number.isInteger(dia) && dia >= 0 && dia <= 6) unicos.add(String(dia));
  });
  return [...unicos].sort((a, b) => Number(a) - Number(b));
}

function serializarAgendaDias(valor) {
  const dias = normalizarDiasAgenda(valor);
  return dias.length ? dias.join(",") : diasPadraoAgenda.join(",");
}

function serializarAgendaHorarios(valor) {
  const horarios = normalizarHorariosAgenda(valor);
  return horarios.length ? horarios.join(",") : horariosPadrao.join(",");
}

function obterAgendaDias(loja) {
  return normalizarDiasAgenda(loja?.agendaDias || diasPadraoAgenda);
}

function obterAgendaHorarios(loja) {
  return normalizarHorariosAgenda(loja?.agendaHorarios || horariosPadrao);
}

function diaSemanaData(dataTexto) {
  const data = new Date(`${dataTexto}T12:00:00`);
  return data.getDay();
}

async function horarioOcupado({ lojaId, data, hora, ignorarId = null }) {
  const ocupado = await prisma.agendamento.findFirst({
    where: {
      lojaId: Number(lojaId),
      data,
      hora,
      status: { in: statusBloqueiamHorario },
      ...(ignorarId ? { id: { not: Number(ignorarId) } } : {}),
    },
    select: { id: true },
  });
  return Boolean(ocupado);
}

async function montarDisponibilidadeLoja({ loja, data, ignorarId = null }) {
  const dias = obterAgendaDias(loja);
  const horariosConfigurados = obterAgendaHorarios(loja);
  const diaSemana = String(diaSemanaData(data));
  const aberto = dias.includes(diaSemana);

  if (!aberto) {
    return {
      aberto: false,
      diasFuncionamento: dias,
      horariosConfigurados,
      horarios: [],
      mensagem: "A loja não atende nesta data.",
    };
  }

  const agendamentos = await prisma.agendamento.findMany({
    where: {
      lojaId: loja.id,
      data,
      status: { in: statusBloqueiamHorario },
      ...(ignorarId ? { id: { not: Number(ignorarId) } } : {}),
    },
    select: { hora: true },
  });
  const ocupados = new Set(agendamentos.map((a) => a.hora));

  return {
    aberto: true,
    diasFuncionamento: dias,
    horariosConfigurados,
    horarios: horariosConfigurados.map((hora) => ({ hora, disponivel: !ocupados.has(hora) })),
  };
}

async function deletarLojaComRelacionados(id) {
  const agendamentos = await prisma.agendamento.findMany({
    where: { lojaId: id },
    select: { id: true },
  });
  const agendamentoIds = agendamentos.map((a) => a.id);

  await prisma.denuncia.deleteMany({
    where: {
      OR: [
        { lojaId: id },
        agendamentoIds.length ? { agendamentoId: { in: agendamentoIds } } : { id: -1 },
        { avaliacao: { lojaId: id } },
      ],
    },
  });
  await prisma.avaliacao.deleteMany({
    where: {
      OR: [
        { lojaId: id },
        agendamentoIds.length ? { agendamentoId: { in: agendamentoIds } } : { id: -1 },
      ],
    },
  });
  await prisma.agendamento.deleteMany({ where: { lojaId: id } });
  await prisma.servicoLoja.deleteMany({ where: { lojaId: id } });
  await prisma.loja.delete({ where: { id } });
}

// ── Middlewares de autenticacao ─────────────────────────────────────────────
function autenticarDono(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (!payload.donoId) return res.status(403).json({ error: "Token de dono inválido." });
    req.dono = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

function autenticarUsuario(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (!payload.id) return res.status(403).json({ error: "Token de usuário inválido." });
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

// extrai usuário do token mas não bloqueia se ausente
function autenticarAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (!payload.adminRole) return res.status(403).json({ error: "Acesso restrito a administradores." });
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

function tentarAutenticarUsuario(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(auth.slice(7), jwtSecret);
      if (payload.id) req.usuario = payload;
    } catch {}
  }
  next();
}

function autenticarUpload(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (!payload.id && !payload.donoId && !payload.adminRole) {
      return res.status(403).json({ error: "Token sem permissão para upload." });
    }
    req.uploadUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

// ── OAuth Google ────────────────────────────────────────────────────────────
app.get("/auth/google", (req, res, next) => {
  req.session.returnTo = redirecionamentoSeguro(req.query.next, "/index.html");
  req.session.parceiro = req.query.parceiro === "1";
  if (!googleOAuthConfigured) {
    const dest = req.session.parceiro ? "/cadastro-dono.html" : "/cadastro.html?mode=login";
    const sep = dest.includes("?") ? "&" : "?";
    return res.redirect(`${dest}${sep}auth=google_not_configured`);
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback", (req, res, next) => {
  const returnTo = redirecionamentoSeguro(req.session.returnTo, "/index.html");
  const parceiro = Boolean(req.session.parceiro);
  delete req.session.returnTo;
  delete req.session.parceiro;

  if (!googleOAuthConfigured) {
    const dest = parceiro ? "/cadastro-dono.html" : "/cadastro.html?mode=login";
    const sep = dest.includes("?") ? "&" : "?";
    return res.redirect(`${dest}${sep}auth=google_not_configured`);
  }

  const failDest = parceiro ? "/cadastro-dono.html?auth=google_failed" : "/cadastro.html?mode=login&auth=google_failed";
  passport.authenticate("google", { failureRedirect: failDest })(req, res, () => {
    const user = req.user || {};

    if (parceiro) {
      (async () => {
        try {
          let dono = await prisma.dono.findFirst({ where: { googleId: user.id } });

          if (!dono) {
            // gera login unico a partir do email/nome
            const base = String(user.email || user.name || "dono")
              .split("@")[0]
              .toLowerCase()
              .replace(/[^a-z0-9._-]/g, "")
              .slice(0, 20) || "dono";
            let login = base;
            let i = 1;
            while (await prisma.dono.findUnique({ where: { login } })) {
              login = `${base}${i++}`;
            }
            dono = await prisma.dono.create({
              data: { nome: user.name || "Parceiro Google", login, senha: null, googleId: user.id },
            });
          }

          const token = gerarTokenDono(dono);
          const next = encodeURIComponent(returnTo);
          res.redirect(`/cadastro-dono.html?auth=dono_google_success&token=${token}&next=${next}`);
        } catch (err) {
          console.error("Erro no Google auth do dono:", err);
          res.redirect("/cadastro-dono.html?auth=google_failed");
        }
      })();
      return;
    }

    (async () => {
      try {
        const email = normalizarEmail(user.email);
        if (!email) return res.redirect("/cadastro.html?mode=login&auth=google_failed");

        let usuario = await prisma.usuario.findFirst({
          where: { OR: [{ googleId: user.id }, { email }] },
        });

        if (!usuario) {
          usuario = await prisma.usuario.create({
            data: {
              nome: user.name || email.split("@")[0] || "Usuario Google",
              email,
              googleId: user.id,
            },
          });
        } else if (!usuario.googleId) {
          usuario = await prisma.usuario.update({
            where: { id: usuario.id },
            data: { googleId: user.id },
          });
        }

        const token = gerarTokenUsuario(usuario);
        const name = encodeURIComponent(usuario.nome);
        const emailParam = encodeURIComponent(usuario.email);
        const next = encodeURIComponent(returnTo);
        res.redirect(`/cadastro.html?mode=login&auth=success&provider=google&token=${encodeURIComponent(token)}&name=${name}&email=${emailParam}&next=${next}`);
      } catch (err) {
        console.error("Erro no Google auth do cliente:", err);
        res.redirect("/cadastro.html?mode=login&auth=google_failed");
      }
    })();
  });
});

app.get("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/index.html"));
  });
});

app.get("/api/auth/me", (req, res) => res.json({ authenticated: Boolean(req.user), user: req.user || null }));
app.get("/api/auth/config", (_req, res) => res.json({ googleOAuthConfigured }));

app.get("/api/validacoes/cpf/:cpf", limitarValidacoes, async (req, res) => {
  const cpf = normalizarCpf(req.params.cpf);
  if (cpf.length !== 11 || !cpfTemDigitoValido(cpf)) {
    return res.status(400).json({ valido: false, origem: "local", mensagem: "CPF invalido." });
  }

  try {
    const validacaoOficial = await consultarCpfSerpro(cpf);
    if (validacaoOficial) return res.json(validacaoOficial);
  } catch (err) {
    console.warn(`Aviso: não foi possível validar CPF no SERPRO: ${err.message}`);
  }

  res.json({
    valido: true,
    origem: "local",
    mensagem: "CPF com dígitos válidos. Configure a API oficial SERPRO para consulta cadastral.",
  });
});

// ── Auth cliente ────────────────────────────────────────────────────────────
app.get("/api/validacoes/cnpj/:cnpj", limitarValidacoes, async (req, res) => {
  const cnpj = normalizarCnpj(req.params.cnpj);
  if (!cnpjTemDigitoValido(cnpj)) {
    return res.status(400).json({ valido: false, origem: "local", mensagem: "CNPJ inválido." });
  }

  try {
    return res.json(await consultarCnpjBrasilApi(cnpj));
  } catch (err) {
    console.warn(`Aviso: não foi possível validar CNPJ na BrasilAPI: ${err.message}`);
  }

  return res.json({
    valido: true,
    origem: "local",
    mensagem: "CNPJ com dígitos válidos. Consulta oficial indisponível agora.",
  });
});

app.get("/api/geocode", limitarValidacoes, async (req, res) => {
  try {
    const endereco = String(req.query.endereco || "").trim();
    if (endereco.length < 6) return res.status(400).json({ error: "Informe um endereço mais completo." });
    const resultados = await consultarGeocodingNominatim(endereco);
    if (!resultados.length) return res.status(404).json({ error: "Endereço não encontrado." });
    res.json({ resultados, melhor: resultados[0], origem: "nominatim" });
  } catch {
    res.status(503).json({ error: "Não foi possível consultar o serviço de geocoding agora." });
  }
});

app.get("/api/geocode/reverso", limitarValidacoes, async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    if (!coordenadasValidas(latitude, longitude)) return res.status(400).json({ error: "Coordenadas invalidas." });
    const resultado = await consultarReverseGeocodingNominatim(latitude, longitude);
    res.json({ resultado, origem: "nominatim" });
  } catch {
    res.status(503).json({ error: "Não foi possível consultar o endereço agora." });
  }
});

app.post("/api/moderacao/imagem", limitarUploads, autenticarUpload, async (req, res) => {
  try {
    const { imagem, nomeArquivo, escopo } = req.body || {};
    const upload = prepararImagemUpload({ imagem, nomeArquivo, escopo });
    const moderacao = await moderarImagemUpload(upload);
    res.status(moderacao.bloqueada ? 422 : 200).json(moderacao);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao moderar imagem.", moderacao: err.moderacao });
  }
});

app.post("/api/uploads/imagem", limitarUploads, autenticarUpload, async (req, res) => {
  try {
    const { imagem, nomeArquivo, escopo } = req.body || {};
    const { url, moderacao } = await salvarImagemUpload({ imagem, nomeArquivo, escopo });
    res.status(201).json({ url, moderacao });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao salvar imagem.", moderacao: err.moderacao });
  }
});

app.post("/api/auth/signup", limitarAuth, async (req, res) => {
  try {
    const { nome, email, cpf, telefone, senha } = req.body;
    if (!nome || !email || !cpf || !telefone || !senha) return res.status(400).json({ error: "Todos os campos são obrigatórios." });

    const emailNorm = normalizarEmail(email);
    const cpfNorm = String(cpf).replace(/\D/g, "");
    const telefoneNorm = String(telefone).replace(/\D/g, "");
    if (!cpfTemDigitoValido(cpfNorm)) return res.status(400).json({ error: "CPF invalido." });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });

    const existente = await prisma.usuario.findFirst({ where: { OR: [{ email: emailNorm }, { cpf: cpfNorm }] } });
    if (existente) return res.status(409).json({ error: "Ja existe um cadastro com este email ou CPF." });

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({ data: { nome: String(nome).trim(), email: emailNorm, cpf: cpfNorm, telefone: telefoneNorm, senha: senhaHash } });
    const token = gerarTokenUsuario(usuario);
    res.status(201).json({ token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.status(500).json({ error: "Erro interno ao criar conta." });
  }
});

app.post("/api/auth/login", limitarAuth, async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha." });

    const usuario = await prisma.usuario.findUnique({ where: { email: normalizarEmail(email) } });
    if (!usuario) return res.status(401).json({ error: "Email ou senha inválidos." });
    if (!usuario.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, usuario.senha))) return res.status(401).json({ error: "Email ou senha inválidos." });

    const token = gerarTokenUsuario(usuario);
    res.json({ token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: "Erro interno ao fazer login." });
  }
});

// ── Auth dono ───────────────────────────────────────────────────────────────
app.post("/api/dono/cadastro", limitarAuth, async (req, res) => {
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
      if (!cnpjValidado.valido) {
        console.warn(`Aviso: CNPJ ${cnpjNorm} não encontrado na Receita Federal, mas permitindo cadastro.`);
      }
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
    const dono = await prisma.dono.create({
      data: { nome: String(nome).trim(), login: loginNorm, cnpj: cnpjNorm, email: emailNorm, senha: senhaHash },
    });
    const token = gerarTokenDono(dono);
    res.status(201).json({ token, dono: { id: dono.id, nome: dono.nome, login: dono.login, cnpj: dono.cnpj } });
  } catch (err) {
    console.error("Erro no cadastro do dono:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/dono/login", limitarAuth, async (req, res) => {
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

app.get("/api/dono/me", autenticarDono, async (req, res) => {
  try {
    const dono = await prisma.dono.findUnique({ where: { id: req.dono.donoId }, select: { id: true, nome: true, login: true } });
    if (!dono) return res.status(404).json({ error: "Dono não encontrado." });
    res.json({ dono });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

// ── Recuperação de senha ────────────────────────────────────────────────────
const limitarReset = criarLimitador({ janelaMs: 60 * 60 * 1000, maximo: 5 });

app.post("/api/reset-senha/solicitar", limitarReset, async (req, res) => {
  try {
    const { email, tipo } = req.body;
    if (!email || !["usuario", "dono"].includes(tipo)) {
      return res.status(400).json({ error: "Informe email e tipo de conta." });
    }
    const emailNorm = normalizarEmail(email);
    if (!emailValido(emailNorm)) return res.status(400).json({ error: "Email inválido." });

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    try {
      if (tipo === "usuario") {
        const usuario = await prisma.usuario.findUnique({ where: { email: emailNorm } });
        if (usuario) {
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { resetToken: token, resetTokenExpiry: expiry },
          });
          await enviarEmailReset({ para: emailNorm, nome: usuario.nome, token, tipo: "usuario" });
        }
      } else {
        const dono = await prisma.dono.findUnique({ where: { email: emailNorm } });
        if (dono) {
          await prisma.dono.update({
            where: { id: dono.id },
            data: { resetToken: token, resetTokenExpiry: expiry },
          });
          await enviarEmailReset({ para: emailNorm, nome: dono.nome, token, tipo: "dono" });
        }
      }
    } catch (dbErr) {
      console.warn("Aviso reset-senha (banco indisponível localmente?):", dbErr.message?.split("\n")[0]);
    }

    res.json({ ok: true, mensagem: "Se este email estiver cadastrado, você receberá um link de recuperação em breve." });
  } catch (err) {
    console.error("Erro ao solicitar reset:", err);
    res.status(500).json({ error: "Erro interno ao solicitar recuperação." });
  }
});

app.post("/api/reset-senha/confirmar", limitarReset, async (req, res) => {
  try {
    const { token, novaSenha, tipo } = req.body;
    if (!token || !novaSenha || !["usuario", "dono"].includes(tipo)) {
      return res.status(400).json({ error: "Dados inválidos." });
    }
    if (String(novaSenha).length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
    }

    const agora = new Date();

    try {
      if (tipo === "usuario") {
        const usuario = await prisma.usuario.findUnique({ where: { resetToken: token } });
        if (!usuario || !usuario.resetTokenExpiry || usuario.resetTokenExpiry < agora) {
          return res.status(400).json({ error: "Link de recuperação inválido ou expirado." });
        }
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { senha: senhaHash, resetToken: null, resetTokenExpiry: null },
        });
      } else {
        const dono = await prisma.dono.findUnique({ where: { resetToken: token } });
        if (!dono || !dono.resetTokenExpiry || dono.resetTokenExpiry < agora) {
          return res.status(400).json({ error: "Link de recuperação inválido ou expirado." });
        }
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await prisma.dono.update({
          where: { id: dono.id },
          data: { senha: senhaHash, resetToken: null, resetTokenExpiry: null },
        });
      }
    } catch (dbErr) {
      console.warn("Aviso reset-confirmar (banco indisponível localmente?):", dbErr.message?.split("\n")[0]);
    }

    res.json({ ok: true, mensagem: "Senha alterada com sucesso! Você já pode fazer login." });
  } catch (err) {
    console.error("Erro ao confirmar reset:", err);
    res.status(500).json({ error: "Erro interno ao redefinir senha." });
  }
});

// ── Lojas ───────────────────────────────────────────────────────────────────
app.get("/api/lojas", async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: { bloqueado: false },
      include: { servicos: true, avaliacoes: { select: { nota: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar lojas." });
  }
});

app.get("/api/favoritos", autenticarUsuario, async (req, res) => {
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
      ? await prisma.loja.findMany({
          where: { id: { in: lojaIds }, bloqueado: false },
          include: { servicos: true, avaliacoes: { select: { nota: true } } },
        })
      : [];
    const lojasPorId = new Map(lojasEncontradas.map((loja) => [loja.id, loja]));
    const lojas = lojaIds.map((id) => lojasPorId.get(id)).filter(Boolean);
    res.json({ lojas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar favoritos." });
  }
});

app.post("/api/favoritos/:lojaId", autenticarUsuario, async (req, res) => {
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

app.delete("/api/favoritos/:lojaId", autenticarUsuario, async (req, res) => {
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

app.get("/api/lojas/minhas", autenticarDono, async (req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: { donoId: req.dono.donoId },
      include: {
        servicos: true,
        avaliacoes: {
          include: { usuario: { select: { nome: true, email: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lojas." });
  }
});

app.get("/api/lojas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID de loja invalido." });

    const loja = await prisma.loja.findFirst({
      where: { id, bloqueado: false },
      include: { servicos: true, avaliacoes: { orderBy: { createdAt: "desc" } } },
    });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json({ loja });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.get("/api/lojas/:id/disponibilidade", async (req, res) => {
  try {
    const lojaId = Number(req.params.id);
    const data = String(req.query.data || "").trim();
    const ignorarId = req.query.ignorarAgendamentoId ? Number(req.query.ignorarAgendamentoId) : null;
    if (!lojaId) return res.status(400).json({ error: "ID invalido." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Informe uma data valida a partir de hoje." });

    const loja = await prisma.loja.findFirst({ where: { id: lojaId, bloqueado: false } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });

    res.json(await montarDisponibilidadeLoja({ loja, data, ignorarId }));
  } catch {
    res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
});

app.post("/api/lojas", autenticarDono, async (req, res) => {
  try {
    const {
      nome,
      descricao,
      endereco,
      latitude,
      longitude,
      precoMedio,
      categoria,
      fotoUrl,
      capaUrl,
      servicos,
      agendaDias,
      agendaHorarios,
      fotosAdicionais,
      formasPagamento,
      politicaCancelamento,
    } = req.body;
    if (!nome || !descricao || !endereco || !fotoUrl) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    const latitudeNum = Number(latitude);
    const longitudeNum = Number(longitude);
    if (!coordenadasValidas(latitudeNum, longitudeNum)) return res.status(400).json({ error: "Latitude e longitude invalidas." });
    if (!imagemLojaValida(fotoUrl) || (capaUrl && !imagemLojaValida(capaUrl))) {
      return res.status(400).json({ error: "Fotos devem ser URLs http/https ou arquivos em assets/img." });
    }

    const existente = await prisma.loja.findFirst({ where: { donoId: req.dono.donoId } });
    if (existente) return res.status(409).json({ error: "Voce ja possui um lava jato publicado.", lojaId: existente.id });

    const loja = await prisma.loja.create({
      data: {
        nome,
        descricao,
        endereco,
        latitude: latitudeNum,
        longitude: longitudeNum,
        precoMedio: Number(precoMedio) || 0,
        categoria: categoria || "serviços gerais",
        fotoUrl,
        capaUrl: capaUrl || null,
        fotosAdicionais: serializarFotosAdicionais(fotosAdicionais),
        formasPagamento: serializarListaTexto(formasPagamento) || "Pix, Cartão, Dinheiro",
        politicaCancelamento: String(politicaCancelamento || "").trim() || "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.",
        agendaDias: serializarAgendaDias(agendaDias),
        agendaHorarios: serializarAgendaHorarios(agendaHorarios),
        donoId: req.dono.donoId,
        servicos: Array.isArray(servicos) && servicos.length
          ? { create: servicos.map((s) => ({ nome: s.name || s.nome || "", descricao: s.description || s.descricao || "", preco: Number(s.price ?? s.preco) || 0, duracao: s.duration || s.duracao || "" })) }
          : undefined,
      },
      include: { servicos: true },
    });
    res.status(201).json({ loja });
  } catch (err) {
    console.error("Erro ao criar loja:", err);
    res.status(500).json({ error: "Erro ao criar loja." });
  }
});

app.put("/api/lojas/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findFirst({ where: { id, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou sem permissão." });

    const {
      nome,
      descricao,
      endereco,
      latitude,
      longitude,
      precoMedio,
      categoria,
      fotoUrl,
      capaUrl,
      agendaDias,
      agendaHorarios,
      fotosAdicionais,
      formasPagamento,
      politicaCancelamento,
    } = req.body;
    const latitudeNum = latitude !== undefined ? Number(latitude) : loja.latitude;
    const longitudeNum = longitude !== undefined ? Number(longitude) : loja.longitude;
    const proximaFoto = fotoUrl ?? loja.fotoUrl;
    const proximaCapa = capaUrl !== undefined ? (capaUrl || null) : loja.capaUrl;
    if (!coordenadasValidas(latitudeNum, longitudeNum)) return res.status(400).json({ error: "Latitude e longitude invalidas." });
    if (!imagemLojaValida(proximaFoto) || (proximaCapa && !imagemLojaValida(proximaCapa))) {
      return res.status(400).json({ error: "Fotos devem ser URLs http/https ou arquivos em assets/img." });
    }
    const atualizada = await prisma.loja.update({
      where: { id },
      data: {
        nome: nome ?? loja.nome,
        descricao: descricao ?? loja.descricao,
        endereco: endereco ?? loja.endereco,
        latitude: latitudeNum,
        longitude: longitudeNum,
        precoMedio: precoMedio !== undefined ? Number(precoMedio) : loja.precoMedio,
        categoria: categoria ?? loja.categoria,
        fotoUrl: proximaFoto,
        capaUrl: proximaCapa,
        fotosAdicionais: fotosAdicionais !== undefined ? serializarFotosAdicionais(fotosAdicionais) : loja.fotosAdicionais,
        formasPagamento: formasPagamento !== undefined ? (serializarListaTexto(formasPagamento) || loja.formasPagamento) : loja.formasPagamento,
        politicaCancelamento: politicaCancelamento !== undefined ? (String(politicaCancelamento || "").trim() || loja.politicaCancelamento) : loja.politicaCancelamento,
        agendaDias: agendaDias !== undefined ? serializarAgendaDias(agendaDias) : loja.agendaDias,
        agendaHorarios: agendaHorarios !== undefined ? serializarAgendaHorarios(agendaHorarios) : loja.agendaHorarios,
      },
      include: { servicos: true },
    });
    res.json({ loja: atualizada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar loja." });
  }
});

app.delete("/api/lojas/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findFirst({ where: { id, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou sem permissão." });
    await deletarLojaComRelacionados(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir loja." });
  }
});

// ── Serviços da loja ────────────────────────────────────────────────────────
app.post("/api/lojas/:lojaId/servicos", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });

    const { nome, descricao, preco, duracao } = req.body;
    if (!nome || !descricao || !duracao) return res.status(400).json({ error: "Preencha todos os campos do serviço." });

    const servico = await prisma.servicoLoja.create({ data: { nome, descricao, preco: Number(preco) || 0, duracao, lojaId } });
    res.status(201).json({ servico });
  } catch {
    res.status(500).json({ error: "Erro ao criar serviço." });
  }
});

app.put("/api/lojas/:lojaId/servicos/:id", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const id = Number(req.params.id);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });

    const servico = await prisma.servicoLoja.findFirst({ where: { id, lojaId } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });

    const { nome, descricao, preco, duracao } = req.body;
    const atualizado = await prisma.servicoLoja.update({
      where: { id },
      data: { nome: nome ?? servico.nome, descricao: descricao ?? servico.descricao, preco: preco !== undefined ? Number(preco) : servico.preco, duracao: duracao ?? servico.duracao },
    });
    res.json({ servico: atualizado });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar serviço." });
  }
});

app.delete("/api/lojas/:lojaId/servicos/:id", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const id = Number(req.params.id);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });

    const servico = await prisma.servicoLoja.findFirst({ where: { id, lojaId } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });

    const count = await prisma.servicoLoja.count({ where: { lojaId } });
    if (count <= 1) return res.status(400).json({ error: "A loja precisa ter pelo menos 1 serviço." });

    const agendamentos = await prisma.agendamento.count({ where: { servicoId: id } });
    if (agendamentos > 0) return res.status(400).json({ error: "Este serviço possui agendamentos. Cancele ou finalize os agendamentos antes de excluir." });

    await prisma.servicoLoja.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir serviço." });
  }
});

// ── Agendamentos ────────────────────────────────────────────────────────────
app.post("/api/agendamentos", autenticarUsuario, async (req, res) => {
  try {
    const { lojaId, servicoId, data, hora, veiculo, notas, nomeCliente, emailCliente } = req.body;
    if (!lojaId || !servicoId || !data || !hora) return res.status(400).json({ error: "Dados incompletos para agendamento." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Escolha uma data valida a partir de hoje." });

    const loja = await prisma.loja.findFirst({ where: { id: Number(lojaId), bloqueado: false } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou indisponível." });
    const disponibilidade = await montarDisponibilidadeLoja({ loja, data });
    const horarioDisponivel = disponibilidade.horarios.find((item) => item.hora === hora && item.disponivel);
    if (!disponibilidade.aberto || !horarioDisponivel) return res.status(400).json({ error: "Horário indisponível para esta loja." });

    const servico = await prisma.servicoLoja.findFirst({ where: { id: Number(servicoId), lojaId: Number(lojaId) } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado nesta loja." });
    if (await horarioOcupado({ lojaId, data, hora })) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });

    const agendamento = await prisma.agendamento.create({
      data: {
        data,
        hora,
        veiculo: veiculo || "Carro",
        notas: notas || null,
        nomeCliente: nomeCliente || null,
        emailCliente: emailCliente || null,
        usuarioId: req.usuario.id,
        lojaId: Number(lojaId),
        servicoId: Number(servicoId),
      },
      include: { loja: { select: { nome: true } }, servico: { select: { nome: true } } },
    });
    res.status(201).json({ agendamento });
  } catch (err) {
    if (erroHorarioReservado(err)) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }
    console.error("Erro ao criar agendamento:", err);
    res.status(500).json({ error: "Erro ao criar agendamento." });
  }
});

app.get("/api/agendamentos/dono", autenticarDono, async (req, res) => {
  try {
    const lojas = await prisma.loja.findMany({ where: { donoId: req.dono.donoId }, select: { id: true } });
    const lojaIds = lojas.map((l) => l.id);
    const agendamentos = await prisma.agendamento.findMany({
      where: { lojaId: { in: lojaIds } },
      include: {
        loja: { select: { id: true, nome: true } },
        servico: { select: { id: true, nome: true, preco: true, duracao: true } },
        usuario: { select: { nome: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ agendamentos });
  } catch {
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

app.get("/api/agendamentos/me", autenticarUsuario, async (req, res) => {
  try {
    const agendamentos = await prisma.agendamento.findMany({
      where: { usuarioId: req.usuario.id },
      include: {
        loja: { select: { id: true, nome: true, endereco: true, agendaDias: true, agendaHorarios: true } },
        servico: { select: { id: true, nome: true, preco: true, duracao: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ agendamentos });
  } catch {
    res.status(500).json({ error: "Erro ao buscar seus agendamentos." });
  }
});

app.put("/api/agendamentos/:id", autenticarUsuario, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { data, hora, veiculo, notas } = req.body;
    if (!id) return res.status(400).json({ error: "ID invalido." });
    if (!data || !hora) return res.status(400).json({ error: "Informe nova data e horario." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Escolha uma data valida a partir de hoje." });

    const agendamento = await prisma.agendamento.findFirst({
      where: { id, usuarioId: req.usuario.id },
      include: { loja: true },
    });
    if (!agendamento) return res.status(404).json({ error: "Agendamento não encontrado." });
    if (["finalizado", "cancelado"].includes(agendamento.status)) {
      return res.status(400).json({ error: "Este agendamento não pode mais ser alterado." });
    }
    const disponibilidade = await montarDisponibilidadeLoja({ loja: agendamento.loja, data, ignorarId: id });
    const horarioDisponivel = disponibilidade.horarios.find((item) => item.hora === hora && item.disponivel);
    if (!disponibilidade.aberto || !horarioDisponivel) return res.status(400).json({ error: "Horário indisponível para esta loja." });
    if (await horarioOcupado({ lojaId: agendamento.lojaId, data, hora, ignorarId: id })) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }

    const atualizado = await prisma.agendamento.update({
      where: { id },
      data: {
        data,
        hora,
        veiculo: veiculo || agendamento.veiculo,
        notas: notas === undefined ? agendamento.notas : notas || null,
        status: "pendente",
      },
      include: {
        loja: { select: { id: true, nome: true, endereco: true } },
        servico: { select: { id: true, nome: true, preco: true, duracao: true } },
      },
    });
    res.json({ agendamento: atualizado });
  } catch (err) {
    if (erroHorarioReservado(err)) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

app.put("/api/agendamentos/:id/cancelar", autenticarUsuario, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });

    const agendamento = await prisma.agendamento.findFirst({
      where: { id, usuarioId: req.usuario.id },
    });
    if (!agendamento) return res.status(404).json({ error: "Agendamento não encontrado." });
    if (agendamento.status === "finalizado") return res.status(400).json({ error: "Agendamento finalizado não pode ser cancelado." });

    const atualizado = await prisma.agendamento.update({
      where: { id },
      data: { status: "cancelado" },
    });
    res.json({ agendamento: atualizado });
  } catch {
    res.status(500).json({ error: "Erro ao cancelar agendamento." });
  }
});

app.put("/api/agendamentos/:id/status", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Informe o status." });
    if (!statusValidos.has(status)) return res.status(400).json({ error: "Status invalido." });

    const agendamento = await prisma.agendamento.findFirst({ where: { id }, include: { loja: true } });
    if (!agendamento || agendamento.loja.donoId !== req.dono.donoId) return res.status(404).json({ error: "Agendamento não encontrado ou sem permissão." });
    if (statusBloqueiamHorario.includes(status) && await horarioOcupado({ lojaId: agendamento.lojaId, data: agendamento.data, hora: agendamento.hora, ignorarId: id })) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }

    const atualizado = await prisma.agendamento.update({ where: { id }, data: { status } });
    res.json({ agendamento: atualizado });
  } catch (err) {
    if (erroHorarioReservado(err)) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }
    res.status(500).json({ error: "Erro ao atualizar status." });
  }
});

app.delete("/api/agendamentos/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agendamento = await prisma.agendamento.findFirst({ where: { id }, include: { loja: true } });
    if (!agendamento || agendamento.loja.donoId !== req.dono.donoId) return res.status(404).json({ error: "Agendamento não encontrado ou sem permissão." });
    await prisma.denuncia.deleteMany({ where: { agendamentoId: id } });
    await prisma.avaliacao.deleteMany({ where: { agendamentoId: id } });
    await prisma.agendamento.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir agendamento." });
  }
});

// ── Avaliações ──────────────────────────────────────────────────────────────
app.get("/api/avaliacoes/loja/:lojaId", async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const avaliacoes = await prisma.avaliacao.findMany({ where: { lojaId }, orderBy: { createdAt: "desc" } });
    res.json({ avaliacoes });
  } catch {
    res.status(500).json({ error: "Erro ao buscar avaliações." });
  }
});

app.post("/api/avaliacoes", autenticarUsuario, async (req, res) => {
  try {
    const { lojaId, nota, comentario, fotoUrl, nomeCliente } = req.body;
    if (!lojaId || !nota) return res.status(400).json({ error: "Loja e nota são obrigatórios." });
    if (Number(nota) < 1 || Number(nota) > 5) return res.status(400).json({ error: "Nota deve ser entre 1 e 5." });
    if (String(comentario || "").trim().length < 8) return res.status(400).json({ error: "Comentário deve ter pelo menos 8 caracteres." });
    if (!fotoAvaliacaoValida(fotoUrl)) return res.status(400).json({ error: "Foto deve ser uma URL http/https ou imagem PNG, JPG ou WEBP de ate 2 MB." });
    const loja = await prisma.loja.findFirst({ where: { id: Number(lojaId), bloqueado: false }, select: { id: true } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });

    const existente = await prisma.avaliacao.findFirst({
      where: { lojaId: Number(lojaId), usuarioId: req.usuario.id },
      select: { id: true },
    });
    if (existente) return res.status(409).json({ error: "Voce ja avaliou este estabelecimento." });

    const agendamentoFinalizado = await prisma.agendamento.findFirst({
      where: {
        lojaId: Number(lojaId),
        usuarioId: req.usuario.id,
        status: "finalizado",
        avaliacao: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!agendamentoFinalizado) {
      return res.status(403).json({ error: "Voce so pode avaliar depois de ter um agendamento finalizado nesta loja." });
    }

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

// ── Admin ────────────────────────────────────────────────────────────────────
app.post("/api/denuncias", autenticarUsuario, async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const motivo = String(req.body?.motivo || "").trim();
    const detalhes = String(req.body?.detalhes || "").trim();
    const lojaId = req.body?.lojaId ? Number(req.body.lojaId) : null;
    const avaliacaoId = req.body?.avaliacaoId ? Number(req.body.avaliacaoId) : null;
    const agendamentoId = req.body?.agendamentoId ? Number(req.body.agendamentoId) : null;

    if (!["loja", "avaliacao", "agendamento"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo de denúncia inválido." });
    }
    if (motivo.length < 4) return res.status(400).json({ error: "Informe um motivo para a denúncia." });

    const data = {
      tipo,
      motivo: motivo.slice(0, 120),
      detalhes: detalhes ? detalhes.slice(0, 600) : null,
      usuarioId: req.usuario.id,
    };

    if (tipo === "loja") {
      if (!lojaId) return res.status(400).json({ error: "Informe a loja denunciada." });
      const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { id: true } });
      if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
      data.lojaId = loja.id;
    }

    if (tipo === "avaliacao") {
      if (!avaliacaoId) return res.status(400).json({ error: "Informe a avaliação denunciada." });
      const avaliacao = await prisma.avaliacao.findUnique({
        where: { id: avaliacaoId },
        select: { id: true, lojaId: true },
      });
      if (!avaliacao) return res.status(404).json({ error: "Avaliação não encontrada." });
      data.avaliacaoId = avaliacao.id;
      data.lojaId = avaliacao.lojaId;
    }

    if (tipo === "agendamento") {
      if (!agendamentoId) return res.status(400).json({ error: "Informe o agendamento denunciado." });
      const agendamento = await prisma.agendamento.findFirst({
        where: { id: agendamentoId, usuarioId: req.usuario.id },
        select: { id: true, lojaId: true },
      });
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

app.post("/api/admin/login", limitarAuth, async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) {
    return res.status(401).json({ error: "Login ou senha incorretos." });
  }
  try {
    const loginOk = crypto.timingSafeEqual(Buffer.from(login), Buffer.from(adminLogin));
    const senhaOk = crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(adminSenha));
    if (!loginOk || !senhaOk) {
      return res.status(401).json({ error: "Login ou senha incorretos." });
    }
  } catch {
    return res.status(401).json({ error: "Login ou senha incorretos." });
  }
  res.json({ token: gerarTokenAdmin() });
});

app.get("/api/admin/resumo", autenticarAdmin, async (_req, res) => {
  try {
    const [lojas, bloqueadas, donos, usuarios, agendamentos, pendentes, avaliacoes, denuncias, denunciasAbertas] = await Promise.all([
      prisma.loja.count(),
      prisma.loja.count({ where: { bloqueado: true } }),
      prisma.dono.count(),
      prisma.usuario.count(),
      prisma.agendamento.count(),
      prisma.agendamento.count({ where: { status: "pendente" } }),
      prisma.avaliacao.count(),
      prisma.denuncia.count(),
      prisma.denuncia.count({ where: { status: "aberta" } }),
    ]);
    res.json({ resumo: { lojas, bloqueadas, donos, usuarios, agendamentos, pendentes, avaliacoes, denuncias, denunciasAbertas } });
  } catch {
    res.status(500).json({ error: "Erro ao carregar resumo admin." });
  }
});

app.get("/api/admin/lojas", autenticarAdmin, async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      include: {
        dono: { select: { id: true, nome: true, login: true, cnpj: true } },
        servicos: true,
        _count: { select: { servicos: true, avaliacoes: true } },
        avaliacoes: { select: { nota: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.get("/api/admin/lojas-favoritadas", autenticarAdmin, async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      select: {
        id: true,
        nome: true,
        endereco: true,
        fotoUrl: true,
        bloqueado: true,
        _count: { select: { favoritos: true } },
      },
    });

    const lojasFavoritadas = lojas
      .map((loja) => ({
        id: loja.id,
        nome: loja.nome,
        endereco: loja.endereco,
        fotoUrl: loja.fotoUrl,
        bloqueado: loja.bloqueado,
        totalFavoritos: loja._count?.favoritos || 0,
      }))
      .filter((loja) => loja.totalFavoritos > 0)
      .sort((a, b) => {
        if (b.totalFavoritos !== a.totalFavoritos) return b.totalFavoritos - a.totalFavoritos;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    const totalFavoritos = lojasFavoritadas.reduce((acc, loja) => acc + loja.totalFavoritos, 0);
    res.json({
      lojas: lojasFavoritadas,
      totalLojasFavoritadas: lojasFavoritadas.length,
      totalFavoritos,
    });
  } catch {
    res.status(500).json({ error: "Erro ao carregar lojas favoritadas." });
  }
});

app.get("/api/admin/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findUnique({
      where: { id },
      include: {
        dono: { select: { id: true, nome: true, login: true, cnpj: true } },
        servicos: { orderBy: { id: "asc" } },
        avaliacoes: { select: { nota: true } },
      },
    });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json({ loja });
  } catch {
    res.status(500).json({ error: "Erro ao carregar loja." });
  }
});

function prepararLojaAdmin(lojaInput = {}) {
  const loja = {
    nome: String(lojaInput.nome || "").trim(),
    descricao: String(lojaInput.descricao || "").trim(),
    endereco: String(lojaInput.endereco || "").trim(),
    latitude: Number(lojaInput.latitude),
    longitude: Number(lojaInput.longitude),
    precoMedio: Number(lojaInput.precoMedio) || 0,
    categoria: String(lojaInput.categoria || "serviços gerais").trim() || "serviços gerais",
    fotoUrl: String(lojaInput.fotoUrl || "").trim(),
    capaUrl: String(lojaInput.capaUrl || "").trim() || null,
    fotosAdicionais: serializarFotosAdicionais(lojaInput.fotosAdicionais),
    formasPagamento: serializarListaTexto(lojaInput.formasPagamento) || "Pix, Cartão, Dinheiro",
    politicaCancelamento: String(lojaInput.politicaCancelamento || "").trim() || "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.",
    agendaDias: lojaInput.agendaDias !== undefined ? serializarAgendaDias(lojaInput.agendaDias) : serializarAgendaDias(lojaInput.agendaDias ?? diasPadraoAgenda),
    agendaHorarios: lojaInput.agendaHorarios !== undefined ? serializarAgendaHorarios(lojaInput.agendaHorarios) : serializarAgendaHorarios(lojaInput.agendaHorarios ?? horariosPadrao),
    bloqueado: lojaInput.bloqueado === true || lojaInput.bloqueado === "true",
  };

  if (!loja.nome || !loja.descricao || !loja.endereco || !loja.fotoUrl) {
    const erro = new Error("Preencha nome, descrição, endereço e foto da loja.");
    erro.status = 400;
    throw erro;
  }
  if (!coordenadasValidas(loja.latitude, loja.longitude)) {
    const erro = new Error("Latitude e longitude invalidas.");
    erro.status = 400;
    throw erro;
  }
  if (!imagemLojaValida(loja.fotoUrl) || (loja.capaUrl && !imagemLojaValida(loja.capaUrl))) {
    const erro = new Error("Fotos devem ser URLs http/https ou arquivos em assets/img.");
    erro.status = 400;
    throw erro;
  }

  return loja;
}

function prepararServicosAdmin(servicos = []) {
  return (Array.isArray(servicos) ? servicos : [])
    .map((servico) => ({
      id: servico.id ? Number(servico.id) : null,
      nome: String(servico.nome || "").trim(),
      descricao: String(servico.descricao || "").trim(),
      preco: Number(servico.preco),
      duracao: String(servico.duracao || "").trim(),
    }))
    .filter((servico) => servico.nome || servico.descricao || servico.duracao || Number.isFinite(servico.preco));
}

app.put("/api/admin/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.loja.findUnique({ where: { id }, include: { dono: true } });
    if (!atual) return res.status(404).json({ error: "Loja não encontrada." });

    const { dono: donoInput, loja: lojaInput, servicos: servicosInput } = req.body || {};
    const donoNome = String(donoInput?.nome || atual.dono.nome).trim();
    const donoLogin = normalizarLoginDono(donoInput?.login || atual.dono.login);
    const cnpj = normalizarCnpj(donoInput?.cnpj ?? atual.dono.cnpj);
    const cnpjAlterado = cnpj !== (atual.dono.cnpj || "");

    if (!donoNome || !donoLogin) return res.status(400).json({ error: "Informe nome e login do parceiro." });
    if (donoLogin.length < 4) return res.status(400).json({ error: "Login do parceiro deve ter pelo menos 4 caracteres." });
    if (cnpjAlterado && cnpj && !cnpjTemDigitoValido(cnpj)) return res.status(400).json({ error: "CNPJ inválido." });

    if (donoLogin !== atual.dono.login) {
      const loginExistente = await prisma.dono.findUnique({ where: { login: donoLogin } });
      if (loginExistente && loginExistente.id !== atual.donoId) {
        return res.status(409).json({ error: "Este login ja pertence a outro parceiro." });
      }
    }
    if (cnpj && cnpjAlterado) {
      const cnpjExistente = await prisma.dono.findFirst({ where: { cnpj } });
      if (cnpjExistente && cnpjExistente.id !== atual.donoId) {
        return res.status(409).json({ error: "Este CNPJ ja pertence a outro parceiro." });
      }
    }

    const donoUpdate = { nome: donoNome, login: donoLogin, cnpj: cnpj || null };
    const novaSenha = String(donoInput?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      donoUpdate.senha = await bcrypt.hash(novaSenha, 10);
    }

    const lojaData = prepararLojaAdmin({ ...atual, ...(lojaInput || {}) });
    const servicos = prepararServicosAdmin(servicosInput);
    if (Array.isArray(servicosInput) && !servicos.length) {
      return res.status(400).json({ error: "Adicione pelo menos um serviço para a loja." });
    }
    for (const servico of servicos) {
      if (!servico.nome || !servico.descricao || !servico.duracao || !Number.isFinite(servico.preco) || servico.preco < 0) {
        return res.status(400).json({ error: "Preencha nome, descrição, preço e duração dos serviços." });
      }
    }

    const completa = await prisma.$transaction(async (tx) => {
      await tx.dono.update({ where: { id: atual.donoId }, data: donoUpdate });
      const loja = await tx.loja.update({ where: { id }, data: lojaData });

      const idsMantidos = [];
      for (const servico of servicos) {
        const { id: servicoId, ...servicoData } = servico;
        if (servicoId) {
          const existente = await tx.servicoLoja.findFirst({ where: { id: servicoId, lojaId: id } });
          if (existente) {
            await tx.servicoLoja.update({ where: { id: servicoId }, data: servicoData });
            idsMantidos.push(servicoId);
          }
        } else {
          const criado = await tx.servicoLoja.create({ data: { ...servicoData, lojaId: id } });
          idsMantidos.push(criado.id);
        }
      }
      if (Array.isArray(servicosInput)) {
        const whereRemovidos = { lojaId: id, ...(idsMantidos.length ? { id: { notIn: idsMantidos } } : {}) };
        const removidosComAgendamento = await tx.servicoLoja.findFirst({
          where: { ...whereRemovidos, agendamentos: { some: {} } },
          select: { nome: true },
        });
        if (removidosComAgendamento) {
          const erro = new Error(`O serviço "${removidosComAgendamento.nome}" possui agendamentos e não pode ser removido pelo editor admin.`);
          erro.status = 400;
          throw erro;
        }
        await tx.servicoLoja.deleteMany({ where: whereRemovidos });
      }

      return tx.loja.findUnique({
        where: { id: loja.id },
        include: { dono: true, servicos: true },
      });
    });
    res.json({ loja: completa });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao atualizar loja pelo admin." });
  }
});

app.put("/api/admin/lojas/:id/bloquear", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.update({ where: { id }, data: { bloqueado: true } });
    res.json({ loja });
  } catch {
    res.status(500).json({ error: "Erro ao bloquear loja." });
  }
});

app.put("/api/admin/lojas/:id/desbloquear", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.update({ where: { id }, data: { bloqueado: false } });
    res.json({ loja });
  } catch {
    res.status(500).json({ error: "Erro ao desbloquear loja." });
  }
});

app.delete("/api/admin/lojas/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findUnique({ where: { id }, select: { nome: true, donoId: true } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    await deletarLojaComRelacionados(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir loja." });
  }
});

// ── Arquivos estaticos ──────────────────────────────────────────────────────
const usuarioAdminSelect = {
  id: true,
  nome: true,
  email: true,
  cpf: true,
  telefone: true,
  googleId: true,
  createdAt: true,
  _count: { select: { agendamentos: true, avaliacoes: true, denuncias: true } },
};

const donoAdminSelect = {
  id: true,
  nome: true,
  login: true,
  cnpj: true,
  googleId: true,
  createdAt: true,
  _count: { select: { lojas: true } },
};

const avaliacaoAdminInclude = {
  usuario: { select: { id: true, nome: true, email: true } },
  loja: { select: { id: true, nome: true } },
  _count: { select: { denuncias: true } },
};

app.get("/api/admin/usuarios", autenticarAdmin, async (_req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        cpf: true,
        telefone: true,
        googleId: true,
        createdAt: true,
        _count: { select: { agendamentos: true, avaliacoes: true, denuncias: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ usuarios });
  } catch {
    res.status(500).json({ error: "Erro ao carregar usuários." });
  }
});

app.get("/api/admin/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: usuarioAdminSelect });
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado." });
    res.json({ usuario });
  } catch {
    res.status(500).json({ error: "Erro ao carregar usuario." });
  }
});

app.put("/api/admin/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.usuario.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Usuario nao encontrado." });

    const nome = String(req.body?.nome ?? atual.nome).trim();
    const email = normalizarEmail(req.body?.email ?? atual.email);
    const cpf = req.body?.cpf === undefined ? atual.cpf : normalizarCpf(req.body.cpf);
    const telefone = req.body?.telefone === undefined ? atual.telefone : normalizarTelefone(req.body.telefone);
    const cpfAlterado = cpf !== (atual.cpf || "");
    const telefoneAlterado = telefone !== (atual.telefone || "");

    if (!nome || !email) return res.status(400).json({ error: "Informe nome e email." });
    if (!emailValido(email)) return res.status(400).json({ error: "Email invalido." });
    if (cpfAlterado && cpf && !cpfTemDigitoValido(cpf)) return res.status(400).json({ error: "CPF invalido." });
    if (telefoneAlterado && telefone && telefone.length < 10) return res.status(400).json({ error: "Telefone invalido." });

    if (email !== atual.email) {
      const emailExistente = await prisma.usuario.findUnique({ where: { email } });
      if (emailExistente && emailExistente.id !== id) {
        return res.status(409).json({ error: "Este email ja pertence a outro usuario." });
      }
    }
    if (cpf && cpfAlterado) {
      const cpfExistente = await prisma.usuario.findFirst({ where: { cpf } });
      if (cpfExistente && cpfExistente.id !== id) {
        return res.status(409).json({ error: "Este CPF ja pertence a outro usuario." });
      }
    }

    const data = {
      nome,
      email,
      cpf: cpf || null,
      telefone: telefone || null,
    };
    const novaSenha = String(req.body?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      data.senha = await bcrypt.hash(novaSenha, 10);
    }

    const usuario = await prisma.usuario.update({ where: { id }, data, select: usuarioAdminSelect });
    res.json({ usuario });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar usuario." });
  }
});

app.delete("/api/admin/usuarios/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.$transaction([
      prisma.agendamento.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.avaliacao.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.denuncia.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
      prisma.usuario.delete({ where: { id } }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

app.get("/api/admin/donos", autenticarAdmin, async (_req, res) => {
  try {
    const donos = await prisma.dono.findMany({
      select: {
        id: true,
        nome: true,
        login: true,
        cnpj: true,
        googleId: true,
        createdAt: true,
        _count: { select: { lojas: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ donos });
  } catch {
    res.status(500).json({ error: "Erro ao carregar parceiros." });
  }
});

app.get("/api/admin/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const dono = await prisma.dono.findUnique({ where: { id }, select: donoAdminSelect });
    if (!dono) return res.status(404).json({ error: "Parceiro nao encontrado." });
    res.json({ dono });
  } catch {
    res.status(500).json({ error: "Erro ao carregar parceiro." });
  }
});

app.put("/api/admin/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.dono.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Parceiro nao encontrado." });

    const nome = String(req.body?.nome ?? atual.nome).trim();
    const login = normalizarLoginDono(req.body?.login ?? atual.login);
    const cnpj = req.body?.cnpj === undefined ? atual.cnpj : normalizarCnpj(req.body.cnpj);
    const cnpjAlterado = cnpj !== (atual.cnpj || "");

    if (!nome || !login) return res.status(400).json({ error: "Informe nome e login do parceiro." });
    if (login.length < 4) return res.status(400).json({ error: "Login do parceiro deve ter pelo menos 4 caracteres." });
    if (cnpjAlterado && cnpj && !cnpjTemDigitoValido(cnpj)) return res.status(400).json({ error: "CNPJ invalido." });

    if (login !== atual.login) {
      const loginExistente = await prisma.dono.findUnique({ where: { login } });
      if (loginExistente && loginExistente.id !== id) {
        return res.status(409).json({ error: "Este login ja pertence a outro parceiro." });
      }
    }
    if (cnpj && cnpjAlterado) {
      const cnpjExistente = await prisma.dono.findFirst({ where: { cnpj } });
      if (cnpjExistente && cnpjExistente.id !== id) {
        return res.status(409).json({ error: "Este CNPJ ja pertence a outro parceiro." });
      }
    }

    const data = { nome, login, cnpj: cnpj || null };
    const novaSenha = String(req.body?.senha || "");
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres." });
      data.senha = await bcrypt.hash(novaSenha, 10);
    }

    const dono = await prisma.dono.update({ where: { id }, data, select: donoAdminSelect });
    res.json({ dono });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar parceiro." });
  }
});

app.delete("/api/admin/donos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const lojas = await prisma.loja.findMany({ where: { donoId: id }, select: { id: true } });
    for (const loja of lojas) await deletarLojaComRelacionados(loja.id);
    await prisma.dono.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir parceiro." });
  }
});

app.get("/api/admin/agendamentos", autenticarAdmin, async (_req, res) => {
  try {
    const agendamentos = await prisma.agendamento.findMany({
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        loja: { select: { id: true, nome: true } },
        servico: { select: { id: true, nome: true, preco: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ agendamentos });
  } catch {
    res.status(500).json({ error: "Erro ao carregar agendamentos." });
  }
});

app.put("/api/admin/agendamentos/:id/status", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!id || !["pendente", "finalizado", "cancelado"].includes(status)) {
      return res.status(400).json({ error: "Status invalido." });
    }
    const agendamento = await prisma.agendamento.update({ where: { id }, data: { status } });
    res.json({ agendamento });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

app.delete("/api/admin/agendamentos/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.deleteMany({ where: { agendamentoId: id } });
    await prisma.avaliacao.deleteMany({ where: { agendamentoId: id } });
    await prisma.agendamento.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir agendamento." });
  }
});

app.get("/api/admin/avaliacoes", autenticarAdmin, async (_req, res) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        loja: { select: { id: true, nome: true } },
        _count: { select: { denuncias: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ avaliacoes });
  } catch {
    res.status(500).json({ error: "Erro ao carregar avaliações." });
  }
});

app.get("/api/admin/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const avaliacao = await prisma.avaliacao.findUnique({ where: { id }, include: avaliacaoAdminInclude });
    if (!avaliacao) return res.status(404).json({ error: "Avaliacao nao encontrada." });
    res.json({ avaliacao });
  } catch {
    res.status(500).json({ error: "Erro ao carregar avaliacao." });
  }
});

app.put("/api/admin/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atual = await prisma.avaliacao.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: "Avaliacao nao encontrada." });

    const nota = req.body?.nota === undefined ? atual.nota : Number(req.body.nota);
    const comentario = req.body?.comentario === undefined ? atual.comentario : String(req.body.comentario || "").trim();
    const fotoUrl = req.body?.fotoUrl === undefined ? atual.fotoUrl : String(req.body.fotoUrl || "").trim();
    const nomeCliente = req.body?.nomeCliente === undefined ? atual.nomeCliente : String(req.body.nomeCliente || "").trim();

    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ error: "Nota deve ser um inteiro entre 1 e 5." });
    }
    if (!fotoAvaliacaoValida(fotoUrl)) {
      return res.status(400).json({ error: "Foto deve ser uma URL http/https ou imagem PNG, JPG ou WEBP de ate 2 MB." });
    }

    const avaliacao = await prisma.avaliacao.update({
      where: { id },
      data: {
        nota,
        comentario: comentario || null,
        fotoUrl: fotoUrl || null,
        nomeCliente: nomeCliente || null,
      },
      include: avaliacaoAdminInclude,
    });
    res.json({ avaliacao });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar avaliacao." });
  }
});

app.delete("/api/admin/avaliacoes/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.deleteMany({ where: { avaliacaoId: id } });
    await prisma.avaliacao.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir avaliação." });
  }
});

app.get("/api/admin/denuncias", autenticarAdmin, async (_req, res) => {
  try {
    const denuncias = await prisma.denuncia.findMany({
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        loja: { select: { id: true, nome: true } },
        avaliacao: { select: { id: true, comentario: true, nota: true } },
        agendamento: { select: { id: true, data: true, hora: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ denuncias });
  } catch {
    res.status(500).json({ error: "Erro ao carregar denúncias." });
  }
});

app.put("/api/admin/denuncias/:id/status", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!id || !["aberta", "em_analise", "resolvida", "arquivada"].includes(status)) {
      return res.status(400).json({ error: "Status invalido." });
    }
    const denuncia = await prisma.denuncia.update({ where: { id }, data: { status } });
    res.json({ denuncia });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar denúncia." });
  }
});

app.delete("/api/admin/denuncias/:id", autenticarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    await prisma.denuncia.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir denúncia." });
  }
});

app.use("/assets", express.static(path.join(baseDir, "assets")));
app.get("/", (_req, res) => res.sendFile(path.join(baseDir, "index.html")));
app.get("/parceiro-cadastrar.html", (_req, res) => res.redirect(301, "/cadastro-dono.html"));
app.get("/:page", (req, res, next) => {
  const { page } = req.params;
  if (!publicPages.has(page)) return next();
  return res.sendFile(path.join(baseDir, page));
});

app.use((_req, res) => {
  res.status(404).json({ error: "Recurso não encontrado." });
});

let server;

async function iniciarServidor() {
  await garantirIndicesBanco();
  server = app.listen(PORT, () => {
    console.log(`AutoShine ativo em http://localhost:${PORT}`);
    if (!googleOAuthConfigured) console.log("OAuth Google desativado: configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env");
  });
}

iniciarServidor().catch((err) => {
  console.error("Nao foi possivel iniciar o AutoShine:", err);
  process.exit(1);
});

module.exports = { app, prisma, get server() { return server; }, iniciarServidor };
