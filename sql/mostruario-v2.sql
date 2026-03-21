-- ============================================
-- Mostruario V2 — Tabelas independentes do estoque
-- TigraoImports
-- ============================================

-- Categorias do mostruario (independente)
CREATE TABLE IF NOT EXISTS loja_categorias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  emoji TEXT DEFAULT '📦',
  ordem INTEGER DEFAULT 0,
  visivel BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO loja_categorias (nome, slug, emoji, ordem) VALUES
  ('iPhone', 'iphones', '📱', 1),
  ('MacBook', 'macbooks', '💻', 2),
  ('iPad', 'ipads', '📲', 3),
  ('AirPods', 'airpods', '🎧', 4),
  ('Apple Watch', 'apple-watch', '⌚', 5),
  ('Mac Mini', 'mac-mini', '🖥️', 6),
  ('Acessórios', 'acessorios', '🔌', 7)
ON CONFLICT (slug) DO NOTHING;

-- Produtos do mostruario
CREATE TABLE IF NOT EXISTS loja_produtos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  categoria_id uuid REFERENCES loja_categorias(id),
  descricao TEXT,
  descricao_curta TEXT,
  imagem_url TEXT,
  tags TEXT[], -- ex: ['Novo', 'Lacrado', '1 ano garantia', 'Nota Fiscal']
  destaque BOOLEAN DEFAULT FALSE,
  visivel BOOLEAN DEFAULT TRUE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variacoes de produto (storage, cor, RAM, chip, etc — totalmente flexivel)
CREATE TABLE IF NOT EXISTS loja_variacoes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES loja_produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, -- ex: "256GB Titanio Natural", "512GB/16GB Prata"
  atributos JSONB DEFAULT '{}', -- ex: {"storage": "256GB", "cor": "Titanio Natural", "ram": "16GB"}
  preco NUMERIC NOT NULL DEFAULT 0,
  preco_parcelado NUMERIC, -- se null, calcula automaticamente
  imagem_url TEXT, -- imagem especifica da variacao (opcional)
  visivel BOOLEAN DEFAULT TRUE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE loja_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_variacoes ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "public read loja_categorias" ON loja_categorias FOR SELECT USING (true);
CREATE POLICY "public read loja_produtos" ON loja_produtos FOR SELECT USING (true);
CREATE POLICY "public read loja_variacoes" ON loja_variacoes FOR SELECT USING (true);

-- Service write policies (service role key)
CREATE POLICY "service write loja_categorias" ON loja_categorias FOR ALL USING (true);
CREATE POLICY "service write loja_produtos" ON loja_produtos FOR ALL USING (true);
CREATE POLICY "service write loja_variacoes" ON loja_variacoes FOR ALL USING (true);
