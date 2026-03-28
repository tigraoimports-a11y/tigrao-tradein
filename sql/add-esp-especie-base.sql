-- Adicionar coluna esp_especie_base na tabela saldos_bancarios
-- Separa o saldo base da espécie (manhã) do saldo de fechamento (noite)
-- Antes, o campo esp_especie era usado para ambos, causando conflito ao fazer transferências

ALTER TABLE saldos_bancarios ADD COLUMN IF NOT EXISTS esp_especie_base NUMERIC DEFAULT 0;

-- Migrar dados existentes: copiar esp_especie para esp_especie_base nos registros que já existem
-- (assumimos que o valor atual de esp_especie era usado como base)
UPDATE saldos_bancarios
SET esp_especie_base = COALESCE(esp_especie, 0)
WHERE esp_especie_base = 0 OR esp_especie_base IS NULL;
