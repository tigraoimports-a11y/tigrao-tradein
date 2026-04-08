-- Adiciona colunas de pagamento detalhado em entregas pra mostrar entrada/parcelas/total
-- separadamente (antes era só forma_pagamento texto + valor numérico).

alter table entregas add column if not exists entrada numeric;
alter table entregas add column if not exists parcelas integer;
alter table entregas add column if not exists valor_total numeric;
