-- Regenera detalhes_upgrade das entregas PENDENTE com trade-in, aplicando
-- a mesma formatacao do encaminhar-entrega pos-fix:
--   - Traduz cores EN->PT (Midnight -> Preto, Black -> Preto, etc)
--   - Nao duplica cor
--   - Inclui flags: Grade X, Com/Sem caixa/cabo/fonte, pulseira, ciclos
--
-- Escopo: so entregas PENDENTE (nao mexe em entregues/canceladas).
-- Idempotente.

-- Helper 1: traduz cores EN comuns pra PT dentro de um texto
CREATE OR REPLACE FUNCTION pg_temp.normaliza_cores_pt(s TEXT) RETURNS TEXT AS $$
DECLARE
  result TEXT := s;
  en TEXT;
  pt TEXT;
  -- Ordenado por comprimento desc pra evitar match parcial ("Rose Gold" antes de "Gold").
  pairs TEXT[][] := ARRAY[
    ['Black Titanium',   'Titânio Preto'],
    ['Blue Titanium',    'Titânio Azul'],
    ['Desert Titanium',  'Titânio Deserto'],
    ['Natural Titanium', 'Titânio Natural'],
    ['White Titanium',   'Titânio Branco'],
    ['Midnight Green',   'Verde'],
    ['Space Black',      'Preto'],
    ['Space Gray',       'Cinza'],
    ['Jet Black',        'Preto'],
    ['Rose Gold',        'Dourado'],
    ['Deep Purple',      'Roxo'],
    ['Cosmic Orange',    'Laranja'],
    ['Sky Blue',         'Azul'],
    ['Mist Blue',        'Azul'],
    ['Sierra Blue',      'Azul'],
    ['Pacific Blue',     'Azul'],
    ['Deep Blue',        'Azul'],
    ['Alpine Green',     'Verde'],
    ['Light Gold',       'Dourado'],
    ['Cloud White',      'Branco'],
    ['Midnight',         'Preto'],
    ['Starlight',        'Estelar'],
    ['Black',            'Preto'],
    ['White',            'Branco'],
    ['Blue',             'Azul'],
    ['Green',            'Verde'],
    ['Silver',           'Prata'],
    ['Graphite',         'Cinza'],
    ['Slate',            'Cinza'],
    ['Gold',             'Dourado'],
    ['Purple',           'Roxo'],
    ['Lavender',         'Roxo'],
    ['Pink',             'Rosa'],
    ['Blush',            'Rosa'],
    ['Orange',           'Laranja'],
    ['Yellow',           'Amarelo'],
    ['Citrus',           'Amarelo'],
    ['Red',              'Vermelho'],
    ['Teal',             'Verde'],
    ['Sage',             'Verde'],
    ['Indigo',           'Azul'],
    ['Ultramarine',      'Azul']
  ];
  i INT;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    en := pairs[i][1];
    pt := pairs[i][2];
    result := regexp_replace(result, '\m' || en || '\M', pt, 'gi');
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper 2: formata valor "1300" (ou "R$ 1.300") como "1.300"
CREATE OR REPLACE FUNCTION pg_temp.fmt_valor(v TEXT) RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  IF v IS NULL THEN RETURN '0'; END IF;
  digits := regexp_replace(v, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN '0'; END IF;
  -- Separador de milhares via reverse (PG nao tem lookahead)
  RETURN reverse(regexp_replace(reverse(digits), '(\d{3})(?=\d)', '\1.', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper 3: monta string de flags
CREATE OR REPLACE FUNCTION pg_temp.flags_troca(
  grade TEXT, caixa TEXT, cabo TEXT, fonte TEXT, pulseira TEXT, ciclos TEXT
) RETURNS TEXT AS $$
DECLARE
  parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF grade IS NOT NULL AND grade <> '' THEN parts := array_append(parts, 'Grade ' || grade); END IF;
  IF caixa = 'SIM' THEN parts := array_append(parts, 'Com caixa');
  ELSIF caixa = 'NAO' THEN parts := array_append(parts, 'Sem caixa'); END IF;
  IF cabo = 'SIM' THEN parts := array_append(parts, 'Com cabo');
  ELSIF cabo = 'NAO' THEN parts := array_append(parts, 'Sem cabo'); END IF;
  IF fonte = 'SIM' THEN parts := array_append(parts, 'Com fonte');
  ELSIF fonte = 'NAO' THEN parts := array_append(parts, 'Sem fonte'); END IF;
  IF pulseira = 'SIM' THEN parts := array_append(parts, 'Com pulseira'); END IF;
  IF ciclos IS NOT NULL AND ciclos <> '' THEN parts := array_append(parts, ciclos || ' ciclos'); END IF;
  RETURN array_to_string(parts, ' | ');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper 4: monta uma parte (troca 1 ou troca 2)
CREATE OR REPLACE FUNCTION pg_temp.build_parte(
  produto TEXT, valor TEXT, bateria TEXT, obs TEXT,
  grade TEXT, caixa TEXT, cabo TEXT, fonte TEXT, pulseira TEXT, ciclos TEXT
) RETURNS TEXT AS $$
DECLARE
  nome TEXT;
  flags TEXT;
  bat TEXT := '';
  obs_fmt TEXT := '';
  flags_fmt TEXT := '';
BEGIN
  IF produto IS NULL OR produto = '' THEN RETURN NULL; END IF;
  nome := pg_temp.normaliza_cores_pt(produto);
  IF bateria IS NOT NULL AND bateria <> '' THEN bat := ' (Bat: ' || bateria || '%)'; END IF;
  flags := pg_temp.flags_troca(grade, caixa, cabo, fonte, pulseira, ciclos);
  IF flags <> '' THEN flags_fmt := ' | ' || flags; END IF;
  IF obs IS NOT NULL AND obs <> '' THEN obs_fmt := ' ' || obs; END IF;
  RETURN nome || ' — R$ ' || pg_temp.fmt_valor(valor) || bat || flags_fmt || obs_fmt;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Regenera detalhes_upgrade
UPDATE entregas e
SET detalhes_upgrade = sub.novo_texto
FROM (
  SELECT
    e.id,
    array_to_string(
      ARRAY(SELECT x FROM unnest(ARRAY[
        pg_temp.build_parte(
          v.troca_produto,  v.produto_na_troca::TEXT,  v.troca_bateria,  v.troca_obs,
          v.troca_grade,  v.troca_caixa,  v.troca_cabo,  v.troca_fonte,  v.troca_pulseira,  v.troca_ciclos
        ),
        pg_temp.build_parte(
          v.troca_produto2, v.produto_na_troca2::TEXT, v.troca_bateria2, v.troca_obs2,
          v.troca_grade2, v.troca_caixa2, v.troca_cabo2, v.troca_fonte2, v.troca_pulseira2, v.troca_ciclos2
        )
      ]) x WHERE x IS NOT NULL),
      ' + '
    ) AS novo_texto
  FROM entregas e
  JOIN vendas v ON v.id = e.venda_id
  WHERE e.status = 'PENDENTE'
    AND e.venda_id IS NOT NULL
    AND (v.troca_produto IS NOT NULL OR v.troca_produto2 IS NOT NULL)
) sub
WHERE e.id = sub.id
  AND sub.novo_texto IS NOT NULL
  AND sub.novo_texto <> ''
  AND (e.detalhes_upgrade IS DISTINCT FROM sub.novo_texto);
