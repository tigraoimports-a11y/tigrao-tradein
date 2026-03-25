-- Criar tabela tradein_perguntas
CREATE TABLE IF NOT EXISTS tradein_perguntas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  opcoes JSONB NOT NULL DEFAULT '[]',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}',
  device_type TEXT NOT NULL DEFAULT 'iphone',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tradein_perguntas_device_ordem ON tradein_perguntas(device_type, ordem);

-- Seed: 9 perguntas padrão do trade-in iPhone
INSERT INTO tradein_perguntas (slug, titulo, tipo, opcoes, ordem, ativo, config, device_type) VALUES
(
  'hasDamage',
  'O aparelho esta trincado, quebrado ou com defeito?',
  'yesno',
  '[{"value":"no","label":"Nao","discount":0,"variant":"success"},{"value":"yes","label":"Sim","discount":0,"variant":"error","reject":true,"rejectMessage":"Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca."}]',
  1, true, '{}', 'iphone'
),
(
  'battery',
  'Saude da bateria',
  'numeric',
  '[]',
  2, true,
  '{"min":1,"max":100,"unit":"%","placeholder":"Ex: 87","helpText":"Ajustes > Bateria > Saude da Bateria","thresholds":[{"below":85,"discount":-200}]}',
  'iphone'
),
(
  'screenScratch',
  'Riscos na tela',
  'selection',
  '[{"value":"none","label":"Nenhum","discount":0},{"value":"one","label":"1 risco","discount":-100},{"value":"multiple","label":"2 ou mais","discount":-250}]',
  3, true, '{}', 'iphone'
),
(
  'sideScratch',
  'Riscos laterais',
  'selection',
  '[{"value":"none","label":"Nenhum","discount":0},{"value":"one","label":"1 risco","discount":-100},{"value":"multiple","label":"2 ou mais","discount":-250}]',
  4, true, '{}', 'iphone'
),
(
  'peeling',
  'Descascado / Amassado',
  'selection',
  '[{"value":"none","label":"Nao","discount":0},{"value":"light","label":"Leve","discount":-200},{"value":"heavy","label":"Forte","discount":-300}]',
  5, true, '{}', 'iphone'
),
(
  'partsReplaced',
  'O aparelho ja teve alguma peca trocada?',
  'selection',
  '[{"value":"no","label":"Nao","discount":0,"variant":"success"},{"value":"apple","label":"Sim, na Apple (autorizada)","discount":0,"variant":"success"},{"value":"thirdParty","label":"Sim, fora da Apple","discount":0,"variant":"error","reject":true,"rejectMessage":"Infelizmente nao aceitamos aparelhos com pecas trocadas fora da rede autorizada Apple."}]',
  6, true,
  '{"showDetailInputOnValue":"apple","detailPlaceholder":"Ex: Tela, Bateria, Alto-falante..."}',
  'iphone'
),
(
  'hasWarranty',
  'Ainda esta na garantia Apple de 12 meses?',
  'yesno',
  '[{"value":"yes","label":"Sim","discount":0,"variant":"success"},{"value":"no","label":"Nao","discount":0}]',
  7, true, '{}', 'iphone'
),
(
  'warrantyMonth',
  'Ate qual mes vai a garantia do seu aparelho?',
  'conditional_date',
  '[]',
  8, true,
  '{"dependsOn":"hasWarranty","showWhenValue":"yes","bonuses":{"ate3m":0.03,"de3a6m":0.05,"acima6m":0.07}}',
  'iphone'
),
(
  'hasOriginalBox',
  'Ainda tem a caixa original do aparelho?',
  'yesno',
  '[{"value":"yes","label":"Sim","discount":0,"variant":"success"},{"value":"no","label":"Nao","discount":-100}]',
  9, true, '{}', 'iphone'
);
