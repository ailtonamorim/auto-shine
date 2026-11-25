-- Junção dos projetos (23/11/2026).
-- 1) Recoloca a unicidade de e-mail, CPF e Google ID que a migration
--    20260928010000_use_hmac_indexes_for_uniqueness removeu sem criar substituto.
--    Login, cadastro e verificação de e-mail dependem dela.
-- 2) Remove o índice "1 reserva por horário" que o servidor antigo criava ao iniciar
--    (garantirIndicesBanco). Ele impedia a capacidade simultânea da agenda.
--
-- Se houver contas duplicadas, a migration para sem alterar nada e informa os IDs
-- (nunca o e-mail ou CPF). Resolva os duplicados e rode `npx prisma migrate deploy` de novo.

DO $$
DECLARE
  duplicados TEXT;
BEGIN
  SELECT string_agg(item, '; ') INTO duplicados FROM (
    SELECT 'Usuario e-mail repetido nos ids ' || string_agg(id::TEXT, ',' ORDER BY id) AS item
      FROM "Usuario" WHERE "email" IS NOT NULL GROUP BY "email" HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'Usuario CPF repetido nos ids ' || string_agg(id::TEXT, ',' ORDER BY id)
      FROM "Usuario" WHERE "cpf" IS NOT NULL GROUP BY "cpf" HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'Usuario Google ID repetido nos ids ' || string_agg(id::TEXT, ',' ORDER BY id)
      FROM "Usuario" WHERE "googleId" IS NOT NULL GROUP BY "googleId" HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'Dono e-mail repetido nos ids ' || string_agg(id::TEXT, ',' ORDER BY id)
      FROM "Dono" WHERE "email" IS NOT NULL GROUP BY "email" HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'Dono Google ID repetido nos ids ' || string_agg(id::TEXT, ',' ORDER BY id)
      FROM "Dono" WHERE "googleId" IS NOT NULL GROUP BY "googleId" HAVING COUNT(*) > 1
  ) AS repetidos;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION 'Contas duplicadas impedem recolocar a regra de unicidade: %', duplicados;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_cpf_key" ON "Usuario"("cpf");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_googleId_key" ON "Usuario"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_email_key" ON "Dono"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Dono_googleId_key" ON "Dono"("googleId");

DROP INDEX IF EXISTS "Agendamento_lojaId_data_hora_ativo_key";
