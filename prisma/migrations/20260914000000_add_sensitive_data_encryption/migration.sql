ALTER TABLE "Usuario"
  ADD COLUMN "emailCipher" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "emailIndex" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "cpfCipher" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "cpfIndex" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "telefoneCipher" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "googleIdCipher" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "googleIdIndex" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "resetTokenHash" TEXT;

ALTER TABLE "Dono"
  ADD COLUMN "emailCipher" TEXT;
ALTER TABLE "Dono" ADD COLUMN "emailIndex" TEXT;
ALTER TABLE "Dono" ADD COLUMN "cnpjCipher" TEXT;
ALTER TABLE "Dono" ADD COLUMN "cnpjIndex" TEXT;
ALTER TABLE "Dono" ADD COLUMN "googleIdCipher" TEXT;
ALTER TABLE "Dono" ADD COLUMN "googleIdIndex" TEXT;
ALTER TABLE "Dono" ADD COLUMN "resetTokenHash" TEXT;

ALTER TABLE "Agendamento"
  ADD COLUMN "notasCipher" TEXT;
ALTER TABLE "Agendamento" ADD COLUMN "nomeClienteCipher" TEXT;
ALTER TABLE "Agendamento" ADD COLUMN "emailClienteCipher" TEXT;

ALTER TABLE "Denuncia" ADD COLUMN "detalhesCipher" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_emailIndex_key" ON "Usuario"("emailIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_cpfIndex_key" ON "Usuario"("cpfIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_googleIdIndex_key" ON "Usuario"("googleIdIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_resetTokenHash_key" ON "Usuario"("resetTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_emailIndex_key" ON "Dono"("emailIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_cnpjIndex_key" ON "Dono"("cnpjIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_googleIdIndex_key" ON "Dono"("googleIdIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_resetTokenHash_key" ON "Dono"("resetTokenHash");