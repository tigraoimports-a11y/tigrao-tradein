-- Adiciona tipo TRANSFERENCIA na tabela gastos
-- Depositos de especie → banco agora usam TRANSFERENCIA ao inves de SAIDA
-- Isso corrige o calculo de lucro que contava depositos como gastos

-- 1) Remove o check constraint antigo
ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_tipo_check;

-- 2) Recria com o novo valor TRANSFERENCIA
ALTER TABLE gastos ADD CONSTRAINT gastos_tipo_check CHECK (tipo IN ('SAIDA','ENTRADA','TRANSFERENCIA'));

-- 3) Corrige registros existentes: depositos de especie que eram SAIDA viram TRANSFERENCIA
UPDATE gastos
SET tipo = 'TRANSFERENCIA'
WHERE is_dep_esp = true AND tipo = 'SAIDA';

-- 4) Corrige tambem os que usavam categoria TRANSFERENCIA ou DEPOSITO ESPECIE como tipo SAIDA
UPDATE gastos
SET tipo = 'TRANSFERENCIA'
WHERE tipo = 'SAIDA' AND categoria IN ('TRANSFERENCIA', 'DEPOSITO ESPECIE');
