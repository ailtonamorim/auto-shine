const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const { jwtSecret } = require("../utils/tokens");

const authCookieName = "autoshine_auth";
const protectedClientPages = new Set(["agendamento.html", "favoritos.html", "meus-agendamentos.html", "perfil-usuario.html"]);
const protectedPartnerPages = new Set(["perfil-dono.html"]);
const clientPortalPages = new Set([
  "index.html",
  "mapa.html",
  "perfil.html",
  "servicos.html",
  "avaliacoes.html",
  "cadastro.html",
  "login.html",
  "agendamento.html",
  "favoritos.html",
  "meus-agendamentos.html",
  "perfil-usuario.html",
]);

// Papel do token (Diego): tokens novos trazem "role"; tokens antigos são reconhecidos pelos campos.
function papelDoToken(payload) {
  if (payload?.role === "client" && payload.id) return "client";
  if (payload?.role === "partner" && payload.donoId) return "partner";
  if (payload?.role === "admin" && payload.adminRole) return "admin";
  if (!payload?.role) {
    if (payload?.adminRole) return "admin";
    if (payload?.donoId) return "partner";
    if (payload?.id) return "client";
  }
  return null;
}

function setAuthCookie(res, token) {
  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(authCookieName, { httpOnly: true, sameSite: "lax", path: "/" });
}

// O cookie só decide redirecionamentos de páginas. As APIs continuam exigindo o token
// no cabeçalho e conferindo versão do login, e-mail confirmado e bloqueio (contaAtual).
function obterPapelDaPagina(req) {
  const cookies = String(req.headers.cookie || "").split(";");
  const authCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${authCookieName}=`));
  if (!authCookie) return null;
  try {
    return papelDoToken(jwt.verify(decodeURIComponent(authCookie.slice(authCookieName.length + 1)), jwtSecret));
  } catch {
    return null;
  }
}

function inicioDoPapel(role) {
  if (role === "admin") return "/admin.html";
  if (role === "partner") return "/cadastro-dono.html";
  return "/index.html";
}

function autorizarPagina(page) {
  return (req, res, next) => {
    const role = obterPapelDaPagina(req);
    if (page === "admin.html") {
      if (role && role !== "admin") return res.redirect(inicioDoPapel(role));
      return next();
    }

    if (page === "cadastro-dono.html") {
      if (role && role !== "partner") return res.redirect(inicioDoPapel(role));
      return next();
    }

    if ((page === "cadastro.html" || page === "login.html") && role) {
      return res.redirect(inicioDoPapel(role));
    }

    if (clientPortalPages.has(page) && (role === "partner" || role === "admin")) {
      return res.redirect(inicioDoPapel(role));
    }

    if (protectedClientPages.has(page)) {
      if (role === "client") return next();
      if (role) return res.redirect(inicioDoPapel(role));
      return res.redirect(`/cadastro.html?mode=login&next=${encodeURIComponent(`/${page}`)}`);
    }

    if (protectedPartnerPages.has(page)) {
      if (role === "partner") return next();
      if (role) return res.redirect(inicioDoPapel(role));
      return res.redirect(`/cadastro.html?perfil=empresa&mode=login&next=${encodeURIComponent(`/${page}`)}`);
    }

    return next();
  };
}

function lerToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
  try { return jwt.verify(auth.slice(7), jwtSecret); } catch { return null; }
}

// Bloqueio e suspensão feitos pelo admin (vindos do projeto dos colegas).
function motivoBloqueio(conta, dono) {
  if (conta.bloqueado) return dono ? "Conta de parceiro bloqueada. Entre em contato com o suporte." : "Conta de usuário bloqueada. Entre em contato com o suporte.";
  if (conta.suspensoAte && conta.suspensoAte > new Date()) {
    return `${dono ? "Conta de parceiro suspensa" : "Conta suspensa"} até ${conta.suspensoAte.toLocaleDateString("pt-BR")}.`;
  }
  return null;
}

async function contaAtual(payload, tipo) {
  const dono = tipo === "dono";
  const id = dono ? payload.donoId : payload.id;
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const conta = await prisma[dono ? "dono" : "usuario"].findUnique({
    where: { id }, select: dono
      ? { id: true, nome: true, login: true, authVersion: true, emailVerificadoEm: true, email: true, bloqueado: true, suspensoAte: true }
      : { id: true, nome: true, email: true, authVersion: true, emailVerificadoEm: true, bloqueado: true, suspensoAte: true },
  });
  // JWTs anteriores à migration equivalem à versão inicial (zero).
  if (!conta || !conta.email || !conta.emailVerificadoEm || (payload.authVersion ?? 0) !== conta.authVersion) return null;
  const bloqueio = motivoBloqueio(conta, dono);
  if (bloqueio) throw Object.assign(new Error(bloqueio), { status: 403, code: "CONTA_BLOQUEADA" });
  return { ...payload, nome: conta.nome, ...(dono ? { login: conta.login } : { email: conta.email }) };
}

function falhaVerificacao(res, err) {
  if (err?.code === "CONTA_BLOQUEADA") return res.status(403).json({ error: err.message, code: err.code });
  return res.status(503).json({ error: "Não foi possível verificar sua sessão. Tente novamente." });
}

function sessaoInvalida(res) {
  return res.status(401).json({ error: "Sua sessão expirou ou foi encerrada. Faça login novamente.", code: "SESSAO_INVALIDA" });
}

function autenticarConta(tipo) {
  return async (req, res, next) => {
    const payload = lerToken(req);
    if (!payload) return sessaoInvalida(res);
    if (papelDoToken(payload) !== (tipo === "dono" ? "partner" : "client")) {
      return res.status(403).json({ error: "Token sem permissão para esta conta." });
    }
    try {
      const atual = await contaAtual(payload, tipo);
      if (!atual) return sessaoInvalida(res);
      req[tipo] = atual;
    } catch (err) {
      return falhaVerificacao(res, err);
    }
    return next();
  };
}
const autenticarDono = autenticarConta("dono");
const autenticarUsuario = autenticarConta("usuario");

function autenticarAdmin(req, res, next) {
  const payload = lerToken(req);
  if (!payload) return sessaoInvalida(res);
  if (papelDoToken(payload) !== "admin") return res.status(403).json({ error: "Acesso restrito a administradores." });
  req.admin = payload;
  return next();
}

async function tentarAutenticarUsuario(req, res, next) {
  const payload = lerToken(req);
  if (papelDoToken(payload) === "client") {
    try {
      const atual = await contaAtual(payload, "usuario");
      if (atual) req.usuario = atual;
    } catch (err) {
      // Rotas públicas seguem sem usuário quando a conta está bloqueada.
      if (err?.code !== "CONTA_BLOQUEADA") return falhaVerificacao(res, err);
    }
  }
  return next();
}

async function autenticarUpload(req, res, next) {
  const payload = lerToken(req);
  if (!payload) return sessaoInvalida(res);
  const role = papelDoToken(payload);
  if (!role) return res.status(403).json({ error: "Token sem permissão para upload." });
  try {
    const atual = role === "admin" ? payload : await contaAtual(payload, role === "partner" ? "dono" : "usuario");
    if (!atual) return sessaoInvalida(res);
    req.uploadUser = atual;
  } catch (err) {
    return falhaVerificacao(res, err);
  }
  return next();
}
module.exports = {
  authCookieName,
  papelDoToken,
  setAuthCookie,
  clearAuthCookie,
  autorizarPagina,
  autenticarDono,
  autenticarUsuario,
  autenticarAdmin,
  tentarAutenticarUsuario,
  autenticarUpload,
};
