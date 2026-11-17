ALTER TABLE "Loja"
ADD COLUMN "inativoAte" DATETIME;

CREATE INDEX "Loja_inativoAte_idx" ON "Loja"("inativoAte");
