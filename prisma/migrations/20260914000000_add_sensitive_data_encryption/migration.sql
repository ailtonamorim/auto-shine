ALTER TABLE "Usuario"
  ADD COLUMN IF NOT EXISTS "emailCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "emailIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "cpfCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "cpfIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "telefoneCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "googleIdCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "googleIdIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT;

ALTER TABLE "Dono"
  ADD COLUMN IF NOT EXISTS "emailCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "emailIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "cnpjCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "cnpjIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "googleIdCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "googleIdIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT;

ALTER TABLE "Agendamento"
  ADD COLUMN IF NOT EXISTS "notasCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "nomeClienteCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "emailClienteCipher" TEXT;

ALTER TABLE "Denuncia"
  ADD COLUMN IF NOT EXISTS "detalhesCipher" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_emailIndex_key" ON "Usuario"("emailIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_cpfIndex_key" ON "Usuario"("cpfIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_googleIdIndex_key" ON "Usuario"("googleIdIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_resetTokenHash_key" ON "Usuario"("resetTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_emailIndex_key" ON "Dono"("emailIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_cnpjIndex_key" ON "Dono"("cnpjIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_googleIdIndex_key" ON "Dono"("googleIdIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_resetTokenHash_key" ON "Dono"("resetTokenHash");