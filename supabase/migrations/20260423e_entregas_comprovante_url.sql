-- Adiciona coluna `comprovante_url` em entregas pra anexar foto/imagem do
-- comprovante (recibo, ticket, foto da assinatura, etc.) e mostrar inline
-- no card em vez de so um link.
--
-- A flag booleana `comprovante_lancado` continua sendo o checkbox manual
-- ("a Bia confirmou que recebeu o comprovante"). A nova URL e opcional —
-- vendedor cola um link de imagem (Drive, WhatsApp, etc.) ou deixa vazio.

ALTER TABLE entregas
  ADD COLUMN IF NOT EXISTS comprovante_url TEXT;
