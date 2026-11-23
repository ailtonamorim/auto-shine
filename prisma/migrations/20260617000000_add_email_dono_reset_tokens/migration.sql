-- AlterTable Usuario: add reset token fields
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_resetToken_key" ON "Usuario"("resetToken");

-- AlterTable Dono: add email and reset token fields
ALTER TABLE "Dono" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Dono" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "Dono" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_email_key" ON "Dono"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_resetToken_key" ON "Dono"("resetToken");
