import { corParaPT } from "./cor-pt";

const STRUCTURED = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS", "SEMINOVOS"];

function getBaseCat(cat: string): string {
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
    parts.push(modelo);
    if (tela) parts.push(tela);
    if (ram) parts.push(ram);
    if (ssd) parts.push(ssd);
    if (cor) parts.push(cor);
  } else if (baseCat === "MAC_MINI") {
    parts.push("Mac Mini");
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
    return cleanProdutoDisplay(nomeRaw);
  }

  return parts.filter(Boolean).join(" ");
}
