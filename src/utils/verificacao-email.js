const crypto = require("crypto");
const prisma = require("../config/database");
const { emailTransporter, enviarEmailVerificacao } = require("../config/email");
const { hashTokenRecuperacao } = require("./senha");

const mensagemVerificacao = "Se houver uma conta pendente com este e-mail, enviaremos as instruções de confirmação. Confira também o spam. Aguarde um minuto antes de solicitar novamente.";
const camposLimparVerificacao = { emailVerificacaoToken: null, emailVerificacaoExpiraEm: null, emailVerificacaoEnviadaEm: null };

function exigirEnvioEmail() {
  if (!emailTransporter) {
    const erro = new Error("O envio de e-mail está indisponível. Tente novamente mais tarde.");
    erro.status = 503;
    throw erro;
  }
}

function pendenciaEmail(conta) {
  if (conta.emailVerificadoEm && conta.email) return null;
  return {
    code: conta.email ? "EMAIL_NAO_VERIFICADO" : "EMAIL_NECESSARIO",
    error: conta.email ? "Confirme seu e-mail para acessar a conta. Você pode solicitar um novo link." : "Vincule e confirme um e-mail usando seu login e senha atuais.",
  };
}

async function solicitarVerificacao(conta, tipo) {
  exigirEnvioEmail();
  if (!conta.email || conta.emailVerificadoEm) return false;
  const model = prisma[tipo];
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashTokenRecuperacao(token);
  const agora = new Date();
  // Reserva atômica do envio: cooldown por conta também entre processos.
  const result = await model.updateMany({ where: {
    id: conta.id, email: conta.email, authVersion: conta.authVersion,
    emailVerificadoEm: null,
    OR: [{ emailVerificacaoEnviadaEm: null }, { emailVerificacaoEnviadaEm: { lte: new Date(agora.getTime() - 60000) } }],
  }, data: {
    emailVerificacaoToken: tokenHash,
    emailVerificacaoExpiraEm: new Date(agora.getTime() + 24 * 60 * 60 * 1000),
    emailVerificacaoEnviadaEm: agora,
  } });
  if (result.count !== 1) return false;
  try {
    await enviarEmailVerificacao({ para: conta.email, nome: conta.nome, token, tipo });
  } catch {
    await model.updateMany({ where: { id: conta.id, emailVerificacaoToken: tokenHash }, data: camposLimparVerificacao });
    throw new Error("EMAIL_VERIFICACAO_FALHOU");
  }
  return true;
}

async function responderCadastroPendente(res, conta, tipo) {
  try {
    await solicitarVerificacao(conta, tipo);
    return res.status(201).json({ verificacaoPendente: true, mensagem: "Cadastro recebido. Enviamos um link para confirmar seu e-mail. Confirme antes de entrar." });
  } catch {
    return res.status(503).json({ verificacaoPendente: true, code: "EMAIL_ENVIO_FALHOU", error: "Seu cadastro ficou pendente, mas não foi possível enviar o e-mail. Solicite um novo link de confirmação." });
  }
}

module.exports = { exigirEnvioEmail, pendenciaEmail, solicitarVerificacao, responderCadastroPendente, mensagemVerificacao, camposLimparVerificacao };
