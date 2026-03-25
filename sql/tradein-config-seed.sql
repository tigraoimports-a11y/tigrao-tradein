-- Criar tabela tradein_config (single-row, configurações do formulário trade-in)
CREATE TABLE IF NOT EXISTS tradein_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seminovos JSONB NOT NULL DEFAULT '[]',
  labels JSONB NOT NULL DEFAULT '{}',
  origens JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed com valores padrão atuais
INSERT INTO tradein_config (seminovos, labels, origens) VALUES (
  '[
    {"modelo": "iPhone 15 Pro", "storages": ["128GB", "256GB"], "ativo": true},
    {"modelo": "iPhone 15 Pro Max", "storages": ["256GB", "512GB"], "ativo": true},
    {"modelo": "iPhone 16 Pro", "storages": ["128GB", "256GB"], "ativo": true},
    {"modelo": "iPhone 16 Pro Max", "storages": ["256GB"], "ativo": true}
  ]',
  '{
    "step1_titulo": "Qual é o modelo do seu usado?",
    "step2_titulo": "Voce deseja comprar um...",
    "lacrado_label": "Lacrado",
    "lacrado_desc": "Novo, na caixa",
    "seminovo_label": "Seminovo",
    "seminovo_desc": "Revisado, com garantia",
    "seminovo_info": "Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp.",
    "step3_nome_label": "Seu nome",
    "step3_nome_placeholder": "Como podemos te chamar?",
    "step3_whatsapp_label": "WhatsApp com DDD",
    "step3_whatsapp_placeholder": "(21) 99999-9999",
    "step3_instagram_label": "Instagram (opcional)",
    "step3_instagram_placeholder": "@seuperfil",
    "step3_origem_label": "Como nos encontrou? (opcional)"
  }',
  '["Anúncio", "Story", "Direct", "WhatsApp", "Indicação", "Já sou cliente"]'
);

-- RLS: leitura pública, escrita pelo service role
ALTER TABLE tradein_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública tradein_config"
  ON tradein_config FOR SELECT
  USING (true);

CREATE POLICY "Service role update tradein_config"
  ON tradein_config FOR UPDATE
  USING (true)
  WITH CHECK (true);
