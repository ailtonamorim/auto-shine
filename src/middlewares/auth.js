const jwt = require("jsonwebtoken");
const { jwtSecret, authCookieNames } = require("../utils/tokens");

function lerCookie(req, nome) {
  const cookies = String(req.headers.cookie || "").split(";");
  const item = cookies.find((cookie) => cookie.trim().startsWith(`${nome}=`));
  if (!item) return null;
  try {
    return decodeURIComponent(item.trim().slice(nome.length + 1));
  } catch {
    return null;
  }
}

function origemValida(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

function autorizarCookie(req, res, nomeCookie, verificarClaim, mensagem) {
  const token = lerCookie(req, nomeCookie);
  if (!token) {
    res.status(401).json({ error: "Sessão não fornecida." });
    return null;
  }
  if (!origemValida(req)) {
    res.status(403).json({ error: "Origem da requisição inválida." });
    return null;
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (!verificarClaim(payload)) {
      res.status(403).json({ error: mensagem });
      return null;
    }
    return payload;
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
    return null;
  }
}

function autenticarDono(req, res, next) {
  const payload = autorizarCookie(req, res, authCookieNames.dono, (claim) => Boolean(claim.donoId), "Sessão de parceiro inválida.");
  if (!payload) return;
  req.dono = payload;
  next();
}

function autenticarUsuario(req, res, next) {
  const payload = autorizarCookie(req, res, authCookieNames.usuario, (claim) => Boolean(claim.id), "Sessão de usuário inválida.");
  if (!payload) return;
  req.usuario = payload;
  next();
}

function autenticarAdmin(req, res, next) {
  const payload = autorizarCookie(req, res, authCookieNames.admin, (claim) => Boolean(claim.adminRole), "Acesso restrito a administradores.");
  if (!payload) return;
  next();
}

function tentarAutenticarUsuario(req, _res, next) {
  const token = lerCookie(req, authCookieNames.usuario);
  if (token) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.id) req.usuario = payload;
    } catch {}
  }
  next();
}

function autenticarUpload(req, res, next) {
  const roleCookie = ["admin", "dono", "usuario"].find((role) => lerCookie(req, authCookieNames[role]));
  if (!roleCookie) return res.status(401).json({ error: "Sessão não fornecida." });
  const payload = autorizarCookie(req, res, authCookieNames[roleCookie], (claim) => Boolean(claim.id || claim.donoId || claim.adminRole), "Sessão sem permissão para upload.");
  if (!payload) return;
  req.uploadUser = payload;
  next();
}

module.exports = { autenticarDono, autenticarUsuario, autenticarAdmin, tentarAutenticarUsuario, autenticarUpload };
