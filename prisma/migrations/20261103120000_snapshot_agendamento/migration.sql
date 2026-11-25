-- Não preenche o passado com os dados atuais do catálogo.
ALTER TABLE "Agendamento"
  ADD COLUMN "servicoNome" TEXT,
  ADD COLUMN "precoCentavos" INTEGER,
  ADD COLUMN "duracaoMinutos" INTEGER;

ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_snapshot_completo_check" CHECK (
  ("servicoNome" IS NULL AND "precoCentavos" IS NULL AND "duracaoMinutos" IS NULL)
  OR
  ("servicoNome" IS NOT NULL AND length(trim("servicoNome")) > 0
   AND "precoCentavos" IS NOT NULL AND "precoCentavos" >= 0
   AND "duracaoMinutos" IS NOT NULL AND "duracaoMinutos" > 0)
);
