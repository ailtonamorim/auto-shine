const test = require('node:test');
const assert = require('node:assert/strict');

function carregarCrypto() {
  delete require.cache[require.resolve('../src/utils/crypto')];
  return require('../src/utils/crypto');
}

function defineKeys() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012', 'utf8').toString('base64');
  process.env.DATA_ENCRYPTION_KEY_PREVIOUS = Buffer.from('abcdefghijklmnopqrstuvwxzy123456', 'utf8').toString('base64');
  process.env.DATA_ENCRYPTION_KEY_ID = 'current';
  process.env.DATA_ENCRYPTION_KEY_PREVIOUS_ID = 'previous';
  process.env.DATA_INDEX_KEY = Buffer.from('09876543210987654321098765432109', 'utf8').toString('base64');
  process.env.DATA_INDEX_KEY_PREVIOUS = Buffer.from('qrstuvwxyzabcdefghijklmnop123456', 'utf8').toString('base64');
}

test('suporta rotação de chave com payload versionado e fallback de chave anterior', () => {
  defineKeys();
  const { criptografar, descriptografar } = carregarCrypto();

  const atual = criptografar('valor-sensivel', { keyId: 'current' });
  assert.match(atual, /^v2\./);
  assert.equal(descriptografar(atual), 'valor-sensivel');

  const legado = criptografar('valor-legacy', {
    key: Buffer.from('abcdefghijklmnopqrstuvwxzy123456', 'utf8'),
    keyId: 'previous',
  });

  assert.equal(descriptografar(legado), 'valor-legacy');
});
