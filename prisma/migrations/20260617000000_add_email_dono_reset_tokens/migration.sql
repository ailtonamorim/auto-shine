ALTER TABLE "Usuario" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "resetTokenExpiry" DATETIME;
CREATE UNIQUE INDEX "Usuario_resetToken_key" ON "Usuario"("resetToken");

ALTER TABLE "Dono" ADD COLUMN "email" TEXT;
ALTER TABLE "Dono" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "Dono" ADD COLUMN "resetTokenExpiry" DATETIME;
CREATE UNIQUE INDEX "Dono_email_key" ON "Dono"("email");
CREATE UNIQUE INDEX "Dono_resetToken_key" ON "Dono"("resetToken");
