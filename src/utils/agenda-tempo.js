// Minutos civis: datas/horas da agenda são sempre do fuso America/Sao_Paulo.
// O Z abaixo é só uma escala numérica para comparar horários civis, não UTC de atendimento.
function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
function minutoDia(hora) {
  if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
}
function minutoCivil(data, hora = '00:00') {
  if (!dataValida(data) || minutoDia(hora) === null) return null;
  return Date.parse(`${data}T${hora}:00Z`) / 60000;
}
function agoraAgenda(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const data = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = `${parts.hour}:${parts.minute}`;
  return { data, hora, minuto: minutoCivil(data, hora) };
}
module.exports = { dataValida, minutoDia, minutoCivil, agoraAgenda };
