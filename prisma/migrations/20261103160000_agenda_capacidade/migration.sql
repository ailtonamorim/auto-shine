BEGIN;
ALTER TABLE "Loja"
  ADD COLUMN "capacidadeSimultanea" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "agendaFechamento" TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN "agendaBloqueios" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_capacidade_check" CHECK ("capacidadeSimultanea" BETWEEN 1 AND 100);
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_fechamento_check" CHECK ("agendaFechamento" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_bloqueios_check" CHECK (jsonb_typeof("agendaBloqueios") = 'array');

-- Duração operacional informada posteriormente para reservas antigas; não é um snapshot histórico.
ALTER TABLE "Agendamento" ADD COLUMN "duracaoAgendaMinutos" INTEGER;
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_duracao_agenda_check"
  CHECK ("duracaoAgendaMinutos" IS NULL OR "duracaoAgendaMinutos" BETWEEN 1 AND 1440);

-- A exclusividade por horário exato impedia capacidade > 1 e não detectava sobreposição.
DROP INDEX IF EXISTS "Agendamento_lojaId_data_hora_ativo_key";
CREATE INDEX "Agendamento_lojaId_status_data_idx" ON "Agendamento" ("lojaId", "status", "data");
COMMIT;
