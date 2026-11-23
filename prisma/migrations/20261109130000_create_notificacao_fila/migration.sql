-- CreateEnum
CREATE TYPE "NotificacaoStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'FALHA');

-- CreateEnum
CREATE TYPE "NotificacaoTipo" AS ENUM ('NOVA_SOLICITACAO', 'ALTERACAO_CLIENTE', 'REAGENDAMENTO_CLIENTE', 'CANCELAMENTO_CLIENTE', 'ALTERACAO_ESTABELECIMENTO', 'CONFIRMACAO', 'FINALIZACAO', 'CANCELAMENTO_ESTABELECIMENTO', 'ALTERACAO_ADMIN', 'EXPIRACAO_AUTOMATICA');

-- CreateEnum
CREATE TYPE "DestinatarioTipo" AS ENUM ('CLIENTE', 'ESTABELECIMENTO', 'ADMIN');

-- CreateTable
CREATE TABLE "notificacao_fila" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "chave_idempotencia" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL,
    "destinatario_email" TEXT NOT NULL,
    "destinatario_tipo" "DestinatarioTipo" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "limite_tentativas" INTEGER NOT NULL DEFAULT 3,
    "proxima_tentativa_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMP(3),
    "ultima_tentativa_em" TIMESTAMP(3),
    "ultima_falha" TEXT,
    "worker_id" TEXT,
    "processando_ate" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificacao_fila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notificacao_fila_chave_idempotencia_key" ON "notificacao_fila"("chave_idempotencia");

-- CreateIndex
CREATE INDEX "idx_notificacao_fila_processamento" ON "notificacao_fila"("status", "proxima_tentativa_em");

-- CreateIndex
CREATE INDEX "idx_notificacao_fila_expirados" ON "notificacao_fila"("status", "processando_ate");

-- CreateIndex
CREATE INDEX "idx_notificacao_fila_evento" ON "notificacao_fila"("evento_id");

-- CreateIndex
CREATE INDEX "idx_notificacao_fila_destinatario" ON "notificacao_fila"("destinatario_email");