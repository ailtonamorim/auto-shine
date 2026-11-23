ALTER TABLE "Usuario"
  ADD COLUMN "telefoneIndex" TEXT;

ALTER TABLE "Agendamento"
  ADD COLUMN "nomeClienteIndex" TEXT;
ALTER TABLE "Agendamento" ADD COLUMN "emailClienteIndex" TEXT;

ALTER TABLE "Denuncia"
  ADD COLUMN "motivoCipher" TEXT;
ALTER TABLE "Denuncia" ADD COLUMN "motivoIndex" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "acao" TEXT NOT NULL,
  "tabela" TEXT NOT NULL,
  "recordId" INTEGER,
  "usuarioId" INTEGER,
  "enderecoIp" TEXT,
  "detalhes" TEXT,
  "sucesso" BOOLEAN NOT NULL DEFAULT true,
  "erro" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Usuario_telefoneIndex_idx" ON "Usuario"("telefoneIndex");
CREATE INDEX IF NOT EXISTS "Agendamento_nomeClienteIndex_idx" ON "Agendamento"("nomeClienteIndex");
CREATE INDEX IF NOT EXISTS "Agendamento_emailClienteIndex_idx" ON "Agendamento"("emailClienteIndex");
CREATE INDEX IF NOT EXISTS "Denuncia_motivoIndex_idx" ON "Denuncia"("motivoIndex");
CREATE INDEX IF NOT EXISTS "AuditLog_acao_idx" ON "AuditLog"("acao");
CREATE INDEX IF NOT EXISTS "AuditLog_tabela_idx" ON "AuditLog"("tabela");
CREATE INDEX IF NOT EXISTS "AuditLog_usuarioId_idx" ON "AuditLog"("usuarioId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
