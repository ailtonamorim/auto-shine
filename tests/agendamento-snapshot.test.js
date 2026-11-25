// Express real; banco, autenticação e disponibilidade isolados em memória.
// Não carrega .env, não usa PostgreSQL externo nem altera dados reais.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { precoEmCentavos, duracaoEmMinutos, snapshotServico } = require('../src/utils/agendamento-snapshot');

for (const [input, expected] of [[0, 0], [49.9, 4990], [0.29, 29], ['1,05', 105], ['21474836.47', 2147483647]]) {
  test(`preço ${input} é convertido para ${expected} centavos`, () => assert.equal(precoEmCentavos(input), expected));
}
test('rejeita preços ausentes, ambíguos, negativos, não finitos ou com fração de centavo', () => {
  for (const value of [null, undefined, '', ' ', true, -1, NaN, Infinity, 'abc', '1.234,56', 1.005, '21474836.48']) {
    assert.throws(() => precoEmCentavos(value), { status: 400 });
  }
});
for (const [input, expected] of [['45 min',45], ['1h',60], ['1h30',90], ['1 h 05 min',65], ['2 horas',120], ['1 dia',1440], ['2 dias',2880], ['90 minutos',90]]) {
  test(`duração ${input} é convertida para ${expected} minutos`, () => assert.equal(duracaoEmMinutos(input),expected));
}
test('duração inválida não é adivinhada', () => {
  for (const value of ['', null, 60, '60', '0 min', '-30 min', '1h90', '30-60 min', 'a combinar', '1 dia útil', '99999999999 h']) {
    assert.throws(() => duracaoEmMinutos(value), { status: 400 });
  }
});
test('snapshot não mantém referência mutável ao catálogo', () => {
  const service = { nome: 'Lavagem', preco: 49.9, duracao: '1h30' };
  const snapshot = snapshotServico(service);
  Object.assign(service,{ nome:'Novo',preco:90,duracao:'2h' });
  assert.deepEqual(snapshot,{ servicoNome:'Lavagem',precoCentavos:4990,duracaoMinutos:90 });
});

let service, shop, bookings, failCreate;
const audit = [];
function withDetails(row) {
  return structuredClone({ ...row, servico: service, loja: shop, alteracoes: audit });
}
const db = {
  async $queryRaw() { return [{id:1}]; },
  loja: { async findFirst({ where }) {
    if (where.id !== undefined && where.id !== shop.id) return null;
    if (where.donoId !== undefined && where.donoId !== shop.donoId) return null;
    if (where.bloqueado === false && shop.bloqueado) return null;
    return structuredClone(shop);
  }, async create({data}) { return { ...data, id: 2 }; } },
  servicoLoja: {
    async findFirst({ where }) { return where.id === service.id && where.lojaId === service.lojaId ? structuredClone(service) : null; },
    async create({ data }) { return { id: 2, ...data }; },
    async update({ data }) { Object.assign(service,data); return structuredClone(service); },
  },
  agendamento: {
    async create({ data }) {
      if (failCreate) throw new Error('Falha simulada de escrita');
      const row = { id: bookings.length + 1, revisao: 0, status: 'pendente', ...structuredClone(data) };
      bookings.push(row); return withDetails(row);
    },
    async findMany() { return bookings.map(withDetails); },
    async findFirst({ where }) { const row = bookings.find(b => b.id === where.id); return row ? withDetails(row) : null; },
    async findUnique({ where }) { return withDetails(bookings.find(b => b.id === where.id)); },
    async updateMany({ where, data }) {
      const row = bookings.find(b => b.id === where.id && b.revisao === where.revisao && b.status === where.status);
      if (!row) return { count: 0 };
      const { revisao, ...rest } = data;
      Object.assign(row,structuredClone(rest)); row.revisao += revisao.increment;
      return { count: 1 };
    },
  },
  alteracaoAgendamento: { async create({ data }) { audit.push(data); return data; } },
  // Fila de notificações (tópico 8): gravada na mesma transação da reserva.
  notificacaoFila: { async createMany({ data }) { return { count: data.length }; } },
  async $transaction(fn) { return fn(db); },
};
function mockModule(name, exports) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename:id, loaded:true, exports };
}
mockModule('../src/config/database',db);
mockModule('../src/middlewares/auth', {
  autenticarUsuario(req,_res,next) { req.usuario={ id:1,nome:'Cliente',email:'teste@example.test' }; next(); },
  autenticarDono(req,_res,next) { req.dono={ donoId:1,nome:'Parceiro' }; next(); },
});
const agenda = require('../src/utils/agenda');
mockModule('../src/utils/agenda', {
  ...agenda,
  validarHorario: async()=>{},
  montarDisponibilidadeLoja: async()=>({ aberto:true,horarios:[{ hora:'10:00',disponivel:true }] }),
});
const app=express(); app.use(express.json());
app.use('/agendamentos',require('../src/routes/agendamentos'));
app.use('/lojas',require('../src/routes/lojas'));
let server,base;
before(async()=>{ server=app.listen(0,'127.0.0.1'); await once(server,'listening'); base=`http://127.0.0.1:${server.address().port}`; });
after(async()=>{ await new Promise(resolve=>server.close(resolve)); });
beforeEach(()=>{
  shop={ id:1,donoId:1,bloqueado:false,nome:'Loja',formasPagamento:'Pix, Dinheiro' };
  service={ id:1,lojaId:1,nome:'Lavagem',descricao:'Descrição',preco:49.9,duracao:'1h30' };
  bookings=[]; audit.length=0; failCreate=false;
});
function body(extra={}) { return { lojaId:1,servicoId:1,data:'2099-11-10',hora:'10:00',veiculo:'carro',formaPagamento:'Pix',...extra }; }
async function request(url, method='GET', data) {
  const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  return { status:res.status,...await res.json() };
}
async function create(extra={}) { return request('/agendamentos','POST',body(extra)); }
function assertSnapshot(row) {
  assert.equal(row.servicoNome,'Lavagem'); assert.equal(row.precoCentavos,4990); assert.equal(row.duracaoMinutos,90);
}
test('POST usa preço, nome e duração do banco e ignora campos de snapshot enviados pelo cliente',async()=>{
  const result=await create({ precoCentavos:1,servicoNome:'Fraude',duracaoMinutos:1,preco:0 });
  assert.equal(result.status,201); assertSnapshot(result.agendamento); assertSnapshot(bookings[0]);
});
test('alterar catálogo preserva reserva anterior; nova reserva recebe novas condições',async()=>{
  await create();
  const edit=await request('/lojas/1/servicos/1','PUT',{ nome:'Lavagem premium',preco:80,duracao:'2h' });
  assert.equal(edit.status,200);
  for (const url of ['/agendamentos/me','/agendamentos/dono']) {
    const result=await request(url); assertSnapshot(result.agendamentos[0]);
    assert.equal(result.agendamentos[0].servico.preco,80);
  }
  const result=await create();
  assert.equal(result.agendamento.precoCentavos,8000);
  assert.equal(result.agendamento.servicoNome,'Lavagem premium');
  assert.equal(result.agendamento.duracaoMinutos,120);
});
test('cotação alterada bloqueia a criação, permitindo confirmar após revisar condições',async()=>{
  const quote={nome:service.nome,preco:service.preco,duracao:service.duracao};
  service.preco=90;
  const result=await create({servicoEsperado:quote});
  assert.equal(result.status,409); assert.equal(result.code,'SERVICO_ALTERADO'); assert.equal(bookings.length,0);
  quote.preco=90;
  assert.equal((await create({servicoEsperado:quote})).status,201);
});
test('edição, confirmação e cancelamento mantêm condições da reserva',async()=>{
  await create(); service.preco=100; service.nome='Mudou'; service.duracao='4h';
  let result=await request('/agendamentos/1','PUT',body({revisao:0,motivo:'Cliente alterou observação',notas:'Nova observação',precoCentavos:100,servicoId:2}));
  assert.equal(result.status,200); assertSnapshot(result.agendamento); assert.equal(result.agendamento.servicoId,1);
  result=await request('/agendamentos/1/status','PUT',{revisao:1,status:'confirmado'});
  assert.equal(result.status,200); assertSnapshot(result.agendamento);
  result=await request('/agendamentos/1/dono/cancelar','PUT',{revisao:2,motivo:'Cancelado por solicitação'});
  assert.equal(result.status,200); assertSnapshot(result.agendamento);
});
test('agendamento legado continua sem valor após edição; não se copia catálogo atual',async()=>{
  bookings.push({id:1,revisao:0,status:'pendente',usuarioId:1,...body(),servicoNome:null,precoCentavos:null,duracaoMinutos:null});
  const result=await request('/agendamentos/1','PUT',body({revisao:0,motivo:'Atualizando observação',notas:'Novo texto'}));
  assert.equal(result.status,200); assert.equal(result.agendamento.precoCentavos,null);
  assert.equal(result.agendamento.servicoNome,null); assert.equal(result.agendamento.duracaoMinutos,null);
});
test('cadastro inválido impede reserva sem gravar snapshot incompleto',async()=>{
  for (const patch of [{preco:-1},{preco:10.005},{duracao:'a combinar'},{nome:''}]) {
    const original={...service}; Object.assign(service,patch);
    const result=await create(); assert.equal(result.status,400); assert.equal(bookings.length,0);
    service=original;
  }
});
test('serviço de outra loja e loja bloqueada não permitem reservar',async()=>{
  service.lojaId=2; assert.equal((await create()).status,404); assert.equal(bookings.length,0);
  service.lojaId=1; shop.bloqueado=true; assert.equal((await create()).status,404); assert.equal(bookings.length,0);
});
test('falha ao gravar reserva não retorna sucesso',async()=>{
  failCreate=true;
  const old=console.error; console.error=()=>{};
  try { assert.equal((await create()).status,500); assert.equal(bookings.length,0); }
  finally { console.error=old; }
});
test('cadastro e edição de serviço rejeitam preço e duração inválidos',async()=>{
  for (const method of ['POST','PUT']) {
    for (const patch of [{preco:-1},{preco:null},{preco:'abc'},{preco:1.005},{duracao:'a combinar'}]) {
      const url=method==='POST'?'/lojas/1/servicos':'/lojas/1/servicos/1';
      const result=await request(url,method,{nome:'Serviço',descricao:'Descrição',preco:50,duracao:'30 min',...patch});
      assert.equal(result.status,400); assert.equal(service.preco,49.9);
    }
  }
});

const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
const ui=vm.createContext({ Intl });
vm.runInContext(source.slice(source.indexOf('function bookingServiceName('),source.indexOf('function createBookingListController(')),ui);
ui.escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
ui.bookingUnread=()=>[]; ui.bookingDateLabel=value=>value; ui.bookingHistoryHtml=()=>'';
test('painel soma centavos exatos e exclui cancelados, pendentes e confirmados',()=>{
  const rows=[{status:'finalizado',precoCentavos:10},{status:'finalizado',precoCentavos:20},
    ...['pendente','confirmado','cancelado'].map(status=>({status,precoCentavos:9999}))];
  const sum=ui.bookingRevenue(rows); assert.equal(sum.centavos,30); assert.equal(sum.comValor,2); assert.equal(sum.semValor,0);
});
test('legados não viram zero ou preço do catálogo; painel sinaliza soma parcial',()=>{
  const legacy={status:'finalizado',precoCentavos:null,servico:{preco:999}};
  const total=ui.bookingRevenue([legacy,{status:'finalizado',precoCentavos:5000}]);
  assert.equal(total.centavos,5000); assert.equal(total.semValor,1);
  assert.match(ui.bookingRevenueLabel(total),/parcial/);
  assert.equal(ui.bookingRevenueLabel(ui.bookingRevenue([legacy])),'Valor não registrado');
  assert.equal(ui.bookingPriceLabel(legacy),'Valor histórico não registrado');
});
test('serviço gratuito é valor conhecido, distinto de valor ausente',()=>{
  const total=ui.bookingRevenue([{status:'finalizado',precoCentavos:0}]);
  assert.equal(total.comValor,1); assert.equal(total.semValor,0);
  assert.match(ui.bookingRevenueLabel(total),/0,00/);
});
test('cartões do cliente e parceiro mostram snapshot e escapam nome armazenado',()=>{
  const row={id:1,status:'finalizado',servicoNome:'<script>antigo</script>',precoCentavos:4990,duracaoMinutos:90,
    data:'2099-11-10',hora:'10:00',servico:{nome:'Novo',preco:999,duracao:'3h'},loja:{nome:'Loja'}};
  for (const role of ['cliente','parceiro']) {
    const html=ui.bookingCardHtml(row,role);
    assert.match(html,/49,90/); assert.match(html,/90 min/); assert.match(html,/&lt;script&gt;/);
    assert.doesNotMatch(html,/<script>|999|Novo/); assert.match(html,/não confirma que o pagamento foi recebido/);
  }
});
test('lista legada não apresenta nome nem duração atuais como históricos',()=>{
  const html=ui.bookingCardHtml({id:1,status:'finalizado',servico:{nome:'Novo',duracao:'3h',preco:999}},'cliente');
  assert.match(html,/Novo \(nome atual; histórico não registrado\)/); assert.match(html,/Valor histórico não registrado/);
  assert.match(html,/Duração histórica não registrada/); assert.doesNotMatch(html,/999|3h/);
});

test('finalização preserva o preço reservado para o cálculo do painel',async()=>{
  await create(); service.preco=200;
  assert.equal((await request('/agendamentos/1/status','PUT',{revisao:0,status:'confirmado'})).status,200);
  // Simula a passagem do tempo, preservando o snapshot reservado.
  bookings[0].data='2000-01-01';
  const result=await request('/agendamentos/1/status','PUT',{revisao:1,status:'finalizado'});
  assert.equal(result.status,200); assertSnapshot(result.agendamento);
  assert.equal(ui.bookingRevenue([result.agendamento]).centavos,4990);
});

function renderDashboard(rows) {
  const context=vm.createContext({Intl,Date,
    cachedShops:[{id:1,nome:'Loja',servicos:[],avaliacoes:[]}],cachedBookings:rows,
    dashboardRoot:{innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]},selectedDashboardShopId:'1',ownerSidebarCollapsed:false,
    getDonoFromToken:()=>({nome:'Parceiro'}),
    parseScheduleTimes:()=>['10:00'],parseScheduleDays:()=>['0','1','2','3','4','5','6'],
    defaultBookingTimes:[],defaultScheduleDays:[],
    // Notificações do parceiro (Diego) vivem no escopo da página; o teste começa sem nenhuma.
    partnerNotifications:[],unreadPartnerNotifications:0,
    escapeHtml:ui.escapeHtml,
    bookingRevenue:ui.bookingRevenue,bookingRevenueLabel:ui.bookingRevenueLabel,bookingServiceName:ui.bookingServiceName,
  });
  const start=source.indexOf('  function localDateKey(date = new Date())');
  const end=source.indexOf('  function createServiceRow(',start);
  vm.runInContext(source.slice(start,end),context);
  const today=context.localDateKey();
  for (const row of rows) { row.data=today; row.lojaId=1; }
  context.renderPartnerDashboard();
  return context.dashboardRoot.innerHTML;
}
test('painel completo usa valores reservados e declara que não são pagamentos confirmados',()=>{
  const html=renderDashboard([{id:1,status:'finalizado',precoCentavos:4990,servicoNome:'Lavagem antiga',servico:{preco:999}}]);
  assert.match(html,/Valor finalizado hoje<\/p>\s*<strong>R\$\s*49,90<\/strong>/);
  assert.doesNotMatch(html,/999/);
  assert.match(html,/Não representam pagamentos confirmados/);
});
test('painel completo identifica valor parcial e desativa comparação enganosa com ontem',()=>{
  const html=renderDashboard([{id:1,status:'finalizado',precoCentavos:4990},{id:2,status:'finalizado',precoCentavos:null,servico:{preco:999}}]);
  assert.match(html,/49,90 \(parcial\)/);
  assert.match(html,/Comparação indisponível/);
  assert.match(html,/1 atendimento\(s\) sem valor histórico/);
  assert.match(html,/49,90\*/);
});

test('painel não indica vagas livres quando uma reserva antiga aguarda duração',()=>{
  const html=renderDashboard([{id:1,status:'pendente',hora:'10:00',duracaoMinutos:null,precoCentavos:null}]);
  assert.match(html,/Duração pendente: novas reservas suspensas/);
});
test('painel inclui ocupação de serviço que começou antes do horário exibido',()=>{
  const html=renderDashboard([{id:1,status:'confirmado',hora:'09:00',duracaoMinutos:90,precoCentavos:8000,servicoNome:'Serviço longo'}]);
  assert.match(html,/1\/1 vagas ocupadas/);assert.match(html,/Serviço longo/);
});
