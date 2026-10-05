const crypto = require("crypto");

function normalizarChaveBase64(chave, nomeVariavel) {
  const buffer = Buffer.from(chave || "", "base64");
  if (buffer.length !== 32) {
    throw new Error(`${nomeVariavel} deve ser uma chave base64 de 32 bytes.`);
  }
  return buffer;
}

function normalizarChaveId(chaveId, fallback) {
  return String(chaveId || fallback || "primary").replace(/\./g, "-");
}

function getConfiguredEncryptionKeys() {
  const currentKey = normalizarChaveBase64(process.env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY");
  const currentId = normalizarChaveId(process.env.DATA_ENCRYPTION_KEY_ID, "primary");
  const keys = [{ id: currentId, key: currentKey }];

  if (process.env.DATA_ENCRYPTION_KEY_PREVIOUS) {
    const previousKey = normalizarChaveBase64(process.env.DATA_ENCRYPTION_KEY_PREVIOUS, "DATA_ENCRYPTION_KEY_PREVIOUS");
    if (previousKey.equals(currentKey)) {
      throw new Error("DATA_ENCRYPTION_KEY_PREVIOUS deve ser diferente de DATA_ENCRYPTION_KEY.");
    }
    keys.push({
      id: normalizarChaveId(process.env.DATA_ENCRYPTION_KEY_PREVIOUS_ID, "previous"),
      key: previousKey,
    });
  }

  return keys;
}

function getConfiguredIndexKeys() {
  const currentKey = normalizarChaveBase64(process.env.DATA_INDEX_KEY, "DATA_INDEX_KEY");
  const keys = [{ id: "primary", key: currentKey }];

  if (process.env.DATA_INDEX_KEY_PREVIOUS) {
    const previousKey = normalizarChaveBase64(process.env.DATA_INDEX_KEY_PREVIOUS, "DATA_INDEX_KEY_PREVIOUS");
    if (previousKey.equals(currentKey)) {
      throw new Error("DATA_INDEX_KEY_PREVIOUS deve ser diferente de DATA_INDEX_KEY.");
    }
    keys.push({ id: "previous", key: previousKey });
  }

  return keys;
}

function getEncryptionKey() {
  return getConfiguredEncryptionKeys()[0].key;
}

function getIndexKey() {
  return getConfiguredIndexKeys()[0].key;
}

function validarChavesCriptograficas() {
  getConfiguredEncryptionKeys();
  getConfiguredIndexKeys();
}

function parseCipherPayload(valor) {
  if (!valor) return null;

  const texto = String(valor);
  const partes = texto.split(".");

  if (texto.startsWith("v2.")) {
    if (partes.length < 5) throw new Error("Valor criptografado versionado inválido.");
    const [, keyId, ivBase64, tagBase64, ...conteudoRestante] = partes;
    return {
      keyId,
      ivBase64,
      tagBase64,
      conteudoBase64: conteudoRestante.join("."),
    };
  }

  if (partes.length !== 3) {
    throw new Error("Valor criptografado inválido.");
  }

  const [ivBase64, tagBase64, conteudoBase64] = partes;
  return { keyId: null, ivBase64, tagBase64, conteudoBase64 };
}

function descriptografarComChave(valor, key) {
  const payload = parseCipherPayload(valor);
  if (!payload) return null;

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.conteudoBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function criptografar(valor, options = {}) {
  if (valor === null || valor === undefined || valor === "") return null;

  const key = options.key ? Buffer.isBuffer(options.key) ? options.key : Buffer.from(String(options.key), "base64") : getEncryptionKey();
  if (key.length !== 32) {
    throw new Error("Chave de criptografia inválida. Deve possuir 32 bytes.");
  }

  const keyId = normalizarChaveId(options.keyId ?? process.env.DATA_ENCRYPTION_KEY_ID ?? "primary");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const conteudo = Buffer.concat([cipher.update(String(valor), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = [iv.toString("base64"), tag.toString("base64"), conteudo.toString("base64")].join(".");
  return `v2.${keyId}.${payload}`;
}

function descriptografar(valor) {
  if (!valor) return null;

  const payload = parseCipherPayload(valor);
  if (!payload) return null;

  const candidates = [];
  if (payload.keyId) {
    const matchedKey = getConfiguredEncryptionKeys().find((entry) => entry.id === payload.keyId);
    if (matchedKey) candidates.push(matchedKey.key);
  }

  if (candidates.length === 0) {
    candidates.push(...getConfiguredEncryptionKeys().map((entry) => entry.key));
  }

  for (const key of candidates) {
    try {
      return descriptografarComChave(valor, key);
    } catch {
      // tenta a próxima chave configurada
    }
  }

  throw new Error("Valor criptografado inválido ou chave incompatível.");
}

function descriptografarSeNecessario(valor) {
  if (!valor) return valor;
  try {
    return descriptografar(valor);
  } catch {
    return valor;
  }
}

function criarIndice(valor, options = {}) {
  if (valor === null || valor === undefined || valor === "") return null;

  const key = options.key ? Buffer.isBuffer(options.key) ? options.key : Buffer.from(String(options.key), "base64") : getIndexKey();
  if (key.length !== 32) {
    throw new Error("Chave de índice inválida. Deve possuir 32 bytes.");
  }

  return crypto.createHmac("sha256", key).update(String(valor), "utf8").digest("hex");
}

function criarHashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

module.exports = {
  criptografar,
  descriptografar,
  descriptografarSeNecessario,
  criarIndice,
  criarHashToken,
  validarChavesCriptograficas,
  getConfiguredEncryptionKeys,
  getConfiguredIndexKeys,
  getEncryptionKey,
  getIndexKey,
};
