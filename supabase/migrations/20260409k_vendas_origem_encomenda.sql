-- Adiciona 'ENCOMENDA' e 'NAO_INFORMARAM' ao constraint de origem das vendas
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_origem_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_origem_check
  CHECK (origem IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO','NAO_INFORMARAM','ENCOMENDA'));

-- Endereco do cliente na encomenda
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS complemento TEXT;

-- Converte nomes de clientes existentes em encomendas para CAIXA ALTA
UPDATE encomendas SET cliente = UPPER(cliente) WHERE cliente IS NOT NULL AND cliente <> UPPER(cliente);
