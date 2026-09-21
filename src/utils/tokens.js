const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = "7d";

function gerarTokenUsuario(usuario) {
  return jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenDono(dono) {
  return jwt.sign({ donoId: dono.id, nome: dono.nome, login: dono.login }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenAdmin() {
  return jwt.sign({ adminRole: true }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function normalizarTokenEntrega(token) {
  return String(token || "").replace(/\D/g, "").slice(0, 6);
}

function formatarTokenEntrega(token) {
  const limpo = normalizarTokenEntrega(token);
  return limpo.length === 6 ? `${limpo.slice(0, 3)}-${limpo.slice(3)}` : limpo;
}

function assinaturaAgendamentoEntrega(agendamento) {
  return [
    agendamento.id,
    agendamento.usuarioId || "",
    agendamento.lojaId,
    agendamento.servicoId,
    agendamento.createdAt instanceof Date ? agendamento.createdAt.toISOString() : agendamento.createdAt,
  ].join(":");
}

function gerarTokenEntrega(agendamento) {
  const digest = crypto
    .createHmac("sha256", jwtSecret)
    .update(assinaturaAgendamentoEntrega(agendamento))
    .digest();
  const numero = digest.readUInt32BE(0) % 1000000;
  return String(numero).padStart(6, "0");
}

function validarTokenEntrega(tokenInformado, agendamento) {
  const recebido = normalizarTokenEntrega(tokenInformado);
  if (recebido.length !== 6) return false;
  const esperado = gerarTokenEntrega(agendamento);
  return crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

function tokenEntregaDisponivel(agendamento) {
  return Boolean(agendamento) && !["finalizado", "cancelado"].includes(agendamento.status);
}

function anexarTokenEntrega(agendamento) {
  if (!agendamento) return agendamento;
  const disponivel = tokenEntregaDisponivel(agendamento);
  return {
    ...agendamento,
    entregaToken: disponivel ? formatarTokenEntrega(gerarTokenEntrega(agendamento)) : null,
    entregaTokenStatus: agendamento.entregaTokenValidadoEm ? "validado" : disponivel ? "ativo" : "indisponivel",
  };
}

module.exports = {
  jwtSecret,
  gerarTokenUsuario,
  gerarTokenDono,
  gerarTokenAdmin,
  normalizarTokenEntrega,
  formatarTokenEntrega,
  gerarTokenEntrega,
  validarTokenEntrega,
  tokenEntregaDisponivel,
  anexarTokenEntrega,
};
