-- Remove tabelas do Pluggy/Open Finance
--
-- Decidimos abandonar Pluggy depois que vimos que Itau Empresas usa
-- scraping (credenciais armazenadas no Pluggy) ao inves de Open Finance
-- oficial. Risco demais pra conta empresarial. Voltamos a digitacao
-- manual de saldos via /admin/auditoria.
--
-- As migrations 20260425d (criou tabelas) e 20260425e (grants) ficam no
-- historico — padrao do projeto e nunca apagar migration que ja rodou.
-- Esta migration apenas faz DROP idempotente.

DROP TABLE IF EXISTS bancos_saldos_historico CASCADE;
DROP TABLE IF EXISTS bancos_conexoes CASCADE;
