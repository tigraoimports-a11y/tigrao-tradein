-- Encomendas v2: campos expandidos + troca + vínculos

-- Novos campos de cliente
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS complemento TEXT;

-- Produto encomendado (estruturado)
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS armazenamento TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS previsao_chegada DATE;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS obs_financeira TEXT;

-- Troca 1
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_produto TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_cor TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_categoria TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_armazenamento TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_bateria TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_grade TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_caixa TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_cabo TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_fonte TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_pulseira TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_ciclos TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_obs TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_valor NUMERIC DEFAULT 0;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_serial TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_imei TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_garantia TEXT;

-- Troca 2
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_produto2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_cor2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_categoria2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_valor2 NUMERIC DEFAULT 0;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_bateria2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_grade2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_caixa2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_cabo2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_fonte2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_obs2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_serial2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_imei2 TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS troca_garantia2 TEXT;

-- Vínculos
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS estoque_id UUID;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS venda_id UUID;

-- Status expandido (adiciona CHEGOU, PRONTO_ENTREGA, FINALIZADO)
ALTER TABLE encomendas DROP CONSTRAINT IF EXISTS encomendas_status_check;
ALTER TABLE encomendas ADD CONSTRAINT encomendas_status_check
  CHECK (status IN ('PENDENTE','COMPRADO','A CAMINHO','CHEGOU','PRONTO_ENTREGA','FINALIZADO','CANCELADA'));

-- FK no estoque para rastreabilidade reversa
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS encomenda_id UUID;
CREATE INDEX IF NOT EXISTS idx_estoque_encomenda ON estoque(encomenda_id) WHERE encomenda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_encomendas_estoque ON encomendas(estoque_id) WHERE estoque_id IS NOT NULL;

-- Adicionar ENCOMENDA como origem válida em vendas
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_origem_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_origem_check
  CHECK (origem IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO','ENCOMENDA'));
