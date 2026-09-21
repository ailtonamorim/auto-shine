-- AlterTable Agendamento: add delivery token verification state
ALTER TABLE "Agendamento" ADD COLUMN IF NOT EXISTS "entregaTokenValidadoEm" TIMESTAMP(3);
ALTER TABLE "Agendamento" ADD COLUMN IF NOT EXISTS "entregaTokenTentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Agendamento" ADD COLUMN IF NOT EXISTS "entregaTokenUltimaTentativaEm" TIMESTAMP(3);
