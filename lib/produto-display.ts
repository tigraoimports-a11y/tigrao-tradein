import { corParaPT, normalizarCoresNoTexto } from "./cor-pt";
import { parseSku, inferirCorDoTexto } from "./sku";

// Regex pra detectar segmentos "classificaveis" (storage, chip, tela, etc) que
// NAO sao cor — usado pra filtrar specs do SKU quando queremos extrair cor.
function isClassificavelSpec(s: string): boolean {
  return (
    /^\d+(GB|TB|MM)$/.test(s) ||
    /^M\d+/.test(s) ||
    (/^\d+$/.test(s) && Number(s) >= 10 && Number(s) <= 17) ||
    ["GPS", "GPSCEL", "WIFI", "CELL", "SEMINOVO", "ANC"].includes(s)
  );
}

const STRUCTURED = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS", "SEMINOVOS"];

export function getBaseCat(cat: string): string {
  if (cat === "SEMINOVOS") return "IPHONES";
  if (STRUCTURED.includes(cat)) return cat;
  const sorted = [...STRUCTURED].sort((a, b) => b.length - a.length);
  for (const base of sorted) {
    if (cat.startsWith(base + "_") || cat.startsWith(base)) return base;
  }
  return cat;
}

export function cleanProdutoDisplay(nome: string | null | undefined): string {
  if (!nome) return "";
  let s = String(nome);
  s = s.replace(/\s*\((LL|JPA|HN|IN|BR|BZ|CH|ZA|KH|TH|SG)\)\s*/gi, " ");
  s = s.replace(/\s*[-–]\s*CHIP\s*F[IÍ]SICO[^[]*$/i, "");
  s = s.replace(/\s*\+?\s*E[-\s]?SIM\b.*$/i, "");
  s = s.replace(/\s*CHIP\s*F[IÍ]SICO\b.*$/i, "");
  s = s.replace(/\s+(LL|JPA|HN|IN|BR|BZ|CH|ZA|KH|TH|SG)\b.*$/i, "");
  s = s.replace(/\[[^\]]*\]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Versao leve do `formatProdutoDisplay` que recebe APENAS a string do produto
 * (nao o objeto estruturado). Aplica a logica global: strip de origem/regiao,
 * traducao EN→PT de cores e dedup de palavras repetidas (ex: "MIDNIGHT Midnight").
 * Depois tenta simplificar cor composta (Preto Brilhante → Preto) via corParaPT.
 *
 * Usado em contextos onde so temos a string (mensagem motoboy, etc) e nao
 * da pra chamar `formatProdutoDisplay` com {produto, categoria, cor, observacao}.
 */
export function limparNomeProduto(raw: string | null | undefined): string {
  if (!raw) return "";
  // 1. Strip regiao/E-SIM/[tags]
  let s = cleanProdutoDisplay(raw);
  // 2. Traduz cores EN canonicas → PT (Midnight → Preto, Silver → Prata, etc)
  s = normalizarCoresNoTexto(s);
  // 3. Dedup de palavras adjacentes (case-insensitive): "Preto Preto" → "Preto"
  const words = s.split(/\s+/).filter(Boolean);
  const dedup: string[] = [];
  for (const w of words) {
    if (dedup.length && dedup[dedup.length - 1].toLowerCase() === w.toLowerCase()) continue;
    dedup.push(w);
  }
  s = dedup.join(" ");
  // 4. Simplifica cor composta no final (Preto Brilhante → Preto, Titanio Natural → Titanio Natural)
  //    Testa as ultimas 1-3 palavras como cor conhecida. Se o corParaPT retornar
  //    algo diferente, substitui.
  const ws = s.split(/\s+/);
  for (let n = Math.min(3, ws.length - 1); n >= 1; n--) {
    const tail = ws.slice(-n).join(" ");
    const simplified = corParaPT(tail);
    if (simplified && simplified !== "—" && simplified.toLowerCase() !== tail.toLowerCase() && simplified.length < tail.length) {
      return ws.slice(0, -n).concat(simplified.split(/\s+/)).join(" ");
    }
  }
  return s;
}

/**
 * Garante que o nome do produto exibido tem a cor.
 *
 * Estrategia em cascata (do mais confiavel pro mais aproximativo):
 *   1. SKU canonico (extrai specs-nao-classificaveis como cor)
 *   2. corDireta (ex: venda.cor copiado do estoque) — EN ou PT, normaliza
 *   3. textoOriginal — infere cor conhecida do texto bruto
 *
 * Se achar cor em qualquer etapa, anexa ao display (caso ja nao esteja visivel).
 *
 * Args:
 *   display — texto ja processado (ex: saida de getModeloBase, sem cor)
 *   sku — SKU canonico da venda/estoque
 *   textoOriginal — texto bruto do produto (pode ter cor embutida)
 *   corDireta — cor vinda de outra fonte (ex: venda.cor copiado do estoque).
 *               Normalmente mais confiavel que inferir do texto.
 */
export function produtoComCorGarantida(
  display: string | null | undefined,
  sku: string | null | undefined,
  textoOriginal?: string | null,
  corDireta?: string | null,
): string {
  const texto = normalizarCoresNoTexto(display || "");

  // 1. Tenta extrair cor do SKU canonico
  let corSegments: string[] = [];
  if (sku) {
    const parsed = parseSku(sku);
    if (parsed) {
      corSegments = parsed.specs.filter((s) => !isClassificavelSpec(s));
    }
  }

  // 2. Se SKU nao tem cor, usa corDireta (venda.cor copiado do estoque —
  //    fonte confiavel quando o SKU esta incompleto / cruzado).
  if (corSegments.length === 0 && corDireta && corDireta.trim()) {
    const corLimpa = corDireta.trim();
    // Normaliza EN→PT (Cosmic Orange → Laranja, Space Black → Preto)
    const corNormalizada = normalizarCoresNoTexto(corLimpa);
    const corInferida = inferirCorDoTexto(corNormalizada);
    if (corInferida) {
      corSegments = corInferida.split(/\s+/);
    } else if (corNormalizada) {
      // Se normalizador nao reconheceu, usa cor bruta (ex: cores novas da Apple
      // que ainda nao estao no dicionario — melhor mostrar algo do que nada).
      corSegments = corNormalizada.toUpperCase().split(/\s+/);
    }
  }

  // 3. Fallback: infere do texto original (vendas legadas / estoque sem cor)
  if (corSegments.length === 0) {
    const textoFonte = textoOriginal || display || "";
    const textoNormalizado = normalizarCoresNoTexto(textoFonte);
    const corInferida = inferirCorDoTexto(textoNormalizado);
    if (corInferida) corSegments = corInferida.split(/\s+/);
  }

  if (corSegments.length === 0) return texto;

  // "BRANCO-NUVEM" → "Branco Nuvem"
  const corBonita = corSegments
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");

  // Ja tem a cor no display? (case-insensitive)
  const textoUpper = texto.toUpperCase();
  const corUpper = corSegments.join(" ").toUpperCase();
  if (textoUpper.includes(corUpper)) return texto;
  if (corSegments.length > 1 && textoUpper.includes(corSegments[0])) return texto;
  // Anexa
  return `${texto} ${corBonita}`;
}

/** Formata o nome do produto para exibição (PT simplificado). Compartilhado entre estoque, gastos e etc. */
export function formatProdutoDisplay(p: {
  produto?: string | null;
  categoria?: string | null;
  cor?: string | null;
  observacao?: string | null;
}): string {
  const nomeRaw = String(p.produto || "");
  const obs = String(p.observacao || "");
  const src = `${nomeRaw} ${obs}`;
  const up = src.toUpperCase();
  const baseCat = getBaseCat(p.categoria || "IPHONES");
  const corRaw = (p.cor || "").trim();
  const cor = corRaw ? corParaPT(corRaw) : "";

  const memMatches = [...up.matchAll(/(\d+)\s*(GB|TB)/g)];
  const mems = memMatches.map(m => ({ raw: `${m[1]}${m[2]}`, gb: m[2] === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
  const sorted = [...mems].sort((a, b) => b.gb - a.gb);
  const storage = sorted[0]?.raw || "";
  const ramTag = obs.match(/\[RAM:([^\]]+)\]/);
  let ram = ramTag ? ramTag[1].trim().toUpperCase() : "";
  if (!ram && sorted.length >= 2) ram = sorted[sorted.length - 1].raw;
  const ssdTag = obs.match(/\[SSD:([^\]]+)\]/);
  const ssd = ssdTag ? ssdTag[1].trim().toUpperCase() : storage;
  const telaTag = obs.match(/\[TELA:([^\]]+)\]/);
  const telaNome = up.match(/\b(11|13|14|15|16)["”]/);
  const tela = telaTag ? telaTag[1].trim().replace(/"?$/, '"') : (telaNome ? `${telaNome[1]}"` : "");
  const mmMatch = up.match(/(\d{2})\s*MM/);
  const tamMm = mmMatch ? `${mmMatch[1]}mm` : "";
  const hasCell = /\+\s*CEL|CELLULAR|\+CELL|GPS\s*\+\s*CEL|\bCEL\b/.test(up);
  const hasGps = /\bGPS\b/.test(up);
  const hasWifi = /WI-?FI|WIFI/.test(up);

  const parts: string[] = [];

  if (baseCat === "IPHONES") {
    const m = up.match(/IPHONE\s*(\d+E?)\s*(PRO\s*MAX|PRO|PLUS|AIR)?/);
    const modelo = m
      ? `iPhone ${m[1].replace(/E$/, "e")}${m[2] ? " " + m[2].replace(/\s+/g, " ").replace(/\bPRO MAX\b/, "Pro Max").replace(/\bPRO\b/, "Pro").replace(/\bPLUS\b/, "Plus").replace(/\bAIR\b/, "Air") : ""}`
      : cleanProdutoDisplay(nomeRaw);
    parts.push(modelo);
    if (storage) parts.push(storage);
    if (cor) parts.push(cor);
  } else if (baseCat === "IPADS") {
    const chipM = up.match(/(M\d+(?:\s*(?:PRO|MAX))?|A\d+(?:\s*PRO)?)/);
    const chip = chipM ? " " + chipM[1].replace(/\s+/g, " ").toUpperCase() : "";
    let modelo = "iPad";
    if (/MINI/.test(up)) modelo = "iPad Mini";
    else if (/AIR/.test(up)) modelo = "iPad Air";
    else if (/PRO/.test(up)) modelo = "iPad Pro";
    parts.push(modelo + chip);
    if (tela) parts.push(tela);
    if (storage) parts.push(storage);
    if (cor) parts.push(cor);
    if (hasCell) parts.push("Wi-Fi + Cellular");
    else if (hasWifi) parts.push("Wi-Fi");
  } else if (baseCat === "MACBOOK") {
    let modelo = "MacBook";
    if (/NEO/.test(up)) modelo = "MacBook Neo";
    else if (/AIR/.test(up)) modelo = "MacBook Air";
    else if (/PRO/.test(up)) modelo = "MacBook Pro";
    const chipM = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX)?/);
    let chip = "";
    if (chipM) {
      const variant = chipM[2] ? " " + chipM[2].replace(/\s+/g, " ").replace(/PRO MAX/i, "Pro Max").replace(/PRO/i, "Pro").replace(/MAX/i, "Max") : "";
      chip = ` M${chipM[1]}${variant}`;
    }
    parts.push(modelo + chip);
    if (tela) parts.push(tela);
    if (ram) parts.push(ram);
    if (ssd) parts.push(ssd);
    if (cor) parts.push(cor);
  } else if (baseCat === "MAC_MINI") {
    // Extrai chip (M1/M2/M3/M4 + opcional PRO/MAX) do nome/observação
    const chipM = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX)?/);
    let chip = "";
    if (chipM) {
      const variant = chipM[2] ? " " + chipM[2].replace(/\s+/g, " ").replace(/PRO MAX/i, "Pro Max").replace(/PRO/i, "Pro").replace(/MAX/i, "Max") : "";
      chip = ` M${chipM[1]}${variant}`;
    }
    parts.push("Mac Mini" + chip);
    if (ram) parts.push(ram);
    if (ssd) parts.push(ssd);
    if (cor) parts.push(cor);
  } else if (baseCat === "APPLE_WATCH") {
    let modelo = "Apple Watch";
    const ultra = up.match(/ULTRA\s*(\d+)?/);
    // \bSE(?!R) — não casar "SERIES"
    // Além disso: Apple Watch SE só existe em 40/44mm. Se nome tem 46mm ou 49mm, "SE" é lixo → Series 11.
    const has46or49 = /\b(46|49)\s*MM/.test(up);
    const seRaw = up.match(/\bSE(?!R)\s*(\d+)?\b/);
    const se = seRaw && !has46or49 ? seRaw : null;
    const series = up.match(/(?:SERIES\s*|\bS)(\d+)/);
    if (ultra) modelo = `Apple Watch Ultra${ultra[1] ? " " + ultra[1] : ""}`;
    else if (se) modelo = `Apple Watch SE${se[1] ? " " + se[1] : ""}`;
    else if (series) modelo = `Apple Watch Series ${series[1]}`;
    else if (has46or49 && seRaw) modelo = "Apple Watch Series 11";
    parts.push(modelo);
    if (tamMm) parts.push(tamMm);
    // Ultra é sempre cellular — redundante exibir
    if (ultra) { /* omit connectivity */ }
    else if (hasCell) parts.push("GPS + Cellular");
    else if (hasGps) parts.push("GPS");
    if (cor) parts.push(cor);
  } else {
    // ACESSORIOS e outras categorias não estruturadas: nome limpo + tela (se houver) + cor em PT
    parts.push(cleanProdutoDisplay(nomeRaw));
    if (tela) parts.push(tela);
    if (cor) parts.push(cor);
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Gera chave de agrupamento por modelo (sem cor) — compartilhado entre estoque e vendas.
 * Inclui tamanho/conectividade pra Watch, RAM+SSD pra MacBook, storage pra iPhone/iPad.
 */
export function getModeloBase(produto: string, categoria: string, observacao?: string | null): string {
  const p = (produto || "").toUpperCase().trim();
  let baseCat = getBaseCat(categoria || "");
  if (!baseCat || !["IPHONES","IPADS","MACBOOK","MAC_MINI","APPLE_WATCH","AIRPODS","ACESSORIOS"].includes(baseCat)) {
    // ACESSORIOS ANTES de IPAD/IPHONE/etc — senao "Magic Keyboard iPad Pro M4"
    // cai em IPADS (porque tem "IPAD" no nome) e vira "iPad Pro M4" no display,
    // escondendo que e um acessorio. Lista cobre os acessorios Apple comuns.
    if (/\bMAGIC\s*(KEYBOARD|MOUSE|TRACKPAD)\b|\bAPPLE\s*PENCIL\b|\bCARREGADOR\b|\bCAPA\b|\bCASE\b|\bCABO\b|\bFONTE\b|\bPELICULA\b|\bP[EÉ]LICULA\b|\bADAPTADOR\b|\bHUB\b|\bPULSEIRA\b|\bSMART\s*FOLIO\b/.test(p)) baseCat = "ACESSORIOS";
    else if (/\bIPHONE\b/.test(p)) baseCat = "IPHONES";
    else if (/\bIPAD\b/.test(p)) baseCat = "IPADS";
    else if (/\bMACBOOK\b/.test(p)) baseCat = "MACBOOK";
    else if (/\bMAC\s*MINI\b/.test(p)) baseCat = "MAC_MINI";
    else if (/\bWATCH\b/.test(p)) baseCat = "APPLE_WATCH";
    else if (/\bAIRPODS?\b/.test(p)) baseCat = "AIRPODS";
  }
  const getMem = () => {
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    if (all.length === 0) return "";
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const biggest = vals.sort((a, b) => b.gb - a.gb)[0];
    return ` ${biggest.raw}`;
  };
  const getSize = () => { const m = p.match(/(\d{2})["”]/); return m ? ` ${m[1]}"` : ""; };

  if (baseCat === "IPHONES") {
    const match = p.match(/IPHONE\s*(\d+)(E)?\s*(PRO\s*MAX|PRO|PLUS|AIR)?/i);
    if (match) {
      const num = match[1] + (match[2] ? "e" : "");
      const variant = match[3] ? " " + match[3].trim() : "";
      return `iPhone ${num}${variant}${getMem()}`;
    }
    return produto;
  }
  if (baseCat === "IPADS") {
    const mem = getMem();
    const size = getSize();
    const chipMatch = p.match(/(M\d+(?:\s*(?:PRO|MAX))?|A\d+(?:\s*PRO)?)/i);
    const chip = chipMatch ? ` ${chipMatch[1].toUpperCase()}` : "";
    if (p.includes("MINI")) return `iPad Mini${chip}${size}${mem}`;
    if (p.includes("AIR")) return `iPad Air${chip}${size}${mem}`;
    if (p.includes("PRO")) return `iPad Pro${chip}${size}${mem}`;
    return `iPad${chip}${mem}`;
  }
  if (baseCat === "MACBOOK") {
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const sorted = [...vals].sort((a, b) => a.gb - b.gb);
    const ram = sorted.length >= 2 ? ` ${sorted[0].raw}` : "";
    const ssd = sorted.length >= 1 ? ` ${sorted[sorted.length - 1].raw}` : "";
    const memPair = `${ram}${ssd}`;
    const size = getSize();
    const chipMatch = p.match(/M(\d+)(\s*PRO)?/i);
    const chip = chipMatch ? ` M${chipMatch[1]}${chipMatch[2] ? " Pro" : ""}` : "";
    if (p.includes("NEO")) return `MacBook Neo${chip}${size}${memPair}`;
    if (p.includes("AIR")) return `MacBook Air${chip}${size}${memPair}`;
    if (p.includes("PRO")) return `MacBook Pro${chip}${size}${memPair}`;
    return `MacBook${chip}${memPair}`;
  }
  if (baseCat === "MAC_MINI") {
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const sorted = [...vals].sort((a, b) => a.gb - b.gb);
    const ram = sorted.length >= 2 ? ` ${sorted[0].raw}` : "";
    const ssd = sorted.length >= 1 ? ` ${sorted[sorted.length - 1].raw}` : "";
    const memPair = `${ram}${ssd}`;
    const chipMatch = p.match(/M(\d+)(\s*PRO)?/i);
    const chip = chipMatch ? ` M${chipMatch[1]}${chipMatch[2] ? " Pro" : ""}` : "";
    return `Mac Mini${chip}${memPair}`;
  }
  if (baseCat === "APPLE_WATCH") {
    // Apple Watch SE só existe em 40/44mm. Se nome tem 46mm ou 49mm, "SE" é lixo → Series 11.
    const has46or49 = /\b(46|49)\s*MM/.test(p);
    const sizeW = p.match(/(\d{2})\s*MM/i);
    const sz = sizeW ? ` ${sizeW[1]}mm` : "";
    const isCell = /\+\s*CEL|GPS\s*\+\s*CEL|CELL|CELULAR/.test(p);
    const conn = isCell ? " GPS+CEL" : " GPS";
    // Variante de pulseira Milanês (natural/preta/etc) eh um SKU diferente
    // com preco/custo proprios. Separa em grupo distinto pra rebalance nao
    // sobrescrever o balanco do milanes com a media do modelo regular.
    const isMilanes = /MILAN[EÊÉ]S/.test(p);
    const milanesSuffix = isMilanes ? " Milanês" : "";
    const ultraMatch = p.match(/ULTRA\s*(\d+)?/);
    if (ultraMatch) {
      const gen = ultraMatch[1] ? ` ${ultraMatch[1]}` : "";
      return `Apple Watch Ultra${gen}${sz}${milanesSuffix}`;
    }
    const seMatch = p.match(/\bSE(?!R)\s*(\d+)/);
    if (seMatch && !has46or49) return `Apple Watch SE ${seMatch[1]}${sz}${conn}${milanesSuffix}`;
    if (/\bSE(?!R)/.test(p) && !has46or49) return `Apple Watch SE${sz}${conn}${milanesSuffix}`;
    const seriesMatch = p.match(/(?:SERIES\s*|\bS)(\d+)/);
    if (seriesMatch) return `Apple Watch Series ${seriesMatch[1]}${sz}${conn}${milanesSuffix}`;
    if (has46or49) return `Apple Watch Series 11${sz}${conn}${milanesSuffix}`;
    return `Apple Watch${sz}${conn}`;
  }
  if (baseCat === "AIRPODS") {
    if (p.includes("PRO")) {
      const genMatch = p.match(/PRO\s*(\d+)/);
      return genMatch ? `AirPods Pro ${genMatch[1]}` : "AirPods Pro";
    }
    if (p.includes("MAX")) {
      const yearMatch = p.match(/MAX\s*(\d{4})/);
      return yearMatch ? `AirPods Max ${yearMatch[1]}` : "AirPods Max";
    }
    const genMatch = p.match(/AIRPODS?\s*(\d+)/);
    if (genMatch) {
      const gen = genMatch[1];
      const hasANC = p.includes("ANC") || p.includes("COM ANC");
      const noANC = p.includes("SEM ANC");
      if (hasANC && !noANC) return `AirPods ${gen} ANC`;
      if (noANC) return `AirPods ${gen}`;
      return `AirPods ${gen}`;
    }
    return "AirPods";
  }
  if (baseCat === "ACESSORIOS") {
    // Tela (ex: 11", 13") vem na observacao como [TELA:X"] — inclui no nome base
    // pra separar variantes do mesmo modelo (Magic Keyboard 11" != 13")
    const telaMatch = observacao?.match(/\[TELA:([^\]]+)\]/);
    const tela = telaMatch ? ` ${telaMatch[1].trim().replace(/"?$/, '"')}` : "";
    // Stripa cor do final do nome pra agrupar variantes no mesmo card
    // (ex: "MAGIC KEYBOARD IPAD AIR M3 13\" BRANCO" + "MAGIC KEYBOARD IPAD
    // AIR M3 13\"" viram o mesmo base — cor fica so na subdivisao). Sem
    // isso, o item com cor no nome cria um card solto e o item com p.cor
    // separado cria outro, repetindo o modelo na listagem.
    const coresPT = /\b(PRETO|BRANCO|CINZA|AZUL|VERDE|PRATA|DOURAD[OA]?|ROXO|ROSA|LARANJA|AMARELO|VERMELHO|ESTELAR|TIT[AÂ]NIO(?:\s+(?:PRETO|BRANCO|AZUL|DESERTO|NATURAL|PRATA|LARANJA))?|MEIA[-\s]NOITE)$/i;
    let nome = (produto || "").replace(/\s*[-–]\s*$/, "").trim();
    while (coresPT.test(nome)) {
      nome = nome.replace(coresPT, "").trim();
    }
    return `${nome}${tela}`;
  }
  return (produto || "").replace(/\s*[-–]\s*$/, "").trim();
}
