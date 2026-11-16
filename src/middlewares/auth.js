const jwt = require("jsonwebtoken");
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

function autenticarDono(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (papelDoToken(payload) !== "partner") return res.status(403).json({ error: "Token de dono inválido." });
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
    if (papelDoToken(payload) !== "client") return res.status(403).json({ error: "Token de usuário inválido." });
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

function autenticarAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (papelDoToken(payload) !== "admin") return res.status(403).json({ error: "Acesso restrito a administradores." });
    req.admin = payload;
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
      if (papelDoToken(payload) === "client") req.usuario = payload;
    } catch {}
  }
  next();
}

function autenticarUpload(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);
    if (!papelDoToken(payload)) return res.status(403).json({ error: "Token sem permissão para upload." });
    req.uploadUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
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
