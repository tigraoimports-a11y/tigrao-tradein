-- Devolver produto KVDH47DYC3 ao estoque (ficou ESGOTADO após troca de produto na edição de venda)
UPDATE estoque
SET status = 'EM ESTOQUE', qnt = 1, updated_at = NOW()
WHERE serial_no = 'KVDH47DYC3'
  AND status = 'ESGOTADO';
