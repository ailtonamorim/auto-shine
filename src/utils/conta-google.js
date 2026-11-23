const prisma = require("../config/database");
const { normalizarEmail, emailValido } = require("./validators");
const { camposLimparVerificacao } = require("./verificacao-email");

async function obterContaGoogle(user, tipo) {
  const email = normalizarEmail(user.email);
  if (!user.id || user.emailVerified !== true || !emailValido(email)) throw new Error("GOOGLE_EMAIL_NAO_VERIFICADO");
  return prisma.$transaction(async tx => {
    const model = tx[tipo];
    let conta = await model.findUnique({ where: { googleId: user.id } });
    if (conta?.email && conta.email !== email) throw new Error("GOOGLE_EMAIL_DIFERENTE");
    if (!conta) conta = await model.findUnique({ where: { email } });
    if (conta?.googleId && conta.googleId !== user.id) throw new Error("GOOGLE_CONTA_DIFERENTE");
    if (conta) {
      if (conta.emailVerificadoEm && conta.googleId === user.id) return conta;
      // Não preserva uma senha cadastrada por terceiro antes da prova de posse.
      const result = await model.updateMany({ where: { id: conta.id, email: conta.email, googleId: conta.googleId, authVersion: conta.authVersion }, data: {
        email, googleId: user.id, emailVerificadoEm: new Date(), ...camposLimparVerificacao,
        ...(!conta.emailVerificadoEm ? { senha: null } : {}),
        resetToken: null, resetTokenExpiry: null, authVersion: { increment: 1 },
      } });
      if (result.count !== 1) throw new Error("GOOGLE_CONTA_ATUALIZADA");
      return model.findUnique({ where: { id: conta.id } });
    }
    const data = { nome: user.name || email.split("@")[0], email, googleId: user.id, emailVerificadoEm: new Date() };
    if (tipo === "dono") {
      const base = email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "parceiro";
      let login = base, i = 1;
      while (await model.findUnique({ where: { login } })) login = `${base}${i++}`;
      data.login = login;
    }
    return model.create({ data });
  });
}
module.exports = { obterContaGoogle };
