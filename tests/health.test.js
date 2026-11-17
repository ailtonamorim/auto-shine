const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularSaudeLoja } = require("../src/utils/health");

const now = new Date("2026-11-16T12:00:00.000Z");
const loja = { createdAt: new Date("2026-11-10T12:00:00.000Z") };

function calcular({ agendamentos = [], avaliacoes = [], concluidos = [], createdAt = loja.createdAt } = {}) {
  return calcularSaudeLoja({ loja: { createdAt }, agendamentos, avaliacoes, concluidos, now });
}

test("classifies 15% cancellation as critical and lower rates as healthy", () => {
  const taxaCritica = calcular({
    agendamentos: [
      ...Array.from({ length: 3 }, () => ({ status: "cancelado" })),
      ...Array.from({ length: 17 }, () => ({ status: "finalizado" })),
    ],
  });
  const taxaSaudavel = calcular({
    agendamentos: [
      ...Array.from({ length: 2 }, () => ({ status: "cancelado" })),
      ...Array.from({ length: 18 }, () => ({ status: "finalizado" })),
    ],
  });
  assert.equal(taxaCritica.healthStatus, "critical");
  assert.equal(taxaSaudavel.healthStatus, "healthy");
});

test("uses review and completed-booking thresholds", () => {
  assert.equal(calcular({ avaliacoes: [{ nota: 3 }, { nota: 4 }, { nota: 4 }] }).healthStatus, "critical");
  assert.equal(calcular({ avaliacoes: [{ nota: 4 }, { nota: 4 }, { nota: 4 }, { nota: 4 }, { nota: 5 }] }).healthStatus, "warning");
  assert.equal(calcular({ avaliacoes: [{ nota: 4 }, { nota: 4 }, { nota: 4 }, { nota: 5 }] }).healthStatus, "healthy");
  assert.equal(calcular({ createdAt: new Date("2026-11-02T12:00:00.000Z") }).healthStatus, "warning");
  assert.equal(calcular({ createdAt: new Date("2026-11-02T12:00:00.000Z"), concluidos: [{ data: "2026-11-10" }] }).healthStatus, "healthy");
});

test("only flags inactivity as critical after 14 days", () => {
  const warning = calcular({ createdAt: new Date("2026-11-02T12:00:00.000Z") });
  const critical = calcular({ createdAt: new Date("2026-11-01T12:00:00.000Z") });
  assert.equal(warning.healthStatus, "warning");
  assert.equal(critical.healthStatus, "critical");
});
