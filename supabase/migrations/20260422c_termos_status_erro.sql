-- Adiciona status 'ERRO' em termos_procedencia
--
-- Motivo: agora /compra dispara geração de termo automática em fire-and-forget
-- quando o cliente termina o formulário. Se a geração do PDF ou chamada ZapSign
-- falhar, precisamos marcar o termo com status distintivo pra equipe ver em
-- /admin/vendas e poder tentar de novo. Sem status 'ERRO', a única opção seria
-- manter 'PENDENTE' (que já tem outro significado: aguardando admin gerar) ou
-- não criar registro nenhum — dos dois, nenhum ajuda a equipe a agir.

ALTER TABLE termos_procedencia DROP CONSTRAINT IF EXISTS termos_procedencia_status_check;

ALTER TABLE termos_procedencia ADD CONSTRAINT termos_procedencia_status_check
  CHECK (status IN ('PENDENTE','GERADO','ENVIADO','ASSINADO','ERRO'));
