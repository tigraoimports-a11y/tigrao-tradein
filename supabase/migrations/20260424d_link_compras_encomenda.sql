-- Adiciona suporte a tipo ENCOMENDA no link_compras. Antes o tipo so
-- aceitava COMPRA ou TROCA. Agora admin pode gerar link de encomenda
-- com sinal antecipado e previsao de chegada — cliente paga o sinal,
-- a encomenda fica registrada em `encomendas` e a responsavel recebe
-- notificacao no WhatsApp.
--
-- Novos campos:
--   previsao_chegada  — texto livre ("15-30 dias", "2 semanas")
--   sinal_pct          — percentual do valor cobrado de sinal (default 50)
--
-- tipo continua TEXT sem CHECK constraint (pra manter compatibilidade
-- com link_compras existentes). Valores possiveis agora: COMPRA / TROCA /
-- ENCOMENDA.

ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS previsao_chegada TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS sinal_pct NUMERIC(5,2);
