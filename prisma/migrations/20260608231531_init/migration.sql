-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "senha" TEXT,
    "googleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Dono" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "cnpj" TEXT,
    "senha" TEXT,
    "googleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Loja" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "precoMedio" REAL NOT NULL DEFAULT 0,
    "categoria" TEXT NOT NULL DEFAULT 'serviços gerais',
    "fotoUrl" TEXT NOT NULL,
    "capaUrl" TEXT,
    "fotosAdicionais" TEXT,
    "formasPagamento" TEXT NOT NULL DEFAULT 'Pix, Cartão, Dinheiro',
    "politicaCancelamento" TEXT NOT NULL DEFAULT 'Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.',
    "agendaDias" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
    "agendaHorarios" TEXT NOT NULL DEFAULT '08:00,09:30,11:00,13:30,15:00,16:30',
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "donoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loja_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Dono" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServicoLoja" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "preco" REAL NOT NULL,
    "duracao" TEXT NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServicoLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "data" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "veiculo" TEXT NOT NULL DEFAULT 'Carro',
    "notas" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "nomeCliente" TEXT,
    "emailCliente" TEXT,
    "usuarioId" INTEGER,
    "lojaId" INTEGER NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agendamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Agendamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ServicoLoja" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "fotoUrl" TEXT,
    "nomeCliente" TEXT,
    "usuarioId" INTEGER,
    "lojaId" INTEGER NOT NULL,
    "agendamentoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Avaliacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Avaliacao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Avaliacao_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Denuncia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalhes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
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

-- CreateTable
CREATE TABLE "Favorito" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorito_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorito_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");
CREATE UNIQUE INDEX "Usuario_googleId_key" ON "Usuario"("googleId");
CREATE UNIQUE INDEX "Dono_login_key" ON "Dono"("login");
CREATE UNIQUE INDEX "Dono_googleId_key" ON "Dono"("googleId");
CREATE UNIQUE INDEX "Avaliacao_agendamentoId_key" ON "Avaliacao"("agendamentoId");
CREATE UNIQUE INDEX "Favorito_usuarioId_lojaId_key" ON "Favorito"("usuarioId", "lojaId");
