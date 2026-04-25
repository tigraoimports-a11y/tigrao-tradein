-- Garante que as colunas vendas.cor, vendas.categoria e vendas.observacao
-- existem. Essas colunas sao preenchidas via copia do estoque na criacao da
-- venda (POST /api/vendas) e usadas pelo display pra mostrar o nome completo
-- do produto (incluindo cor) na aba Em Andamento / Finalizadas / Historico.
--
-- Contexto: descobrimos que algumas vendas nao tinham cor no display mesmo
-- apos varios fixes. A causa raiz era que a coluna vendas.cor nao existia
-- ou nao era populada. Esta migration cria a coluna (idempotente) e depois
-- o backend passa a copiar cor/categoria/observacao do estoque a cada venda
-- criada com estoque_id.
--
-- Tambem ha um endpoint de backfill (/api/admin/vendas/backfill-cor) pra
-- preencher as vendas historicas.

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS cor TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS observacao TEXT;

-- Forca PostgREST a recarregar schema cache pra evitar PGRST204 em rotas
-- que fazem insert com essas colunas.
NOTIFY pgrst, 'reload schema';
