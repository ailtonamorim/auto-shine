/** Funções de mascaração de dados sensíveis para respostas públicas. */

const crypto = require("crypto");

/**
 * Mascara nome de cliente para fins de exibição pública
 * Exemplo: "João Silva" → "Cliente #a3c9f1"
 * @param {string} nome - Nome completo do cliente
 * @param {number} usuarioId - ID do usuário (para geração consistente)
 * @returns {string} Nome mascarado
 */
function mascararNomeCliente(nome, usuarioId) {
  if (!nome || !usuarioId) return "Cliente";
  
  const shortHash = crypto.createHash("sha256").update(String(usuarioId)).digest("hex").slice(0, 6);
  
  return `Cliente #${shortHash}`;
}

/**
 * Mascara endereço removendo número e complemento
 * Exemplo: "Rua A, 123, Apt 456, São Paulo" → "Rua A, São Paulo"
 * @param {string} endereco - Endereço completo
 * @returns {string} Endereço mascarado
 */
function mascararEndereco(endereco) {
  if (!endereco) return "Endereço";
  
  try {
    const partes = endereco.split(",").map((parte) => parte.trim()).filter(Boolean);
    const rua = partes[0] || "";
    const localidade = partes.slice(1).filter((parte) =>
      !/^(?:n(?:[ºo°])?\s*)?\d+[\w/-]*$/i.test(parte) && !/^(apto?\.?|apartamento|bloco|casa|sala|suite|conjunto|cj\.?|fundos)\b/i.test(parte)
    );
    return [rua, localidade[localidade.length - 1]].filter(Boolean).join(", ") || "Endereço";
  } catch {
    return "Endereço";
  }
}

/**
 * Arredonda coordenadas GPS para proteção de privacidade
 * Reduz precisão para ~1km de raio
 * Exemplo: -23.5505, -46.6333 → -23.55, -46.63
 * @param {number} latitude - Latitude original
 * @param {number} longitude - Longitude original
 * @returns {Object} { latitude, longitude } arredondadas
 */
function arredondarGPS(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { latitude: null, longitude: null };
  }
  
  // Arredonda para 2 casas decimais (~1.1km de precisão)
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100,
  };
}

/**
 * Sanitiza texto livre removendo dados pessoais
 * Remove: emails, telefones, CPF, CNPJ, URLs
 * @param {string} texto - Texto com potencial PII
 * @returns {string} Texto sanitizado
 */
function sanitizarTexto(texto) {
  if (!texto || typeof texto !== "string") return "";
  
  let sanitizado = texto;
  
  // Remove emails
  sanitizado = sanitizado.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, "[email removido]");
  
  // Remove telefones (formatos comuns)
  sanitizado = sanitizado.replace(/(\+?55\s?)?(\(?\d{2}\)?)\s?\d{4,5}-?\d{4}/g, "[telefone removido]");
  sanitizado = sanitizado.replace(/\d{3}\.\d{3}\.\d{3}-?\d{2}/g, "[CPF removido]");
  
  // Remove CNPJ
  sanitizado = sanitizado.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "[CNPJ removido]");
  
  // Remove URLs
  sanitizado = sanitizado.replace(/https?:\/\/[^\s]+/g, "[URL removida]");
  sanitizado = sanitizado.replace(/www\.[^\s]+/g, "[URL removida]");
  
  return sanitizado;
}

/**
 * Mascara comentário de avaliação removendo PII
 * @param {string} comentario - Comentário original
 * @returns {string} Comentário sanitizado e seguro
 */
function mascararComentario(comentario) {
  return sanitizarTexto(comentario);
}

/**
 * Mascara detalhes de denúncia
 * @param {string} detalhes - Detalhes originais
 * @returns {string} Detalhes sanitizados
 */
function mascararDetalhes(detalhes) {
  return sanitizarTexto(detalhes);
}

/**
 * Mascara foto de perfil para URL genérica
 * @param {string} fotoUrl - URL original
 * @param {number} usuarioId - ID do usuário
 * @returns {string} URL genérica ou avatar placeholder
 */
function mascararFoto(fotoUrl, usuarioId) {
  if (!usuarioId) return "/assets/img/avatar-default.png";
  
  // Usa um serviço de avatar genérico baseado em hash
  const hash = String(usuarioId).padStart(8, '0');
  return `/assets/img/avatar-${hash.slice(0, 4)}.png`;
}

/**
 * Remove IDs internos de objeto para API pública
 * @param {Object} objeto - Objeto com campos sensíveis
 * @param {Array<string>} camposRemover - Campos a remover (default: IDs de relacionamento)
 * @returns {Object} Objeto sem campos sensíveis
 */
function removerIdsInternos(objeto, camposRemover = ["donoId", "usuarioId", "avaliacaoId", "agendamentoId"]) {
  if (!objeto || typeof objeto !== "object") return objeto;
  
  const copia = { ...objeto };
  camposRemover.forEach(campo => delete copia[campo]);
  
  return copia;
}

function removerCamposCriptografados(objeto) {
  if (!objeto || typeof objeto !== "object") return objeto;
  const copia = { ...objeto };
  ["notasCipher", "nomeClienteCipher", "emailClienteCipher", "motivoCipher", "detalhesCipher"].forEach((campo) => delete copia[campo]);
  return copia;
}

/**
 * Aplica mascaração completa a listagem de lojas públicas
 * @param {Array} lojas - Array de lojas
 * @returns {Array} Lojas com endereço e GPS mascarados
 */
function mascararListaLojas(lojas) {
  if (!Array.isArray(lojas)) return [];
  
  return lojas.map(loja => ({
    ...removerIdsInternos(loja),
    endereco: mascararEndereco(loja.endereco),
    latitude: arredondarGPS(loja.latitude, loja.longitude).latitude,
    longitude: arredondarGPS(loja.latitude, loja.longitude).longitude,
  }));
}

/**
 * Aplica mascaração completa a listagem de avaliações públicas
 * @param {Array} avaliacoes - Array de avaliações
 * @returns {Array} Avaliações com nomes e comentários mascarados
 */
function mascararListaAvaliacoes(avaliacoes) {
  if (!Array.isArray(avaliacoes)) return [];
  
  return avaliacoes.map(avaliacao => ({
    ...removerIdsInternos(avaliacao),
    nomeCliente: mascararNomeCliente(avaliacao.nomeCliente, avaliacao.usuarioId),
    comentario: mascararComentario(avaliacao.comentario),
  }));
}

module.exports = {
  mascararNomeCliente,
  mascararEndereco,
  arredondarGPS,
  sanitizarTexto,
  mascararComentario,
  mascararDetalhes,
  mascararFoto,
  removerIdsInternos,
  removerCamposCriptografados,
  mascararListaLojas,
  mascararListaAvaliacoes,
};
