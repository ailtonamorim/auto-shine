const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../utils/tokens");

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
    if (!payload.id && !payload.donoId && !payload.adminRole) return res.status(403).json({ error: "Token sem permissão para upload." });
    req.uploadUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

module.exports = { autenticarDono, autenticarUsuario, autenticarAdmin, tentarAutenticarUsuario, autenticarUpload };
