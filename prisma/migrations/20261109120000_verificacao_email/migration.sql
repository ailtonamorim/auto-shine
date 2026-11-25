-- Contas existentes ficam pendentes; nenhuma confirmação é presumida.
ALTER TABLE "Usuario"
 ADD COLUMN "emailVerificadoEm" TIMESTAMP(3),
 ADD COLUMN "emailVerificacaoToken" TEXT,
 ADD COLUMN "emailVerificacaoExpiraEm" TIMESTAMP(3),
 ADD COLUMN "emailVerificacaoEnviadaEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "Usuario_emailVerificacaoToken_key" ON "Usuario"("emailVerificacaoToken");
UPDATE "Usuario" SET "resetToken" = NULL, "resetTokenExpiry" = NULL;
ALTER TABLE "Dono"
 ADD COLUMN "emailVerificadoEm" TIMESTAMP(3),
 ADD COLUMN "emailVerificacaoToken" TEXT,
 ADD COLUMN "emailVerificacaoExpiraEm" TIMESTAMP(3),
 ADD COLUMN "emailVerificacaoEnviadaEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "Dono_emailVerificacaoToken_key" ON "Dono"("emailVerificacaoToken");
UPDATE "Dono" SET "resetToken" = NULL, "resetTokenExpiry" = NULL;
