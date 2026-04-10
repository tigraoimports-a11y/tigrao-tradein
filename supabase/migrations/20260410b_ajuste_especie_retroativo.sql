-- ============================================================
-- AJUSTE RETROATIVO: Vendas em espécie + Depósitos
-- ============================================================
--
-- Problema: vendas em dinheiro não estavam com forma=DINHEIRO/banco=ESPECIE
-- e depósitos estavam como tipo=SAIDA ao invés de TRANSFERENCIA.
--
-- Este script corrige os registros existentes.
-- ============================================================

-- ============ 1. CORRIGIR VENDAS EM ESPÉCIE — MARÇO/2026 ============

-- 19/03 — Diana Alicia F. Doctorovich — R$ 3.900
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-19' AND cpf = '873.412.638-49' AND preco_vendido = 3900;

-- 20/03 — Jefferson Alves Pimenta — R$ 2.300
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-20' AND cpf = '077.094.337-31' AND preco_vendido = 2300;

-- 20/03 — Fábio Rodrigo Vaz da Silva — R$ 2.000
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-20' AND cpf = '097.103.597-03' AND preco_vendido = 2000;

-- 24/03 — Michelina Colucci — R$ 8.000
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-24' AND cpf = '108.052.007-46' AND preco_vendido = 8000;

-- 26/03 — Thomaz Magno — R$ 5.200
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-26' AND cpf = '124.451.527-20' AND preco_vendido = 5200;

-- 30/03 — Flavio Gervasoni — R$ 200
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-30' AND cpf = '192.787.207-39' AND preco_vendido = 200;

-- 31/03 — Luana Bandeira Rocha — R$ 9.800
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-03-31' AND cpf = '071.781.056-90' AND preco_vendido = 9800;

-- ============ 2. CORRIGIR VENDAS EM ESPÉCIE — ABRIL/2026 ============

-- 01/04 — Marcelo Bispo Chaves — R$ 7.800
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-04-01' AND cpf = '090.482.657-03' AND preco_vendido = 7800;

-- 02/04 — Sara Silva Cid Farias — R$ 1.500
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-04-02' AND cpf = '126.267.507-35' AND preco_vendido = 1500;

-- 02/04 — Nicole Goldstein — R$ 2.250
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-04-02' AND cpf = '182.640.457-07' AND preco_vendido = 2250;

-- 08/04 — Mauro Mantuano — R$ 697
UPDATE vendas SET forma = 'DINHEIRO', banco = 'ESPECIE', recebimento = 'D+0'
WHERE data = '2026-04-08' AND cpf = '033.974.517-79' AND preco_vendido = 697;

-- ============ 3. CORRIGIR DEPÓSITOS — TIPO TRANSFERENCIA ============

-- Depósito 28/03 — R$ 21.400
UPDATE gastos SET tipo = 'TRANSFERENCIA'
WHERE data = '2026-03-28' AND valor = 21400 AND is_dep_esp = true AND tipo = 'SAIDA';

-- Depósito 05/04 — R$ 20.400
UPDATE gastos SET tipo = 'TRANSFERENCIA'
WHERE data = '2026-04-05' AND valor = 20400 AND is_dep_esp = true AND tipo = 'SAIDA';

-- Garantia extra: corrigir qualquer outro depósito antigo que ainda seja SAIDA
UPDATE gastos SET tipo = 'TRANSFERENCIA'
WHERE is_dep_esp = true AND tipo = 'SAIDA';
