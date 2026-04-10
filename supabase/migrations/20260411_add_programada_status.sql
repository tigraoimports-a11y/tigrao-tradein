-- Adiciona 'PROGRAMADA' como valor válido em status_pagamento
-- A constraint existente só permite FINALIZADO, AGUARDANDO, CANCELADO

ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_status_pagamento_check;

ALTER TABLE vendas ADD CONSTRAINT vendas_status_pagamento_check
  CHECK (status_pagamento IN ('FINALIZADO', 'AGUARDANDO', 'CANCELADO', 'PROGRAMADA'));
