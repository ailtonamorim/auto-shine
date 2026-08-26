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

module.exports = { jwtSecret, gerarTokenUsuario, gerarTokenDono, gerarTokenAdmin };
