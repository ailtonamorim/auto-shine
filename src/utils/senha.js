const crypto = require("crypto");
const { erroSenha } = require("../../assets/js/politica-senha");

function hashTokenRecuperacao(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function dadosTrocaSenha(senhaHash) {
  return {
    senha: senhaHash,
    authVersion: { increment: 1 },
    resetToken: null,
    resetTokenExpiry: null,
  };
}
module.exports = { erroSenha, hashTokenRecuperacao, dadosTrocaSenha };
