-- Adiciona campos pra prints de Nº de Série e IMEI dos aparelhos na troca
--
-- Motivo: evitar erro de digitação de IMEI/Serial pelo cliente e pelo admin.
-- Cliente tira 2 prints da tela "Ajustes > Geral > Sobre" do iPhone:
--   1. Print mostrando Nº de Série
--   2. Print mostrando IMEI
-- Esses prints ficam como prova visual dos dados do aparelho pro termo de procedência.
--
-- Aparelho 2 (quando tem 2 produtos na troca) tem seu próprio par de prints.

-- Tabela link_compras: cliente preenche via formulário público de compra
ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS troca_print_serial_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_imei_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_serial2_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_imei2_url TEXT;

-- Tabela vendas: propaga os prints quando a venda é criada a partir do link_compras
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS troca_print_serial_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_imei_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_serial2_url TEXT,
  ADD COLUMN IF NOT EXISTS troca_print_imei2_url TEXT;

COMMENT ON COLUMN link_compras.troca_print_serial_url IS 'Print tela Sobre do iPhone mostrando Nº de Série do aparelho 1 da troca';
COMMENT ON COLUMN link_compras.troca_print_imei_url IS 'Print tela Sobre mostrando IMEI do aparelho 1 da troca';
COMMENT ON COLUMN vendas.troca_print_serial_url IS 'Print do Nº de Série do aparelho 1 da troca (copiado do link_compras)';
COMMENT ON COLUMN vendas.troca_print_imei_url IS 'Print do IMEI do aparelho 1 da troca (copiado do link_compras)';
