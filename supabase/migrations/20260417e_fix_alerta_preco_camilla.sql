-- Marca simulacoes da CAMILLA (21999757413) como alerta_preco_enviado=true
--
-- Motivo: cliente ja comprou iPhone 17 256GB em 03/04/2026 (venda CAMILLA
-- PIMENTEL) mas recebeu mensagem de queda de preco do mesmo produto em 17/04.
--
-- Mesmo bug do cron de follow-up: janela curta de 30 dias em vendas + match
-- so por nome completo ("CAMILLA" != "CAMILLA PIMENTEL"). Foi corrigido no
-- codigo do cron. Esta migration evita envio acidental ate deploy.

UPDATE simulacoes
SET alerta_preco_enviado = true
WHERE whatsapp = '21999757413'
  AND (alerta_preco_enviado IS NULL OR alerta_preco_enviado = false);
