ALTER TABLE "Loja"
ADD COLUMN "inativoAte" TIMESTAMP(3);

CREATE INDEX "Loja_inativoAte_idx" ON "Loja"("inativoAte");
