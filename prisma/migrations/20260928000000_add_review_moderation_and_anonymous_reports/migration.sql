ALTER TABLE "Avaliacao"
  ADD COLUMN IF NOT EXISTS "aprovado" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Denuncia"
  ADD COLUMN IF NOT EXISTS "anonima" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Denuncia"
  ALTER COLUMN "motivo" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Avaliacao_aprovado_idx" ON "Avaliacao"("aprovado");