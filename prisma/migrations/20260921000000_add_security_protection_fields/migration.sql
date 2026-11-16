ALTER TABLE "Usuario"
  ADD COLUMN IF NOT EXISTS "telefoneIndex" TEXT;

ALTER TABLE "Agendamento"
  ADD COLUMN IF NOT EXISTS "nomeClienteIndex" TEXT,
  ADD COLUMN IF NOT EXISTS "emailClienteIndex" TEXT;

ALTER TABLE "Denuncia"
  ADD COLUMN IF NOT EXISTS "motivoCipher" TEXT,
  ADD COLUMN IF NOT EXISTS "motivoIndex" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL NOT NULL,
  "acao" TEXT NOT NULL,
  "tabela" TEXT NOT NULL,
  "recordId" INTEGER,
  "usuarioId" INTEGER,
  "enderecoIp" TEXT,
  "detalhes" TEXT,
  "sucesso" BOOLEAN NOT NULL DEFAULT true,
  "erro" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Usuario_telefoneIndex_idx" ON "Usuario"("telefoneIndex");
CREATE INDEX IF NOT EXISTS "Agendamento_nomeClienteIndex_idx" ON "Agendamento"("nomeClienteIndex");
CREATE INDEX IF NOT EXISTS "Agendamento_emailClienteIndex_idx" ON "Agendamento"("emailClienteIndex");
CREATE INDEX IF NOT EXISTS "Denuncia_motivoIndex_idx" ON "Denuncia"("motivoIndex");
CREATE INDEX IF NOT EXISTS "AuditLog_acao_idx" ON "AuditLog"("acao");
CREATE INDEX IF NOT EXISTS "AuditLog_tabela_idx" ON "AuditLog"("tabela");
CREATE INDEX IF NOT EXISTS "AuditLog_usuarioId_idx" ON "AuditLog"("usuarioId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
