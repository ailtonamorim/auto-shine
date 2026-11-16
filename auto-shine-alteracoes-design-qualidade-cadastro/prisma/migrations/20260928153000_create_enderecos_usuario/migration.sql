-- Suporte aos endereços da nova tela de perfil. Preserva tabelas e dados existentes.
CREATE TABLE "EnderecoUsuario" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cep" TEXT,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "referencia" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnderecoUsuario_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnderecoUsuario_usuarioId_idx" ON "EnderecoUsuario"("usuarioId");
ALTER TABLE "EnderecoUsuario" ADD CONSTRAINT "EnderecoUsuario_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
