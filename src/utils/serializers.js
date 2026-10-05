const { descriptografarSeNecessario } = require("./crypto");
const { mascararEmail } = require("./masking");

const camposSensiveis = new Set([
  "senha",
  "googleId",
  "googleIdCipher",
  "googleIdIndex",
  "resetToken",
  "resetTokenHash",
  "resetTokenExpiry",
  "cpfCipher",
  "cpfIndex",
  "cnpjCipher",
  "cnpjIndex",
  "emailCipher",
  "emailIndex",
  "telefoneCipher",
  "telefoneIndex",
  "motivoCipher",
  "detalhesCipher",
  "notasCipher",
  "nomeClienteCipher",
  "nomeClienteIndex",
  "emailClienteCipher",
  "emailClienteIndex",
]);

function mascararCpf(valor) {
  const cpf = String(descriptografarSeNecessario(valor) || "").replace(/\D/g, "");
  return cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : "";
}

function mascararCnpj(valor) {
  const cnpj = String(descriptografarSeNecessario(valor) || "").replace(/\D/g, "");
  return cnpj.length === 14 ? `**.***.***/****-${cnpj.slice(-2)}` : "";
}

function removerCamposSensiveis(objeto = {}) {
  if (!objeto || typeof objeto !== "object") return objeto;
  const resposta = { ...objeto };
  for (const campo of camposSensiveis) delete resposta[campo];
  return resposta;
}

const usuarioPublicSelect = {
  id: true,
  nome: true,
  email: true,
  cpf: true,
  telefone: true,
  createdAt: true,
};

const donoPublicSelect = {
  id: true,
  nome: true,
  login: true,
  email: true,
  cnpj: true,
  createdAt: true,
};

function serializarUsuarioPublic(usuario) {
  if (!usuario) return null;
  const resposta = removerCamposSensiveis(usuario);
  resposta.email = mascararEmail(descriptografarSeNecessario(resposta.email));
  resposta.cpf = mascararCpf(resposta.cpf);
  if (resposta.telefone !== undefined) resposta.telefone = descriptografarSeNecessario(resposta.telefone);
  return resposta;
}

function serializarDonoPublic(dono) {
  if (!dono) return null;
  const resposta = removerCamposSensiveis(dono);
  resposta.email = mascararEmail(descriptografarSeNecessario(resposta.email));
  resposta.cnpj = mascararCnpj(resposta.cnpj);
  return resposta;
}

function serializarUsuarioAdmin(usuario, { cpfCompleto = false } = {}) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: descriptografarSeNecessario(usuario.email),
    cpf: cpfCompleto ? descriptografarSeNecessario(usuario.cpf) : mascararCpf(usuario.cpf),
    telefone: descriptografarSeNecessario(usuario.telefone),
    createdAt: usuario.createdAt,
    ...(usuario._count ? { _count: usuario._count } : {}),
  };
}

function serializarDonoAdmin(dono, { cnpjCompleto = false } = {}) {
  if (!dono) return null;
  return {
    id: dono.id,
    nome: dono.nome,
    login: dono.login,
    cnpj: cnpjCompleto ? descriptografarSeNecessario(dono.cnpj) : mascararCnpj(dono.cnpj),
    ...(dono.createdAt ? { createdAt: dono.createdAt } : {}),
    ...(dono._count ? { _count: dono._count } : {}),
  };
}

function serializarLojaAdmin(loja, { cnpjDonoCompleto = false } = {}) {
  if (!loja) return null;
  const camposLoja = [
    "id", "nome", "descricao", "endereco", "latitude", "longitude", "precoMedio",
    "categoria", "fotoUrl", "capaUrl", "fotosAdicionais", "formasPagamento",
    "politicaCancelamento", "agendaDias", "agendaHorarios", "bloqueado", "createdAt", "updatedAt",
  ];
  const resposta = Object.fromEntries(camposLoja.filter((campo) => loja[campo] !== undefined).map((campo) => [campo, loja[campo]]));
  if (loja.dono) resposta.dono = serializarDonoAdmin(loja.dono, { cnpjCompleto: cnpjDonoCompleto });
  if (loja.servicos) resposta.servicos = loja.servicos;
  if (loja._count) resposta._count = loja._count;
  if (loja.avaliacoes) resposta.avaliacoes = loja.avaliacoes;
  return resposta;
}

module.exports = {
  mascararCpf,
  mascararCnpj,
  removerCamposSensiveis,
  usuarioPublicSelect,
  donoPublicSelect,
  serializarUsuarioPublic,
  serializarDonoPublic,
  serializarUsuarioAdmin,
  serializarDonoAdmin,
  serializarLojaAdmin,
};
