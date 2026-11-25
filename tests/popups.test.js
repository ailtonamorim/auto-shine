const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment } = require('./helpers/dom-feedback');

test('erro com a palavra concluído continua sendo erro; salvas é sucesso explícito', () => {
  const e = environment();
  assert.match(e.run('notify("Login concluído sem token", "error")').className, /app-toast-error/);
  assert.match(e.run('notify("Alterações salvas. A outra parte verá um aviso.", "success")').className, /app-toast-success/);
  assert.match(e.run('notify("sucesso", "tipo-inexistente")').className, /app-toast-info/);
});
test('conteúdo de mensagem é escapado e não cria HTML executável', () => {
  const e = environment();
  const toast = e.run('notify("<img src=x onerror=alert(1)>", "error")');
  assert.equal(toast.querySelector('img'), null);
  assert.match(toast.innerHTML, /&lt;img/);
});
test('mensagem repetida é única e a pilha tem no máximo três avisos', () => {
  const e = environment();
  const a = e.run('notify("a", "error")');
  assert.equal(e.run('notify("a", "error")'), a);
  e.run('notify("b", "success"); notify("c", "warning"); notify("d", "info")');
  assert.equal(e.document.querySelector('[data-toast-root]').children.length, 3);
  assert.equal(a.isConnected, true);
});
test('erro e duration zero permanecem; sucesso fecha após cinco segundos', () => {
  const e = environment();
  const error = e.run('notify("erro", "error")'), fixed = e.run('notify("fixo", "info", {duration: 0})'), success = e.run('notify("ok", "success")');
  e.tick(5001);
  assert.equal(success.isConnected, false);
  assert.equal(error.isConnected, true);
  assert.equal(fixed.isConnected, true);
  error.querySelector('button').emit('click'); assert.equal(error.isConnected, false);
});
test('pausa por ponteiro e foco preserva o tempo restante', () => {
  const e = environment(); const toast = e.run('notify("leitura", "success")');
  e.tick(2000); toast.emit('pointerenter'); e.tick(20000);
  toast.emit('focusin'); toast.emit('pointerleave'); e.tick(20000);
  assert.equal(toast.isConnected, true);
  toast.emit('focusout', { relatedTarget: e.document.body }); e.tick(2999);
  assert.equal(toast.isConnected, true); e.tick(2); assert.equal(toast.isConnected, false);
});
test('uma confirmação não aceita a segunda solicitação concorrente', async () => {
  const e = environment(); const first = e.run('confirmAction("Primeira")');
  const second = e.run('confirmAction("Segunda")'); assert.equal(await second, false);
  const dialog = e.document.querySelector('[data-confirm-dialog]');
  assert.equal(dialog.querySelector('[data-confirm-message]').textContent, 'Primeira');
  dialog.emit('click', { target: dialog.querySelector('[data-confirm-ok]') });
  assert.equal(await first, true);
  assert.equal(dialog.listeners.get('click').size, 0);
});
test('exclusão inicia em Cancelar e Escape restaura foco e fundo', async () => {
  const e = environment(); const trigger = e.element(); trigger.focus();
  const preexisting = e.element('section'); preexisting.inert = true;
  const promise = e.run('confirmAction("Excluir?", {danger:true})');
  assert.equal(e.document.activeElement.matches('button[data-confirm-cancel]'), true);
  assert.equal(trigger.inert, true);
  e.document.emit('keydown', { key: 'Escape' });
  assert.equal(await promise, false); assert.equal(trigger.inert, false);
  assert.equal(preexisting.inert, true); assert.equal(e.document.activeElement, trigger);
  assert.equal(e.document.body.classList.contains('app-modal-open'), false);
});
test('Tab e Shift+Tab permanecem na confirmação', async () => {
  const e = environment(); const p = e.run('confirmAction("Confirma?")');
  const dialog = e.document.querySelector('[data-confirm-dialog]');
  e.document.emit('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(e.document.activeElement, dialog.querySelector('button[data-confirm-cancel]'));
  e.document.emit('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(e.document.activeElement, dialog.querySelector('[data-confirm-ok]'));
  dialog.emit('click', { target: dialog.querySelector('[data-confirm-cancel]') });
  assert.equal(await p, false);
});
test('modal sobreposto retorna ao modal anterior e depois ao gatilho', async () => {
  const e = environment(); const trigger = e.element(); trigger.focus();
  const underlying = e.element('section'); const inner = e.document.createElement('button'); underlying.appendChild(inner);
  e.context.underlying = underlying; e.run('activateModal(underlying)');
  const promise = e.run('confirmAction("Confirma?")');
  assert.equal(underlying.inert, true); e.document.emit('keydown', {key:'Escape'}); await promise;
  assert.equal(underlying.inert, false); assert.equal(e.document.activeElement, inner);
  assert.equal(trigger.inert, true); e.run('deactivateModal(underlying)');
  assert.equal(e.document.activeElement, trigger);
});
test('guardAction bloqueia envio repetido e libera o botão após sucesso', async () => {
  const e = environment(); const form = e.element('form'), button = e.document.createElement('button'); form.appendChild(button);
  let finish, count = 0; e.context.handler = async event => { event.preventDefault(); count++; await new Promise(resolve => { finish = resolve; }); };
  const handler = e.run('guardAction(handler)'); const event = {currentTarget:form, submitter:button, preventDefault(){}};
  const first = handler(event); await handler(event);
  assert.equal(count, 1); assert.equal(button.disabled, true); assert.equal(form.getAttribute('aria-busy'), 'true');
  finish(); await first; assert.equal(button.disabled, false); assert.equal(form.getAttribute('aria-busy'), null);
});
test('guardAction libera após cancelamento/erro e permite nova tentativa', async () => {
  const e = environment(); const form = e.element('form'); const button = e.element(); let count = 0;
  e.context.handler = async () => { count++; if (count === 1) throw new Error('offline'); };
  const handler = e.run('guardAction(handler)'); const event = {currentTarget:form, submitter:button, preventDefault(){}};
  await handler(event); assert.equal(button.disabled, false); await handler(event); assert.equal(count, 2);
  assert.ok(e.document.querySelector('.app-toast-error'));
});
test('notificação sobrevive ao redirecionamento e é consumida uma vez no destino', () => {
  const e = environment(); e.run('redirectWithNotice("servicos.html", "Login realizado.")');
  assert.equal(e.window.location.assigned, 'https://autoshine.test/servicos.html');
  e.run('consumeNotice()'); assert.equal(e.document.querySelector('.app-toast'), null);
  e.window.location.pathname = '/servicos.html'; e.run('consumeNotice(); consumeNotice()');
  assert.equal(e.document.querySelector('[data-toast-root]').children.length, 1);
  assert.equal(e.storage.has('autoshine:flash'), false);
});
test('flash expirado ou inválido é descartado sem notificar', () => {
  const e = environment(); e.run('redirectWithNotice("servicos.html", "antigo")'); e.tick(60001); e.run('consumeNotice()');
  assert.equal(e.document.querySelector('.app-toast'), null);
  e.storage.set('autoshine:flash', '{'); assert.doesNotThrow(() => e.run('consumeNotice()'));
  assert.equal(e.storage.has('autoshine:flash'), false);
});
test('redirecionamento externo é recusado', () => {
  const e = environment(); e.run('redirectWithNotice("https://outro.test/", "mensagem")');
  assert.equal(e.window.location.assigned, undefined); assert.equal(e.storage.size, 0);
});

test('confirmação administrativa exige motivo e aceite da exceção antes de resolver', async () => {
  const e = environment(); const pending = e.run('confirmAction("Cancelar?", {requireReason:true,allowDeadlineException:true})');
  const dialog = e.document.querySelector('[data-confirm-dialog]');
  const ok = dialog.querySelector('[data-confirm-ok]');
  dialog.emit('click', {target:ok});
  assert.match(dialog.querySelector('[data-confirm-feedback]').textContent,/motivo/);
  assert.equal(dialog.classList.contains('hidden'),false);
  dialog.querySelector('#confirm-reason').value='Cliente solicitou por telefone';
  dialog.emit('click', {target:ok});
  assert.match(dialog.querySelector('[data-confirm-feedback]').textContent,/exceção/);
  dialog.querySelector('[data-confirm-exception]').checked=true;
  dialog.emit('click', {target:ok});
  const answer=await pending;assert.equal(answer.motivo,'Cliente solicitou por telefone');assert.equal(answer.excecaoPrazo,true);
});
test('cancelar confirmação com motivo não executa a operação', async () => {
  const e=environment();const pending=e.run('confirmAction("Atualizar?", {requireReason:true})');
  e.document.emit('keydown',{key:'Escape'});assert.equal(await pending,false);
});
