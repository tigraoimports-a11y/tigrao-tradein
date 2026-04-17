-- Marca simulacoes da CAMILLA (21999757413) como follow_up_enviado=true
--
-- Motivo: cliente ja fechou pedido (venda CAMILLA PIMENTEL em 04/04/2026), mas
-- tinha multiplas simulacoes com status=SAIR no dia 03/04/2026. O bot de
-- follow-up nao identificou que ela era cliente convertida porque:
--   1. Janela de busca de vendas era de apenas 3 dias
--   2. Match era so por nome completo ("CAMILLA" != "CAMILLA PIMENTEL")
--   3. Nao considerava outros status=GOSTEI do mesmo telefone
--
-- O bug foi corrigido no cron. Esta migration evita envio acidental ate deploy.

UPDATE simulacoes
SET follow_up_enviado = true
WHERE whatsapp = '21999757413'
  AND status = 'SAIR'
  AND follow_up_enviado = false;
