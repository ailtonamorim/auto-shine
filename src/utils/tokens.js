const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = "7d";
const authCookieNames = Object.freeze({
  usuario: "autoshine_user",
  dono: "autoshine_owner",
  admin: "autoshine_admin",
});

const authCookieOptions = Object.freeze({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

function definirCookieAuth(res, tipo, token) {
  res.cookie(authCookieNames[tipo], token, authCookieOptions);
}

function limparCookieAuth(res, tipo) {
  const { maxAge, ...clearOptions } = authCookieOptions;
  res.clearCookie(authCookieNames[tipo], clearOptions);
}

function gerarTokenUsuario(usuario) {
  return jwt.sign({ id: usuario.id }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenDono(dono) {
  return jwt.sign({ donoId: dono.id }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function gerarTokenAdmin() {
  return jwt.sign({ adminRole: true }, jwtSecret, { expiresIn: jwtExpiresIn });
}

module.exports = {
  jwtSecret,
  authCookieNames,
  definirCookieAuth,
  limparCookieAuth,
  gerarTokenUsuario,
  gerarTokenDono,
  gerarTokenAdmin,
};
