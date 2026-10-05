const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializarUsuarioPublic,
  serializarDonoPublic,
  usuarioPublicSelect,
  donoPublicSelect,
} = require('../src/utils/serializers');
const { mascararEmail, mascararNomeCliente } = require('../src/utils/masking');
const { sanitizarParaLog, logger } = require('../src/utils/logger');

test('serializarUsuarioPublic remove campos sensíveis e mascara CPF', () => {
  const usuario = {
    id: 7,
    nome: 'Ana',
    email: 'ana@email.com',
    cpf: '12345678909',
    telefone: '11999998888',
    senha: 'secret',
    googleId: 'google-123',
    resetToken: 'token-abc',
    resetTokenHash: 'hash-abc',
    googleIdIndex: 'indexed',
    cpfCipher: 'enc-cpf',
    cpfIndex: 'cpf-index',
    emailCipher: 'enc-email',
    emailIndex: 'email-index',
  };

  const serializado = serializarUsuarioPublic(usuario);

  assert.deepEqual(serializado, {
    id: 7,
    nome: 'Ana',
    email: 'ana@email.com',
    cpf: '***.***.***-09',
    telefone: '11999998888',
  });
  assert.ok(!('senha' in serializado));
  assert.ok(!('googleId' in serializado));
  assert.ok(!('resetToken' in serializado));
});

test('serializarDonoPublic remove campos sensíveis e mascara CNPJ', () => {
  const dono = {
    id: 3,
    nome: 'Loja Verde',
    login: 'lojaverde',
    cnpj: '12345678000199',
    email: 'contato@lojaverde.com',
    senha: 'secret',
    googleId: 'google-321',
    resetToken: 'token-xyz',
    resetTokenHash: 'hash-xyz',
    googleIdIndex: 'gindex',
    cnpjCipher: 'enc-cnpj',
    cnpjIndex: 'cnpj-index',
  };

  const serializado = serializarDonoPublic(dono);

  assert.deepEqual(serializado, {
    id: 3,
    nome: 'Loja Verde',
    login: 'lojaverde',
    cnpj: '**.***.***/****-99',
    email: 'contato@lojaverde.com',
  });
  assert.ok(!('senha' in serializado));
  assert.ok(!('googleId' in serializado));
  assert.ok(!('resetToken' in serializado));
});

test('selects públicos não incluem campos sensíveis', () => {
  assert.ok(!('senha' in usuarioPublicSelect));
  assert.ok(!('googleId' in usuarioPublicSelect));
  assert.ok(!('resetToken' in usuarioPublicSelect));
  assert.ok(!('cpfCipher' in usuarioPublicSelect));
  assert.ok(!('cnpjCipher' in donoPublicSelect));
  assert.ok(!('googleId' in donoPublicSelect));
  assert.ok(!('resetTokenHash' in donoPublicSelect));
});

test('mascararEmail e mascararNomeCliente protegem dados pessoais', () => {
  const email = mascararEmail('joao.silva@gmail.com');
  const nome = mascararNomeCliente('João Silva', 42);

  assert.ok(email.includes('@'));
  assert.ok(!email.includes('joao'));
  assert.ok(nome.startsWith('Cliente #'));
  assert.ok(nome !== 'João Silva');
});

test('sanitizarParaLog remove senha, token, authorization, CPF, CNPJ, email e telefone', () => {
  const payload = {
    password: '123456',
    token: 'abc123',
    Authorization: 'Bearer abc123',
    cpf: '12345678909',
    cnpj: '12345678000199',
    email: 'joao@email.com',
    telefone: '11999998888',
    nested: { senha: 'segredo', accessToken: 'tok', email: 'a@b.com' },
  };

  const saida = sanitizarParaLog(payload);

  assert.equal(saida.password, '[REDACTED]');
  assert.equal(saida.token, '[REDACTED]');
  assert.equal(saida.Authorization, '[REDACTED]');
  assert.equal(saida.cpf, '[REDACTED]');
  assert.equal(saida.cnpj, '[REDACTED]');
  assert.equal(saida.email, '[REDACTED]');
  assert.equal(saida.telefone, '[REDACTED]');
  assert.equal(saida.nested.senha, '[REDACTED]');
  assert.equal(saida.nested.accessToken, '[REDACTED]');
  assert.equal(saida.nested.email, '[REDACTED]');
  assert.equal(typeof logger.info, 'function');
});
