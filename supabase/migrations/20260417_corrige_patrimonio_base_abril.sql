-- Corrige patrimonio base de abril/2026
--
-- Motivo: ao conferir com extratos bancários (01/04), descobriu-se que o
-- saldo do Infinite registrado na patrimonio_mensal estava subestimado em
-- R$ 17.342,35.
--
-- Sistema tinha: saldo Infinite = R$ 71.284,00
-- Extrato real: saldo Infinite = R$ 88.626,35 (fim do dia 31/03 = inicio 01/04)
--
-- Correcao:
--   saldos_base: 181.184,92 -> 198.527,27 (+17.342,35)
--   patrimonio_base: 1.381.030,92 -> 1.398.373,27 (+17.342,35)
--   estoque_base: sem alteracao

UPDATE patrimonio_mensal
SET
  saldos_base = 198527.27,
  patrimonio_base = 1398373.27,
  observacao = COALESCE(observacao || ' | ', '') || 'Corrigido 17/04: Infinite base +R$17.342,35 (conferido com extrato oficial)',
  updated_at = NOW()
WHERE mes = '2026-04';
