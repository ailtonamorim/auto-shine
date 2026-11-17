/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `codigoRetirada` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the column `emailClienteCipher` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the column `emailClienteIndex` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the column `nomeClienteCipher` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the column `nomeClienteIndex` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the column `notasCipher` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to alter the column `valorServico` on the `Agendamento` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("double precision")` to `Float`.
  - You are about to drop the column `detalhesCipher` on the `Denuncia` table. All the data in the column will be lost.
  - You are about to drop the column `motivoCipher` on the `Denuncia` table. All the data in the column will be lost.
  - You are about to drop the column `motivoIndex` on the `Denuncia` table. All the data in the column will be lost.
  - You are about to drop the column `cnpjCipher` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `cnpjIndex` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `emailCipher` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `emailIndex` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `googleIdCipher` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `googleIdIndex` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `resetTokenHash` on the `Dono` table. All the data in the column will be lost.
  - You are about to drop the column `cpfCipher` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `cpfIndex` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `emailCipher` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `emailIndex` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `googleIdCipher` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `googleIdIndex` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `resetTokenHash` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `telefoneCipher` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `telefoneIndex` on the `Usuario` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "AuditLog_createdAt_idx";

-- DropIndex
DROP INDEX "AuditLog_usuarioId_idx";

-- DropIndex
DROP INDEX "AuditLog_tabela_idx";

-- DropIndex
DROP INDEX "AuditLog_acao_idx";

-- DropIndex
DROP INDEX "Avaliacao_aprovado_idx";

-- DropIndex
DROP INDEX "Loja_statusAprovacao_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AuditLog";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agendamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "data" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "veiculo" TEXT NOT NULL DEFAULT 'Carro',
    "notas" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "nomeCliente" TEXT,
    "emailCliente" TEXT,
    "valorServico" REAL,
    "usuarioId" INTEGER,
    "lojaId" INTEGER NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agendamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Agendamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ServicoLoja" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Agendamento" ("createdAt", "data", "emailCliente", "hora", "id", "lojaId", "nomeCliente", "notas", "servicoId", "status", "usuarioId", "valorServico", "veiculo") SELECT "createdAt", "data", "emailCliente", "hora", "id", "lojaId", "nomeCliente", "notas", "servicoId", "status", "usuarioId", "valorServico", "veiculo" FROM "Agendamento";
DROP TABLE "Agendamento";
ALTER TABLE "new_Agendamento" RENAME TO "Agendamento";
CREATE TABLE "new_Denuncia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT,
    "detalhes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "anonima" BOOLEAN NOT NULL DEFAULT false,
    "respostaLoja" TEXT,
    "anexosResposta" TEXT,
    "dataResposta" DATETIME,
    "parecerAdmin" TEXT,
    "usuarioId" INTEGER,
    "lojaId" INTEGER,
    "avaliacaoId" INTEGER,
    "agendamentoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Denuncia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Denuncia_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Denuncia_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Denuncia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Denuncia" ("agendamentoId", "anexosResposta", "anonima", "avaliacaoId", "createdAt", "dataResposta", "detalhes", "id", "lojaId", "motivo", "parecerAdmin", "respostaLoja", "status", "tipo", "updatedAt", "usuarioId") SELECT "agendamentoId", "anexosResposta", "anonima", "avaliacaoId", "createdAt", "dataResposta", "detalhes", "id", "lojaId", "motivo", "parecerAdmin", "respostaLoja", "status", "tipo", "updatedAt", "usuarioId" FROM "Denuncia";
DROP TABLE "Denuncia";
ALTER TABLE "new_Denuncia" RENAME TO "Denuncia";
CREATE TABLE "new_Dono" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "cnpj" TEXT,
    "senha" TEXT,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "suspensoAte" DATETIME,
    "googleId" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Dono" ("bloqueado", "cnpj", "createdAt", "email", "googleId", "id", "login", "nome", "resetToken", "resetTokenExpiry", "senha", "suspensoAte") SELECT "bloqueado", "cnpj", "createdAt", "email", "googleId", "id", "login", "nome", "resetToken", "resetTokenExpiry", "senha", "suspensoAte" FROM "Dono";
DROP TABLE "Dono";
ALTER TABLE "new_Dono" RENAME TO "Dono";
CREATE UNIQUE INDEX "Dono_login_key" ON "Dono"("login");
CREATE UNIQUE INDEX "Dono_email_key" ON "Dono"("email");
CREATE UNIQUE INDEX "Dono_googleId_key" ON "Dono"("googleId");
CREATE UNIQUE INDEX "Dono_resetToken_key" ON "Dono"("resetToken");
CREATE TABLE "new_Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "fotoPerfilUrl" TEXT,
    "telefone" TEXT,
    "senha" TEXT,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "suspensoAte" DATETIME,
    "googleId" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Usuario" ("bloqueado", "cpf", "createdAt", "email", "fotoPerfilUrl", "googleId", "id", "nome", "resetToken", "resetTokenExpiry", "senha", "suspensoAte", "telefone") SELECT "bloqueado", "cpf", "createdAt", "email", "fotoPerfilUrl", "googleId", "id", "nome", "resetToken", "resetTokenExpiry", "senha", "suspensoAte", "telefone" FROM "Usuario";
DROP TABLE "Usuario";
ALTER TABLE "new_Usuario" RENAME TO "Usuario";
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");
CREATE UNIQUE INDEX "Usuario_googleId_key" ON "Usuario"("googleId");
CREATE UNIQUE INDEX "Usuario_resetToken_key" ON "Usuario"("resetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
