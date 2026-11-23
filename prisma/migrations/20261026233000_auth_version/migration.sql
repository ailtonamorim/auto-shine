-- Preserva as contas, senhas e reservas. JWTs antigos equivalem à versão zero.
ALTER TABLE "Usuario" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Dono" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
