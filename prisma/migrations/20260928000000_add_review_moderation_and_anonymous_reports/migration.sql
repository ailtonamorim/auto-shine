ALTER TABLE "Avaliacao" ADD COLUMN "aprovado" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "new_Denuncia" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tipo" TEXT NOT NULL,
  "motivo" TEXT,
  "detalhes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'aberta',
  "usuarioId" INTEGER,
  "lojaId" INTEGER,
  "avaliacaoId" INTEGER,
  "agendamentoId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "detalhesCipher" TEXT,
  "motivoCipher" TEXT,
  "motivoIndex" TEXT,
  "anonima" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Denuncia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Denuncia_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Denuncia_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Denuncia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Denuncia" (
  "id", "tipo", "motivo", "detalhes", "status", "usuarioId", "lojaId",
  "avaliacaoId", "agendamentoId", "createdAt", "updatedAt",
  "detalhesCipher", "motivoCipher", "motivoIndex"
)
SELECT
  "id", "tipo", "motivo", "detalhes", "status", "usuarioId", "lojaId",
  "avaliacaoId", "agendamentoId", "createdAt", "updatedAt",
  "detalhesCipher", "motivoCipher", "motivoIndex"
FROM "Denuncia";

DROP TABLE "Denuncia";
ALTER TABLE "new_Denuncia" RENAME TO "Denuncia";

CREATE INDEX IF NOT EXISTS "Avaliacao_aprovado_idx" ON "Avaliacao"("aprovado");
CREATE INDEX IF NOT EXISTS "Denuncia_motivoIndex_idx" ON "Denuncia"("motivoIndex");