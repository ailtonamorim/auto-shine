const { coordenadasValidas } = require("./validators");

const geocodingUserAgent = process.env.GEOCODING_USER_AGENT || "AutoShine Marketplace/1.0";
const serproCpfApiUrl = process.env.SERPRO_CPF_API_URL || "";
const serproCpfBearerToken = process.env.SERPRO_CPF_BEARER_TOKEN || "";
const serproCpfConsumerKey = process.env.SERPRO_CPF_CONSUMER_KEY || "";
const serproCpfConsumerSecret = process.env.SERPRO_CPF_CONSUMER_SECRET || "";
const serproCpfTokenUrl = process.env.SERPRO_CPF_TOKEN_URL || "https://gateway.apiserpro.serpro.gov.br/token";

let serproCpfTokenCache = { token: "", expiresAt: 0 };

async function obterSerproCpfBearerToken() {
  if (serproCpfBearerToken) return serproCpfBearerToken;
  if (!serproCpfConsumerKey || !serproCpfConsumerSecret) return "";
  if (serproCpfTokenCache.token && serproCpfTokenCache.expiresAt > Date.now() + 60000) {
    return serproCpfTokenCache.token;
  }
  const credenciais = Buffer.from(`${serproCpfConsumerKey}:${serproCpfConsumerSecret}`).toString("base64");
  const resposta = await fetch(serproCpfTokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${credenciais}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!resposta.ok) throw new Error(`SERPRO token respondeu ${resposta.status}`);
  const dados = await resposta.json();
  const token = dados.access_token || dados.token;
  if (!token) throw new Error("SERPRO não retornou access_token");
  serproCpfTokenCache = { token, expiresAt: Date.now() + (Number(dados.expires_in) || 3600) * 1000 };
  return token;
}

async function consultarCpfSerpro(cpf) {
  const token = await obterSerproCpfBearerToken();
  if (!serproCpfApiUrl || !token) return null;
  const url = serproCpfApiUrl.includes("{cpf}")
    ? serproCpfApiUrl.replace("{cpf}", cpf)
    : `${serproCpfApiUrl.replace(/\/$/, "")}/${cpf}`;
  const resposta = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (resposta.status === 404) return { valido: false, origem: "serpro", mensagem: "CPF não encontrado na base oficial." };
  if (!resposta.ok) throw new Error(`SERPRO respondeu ${resposta.status}`);
  const dados = await resposta.json();
  const situacao = String(dados.situacao?.descricao || dados.situacao || dados.situacaoCadastral || dados.status || "").toLowerCase();
  const valido = !situacao || situacao.includes("regular") || situacao.includes("ativo");
  return {
    valido, origem: "serpro",
    mensagem: valido ? "CPF validado na base oficial." : "CPF encontrado, mas com situação cadastral irregular.",
    dados: { situacao: dados.situacao?.descricao || dados.situacao || dados.situacaoCadastral || dados.status || null },
  };
}

async function consultarCnpjBrasilApi(cnpj) {
  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (resposta.status === 404) return { valido: false, origem: "brasilapi", mensagem: "CNPJ não encontrado na Receita Federal." };
  if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return {
    valido: true, origem: "brasilapi", mensagem: "CNPJ validado na base da Receita Federal.",
    dados: { razaoSocial: dados.razao_social || null, nomeFantasia: dados.nome_fantasia || null, situacao: dados.descricao_situacao_cadastral || dados.situacao_cadastral || null },
  };
}

async function consultarGeocodingNominatim(endereco) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", endereco);
  const resposta = await fetch(url, { headers: { "User-Agent": geocodingUserAgent, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6" } });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return dados
    .map((item) => ({ endereco: item.display_name || endereco, latitude: Number(item.lat), longitude: Number(item.lon), importancia: Number(item.importance || 0) }))
    .filter((item) => coordenadasValidas(item.latitude, item.longitude));
}

async function consultarReverseGeocodingNominatim(latitude, longitude) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  const resposta = await fetch(url, { headers: { "User-Agent": geocodingUserAgent, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6" } });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return { endereco: dados.display_name || "", latitude, longitude };
}

module.exports = { consultarCpfSerpro, consultarCnpjBrasilApi, consultarGeocodingNominatim, consultarReverseGeocodingNominatim };
