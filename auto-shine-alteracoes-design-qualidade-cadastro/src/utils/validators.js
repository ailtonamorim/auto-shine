function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function normalizarLoginDono(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function normalizarCnpj(cnpj) {
  return String(cnpj || "").replace(/\D/g, "");
}

function cnpjTemDigitoValido(cnpj) {
  const digits = normalizarCnpj(cnpj);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calcular = (base, pesos) => {
    const soma = base.split("").reduce((total, digit, index) => total + Number(digit) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcular(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcular(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(digits[12]) && segundo === Number(digits[13]);
}

function normalizarCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function cpfTemDigitoValido(cpf) {
  const digits = normalizarCpf(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const primeiro = calcularDigito(digits.slice(0, 9));
  const segundo = calcularDigito(digits.slice(0, 10));
  return primeiro === Number(digits[9]) && segundo === Number(digits[10]);
}

function coordenadasValidas(latitude, longitude) {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

function dataEhPassado(dataTexto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataTexto || ""))) return true;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(`${dataTexto}T00:00:00`);
  return Number.isNaN(data.getTime()) || data < hoje;
}

function imagemLojaValida(valor) {
  const imagem = String(valor || "").trim();
  if (/^https?:\/\//i.test(imagem)) return true;
  return /^assets\/(img|uploads)\/[a-z0-9._/-]+\.(svg|png|jpe?g|webp)$/i.test(imagem) && !imagem.includes("..");
}

function fotoAvaliacaoValida(fotoUrl) {
  if (!fotoUrl) return true;
  const valor = String(fotoUrl);
  if (valor.length > 2 * 1024 * 1024) return false;
  return (
    /^https?:\/\//i.test(valor) ||
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(valor) ||
    /^assets\/uploads\/[a-z0-9._-]+\.(png|jpe?g|webp)$/i.test(valor)
  );
}

function normalizarListaTexto(valor) {
  if (Array.isArray(valor)) return valor.map((item) => String(item || "").trim()).filter(Boolean);
  return String(valor || "").split(/[\n;,]+/).map((item) => item.trim()).filter(Boolean);
}

function serializarListaTexto(valor) {
  return normalizarListaTexto(valor).join(", ");
}

function normalizarFotosAdicionais(valor) {
  return normalizarListaTexto(valor).filter((foto) => imagemLojaValida(foto)).slice(0, 6);
}

function serializarFotosAdicionais(valor) {
  return normalizarFotosAdicionais(valor).join("\n");
}

function redirecionamentoSeguro(valor, fallback = "index.html") {
  const texto = String(valor || "").trim();
  if (!texto || texto.startsWith("http") || texto.startsWith("//") || texto.includes("\\") || texto.includes("..")) {
    return fallback;
  }
  return texto.startsWith("/") ? texto : `/${texto}`;
}

function criarErroHttp(message, status = 400, extras = {}) {
  const erro = new Error(message);
  erro.status = status;
  Object.assign(erro, extras);
  return erro;
}

module.exports = {
  normalizarEmail, emailValido, normalizarTelefone, normalizarLoginDono,
  normalizarCnpj, cnpjTemDigitoValido, normalizarCpf, cpfTemDigitoValido,
  coordenadasValidas, dataEhPassado, imagemLojaValida, fotoAvaliacaoValida,
  normalizarListaTexto, serializarListaTexto, normalizarFotosAdicionais,
  serializarFotosAdicionais, redirecionamentoSeguro, criarErroHttp,
};
