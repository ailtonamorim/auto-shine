BEGIN;
ALTER TABLE "Agendamento" ADD COLUMN "formaPagamento" TEXT;
ALTER TABLE "Agendamento" ADD COLUMN "revisao" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AlteracaoAgendamento" (
  "id" SERIAL NOT NULL,
  "agendamentoId" INTEGER NOT NULL,
  "autorTipo" TEXT NOT NULL,
  "autorNome" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "anterior" JSONB NOT NULL,
  "atual" JSONB NOT NULL,
  "vistoClienteEm" TIMESTAMP(3),
  "vistoParceiroEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlteracaoAgendamento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlteracaoAgendamento_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AlteracaoAgendamento_agendamentoId_createdAt_idx" ON "AlteracaoAgendamento"("agendamentoId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Agendamento_lojaId_data_hora_ativo_key"
ON "Agendamento" ("lojaId", "data", "hora") WHERE "status" IN ('pendente', 'confirmado');

COMMIT;
