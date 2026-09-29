const crypto = require("crypto");

const encryptionKey = Buffer.from(process.env.DATA_ENCRYPTION_KEY || "", "base64");
const indexKey = Buffer.from(process.env.DATA_INDEX_KEY || "", "base64");

function getEncryptionKey() {
  if (encryptionKey.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes.");
  }
  return encryptionKey;
}

function getIndexKey() {
  if (indexKey.length !== 32) {
    throw new Error("DATA_INDEX_KEY deve ser uma chave base64 independente de 32 bytes.");
  }
  if (indexKey.equals(getEncryptionKey())) {
    throw new Error("DATA_INDEX_KEY deve ser diferente de DATA_ENCRYPTION_KEY.");
  }
  return indexKey;
}

function validarChavesCriptograficas() {
  getEncryptionKey();
  getIndexKey();
}

function criptografar(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const conteudo = Buffer.concat([cipher.update(String(valor), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, conteudo].map((item) => item.toString("base64")).join(".");
}

function descriptografar(valor) {
  if (!valor) return null;

  const partes = String(valor).split(".");
  if (partes.length !== 3) throw new Error("Valor criptografado inválido.");
  const [ivBase64, tagBase64, conteudoBase64] = partes;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(conteudoBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function descriptografarSeNecessario(valor) {
  if (!valor) return valor;
  try {
    return descriptografar(valor);
  } catch {
    return valor;
  }
}

function criarIndice(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  return crypto.createHmac("sha256", getIndexKey()).update(String(valor), "utf8").digest("hex");
}

function criarHashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

module.exports = { criptografar, descriptografar, descriptografarSeNecessario, criarIndice, criarHashToken, validarChavesCriptograficas };
