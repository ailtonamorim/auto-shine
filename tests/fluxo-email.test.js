const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const helpers = source.slice(source.indexOf('function emailCadastroValido('), source.indexOf('// ── Acesso do dono'));
function setup() {
  const elements = {}, state = { redirects: [], notices: [], stored: {}, cleared: [] };
  function element(id) {
    const classes = new Set(['hidden']);
    return elements[id] = { value: '', textContent: '', className: '', attributes: {}, listeners: {},
      message: { textContent: '' },
      classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(key, listener) { this.listeners[key] = listener; },
      querySelector() { return this.message; }
    };
  }
  const input = element('email'), message = element('message'), form = element('form');
  input.form = form;
  element('login-pending'); element('dono-login-pending');
  const context = {
    document: { getElementById: id => elements[id] },
    sessionStorage: { setItem: (key, value) => { state.stored[key] = value; } },
    redirectWithNotice: (...args) => state.redirects.push(args),
    notify: (...args) => state.notices.push(args),
    clearCurrentUser: () => state.cleared.push('usuario'),
    clearDonoToken: () => state.cleared.push('dono'),
    fetch: () => { throw Error('Digitar ou entrar não deve enviar confirmação'); }
  };
  vm.createContext(context); vm.runInContext(helpers, context);
  return { context, elements, state, input, message, form };
}
test('formato: aceita endereços usuais e recusa incompletos, espaços e limites excessivos', () => {
  const { context: c } = setup();
  for (const email of ['pessoa@example.com', ' Nome.Sobrenome+tag@sub.example.com.br ']) assert.equal(c.emailCadastroValido(email), true, email);
  for (const email of ['', 'nome', 'a@b', '@example.com', 'a@@b.com', 'a b@example.com', 'a@example.com\nBcc:x@y.com', 'a'.repeat(65)+'@example.com', 'a@'+'b'.repeat(250)+'.com']) assert.equal(c.emailCadastroValido(email), false, email);
});
test('campo: mostra inválido, válido e obrigatório sem enviar e-mail nem navegar', () => {
  const { context: c, input, message, state, form } = setup();
  const validate = c.configurarValidacaoEmail('email', 'message');
  input.listeners.blur(); assert.equal(message.textContent, '');
  input.value = 'incompleto'; input.listeners.input();
  assert.equal(input.attributes['aria-invalid'], 'true'); assert.match(message.className, /is-invalid/);
  input.value = 'pessoa@example.com'; input.listeners.input();
  assert.equal(input.attributes['aria-invalid'], 'false'); assert.match(message.className, /is-valid/);
  assert.match(message.textContent, /Formato/); assert.match(message.textContent, /após criar a conta/);
  input.value = ''; assert.equal(validate(true), false); assert.match(message.textContent, /Informe/);
  form.listeners.reset(); assert.equal(message.textContent, ''); assert.equal(input.attributes['aria-invalid'], 'false');
  assert.equal(state.redirects.length, 0); assert.deepEqual(state.stored, {});
});
for (const tipo of ['usuario', 'dono']) {
  test(`${tipo}: cadastro abre instruções com o endereço preenchido`, () => {
    const { context: c, state } = setup();
    c.abrirVerificacaoEmail(tipo, 'pessoa@example.com');
    assert.equal(state.redirects[0][0], `verificar-email.html?tipo=${tipo}`);
    assert.deepEqual(state.cleared, [tipo]);
    assert.deepEqual(state.stored, { [`autoshine:verificar:${tipo}`]: 'pessoa@example.com' });
  });
  test(`${tipo}: login pendente informa no próprio formulário, sem redirecionar`, () => {
    const { context: c, elements, state } = setup();
    const box = elements[tipo === 'dono' ? 'dono-login-pending' : 'login-pending'];
    assert.equal(c.tratarPendenciaEmail({code:'EMAIL_NAO_VERIFICADO'}, tipo, 'pessoa@example.com'), true);
    assert.equal(box.classList.contains('hidden'), false); assert.match(box.message.textContent, /senha/);
    assert.equal(state.redirects.length, 0); assert.deepEqual(state.cleared, []);
    assert.equal(c.tratarPendenciaEmail({error:'Credenciais inválidas'}, tipo), false);
    assert.equal(box.classList.contains('hidden'), true);
  });
}
test('conta antiga sem endereço recebe orientação para concluir cadastro', () => {
  const { context: c, elements, state } = setup();
  assert.equal(c.tratarPendenciaEmail({code:'EMAIL_NECESSARIO'}, 'dono'), true);
  assert.match(elements['dono-login-pending'].message.textContent, /uma única vez/);
  assert.equal(state.redirects.length, 0);
});
