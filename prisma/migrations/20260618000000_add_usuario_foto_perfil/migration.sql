-- AlterTable Usuario: add profile photo field
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "fotoPerfilUrl" TEXT;
