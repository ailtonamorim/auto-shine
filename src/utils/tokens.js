const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = "7d";

function gerarTokenUsuario(usuario) {
  return jwt.sign({ role: "client", id: usuario.id, nome: usuario.nome, email: usuario.email, authVersion: usuario.authVersion ?? 0 }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenDono(dono) {
  return jwt.sign({ role: "partner", donoId: dono.id, nome: dono.nome, login: dono.login, authVersion: dono.authVersion ?? 0 }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenAdmin() {
  return jwt.sign({ role: "admin", adminRole: true }, jwtSecret, { expiresIn: jwtExpiresIn });
}

module.exports = { jwtSecret, gerarTokenUsuario, gerarTokenDono, gerarTokenAdmin };
