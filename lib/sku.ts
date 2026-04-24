// lib/sku.ts
// Gerador e parser de SKU canonico do TigraoImports.
//
// Principio: SKU inclui tudo que muda o preco OU a expectativa do cliente.
// Regras por categoria:
//   iPhone    → MODELO + STORAGE + COR
//   iPad      → MODELO + CHIP + TELA + STORAGE + COR + CONECTIVIDADE
//   MacBook   → MODELO + CHIP + TELA + RAM + SSD + COR
//   Mac Mini  → MODELO + CHIP + RAM + SSD
//   Watch     → MODELO + TAMANHO + CONECTIVIDADE + COR
//   AirPods   → MODELO + ANC (se houver)
//   Acessorio → nome slugificado
//
// Origem fiscal (LL/BR/JPA/EUA) NAO entra no SKU — metadata separada.
// Chip fisico vs eSIM NAO entra no SKU — metadata separada.
// Novo vs Seminovo ENTRA: IPHONE-15-PRO-256-PRETO vs IPHONE-15-PRO-256-PRETO-SEMINOVO.

import { corParaPT } from "./cor-pt";

// ─── Normalizacao ────────────────────────────────────────────────

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function upper(s: string | null | undefined): string {
  return String(s || "").toUpperCase().trim();
}

// ─── Input esperado ──────────────────────────────────────────────

export interface ProdutoInput {
  produto: string;              // nome completo do produto (texto livre)
  categoria: string;            // IPHONES, IPADS, MACBOOK, MAC_MINI, APPLE_WATCH, AIRPODS, ACESSORIOS
  cor?: string | null;          // cor (pode vir em PT ou EN)
  observacao?: string | null;   // tags tipo [TELA:13"], [RAM:16GB] etc.
  tipo?: string | null;         // NOVO | SEMINOVO
}

// ─── Helpers extração ──────────────────────────────────────────────

function extrairStorage(texto: string): string | null {
  // Pega o MAIOR storage do texto (pra ignorar RAM em MacBook)
  const matches = [...texto.matchAll(/(\d+)\s*(GB|TB)/gi)];
  if (matches.length === 0) return null;
  const vals = matches.map(m => ({
    raw: `${m[1]}${m[2].toUpperCase()}`,
    gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]),
  }));
  const biggest = vals.sort((a, b) => b.gb - a.gb)[0];
  return biggest.raw;
}

function extrairRamSsd(texto: string): { ram: string | null; ssd: string | null } {
  // Extrai RAM (menor) e SSD (maior) quando ha 2 valores no texto
  const matches = [...texto.matchAll(/(\d+)\s*(GB|TB)/gi)];
  if (matches.length < 2) return { ram: null, ssd: extrairStorage(texto) };
  const vals = matches.map(m => ({
    raw: `${m[1]}${m[2].toUpperCase()}`,
    gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]),
  }));
  const sorted = [...vals].sort((a, b) => a.gb - b.gb);
  return { ram: sorted[0].raw, ssd: sorted[sorted.length - 1].raw };
}

function extrairTela(texto: string, observacao?: string | null): string | null {
  // Tela via [TELA:X"] em observacao, ou "11" / "13" / "14" / "15" / "16" no texto
  const fromObs = observacao?.match(/\[TELA:\s*(\d+(?:\.\d+)?)["']?\s*\]/i);
  if (fromObs) return fromObs[1];
  const m = texto.match(/\b(11|13|14|15|16)\s*["']/);
  return m ? m[1] : null;
}

function extrairTamanhoWatch(texto: string): string | null {
  // Apple Watch: 40mm / 41mm / 42mm / 44mm / 45mm / 46mm / 49mm
  const m = texto.match(/\b(40|41|42|44|45|46|49)\s*MM\b/i);
  return m ? m[1] : null;
}

function extrairConectividade(texto: string): "CELL" | "WIFI" | null {
  const up = upper(texto);
  if (/\+\s*CEL|CELLULAR|\bCELL\b|\+CELL/.test(up)) return "CELL";
  if (/WI-?FI|WIFI/.test(up)) return "WIFI";
  return null;
}

function extrairWatchConn(texto: string): "GPSCEL" | "GPS" | null {
  const up = upper(texto);
  if (/\+\s*CEL|CELLULAR|\bCELL\b/.test(up)) return "GPSCEL";
  if (/\bGPS\b/.test(up)) return "GPS";
  return null;
}

// ─── Normalizacao de cor ─────────────────────────────────────────

function corParaSku(cor: string | null | undefined): string | null {
  if (!cor || !cor.trim()) return null;
  // Converte pra PT canonico (ex: "Black Titanium" → "Titanio Preto")
  const ptRaw = corParaPT(cor);
  if (!ptRaw || ptRaw === "—") return null;
  return slugify(ptRaw);
}

// ─── Detectar variante de modelo (iPhone Pro / Plus / Max / Air / e) ──

function extrairModeloIphone(texto: string): string | null {
  const m = upper(texto).match(/IPHONE\s*(\d+)(E)?\s*(PRO\s*MAX|PRO|PLUS|AIR)?/);
  if (!m) return null;
  const num = m[1] + (m[2] ? "E" : "");
  const variant = m[3] ? `-${m[3].replace(/\s+/g, "-")}` : "";
  return `IPHONE-${num}${variant}`;
}

function extrairModeloIpad(texto: string, chip: string | null): string | null {
  const up = upper(texto);
  if (!/\bIPAD\b/.test(up)) return null;
  let variant = "";
  if (/MINI/.test(up)) variant = "-MINI";
  else if (/AIR/.test(up)) variant = "-AIR";
  else if (/PRO/.test(up)) variant = "-PRO";
  const chipPart = chip ? `-${chip}` : "";
  return `IPAD${variant}${chipPart}`;
}

function extrairChipApple(texto: string): string | null {
  // M1 / M2 / M3 / M4 (com optional PRO/MAX) OU A14/A15/A16/A17
  const up = upper(texto);
  const m = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX|ULTRA)?/);
  if (m) {
    const variant = m[2] ? `-${m[2].replace(/\s+/g, "")}` : "";
    return `M${m[1]}${variant}`;
  }
  const a = up.match(/\bA(\d+)\s*(PRO)?/);
  if (a) return `A${a[1]}${a[2] ? "-PRO" : ""}`;
  return null;
}

function extrairModeloMacbook(texto: string, chip: string | null): string | null {
  const up = upper(texto);
  if (!/MACBOOK/.test(up)) return null;
  let variant = "AIR";
  if (/NEO/.test(up)) variant = "NEO";
  else if (/PRO/.test(up)) variant = "PRO";
  else if (/AIR/.test(up)) variant = "AIR";
  const chipPart = chip ? `-${chip}` : "";
  return `MACBOOK-${variant}${chipPart}`;
}

function extrairModeloMacMini(chip: string | null): string {
  return chip ? `MAC-MINI-${chip}` : "MAC-MINI";
}

function extrairModeloWatch(texto: string): string | null {
  const up = upper(texto);
  if (!/WATCH/.test(up)) return null;
  const has46or49 = /\b(46|49)\s*MM/.test(up);
  const seRaw = up.match(/\bSE(?!R)\s*(\d+)?\b/);
  const se = seRaw && !has46or49 ? seRaw : null;
  const series = up.match(/(?:SERIES\s*|\bS)(\d+)/);
  const ultra = up.match(/ULTRA\s*(\d+)?/);
  const milanes = /MILAN[EÊÉ]S/i.test(texto);
  const milanSfx = milanes ? "-MILANES" : "";

  if (ultra) return `WATCH-ULTRA${ultra[1] ? `-${ultra[1]}` : ""}${milanSfx}`;
  if (se) return `WATCH-SE${se[1] ? `-${se[1]}` : ""}${milanSfx}`;
  if (/\bSE(?!R)/.test(up) && !has46or49) return `WATCH-SE${milanSfx}`;
  if (series) return `WATCH-S${series[1]}${milanSfx}`;
  if (has46or49 && seRaw) return `WATCH-S11${milanSfx}`;
  return `WATCH${milanSfx}`;
}

function extrairModeloAirpods(texto: string): string | null {
  const up = upper(texto);
  if (!/AIRPODS/.test(up)) return null;
  if (up.includes("PRO")) {
    const gen = up.match(/PRO\s*(\d+)/);
    return gen ? `AIRPODS-PRO-${gen[1]}` : "AIRPODS-PRO";
  }
  if (up.includes("MAX")) {
    const year = up.match(/MAX\s*(\d{4})/);
    return year ? `AIRPODS-MAX-${year[1]}` : "AIRPODS-MAX";
  }
  const gen = up.match(/AIRPODS?\s*(\d+)/);
  if (gen) return `AIRPODS-${gen[1]}`;
  return "AIRPODS";
}

// ─── Gerador principal ───────────────────────────────────────────

export interface SkuResult {
  sku: string | null;        // null se falhou a geração
  confianca: number;         // 0-100 (quanto informação conseguimos extrair)
  faltaCor: boolean;         // se tinha que ter cor e não tinha
  componentes: Record<string, string | null>; // pra debug
}

export function gerarSku(produto: ProdutoInput): SkuResult {
  const texto = [produto.produto, produto.observacao].filter(Boolean).join(" ");
  const cat = upper(produto.categoria);
  const corSku = corParaSku(produto.cor);
  const isSeminovo = upper(produto.tipo) === "SEMINOVO";
  const sfx = isSeminovo ? "-SEMINOVO" : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comp: Record<string, any> = { categoria: cat, texto, cor: corSku };

  // ─── IPHONE ─────────────────────────────────────────────
  // Importante: respeitar a categoria explicita. Se cat=ACESSORIOS mas texto
  // tem "IPHONE" no nome (ex: "Capa iPhone 15"), fica em ACESSORIOS.
  if (cat === "IPHONES" || (!cat && /\bIPHONE\b/.test(upper(texto)))) {
    const modelo = extrairModeloIphone(texto);
    const storage = extrairStorage(texto);
    comp.modelo = modelo;
    comp.storage = storage;

    if (!modelo || !storage) return { sku: null, confianca: 0, faltaCor: !corSku, componentes: comp };
    if (!corSku) {
      // SKU sem cor (ainda útil pra analytics, mas menos preciso)
      return { sku: `${modelo}-${storage}${sfx}`, confianca: 70, faltaCor: true, componentes: comp };
    }
    return { sku: `${modelo}-${storage}-${corSku}${sfx}`, confianca: 100, faltaCor: false, componentes: comp };
  }

  // ─── IPAD ───────────────────────────────────────────────
  if (cat === "IPADS" || (!cat && /\bIPAD\b/.test(upper(texto)))) {
    const chip = extrairChipApple(texto);
    const modelo = extrairModeloIpad(texto, chip);
    const tela = extrairTela(texto, produto.observacao);
    const storage = extrairStorage(texto);
    const conn = extrairConectividade(texto);
    comp.modelo = modelo;
    comp.chip = chip;
    comp.tela = tela;
    comp.storage = storage;
    comp.conn = conn;

    if (!modelo || !storage) return { sku: null, confianca: 0, faltaCor: !corSku, componentes: comp };
    const parts = [modelo, tela && tela, storage, corSku, conn].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: corSku ? 100 : 70, faltaCor: !corSku, componentes: comp };
  }

  // ─── MACBOOK ────────────────────────────────────────────
  if (cat === "MACBOOK" || (!cat && /MACBOOK/.test(upper(texto)))) {
    const chip = extrairChipApple(texto);
    const modelo = extrairModeloMacbook(texto, chip);
    const tela = extrairTela(texto, produto.observacao);
    const { ram, ssd } = extrairRamSsd(texto);
    comp.modelo = modelo;
    comp.chip = chip;
    comp.tela = tela;
    comp.ram = ram;
    comp.ssd = ssd;

    if (!modelo || !ssd) return { sku: null, confianca: 0, faltaCor: !corSku, componentes: comp };
    const parts = [modelo, tela && tela, ram, ssd, corSku].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: corSku && ram ? 100 : 70, faltaCor: !corSku, componentes: comp };
  }

  // ─── MAC MINI ───────────────────────────────────────────
  if (cat === "MAC_MINI" || (!cat && /MAC\s*MINI/i.test(texto))) {
    const chip = extrairChipApple(texto);
    const modelo = extrairModeloMacMini(chip);
    const { ram, ssd } = extrairRamSsd(texto);
    comp.modelo = modelo;
    comp.ram = ram;
    comp.ssd = ssd;

    if (!ssd) return { sku: null, confianca: 0, faltaCor: false, componentes: comp };
    const parts = [modelo, ram, ssd].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: ram ? 100 : 70, faltaCor: false, componentes: comp };
  }

  // ─── APPLE WATCH ────────────────────────────────────────
  if (cat === "APPLE_WATCH" || (!cat && /WATCH/i.test(texto))) {
    const modelo = extrairModeloWatch(texto);
    const tam = extrairTamanhoWatch(texto);
    const conn = extrairWatchConn(texto);
    comp.modelo = modelo;
    comp.tamanho = tam;
    comp.conn = conn;

    if (!modelo) return { sku: null, confianca: 0, faltaCor: !corSku, componentes: comp };
    const parts = [modelo, tam && tam + "MM", conn, corSku].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: tam && conn && corSku ? 100 : 70, faltaCor: !corSku, componentes: comp };
  }

  // ─── AIRPODS ────────────────────────────────────────────
  if (cat === "AIRPODS" || (!cat && /AIRPODS/i.test(texto))) {
    const modelo = extrairModeloAirpods(texto);
    const hasANC = /\bANC\b|COM\s*ANC/i.test(texto);
    const noANC = /SEM\s*ANC/i.test(texto);
    comp.modelo = modelo;
    comp.anc = hasANC ? "ANC" : noANC ? "NO-ANC" : null;

    if (!modelo) return { sku: null, confianca: 0, faltaCor: false, componentes: comp };
    const parts = [modelo, hasANC && !noANC ? "ANC" : null].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: 100, faltaCor: false, componentes: comp };
  }

  // ─── ACESSORIOS ─────────────────────────────────────────
  if (cat === "ACESSORIOS") {
    const nome = slugify(produto.produto || "");
    const tela = extrairTela(texto, produto.observacao);
    comp.modelo = nome;
    comp.tela = tela;

    if (!nome) return { sku: null, confianca: 0, faltaCor: false, componentes: comp };
    const parts = ["ACC", nome, tela ? tela : null, corSku].filter(Boolean);
    return { sku: parts.join("-") + sfx, confianca: 80, faltaCor: false, componentes: comp };
  }

  // ─── FALLBACK ───────────────────────────────────────────
  const slug = slugify(produto.produto || "");
  if (!slug) return { sku: null, confianca: 0, faltaCor: false, componentes: comp };
  return { sku: slug + (corSku ? `-${corSku}` : "") + sfx, confianca: 30, faltaCor: !corSku, componentes: comp };
}

// ─── Parser inverso ──────────────────────────────────────────────
// Dado um SKU, volta os componentes pra display.

export interface SkuComponents {
  sku: string;
  categoria: string;
  modelo: string;
  specs: string[];
  cor: string | null;
  seminovo: boolean;
}

export function parseSku(sku: string): SkuComponents | null {
  if (!sku || !sku.trim()) return null;
  const partes = sku.toUpperCase().trim().split("-");
  if (partes.length === 0) return null;

  const seminovo = partes[partes.length - 1] === "SEMINOVO";
  const partesLimpas = seminovo ? partes.slice(0, -1) : partes;
  const categoria = partesLimpas[0];

  return {
    sku: sku.toUpperCase(),
    categoria,
    modelo: partesLimpas.slice(0, 2).join("-"),
    specs: partesLimpas.slice(2),
    cor: null, // simplificado — a extração reversa é heurística e nem sempre clara
    seminovo,
  };
}

// ─── Helper: validar formato ────────────────────────────────────
export function isValidSku(sku: string): boolean {
  if (!sku || !sku.trim()) return false;
  return /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(sku.toUpperCase());
}
