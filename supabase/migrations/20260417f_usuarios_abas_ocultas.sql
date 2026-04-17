-- Adiciona coluna abas_ocultas na tabela usuarios
--
-- Motivo: permitir que cada usuario oculte abas do menu lateral que nao usa.
-- E so uma preferencia visual — nao bloqueia acesso direto via URL.
--
-- Estrutura: array JSONB com os hrefs das abas a ocultar.
-- Exemplo: ["/admin/etiquetas", "/admin/analytics-vendas"]

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS abas_ocultas JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN usuarios.abas_ocultas IS 'Array de hrefs das abas do menu lateral que o usuario quer ocultar (preferencia visual apenas, nao bloqueia acesso)';
