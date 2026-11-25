CREATE TABLE "Notificacao" (
    "id" SERIAL NOT NULL,
    "loja_id" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notificacao_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "Loja" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Notificacao_loja_id_lida_created_at_idx" ON "Notificacao"("loja_id", "lida", "created_at");