// lib/sku-validator.ts
// Valida se o SKU do item de estoque selecionado bate com o SKU esperado
// pela venda (derivado do formulario preenchido pelo cliente).
//
// Estrategia de bloqueio (definida com Andre):
//   CUALQUER divergencia bloqueia — cor, storage, modelo, chip, tela, etc.
//   Match STRICT, comparacao string-literal dos SKUs.
//
// Excecoes:
//   - Se SKU esperado for null (venda antiga sem SKU canonico), permite e
//     herda o SKU do estoque — nao ha baseline pra comparar.
//   - Se SKU do estoque for null (item acessorio sem classificacao completa),
//     tambem permite — UI deve sinalizar no alerta que nao foi possivel
//     validar, mas nao bloqueia.
//
// Quem usa:
//   - PATCH /api/vendas (quando admin vincula estoque_id a uma venda existente)
//   - POST /api/vendas (quando cria venda nova ja com estoque_id — raro pro
//     fluxo de formulario mas possivel)
//   - Frontend /admin/vendas (alerta visual em tempo real antes do submit)

import { parseSku } from "./sku";

export interface SkuComparison {
  ok: boolean;               // true = pode vincular, false = bloqueado
  podeValidar: boolean;      // false quando algum SKU e null (pula validacao)
  skuEsperado: string | null;
  skuSelecionado: string | null;
  motivo?: string;           // mensagem curta legivel (cor, storage, modelo, etc)
  detalhes?: string;         // descricao mais longa pra exibir no alerta
  diferencas?: Array<{ campo: string; esperado: string; selecionado: string }>;
}

// Normaliza pra comparar sem ruido (upper + trim).
function norm(s: string | null | undefined): string {
  return String(s || "").toUpperCase().trim();
}

// Comparador de alto nivel. Devolve ok=true quando SKUs batem ou quando
// algum dos dois e null (nao da pra comparar — permite e UI avisa).
export function compararSkus(
  skuEsperado: string | null | undefined,
  skuSelecionado: string | null | undefined,
): SkuComparison {
  const esperado = skuEsperado ? norm(skuEsperado) : null;
  const selecionado = skuSelecionado ? norm(skuSelecionado) : null;

  // Caso 1: nao ha baseline (venda antiga ou estoque sem SKU) → permite
  if (!esperado || !selecionado) {
    return {
      ok: true,
      podeValidar: false,
      skuEsperado: esperado,
      skuSelecionado: selecionado,
    };
  }

  // Caso 2: SKUs identicos → permite
  if (esperado === selecionado) {
    return {
      ok: true,
      podeValidar: true,
      skuEsperado: esperado,
      skuSelecionado: selecionado,
    };
  }

  // Caso 3: divergem — bloqueia com diff detalhado
  const diferencas = identificarDiferencas(esperado, selecionado);
  const camposMsg = diferencas.map((d) => d.campo).join(", ");
  return {
    ok: false,
    podeValidar: true,
    skuEsperado: esperado,
    skuSelecionado: selecionado,
    motivo: camposMsg || "SKU diferente",
    detalhes: `Cliente pediu um produto diferente do que voce selecionou. Diverge em: ${camposMsg || "multiplos campos"}.`,
    diferencas,
  };
}

// Identifica quais componentes do SKU diferem. Usa heuristicas baseadas no
// formato canonico: MODELO-VARIANT-(TELA)-(CHIP)-STORAGE-COR-(CONN)(-SEMINOVO).
// Nao pretende ser 100% fiel — objetivo e dar dica util pro admin entender
// "o que deu errado" (cor, storage, modelo, etc).
function identificarDiferencas(esperado: string, selecionado: string): Array<{ campo: string; esperado: string; selecionado: string }> {
  const diffs: Array<{ campo: string; esperado: string; selecionado: string }> = [];

  const pE = parseSku(esperado);
  const pS = parseSku(selecionado);
  if (!pE || !pS) {
    diffs.push({ campo: "sku completo", esperado, selecionado });
    return diffs;
  }

  // Categoria (IPHONE, IPAD, MACBOOK, WATCH, AIRPODS, etc)
  if (pE.categoria !== pS.categoria) {
    diffs.push({ campo: "categoria", esperado: pE.categoria, selecionado: pS.categoria });
  }

  // Modelo (primeiros 2 segmentos: ex "IPHONE-17", "IPHONE-17-PRO")
  if (pE.modelo !== pS.modelo) {
    diffs.push({ campo: "modelo", esperado: pE.modelo, selecionado: pS.modelo });
  }

  // Specs: comparar por tipo conhecido (GB/TB = storage, mm = tamanho, MM = memoria, etc)
  const specE = extrairComponentes(pE.specs);
  const specS = extrairComponentes(pS.specs);
  if (specE.storage !== specS.storage && (specE.storage || specS.storage)) {
    diffs.push({
      campo: "storage",
      esperado: specE.storage || "—",
      selecionado: specS.storage || "—",
    });
  }
  if (specE.cor !== specS.cor && (specE.cor || specS.cor)) {
    diffs.push({
      campo: "cor",
      esperado: specE.cor || "—",
      selecionado: specS.cor || "—",
    });
  }
  if (specE.tamanhoWatch !== specS.tamanhoWatch && (specE.tamanhoWatch || specS.tamanhoWatch)) {
    diffs.push({
      campo: "tamanho",
      esperado: specE.tamanhoWatch || "—",
      selecionado: specS.tamanhoWatch || "—",
    });
  }
  if (specE.chip !== specS.chip && (specE.chip || specS.chip)) {
    diffs.push({
      campo: "chip",
      esperado: specE.chip || "—",
      selecionado: specS.chip || "—",
    });
  }

  // Seminovo vs novo
  if (pE.seminovo !== pS.seminovo) {
    diffs.push({
      campo: "condicao",
      esperado: pE.seminovo ? "SEMINOVO" : "NOVO",
      selecionado: pS.seminovo ? "SEMINOVO" : "NOVO",
    });
  }

  // Fallback: se nao conseguiu identificar por componente conhecido mas SKUs
  // diferem, pelo menos avisa que "outros campos" divergem.
  if (diffs.length === 0) {
    diffs.push({ campo: "specs", esperado: pE.specs.join("-"), selecionado: pS.specs.join("-") });
  }

  return diffs;
}

// Extrai componentes conhecidos das "specs" do SKU — heuristica simples baseada
// em formato (numero+GB/TB = storage, numero+MM = tamanho watch, M1/M2/M3 = chip, etc).
function extrairComponentes(specs: string[]): {
  storage: string | null;
  cor: string | null;
  tamanhoWatch: string | null;
  chip: string | null;
} {
  let storage: string | null = null;
  let tamanhoWatch: string | null = null;
  let chip: string | null = null;
  const naoClassificados: string[] = [];

  for (const s of specs) {
    if (/^\d+(GB|TB)$/.test(s)) { storage = s; continue; }
    if (/^\d+MM$/.test(s)) { tamanhoWatch = s; continue; }
    if (/^M\d+(-PRO|-MAX|-ULTRA|-PROMAX)?$/.test(s)) { chip = s; continue; }
    if (s === "GPS" || s === "GPSCEL" || s === "WIFI" || s === "CELL" || s === "SEMINOVO") continue;
    naoClassificados.push(s);
  }

  // Cor = o que sobrou, normalmente 1 ou 2 segmentos no final (ex TITANIO-PRETO).
  const cor = naoClassificados.length > 0 ? naoClassificados.join("-") : null;

  return { storage, cor, tamanhoWatch, chip };
}

// ─── Nome canonico pra exibicao humana ────────────────────────────
// Deriva "iPhone 17 Pro Max 512GB — Prata" de "IPHONE-17-PRO-MAX-512GB-PRATA".
// Usado pra UI mostrar o nome padronizado em vez do texto livre que o cliente
// digitou no formulario (que pode vir em ingles, misturado, com erros).
export function skuToNomeCanonico(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const parsed = parseSku(sku);
  if (!parsed) return null;

  const { categoria, modelo, specs, seminovo } = parsed;

  // Formata o "modelo" legivel baseado na categoria
  const modeloLegivel = formatarModeloHumano(categoria, modelo);

  // Separa specs em storage vs cor pra apresentar com "—"
  const extras = extrairComponentes(specs);
  const partesStorage = [
    extras.chip,
    extras.tamanhoWatch,
    extras.storage,
  ].filter(Boolean);

  const partes = [modeloLegivel];
  if (partesStorage.length > 0) partes.push(partesStorage.join(" "));

  let resultado = partes.join(" ").trim();
  if (extras.cor) {
    // Capitaliza cor canonica (TITANIO-PRETO → Titânio Preto)
    const corBonita = extras.cor
      .split("-")
      .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
      .join(" ");
    resultado += ` — ${corBonita}`;
  }
  if (seminovo) resultado += " (Seminovo)";
  return resultado;
}

function formatarModeloHumano(categoria: string, modelo: string): string {
  // modelo vem como "IPHONE-17-PRO-MAX", "WATCH-SE", "MACBOOK-PRO-M4", etc.
  // Conversoes: IPHONE → iPhone, IPAD → iPad, MAC-MINI → Mac Mini, WATCH → Apple Watch.
  const map: Record<string, string> = {
    IPHONE: "iPhone",
    IPAD: "iPad",
    MACBOOK: "MacBook",
    WATCH: "Apple Watch",
    AIRPODS: "AirPods",
    "MAC-MINI": "Mac Mini",
    ACC: "Acessório",
  };
  const parts = modelo.split("-");
  const prefixo = map[parts[0]] || (map[categoria] || parts[0]);
  // Resto capitalizado (Pro, Max, SE, Ultra, M1, M4, etc)
  const resto = parts
    .slice(1)
    .map((p) => {
      if (/^M\d+$/.test(p)) return p; // chips ficam em caixa alta
      if (/^S\d+$/.test(p)) return `Series ${p.slice(1)}`;
      if (/^\d+$/.test(p)) return p; // numeros de geracao (17, 16, 15)
      return p.charAt(0) + p.slice(1).toLowerCase();
    })
    .join(" ");
  return [prefixo, resto].filter(Boolean).join(" ");
}
