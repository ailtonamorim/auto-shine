-- AlterTable
ALTER TABLE "Agendamento" ADD COLUMN "codigoRetirada" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Agendamento_codigoRetirada_key" ON "Agendamento"("codigoRetirada");
