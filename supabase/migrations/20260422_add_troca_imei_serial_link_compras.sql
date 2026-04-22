-- Adiciona campos digitáveis de IMEI e Nº de Série na tabela link_compras
--
-- Motivo: hoje o cliente anexa 2 prints (serial + IMEI) da tela Ajustes > Sobre,
-- mas o número em si não fica digitado em lugar nenhum — a equipe tem que olhar
-- a imagem e transcrever manualmente pro contrato/venda. Passamos a pedir o
-- cliente digitar os números E anexar o print (o print vira comprovação visual).
--
-- Esses campos vão aparecer na mensagem de WhatsApp do formulário, abaixo da
-- seção "APARELHO NA TROCA", pra facilitar a conferência pelo atendente.
--
-- Aparelho 2 existe quando o cliente troca 2 produtos (trocaProduto2Param).

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS troca_imei    TEXT,
  ADD COLUMN IF NOT EXISTS troca_serial  TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei2   TEXT,
  ADD COLUMN IF NOT EXISTS troca_serial2 TEXT;

COMMENT ON COLUMN link_compras.troca_imei IS 'IMEI digitado pelo cliente (aparelho 1 da troca). Print em troca_print_imei_url serve como prova visual.';
COMMENT ON COLUMN link_compras.troca_serial IS 'Nº de Série digitado pelo cliente (aparelho 1 da troca).';
COMMENT ON COLUMN link_compras.troca_imei2 IS 'IMEI digitado pelo cliente (aparelho 2, quando há 2 produtos na troca).';
COMMENT ON COLUMN link_compras.troca_serial2 IS 'Nº de Série digitado pelo cliente (aparelho 2).';
