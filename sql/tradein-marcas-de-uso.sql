-- Migration: Replace 3 separate condition questions with 2-step wear marks flow
-- Run this in Supabase SQL Editor

-- Step 1: Disable old questions (screenScratch, sideScratch, peeling)
UPDATE tradein_perguntas SET ativo = false, ordem = ordem + 10, updated_at = now()
WHERE slug IN ('screenScratch', 'sideScratch', 'peeling') AND device_type = 'iphone';

-- Step 2: Insert new "hasWearMarks" question (yesno)
INSERT INTO tradein_perguntas (slug, titulo, tipo, opcoes, ordem, ativo, config, device_type)
VALUES (
  'hasWearMarks',
  'Seu aparelho possui marcas de uso?',
  'yesno',
  '[{"value":"no","label":"Nao","discount":0,"variant":"success"},{"value":"yes","label":"Sim","discount":0}]',
  3, true, '{}', 'iphone'
);

-- Step 3: Insert new "wearMarks" multiselect question (conditional on hasWearMarks=yes)
INSERT INTO tradein_perguntas (slug, titulo, tipo, opcoes, ordem, ativo, config, device_type)
VALUES (
  'wearMarks',
  'Selecione as marcas de uso:',
  'multiselect',
  '[{"value":"screen_scratches","label":"Arranhoes na tela","discount":-200},{"value":"side_marks","label":"Marcas nas laterais","discount":-200},{"value":"light_peeling","label":"Descascado leve","discount":-200},{"value":"heavy_peeling","label":"Descascado forte","discount":-300}]',
  4, true, '{"dependsOn":"hasWearMarks","showWhenValue":"yes"}', 'iphone'
);

-- Step 4: Reorder remaining questions so they flow correctly
-- partsReplaced -> 5, hasWarranty -> 6, warrantyMonth -> 7, hasOriginalBox -> 8
UPDATE tradein_perguntas SET ordem = 5, updated_at = now() WHERE slug = 'partsReplaced' AND device_type = 'iphone';
UPDATE tradein_perguntas SET ordem = 6, updated_at = now() WHERE slug = 'hasWarranty' AND device_type = 'iphone';
UPDATE tradein_perguntas SET ordem = 7, updated_at = now() WHERE slug = 'warrantyMonth' AND device_type = 'iphone';
UPDATE tradein_perguntas SET ordem = 8, updated_at = now() WHERE slug = 'hasOriginalBox' AND device_type = 'iphone';
