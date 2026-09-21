const express = require("express");
const { normalizarCpf, normalizarCnpj, cpfTemDigitoValido, cnpjTemDigitoValido, coordenadasValidas } = require("../utils/validators");
const { consultarCpfSerpro, consultarCnpjBrasilApi, consultarGeocodingNominatim, consultarReverseGeocodingNominatim } = require("../utils/geocode");
const { prepararImagemUpload, moderarImagemUpload, salvarImagemUpload } = require("../utils/imagem");
const { autenticarUpload } = require("../middlewares/auth");
const { limitarValidacoes, limitarUploads } = require("../middlewares/security");

const router = express.Router();

router.get("/validacoes/cpf/:cpf", limitarValidacoes, async (req, res) => {
  const cpf = normalizarCpf(req.params.cpf);
  if (cpf.length !== 11 || !cpfTemDigitoValido(cpf)) return res.status(400).json({ valido: false, origem: "local", mensagem: "CPF invalido." });
  try {
    const validacaoOficial = await consultarCpfSerpro(cpf);
    if (validacaoOficial) return res.json(validacaoOficial);
  } catch (err) {
    console.warn(`Aviso: não foi possível validar CPF no SERPRO: ${err.message}`);
  }
  res.json({ valido: true, origem: "local", mensagem: "CPF com dígitos válidos. Configure a API oficial SERPRO para consulta cadastral." });
});

router.get("/validacoes/cnpj/:cnpj", limitarValidacoes, async (req, res) => {
  const cnpj = normalizarCnpj(req.params.cnpj);
  if (!cnpjTemDigitoValido(cnpj)) return res.status(400).json({ valido: false, origem: "local", mensagem: "CNPJ inválido." });
  try {
    return res.json(await consultarCnpjBrasilApi(cnpj));
  } catch (err) {
    console.warn(`Aviso: não foi possível validar CNPJ na BrasilAPI: ${err.message}`);
  }
  return res.json({ valido: true, origem: "local", mensagem: "CNPJ com dígitos válidos. Consulta oficial indisponível agora." });
});

router.get("/geocode", limitarValidacoes, async (req, res) => {
  try {
    const endereco = String(req.query.endereco || "").trim();
    if (endereco.length < 6) return res.status(400).json({ error: "Informe um endereço mais completo." });
    const resultados = await consultarGeocodingNominatim(endereco);
    if (!resultados.length) return res.status(404).json({ error: "Endereço não encontrado." });
    res.json({ resultados, melhor: resultados[0], origem: "nominatim" });
  } catch {
    res.status(503).json({ error: "Não foi possível consultar o serviço de geocoding agora." });
  }
});

router.get("/geocode/reverso", limitarValidacoes, async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    if (!coordenadasValidas(latitude, longitude)) return res.status(400).json({ error: "Coordenadas invalidas." });
    const resultado = await consultarReverseGeocodingNominatim(latitude, longitude);
    res.json({ resultado, origem: "nominatim" });
  } catch {
    res.status(503).json({ error: "Não foi possível consultar o endereço agora." });
  }
});

router.post("/moderacao/imagem", limitarUploads, autenticarUpload, async (req, res) => {
  try {
    const { imagem, nomeArquivo, escopo } = req.body || {};
    const upload = prepararImagemUpload({ imagem, nomeArquivo, escopo });
    const moderacao = await moderarImagemUpload(upload);
    res.status(moderacao.bloqueada ? 422 : 200).json(moderacao);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao moderar imagem.", moderacao: err.moderacao });
  }
});

router.post("/uploads/imagem", limitarUploads, autenticarUpload, async (req, res) => {
  try {
    const { imagem, nomeArquivo, escopo } = req.body || {};
    const { url, moderacao } = await salvarImagemUpload({ imagem, nomeArquivo, escopo });
    res.status(201).json({ url, moderacao });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Erro ao salvar imagem.", moderacao: err.moderacao });
  }
});

module.exports = router;
