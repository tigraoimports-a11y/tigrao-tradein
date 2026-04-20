-- Seed inicial da lista de produtos da Calculadora de Importacao no
-- app_settings. Antes os pesos estavam hardcoded no componente React.
-- Agora admin edita via UI e salva no banco.

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'calc_importacao_produtos',
  '[
    { "cat": "MacBook", "nome": "MacBook Pro M5 14\"", "peso": 3.0 },
    { "cat": "MacBook", "nome": "MacBook Pro M4 Pro 14\"", "peso": 3.0 },
    { "cat": "MacBook", "nome": "MacBook Air M4 15\"", "peso": 3.0 },
    { "cat": "MacBook", "nome": "MacBook Air M5 13\"", "peso": 3.0 },
    { "cat": "iPad", "nome": "iPad A16", "peso": 1.0 },
    { "cat": "iPad", "nome": "iPad Air M3 11\"", "peso": 1.0 },
    { "cat": "iPad", "nome": "iPad Air M3 13\"", "peso": 1.0 },
    { "cat": "iPad", "nome": "iPad Pro M5 11\"", "peso": 1.0 },
    { "cat": "iPad", "nome": "iPad Pro M5 13\"", "peso": 1.0 },
    { "cat": "Mac", "nome": "Mac Mini M4", "peso": 1.06 },
    { "cat": "Mac", "nome": "Mac Mini M4 Pro", "peso": 2.0 }
  ]'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
