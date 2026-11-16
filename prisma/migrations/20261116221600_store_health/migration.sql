ALTER TABLE "Loja"
ADD COLUMN "health_status" TEXT NOT NULL DEFAULT 'healthy',
ADD COLUMN "health_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
