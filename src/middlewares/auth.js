const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const { jwtSecret } = require("../utils/tokens");

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
    if (!(tipo === "dono" ? payload.donoId : payload.id)) {
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
  if (!payload.adminRole) return res.status(403).json({ error: "Acesso restrito a administradores." });
  req.admin = payload;
  return next();
}

async function tentarAutenticarUsuario(req, res, next) {
  const payload = lerToken(req);
  if (payload?.id) {
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
  if (!payload.id && !payload.donoId && !payload.adminRole) {
    return res.status(403).json({ error: "Token sem permissão para upload." });
  }
  try {
    const atual = payload.adminRole ? payload : await contaAtual(payload, payload.donoId ? "dono" : "usuario");
    if (!atual) return sessaoInvalida(res);
    req.uploadUser = atual;
  } catch (err) {
    return falhaVerificacao(res, err);
  }
  return next();
}
module.exports = { autenticarDono, autenticarUsuario, autenticarAdmin, tentarAutenticarUsuario, autenticarUpload };
