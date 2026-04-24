-- Adiciona flags organizacionais de encomenda em `vendas`. Antes a
-- encomenda era uma tabela separada, mas o operador pediu "mesmo fluxo
-- de um link de compra de venda, so marcando organizacao" — venda vira
-- venda normal com 2 campos extras:
--
--   encomenda         — marca a venda como encomenda (agendada p/ chegada)
--   previsao_chegada  — texto livre com prazo apos pagamento (ex: "15 dias")
--
-- Admin pode filtrar /admin/vendas por essa flag pra acompanhar encomendas
-- em andamento separadas das vendas imediatas.

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS encomenda BOOLEAN DEFAULT FALSE;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS previsao_chegada TEXT;

CREATE INDEX IF NOT EXISTS idx_vendas_encomenda ON vendas (encomenda) WHERE encomenda = TRUE;
