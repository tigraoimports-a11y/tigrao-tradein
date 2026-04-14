-- Recuperar produto da troca da cliente MARCELA DA COSTA PEREIRA MIRANDA
-- iPhone 15 Pro 128GB Natural Titanium — serial KWPQCWNCWP, IMEI 352603484622183
-- Pendência foi deletada quando a venda foi desfeita e relançada
INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, cor, bateria, serial_no, imei, cliente, fornecedor, data_compra, observacao, updated_at)
SELECT
  'IPHONE 15 PRO 128GB NATURAL TITANIUM',
  'IPHONES',
  1,
  3100,
  'PENDENTE',
  'PENDENCIA',
  'TITANIO NATURAL',
  86,
  'KWPQCWNCWP',
  '352603484622183',
  'MARCELA DA COSTA PEREIRA MIRANDA',
  'MARCELA DA COSTA PEREIRA MIRANDA',
  '2026-04-11',
  NULL,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM estoque WHERE serial_no = 'KWPQCWNCWP' AND tipo = 'PENDENCIA'
);
