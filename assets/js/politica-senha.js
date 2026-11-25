(function (root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) module.exports = policy;
  else root.AutoShinePassword = policy;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function erroSenha(senha) {
    if (typeof senha !== "string" || senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
      return "Use pelo menos 8 caracteres com letras e números.";
    }
    // O bcrypt considera no máximo 72 bytes; não aceite truncamento silencioso.
    if (new TextEncoder().encode(senha).length > 72) {
      return "A senha deve ter no máximo 72 bytes (letras acentuadas e emojis ocupam mais espaço).";
    }
    return null;
  }
  return { erroSenha };
});
