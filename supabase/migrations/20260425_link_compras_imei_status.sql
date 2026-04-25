-- IMEI antifraude (Abr/2026)
-- Adiciona colunas pra guardar resultado da consulta Infosimples (Anatel/Celular Legal)
-- pra cada IMEI extraido do print pelo OCR. Roda automatico no upload-print.
--
-- Status possiveis:
--   'OK'         → aparelho regular, sem restricao (pode comprar)
--   'BLOQUEADO'  → aparelho com restricao (roubo, furto, perda) — NAO COMPRAR
--   'ERRO'       → consulta falhou (Infosimples fora, IMEI invalido, etc) — consultar manual
--   NULL         → ainda nao consultado (IMEI nao extraido ou print nao enviado)
--
-- Usado em /admin/simulacoes (modal de prints), /admin/vendas (info do produto na troca)
-- e na mensagem WhatsApp que vai pro vendedor quando cliente fecha o pedido.

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS troca_imei_status TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei_consulta_data TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS troca_imei_consulta_detalhes TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei2_status TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei2_consulta_data TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS troca_imei2_consulta_detalhes TEXT;

-- Constraint pra garantir valores validos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'link_compras_troca_imei_status_check') THEN
    ALTER TABLE link_compras
      ADD CONSTRAINT link_compras_troca_imei_status_check
      CHECK (troca_imei_status IS NULL OR troca_imei_status IN ('OK', 'BLOQUEADO', 'ERRO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'link_compras_troca_imei2_status_check') THEN
    ALTER TABLE link_compras
      ADD CONSTRAINT link_compras_troca_imei2_status_check
      CHECK (troca_imei2_status IS NULL OR troca_imei2_status IN ('OK', 'BLOQUEADO', 'ERRO'));
  END IF;
END $$;

-- Indice pra facilitar filtros admin tipo "mostrar so bloqueados"
CREATE INDEX IF NOT EXISTS idx_link_compras_imei_status ON link_compras (troca_imei_status) WHERE troca_imei_status IS NOT NULL;

COMMENT ON COLUMN link_compras.troca_imei_status IS 'Resultado consulta Anatel/Celular Legal via Infosimples: OK | BLOQUEADO | ERRO';
COMMENT ON COLUMN link_compras.troca_imei_consulta_detalhes IS 'Mensagem completa da consulta (responsavel, motivo do bloqueio, etc)';
