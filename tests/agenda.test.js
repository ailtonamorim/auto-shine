// Motor real e rotas Express reais; persistência/autenticação simuladas.
// O teste separado agenda-postgres.test.js verifica o bloqueio com PostgreSQL real.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let shops, services, bookings, audit, sequence, queue, failAudit;
function matches(row, where = {}) {
  return row && Object.entries(where).every(([key,value]) => {
    if (key === 'loja') return matches(shops.find(s=>s.id===row.lojaId),value);
    // Filtro de loja disponível (aprovada, ativa, dono não bloqueado): ver filtroLojaDisponivel.
    if (key === 'OR') return value.some(w => matches(row, w));
    if (key === 'dono' && value?.is) return matches({ bloqueado: false, ...(row.dono || {}) }, value.is);
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('lte' in value) return row[key] <= value.lte;
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function apply(row, data) { for (const [k,v] of Object.entries(data)) row[k]=v && typeof v==='object' && 'increment' in v ? row[k]+v.increment : structuredClone(v); }
function details(row) { return row ? structuredClone({...row,loja:shops.find(s=>s.id===row.lojaId),servico:services.find(s=>s.id===row.servicoId),alteracoes:audit.filter(a=>a.agendamentoId===row.id)}) : null; }
const db={
  loja: {
    async findFirst({where}) { return structuredClone(shops.find(s=>matches(s,where)) || null); },
    async findUnique({where}) { return this.findFirst({where}); },
    async update({where,data}) { const row=shops.find(s=>matches(s,where)); apply(row,data); return structuredClone(row); },
  },
  servicoLoja: { async findFirst({where}) { return structuredClone(services.find(s=>matches(s,where)) || null); } },
  agendamento: {
    async findFirst({where}) { return details(bookings.find(b=>matches(b,where))); },
    async findUnique({where}) { return this.findFirst({where}); },
    async findMany({where}) { return bookings.filter(b=>matches(b,where)).map(details); },
    async create({data}) { const row={id:sequence++,revisao:0,status:'pendente',...structuredClone(data)};bookings.push(row);return details(row); },
    async updateMany({where,data}) { const rows=bookings.filter(b=>matches(b,where));for(const row of rows)apply(row,data);return {count:rows.length}; },
    async update({where,data}) { const row=bookings.find(b=>matches(b,where));apply(row,data);return details(row); },
  },
  alteracaoAgendamento: { async create({data}) { if(failAudit)throw new Error('Falha simulada de histórico');audit.push(structuredClone(data));return data; } },
  async $transaction(fn,options) {
    // A fila só é adquirida quando a implementação executa SELECT ... FOR UPDATE.
    let release, snapshot;
    const tx={...db,async $queryRaw(strings,...values) {
      assert.match(strings.join('?'),/FROM "Loja".*FOR UPDATE/);
      const id=values[0];assert.ok(Number.isInteger(id));
      const previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;
      snapshot=structuredClone({shops,bookings,audit});
      return shops.some(s=>s.id===id)?[{id}]:[];
    }};
    try { return await fn(tx); }
    catch(err) { if(snapshot)({shops,bookings,audit}=snapshot);throw err; }
    finally { if(release)release(); }
  },
};
function mock(name,exports) {const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../src/config/database',db);
mock('../src/middlewares/auth',{
  autenticarUsuario(req,_res,next){req.usuario={id:Number(req.headers['x-user-id']||1),nome:'Cliente'};next();},
  autenticarDono(req,_res,next){req.dono={donoId:Number(req.headers['x-owner-id']||1),nome:'Parceiro'};next();},
  autenticarAdmin(_req,_res,next){next();},
});
const agenda=require('../src/utils/agenda');
const {dataValida,agoraAgenda}=require('../src/utils/agenda-tempo');
const {validarDataHora}=require('../src/utils/agendamento-edicao');
const {comAgendaBloqueada}=require('../src/utils/agenda-transacao');
const app=express();app.use(express.json());
app.use('/agendamentos',require('../src/routes/agendamentos'));
app.use('/lojas',require('../src/routes/lojas'));
app.use('/admin',require('../src/routes/admin'));
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>new Promise(resolve=>server.close(resolve)));
beforeEach(()=>{
  shops=[{id:1,donoId:1,nome:'Loja',descricao:'Teste',endereco:'Rua',latitude:-16,longitude:-49,fotoUrl:'assets/img/logo.svg',bloqueado:false,statusAprovacao:'aprovada',inativoAte:null,formasPagamento:'Pix',agendaDias:'0,1,2,3,4,5,6',agendaHorarios:'08:00,09:00,09:30,10:00,10:30,11:00,16:00,17:00',agendaFechamento:'18:00',agendaBloqueios:[],capacidadeSimultanea:1}];
  services=[{id:1,lojaId:1,nome:'Lavagem',preco:80,duracao:'1h30'},{id:2,lojaId:1,nome:'Rápida',preco:40,duracao:'30 min'}];
  bookings=[];audit=[];sequence=1;queue=Promise.resolve();failAudit=false;
});
const date='2099-11-10';
function booking(patch={}){return {id:sequence++,lojaId:1,usuarioId:1,servicoId:1,data:date,hora:'09:00',status:'pendente',revisao:0,veiculo:'carro',formaPagamento:'Pix',duracaoMinutos:90,servicoNome:'Lavagem',precoCentavos:8000,...patch};}
function avail(patch={}){return agenda.calcularDisponibilidade({loja:shops[0],data:date,duracaoMinutos:30,agendamentos:bookings,now:new Date('2026-11-03T12:00:00Z'),...patch});}
function slot(hora,patch={}){return avail(patch).horarios.find(h=>h.hora===hora);}
function payload(patch={}){return {lojaId:1,servicoId:1,data:date,hora:'09:00',veiculo:'carro',formaPagamento:'Pix',...patch};}
async function req(url,method='GET',body,headers={}){const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,cache:res.headers.get('Cache-Control'),...await res.json()};}
async function create(patch={}){return req('/agendamentos','POST',payload(patch));}

test('sobreposição em início diferente ocupa capacidade até o fim do serviço',()=>{bookings.push(booking());assert.equal(slot('09:30').disponivel,false);assert.equal(slot('10:00').disponivel,false);assert.equal(slot('10:30').disponivel,true);});
test('reserva que termina no início da próxima não colide',()=>{bookings.push(booking({hora:'10:00',duracaoMinutos:60}));assert.equal(slot('09:00',{duracaoMinutos:60}).disponivel,true);assert.equal(slot('09:30',{duracaoMinutos:60}).disponivel,false);});
test('capacidade dois permite compartilhar horário e bloqueia a terceira vaga',()=>{shops[0].capacidadeSimultanea=2;bookings.push(booking());assert.equal(slot('09:30').vagas,1);bookings.push(booking());assert.equal(slot('09:30').disponivel,false);});
test('conta pico simultâneo, não a soma de intervalos que só se tocam',()=>{shops[0].capacidadeSimultanea=2;bookings.push(booking({hora:'09:00',duracaoMinutos:60}),booking({hora:'10:00',duracaoMinutos:60}));assert.equal(slot('09:00',{duracaoMinutos:120}).disponivel,true);});
test('pendente e confirmado ocupam; cancelado e finalizado liberam',()=>{for(const status of ['pendente','confirmado','cancelado','finalizado']){bookings=[booking({status})];assert.equal(slot('09:00').disponivel,['cancelado','finalizado'].includes(status));}});
test('outra loja não interfere',()=>{bookings.push(booking({lojaId:2}));assert.equal(slot('09:00').disponivel,true);});
test('reagendamento ignora apenas a própria reserva',()=>{const a=booking();bookings.push(a);assert.equal(slot('09:00',{ignorarId:a.id}).disponivel,true);bookings.push(booking());assert.equal(slot('09:00',{ignorarId:a.id}).disponivel,false);});
test('usa duração salva, sem consultar duração atual do catálogo',()=>{bookings.push(booking({duracaoMinutos:120,servico:{duracao:'10 min'}}));assert.equal(slot('10:30').disponivel,false);});
test('limite de fechamento inclui fim exato, rejeita ultrapassagem',()=>{assert.equal(slot('17:00',{duracaoMinutos:60}).disponivel,true);assert.equal(slot('17:00',{duracaoMinutos:61}).disponivel,false);assert.equal(slot('08:00',{duracaoMinutos:1440}).disponivel,false);});
test('bloqueio parcial afeta qualquer interseção, respeitando limites',()=>{shops[0].agendaBloqueios=[{data:date,inicio:'10:00',fim:'11:00'}];assert.equal(slot('09:00',{duracaoMinutos:60}).disponivel,true);assert.equal(slot('09:30',{duracaoMinutos:60}).disponivel,false);assert.equal(slot('11:00').disponivel,true);});
test('bloqueio do dia e dia da semana fechado impedem novas reservas',()=>{shops[0].agendaBloqueios=[{data:date}];assert.ok(avail().horarios.every(x=>!x.disponivel));shops[0].agendaBloqueios=[];shops[0].agendaDias=String((agenda.diaSemanaData(date)+1)%7);assert.equal(avail().aberto,false);});
test('fuso de Brasília bloqueia passado, incluindo minuto atual',()=>{const now=new Date('2099-11-10T12:00:30Z');assert.equal(slot('09:00',{now}).disponivel,false);assert.equal(slot('09:30',{now}).disponivel,true);assert.equal(agoraAgenda(new Date('2026-11-04T01:00:00Z')).data,'2026-11-03');});
test('datas impossíveis são rejeitadas, incluindo API de disponibilidade',async()=>{for(const d of ['2026-02-30','2026-13-01','abc']){assert.equal(dataValida(d),false);assert.throws(()=>avail({data:d}));}assert.equal((await req('/lojas/1/disponibilidade?servicoId=1&data=2099-02-30')).status,400);assert.throws(()=>validarDataHora('2000-01-01','10:00'));});
test('legado sem duração suspende a data, sem inventar histórico',()=>{shops[0].capacidadeSimultanea=10;bookings.push(booking({duracaoMinutos:null}));assert.ok(avail().horarios.every(x=>!x.disponivel));assert.equal(bookings[0].duracaoMinutos,null);});
test('duração operacional do legado permite calcular ocupação',()=>{bookings.push(booking({duracaoMinutos:null,duracaoAgendaMinutos:60}));assert.equal(slot('09:30').disponivel,false);assert.equal(slot('10:00').disponivel,true);});
test('reserva antiga que atravessa meia-noite ocupa a manhã seguinte',()=>{bookings.push(booking({data:'2099-11-09',hora:'23:00',duracaoMinutos:600}));assert.equal(slot('08:00').disponivel,false);assert.equal(slot('09:00').disponivel,true);});
test('configurações inválidas não são silenciosamente aceitas',()=>{for(const p of [{capacidadeSimultanea:0},{capacidadeSimultanea:1.5},{capacidadeSimultanea:101},{agendaFechamento:'24:00'},{agendaFechamento:'16:00'},{agendaBloqueios:'2099-02-30'},{agendaBloqueios:'2099-11-10 11:00-10:00'}])assert.throws(()=>agenda.configuracaoAgenda(p,shops[0]),{status:400});});
test('bloqueios aceitam texto e lista sem perder o dia inteiro',()=>{assert.deepEqual(agenda.normalizarBloqueios('2099-12-25\n2099-12-24 12:00-18:00'),[{data:'2099-12-25'},{data:'2099-12-24',inicio:'12:00',fim:'18:00'}]);assert.deepEqual(agenda.normalizarBloqueios(''),[]);});

test('consulta pública usa serviço selecionado e impede excluir reserva arbitrária',async()=>{bookings.push(booking({hora:'10:00',duracaoMinutos:60}));const short=await req(`/lojas/1/disponibilidade?data=${date}&servicoId=2`),long=await req(`/lojas/1/disponibilidade?data=${date}&servicoId=1`);assert.equal(short.horarios.find(x=>x.hora==='09:30').disponivel,true);assert.equal(long.horarios.find(x=>x.hora==='09:30').disponivel,false);assert.equal(short.cache,'no-store');assert.equal((await req(`/lojas/1/disponibilidade?data=${date}&servicoId=2&ignorarAgendamentoId=1`)).status,400);});
test('consulta pública exige serviço pertencente à loja',async()=>{assert.equal((await req(`/lojas/1/disponibilidade?data=${date}`)).status,400);services[0].lojaId=2;assert.equal((await req(`/lojas/1/disponibilidade?data=${date}&servicoId=1`)).status,404);});
test('criação protege intervalo no servidor, mesmo com interface desatualizada',async()=>{assert.equal((await create()).status,201);assert.equal((await create({hora:'09:30'})).status,409);assert.equal((await create({hora:'10:30'})).status,201);});
test('simulação de duas requisições concorrentes para última vaga salva só uma',async()=>{const results=await Promise.all([create(),create({hora:'09:30'})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(bookings.length,1);});
test('simulação concorrente capacidade dois salva duas de três',async()=>{shops[0].capacidadeSimultanea=2;const results=await Promise.all([create(),create(),create()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,201,409]);assert.equal(bookings.length,2);});
test('reagendar verifica duração histórica, preserva reserva em conflito e não grava histórico',async()=>{bookings.push(booking({id:1,hora:'08:00',duracaoMinutos:60}),booking({id:2,hora:'10:00',duracaoMinutos:60}));const result=await req('/agendamentos/1','PUT',payload({hora:'09:30',revisao:0,motivo:'Mudar horário'}));assert.equal(result.status,409);assert.equal(bookings[0].hora,'08:00');assert.equal(audit.length,0);});
test('reagendar para intervalo próprio funciona e registra auditoria',async()=>{const result=await create();const edited=await req(`/agendamentos/${result.agendamento.id}`,'PUT',payload({hora:'09:30',revisao:0,motivo:'Mudar horário'}));assert.equal(edited.status,200);assert.equal(edited.agendamento.revisao,1);assert.equal(audit.length,1);assert.equal(edited.agendamento.precoCentavos,8000);});
test('consulta de reagendamento exige dono da reserva ou parceiro da loja',async()=>{await create();assert.equal((await req(`/agendamentos/1/disponibilidade?data=${date}`)).status,200);assert.equal((await req(`/agendamentos/1/disponibilidade?data=${date}`,'GET',undefined,{'x-user-id':'99'})).status,404);assert.equal((await req(`/agendamentos/1/dono/disponibilidade?data=${date}`,'GET',undefined,{'x-owner-id':'99'})).status,404);});
test('cancelar libera capacidade para nova reserva',async()=>{await create();assert.equal((await req('/agendamentos/1/cancelar','PUT',{revisao:0,motivo:'Cancelar reserva'})).status,200);assert.equal((await create()).status,201);});
test('admin não reabre reserva encerrada mesmo com intervalo ocupado',async()=>{bookings.push(booking({id:1,status:'cancelado'}),booking({id:2}));assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'pendente',revisao:0,motivo:'Correção administrativa'})).status,400);assert.equal(bookings[0].status,'cancelado');});
test('admin não reabre reserva encerrada mesmo sem conflito',async()=>{bookings.push(booking({id:1,status:'cancelado'}));const result=await req('/admin/agendamentos/1/status','PUT',{status:'pendente',revisao:0,motivo:'Correção administrativa'});assert.equal(result.status,400);assert.equal(bookings[0].revisao,0);});
test('parceiro define duração antiga uma única vez, com motivo e sem preencher preço histórico',async()=>{bookings.push(booking({id:1,duracaoMinutos:null,precoCentavos:null,servicoNome:null}));let result=await req('/agendamentos/1/dono/duracao','PUT',{revisao:0,duracaoAgendaMinutos:60,motivo:'Combinado com cliente'});assert.equal(result.status,200);assert.equal(result.agendamento.precoCentavos,null);assert.equal(result.agendamento.duracaoMinutos,null);assert.equal(audit[0].atual.duracaoAgendaMinutos,60);assert.equal(slot('10:00').disponivel,true);result=await req('/agendamentos/1/dono/duracao','PUT',{revisao:1,duracaoAgendaMinutos:90,motivo:'Outra duração'});assert.equal(result.status,400);});
test('resolução de múltiplas reservas antigas não fica bloqueada pelas demais',async()=>{bookings.push(booking({id:1,duracaoMinutos:null}),booking({id:2,hora:'10:00',duracaoMinutos:null}));for(const id of [1,2])assert.equal((await req(`/agendamentos/${id}/dono/duracao`,'PUT',{revisao:0,duracaoAgendaMinutos:60,motivo:'Confirmado com cliente'})).status,200);assert.equal(slot('11:00').disponivel,true);});
test('duração de legado respeita acesso, revisão e limite do dia',async()=>{bookings.push(booking({id:1,hora:'23:00',duracaoMinutos:null}));assert.equal((await req('/agendamentos/1/dono/duracao','PUT',{revisao:0,duracaoAgendaMinutos:120,motivo:'Confirmado cliente'})).status,400);assert.equal((await req('/agendamentos/1/dono/duracao','PUT',{revisao:0,duracaoAgendaMinutos:30,motivo:'Confirmado cliente'},{'x-owner-id':'99'})).status,404);});
test('falha no histórico reverte alteração e libera bloqueio para próxima operação',async()=>{await create();failAudit=true;const old=console.error;console.error=()=>{};try{assert.equal((await req('/agendamentos/1','PUT',payload({hora:'10:00',revisao:0,motivo:'Mudar horário'}))).status,500);}finally{console.error=old;}assert.equal(bookings[0].hora,'09:00');assert.equal(bookings[0].revisao,0);failAudit=false;assert.equal((await create({hora:'11:00'})).status,201);});
test('mudança de configuração usa o mesmo bloqueio e respeita acesso',async()=>{assert.equal((await req('/lojas/1','PUT',{capacidadeSimultanea:2,agendaBloqueios:`${date} 12:00-13:00`})).status,200);assert.equal(shops[0].capacidadeSimultanea,2);assert.equal((await req('/lojas/1','PUT',{capacidadeSimultanea:3},{'x-owner-id':'99'})).status,404);});
test('capacidade reduzida mantém reservas existentes, mas impede aumentar ocupação',async()=>{shops[0].capacidadeSimultanea=2;await create();await create();assert.equal((await req('/lojas/1','PUT',{capacidadeSimultanea:1})).status,200);assert.equal(bookings.length,2);assert.equal((await create()).status,409);});
test('reserva espera atualização concorrente do bloqueio por data',async()=>{const results=await Promise.all([req('/lojas/1','PUT',{agendaBloqueios:date}),create()]);assert.equal(results[0].status,200);assert.equal(results[1].status,409);});
test('revisão desatualizada não altera reserva após operação concorrente',async()=>{await create();const results=await Promise.all([req('/agendamentos/1','PUT',payload({hora:'10:30',revisao:0,motivo:'Primeira alteração'})),req('/agendamentos/1','PUT',payload({hora:'11:00',revisao:0,motivo:'Segunda alteração'}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(audit.length,1);});
test('bloqueio transacional rejeita loja inexistente sem executar escrita',async()=>{let ran=false;await assert.rejects(comAgendaBloqueada(99,async()=>{ran=true;}),{status:404});assert.equal(ran,false);});

test('cartão oferece definição de duração somente ao parceiro de reserva legada ativa',()=>{const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');const ui=vm.createContext({Intl});vm.runInContext(source.slice(source.indexOf('function bookingServiceName('),source.indexOf('function createBookingListController(')),ui);ui.escapeHtml=String;ui.bookingUnread=()=>[];ui.bookingDateLabel=String;ui.bookingHistoryHtml=()=>'';const row=booking({duracaoMinutos:null});assert.match(ui.bookingCardHtml(row,'parceiro'),/data-booking-action="duration"/);assert.doesNotMatch(ui.bookingCardHtml(row,'cliente'),/data-booking-action="duration"/);row.status='cancelado';assert.doesNotMatch(ui.bookingCardHtml(row,'parceiro'),/data-booking-action="duration"/);});

function availabilityUI() {
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
  const start=source.indexOf('  async function updateAvailableTimes(options = {})');
  const end=source.indexOf('  if (dateInput) {',start);
  const waiting=[];
  const select={value:'',disabled:false,options:[],appendChild(option){this.options.push(option);},set innerHTML(value){this.options=[];},get innerHTML(){return '';}};
  const ui=vm.createContext({shopId:'1',servicoId:'2',dateInput:{value:date},timeSelect:select,availabilityRequestId:0,Date,encodeURIComponent,
    document:{createElement:()=>({})},resetTimeOptions(){select.disabled=true;},updateBookingSubmitState(){},setAvailabilityMessage(text){ui.message=text;},
    fetch(url){return new Promise((resolve,reject)=>waiting.push({url,resolve,reject}));},
  });
  vm.runInContext(source.slice(start,end),ui);
  return {ui,waiting,select};
}
test('tela envia serviço escolhido e exibe motivo de indisponibilidade',async()=>{
  const {ui,waiting,select}=availabilityUI();const call=ui.updateAvailableTimes();
  assert.match(waiting[0].url,/servicoId=2/);
  waiting[0].resolve({ok:true,json:async()=>({horarios:[{hora:'17:00',disponivel:false,motivo:'Não termina antes do encerramento'}]})});
  await call;assert.equal(select.disabled,true);assert.match(select.options[0].textContent,/encerramento/);assert.doesNotMatch(ui.message,/outros usuários/);
});
test('tela ignora resposta atrasada da data anterior',async()=>{
  const {ui,waiting,select}=availabilityUI();const old=ui.updateAvailableTimes();
  ui.dateInput.value='2099-11-11';const current=ui.updateAvailableTimes();
  waiting[1].resolve({ok:true,json:async()=>({horarios:[{hora:'11:00',disponivel:true,vagas:2}]})});await current;
  waiting[0].resolve({ok:true,json:async()=>({horarios:[{hora:'09:00',disponivel:true,vagas:1}]})});await old;
  assert.equal(select.options.length,1);assert.equal(select.options[0].value,'11:00');assert.match(select.options[0].textContent,/2 vagas/);
});
test('falha na consulta desabilita seleção antiga',async()=>{
  const {ui,waiting,select}=availabilityUI();select.value='09:00';const call=ui.updateAvailableTimes();waiting[0].reject(new Error('offline'));assert.equal(await call,false);assert.equal(select.disabled,true);
});
