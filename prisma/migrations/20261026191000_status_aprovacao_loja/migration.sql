ALTER TABLE "Loja"
ADD COLUMN "statusAprovacao" TEXT NOT NULL DEFAULT 'aprovada';

CREATE INDEX "Loja_statusAprovacao_idx" ON "Loja"("statusAprovacao");
