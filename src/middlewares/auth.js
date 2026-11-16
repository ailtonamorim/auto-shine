const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const { jwtSecret } = require("../utils/tokens");

async function autenticarDono(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), jwtSecret);
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
  if (!payload.donoId) return res.status(403).json({ error: "Token de dono inválido." });
  try {
    const dono = await prisma.dono.findUnique({ where: { id: payload.donoId }, select: { bloqueado: true, suspensoAte: true } });
    if (!dono) return res.status(401).json({ error: "Conta não encontrada." });
    if (dono.bloqueado) return res.status(403).json({ error: "Conta de parceiro bloqueada. Entre em contato com o suporte." });
    if (dono.suspensoAte && dono.suspensoAte > new Date()) return res.status(403).json({ error: `Conta de parceiro suspensa até ${dono.suspensoAte.toLocaleDateString("pt-BR")}.` });
    req.dono = payload;
    next();
  } catch (error) {
    console.error("Erro ao verificar status da conta de parceiro:", error);
    res.status(500).json({ error: "Não foi possível verificar o status da conta." });
  }
}

async function autenticarUsuario(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), jwtSecret);
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
  if (!payload.id) return res.status(403).json({ error: "Token de usuário inválido." });
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id }, select: { bloqueado: true, suspensoAte: true } });
    if (!usuario) return res.status(401).json({ error: "Conta não encontrada." });
    if (usuario.bloqueado) return res.status(403).json({ error: "Conta de usuário bloqueada. Entre em contato com o suporte." });
    if (usuario.suspensoAte && usuario.suspensoAte > new Date()) return res.status(403).json({ error: `Conta suspensa até ${usuario.suspensoAte.toLocaleDateString("pt-BR")}.` });
    req.usuario = payload;
    next();
  } catch (error) {
    console.error("Erro ao verificar status da conta de usuário:", error);
    res.status(500).json({ error: "Não foi possível verificar o status da conta." });
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

async function autenticarUpload(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido." });
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), jwtSecret);
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
  if (!payload.id && !payload.donoId && !payload.adminRole) return res.status(403).json({ error: "Token sem permissão para upload." });
  try {
    if (payload.id) {
      const usuario = await prisma.usuario.findUnique({ where: { id: payload.id }, select: { bloqueado: true, suspensoAte: true } });
      if (!usuario) return res.status(401).json({ error: "Conta não encontrada." });
      if (usuario.bloqueado) return res.status(403).json({ error: "Conta de usuário bloqueada. Entre em contato com o suporte." });
      if (usuario.suspensoAte && usuario.suspensoAte > new Date()) return res.status(403).json({ error: `Conta suspensa até ${usuario.suspensoAte.toLocaleDateString("pt-BR")}.` });
    }
    if (payload.donoId) {
      const dono = await prisma.dono.findUnique({ where: { id: payload.donoId }, select: { bloqueado: true, suspensoAte: true } });
      if (!dono) return res.status(401).json({ error: "Conta não encontrada." });
      if (dono.bloqueado) return res.status(403).json({ error: "Conta de parceiro bloqueada. Entre em contato com o suporte." });
      if (dono.suspensoAte && dono.suspensoAte > new Date()) return res.status(403).json({ error: `Conta de parceiro suspensa até ${dono.suspensoAte.toLocaleDateString("pt-BR")}.` });
    }
    req.uploadUser = payload;
    next();
  } catch (error) {
    console.error("Erro ao verificar status da conta para upload:", error);
    res.status(500).json({ error: "Não foi possível verificar o status da conta." });
  }
}

module.exports = { autenticarDono, autenticarUsuario, autenticarAdmin, tentarAutenticarUsuario, autenticarUpload };
