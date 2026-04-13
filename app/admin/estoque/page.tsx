"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { getCategoriasEstoque, addCategoriaEstoque, removeCategoriaEstoque, editCategoriaEstoque, EMOJI_OPTIONS } from "@/lib/categorias";
import type { Categoria } from "@/lib/categorias";

import BarcodeScanner from "@/components/BarcodeScanner";
import { buildProdutoName as buildProdutoNameFromSpec, CORES_POR_CATEGORIA, COR_EN_TO_PT, COR_OBRIGATORIA, IPHONE_ORIGENS, WATCH_PULSEIRAS, WATCH_BAND_MODELS, getIphoneCores, MACBOOK_RAMS, MACBOOK_STORAGES, MACBOOK_NUCLEOS, MAC_MINI_NUCLEOS, MAC_MINI_RAMS, type ProdutoSpec } from "@/lib/produto-specs";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import type { Banco } from "@/lib/admin-types";
import { corParaPT, formatCorEtiquetaPTEN } from "@/lib/cor-pt";

/**
 * Normaliza o display de um produto seguindo a ordem rigorosa por categoria,
 * montando do zero a partir dos campos parseados, ignorando o que está cru no nome.
 *
 * - iPhone: Modelo - Armazenamento - Cor
 * - iPad: Modelo - Tamanho - Armazenamento - Cor - Conectividade
 * - MacBook: Modelo - Tamanho - RAM - SSD - Cor
 * - Mac Mini: Modelo - RAM - SSD
 * - Apple Watch: Modelo - Tamanho - Conectividade - Cor
 */
function formatProdutoDisplay(p: {
  produto?: string | null;
  categoria?: string | null;
  cor?: string | null;
  observacao?: string | null;
}): string {
  const nomeRaw = String(p.produto || "").replace(/\s*=\s*/g, " ").replace(/\s+/g, " ").trim();
  const obs = String(p.observacao || "");
  const src = `${nomeRaw} ${obs}`;
  const up = src.toUpperCase();
  const baseCat = getBaseCat(p.categoria || "IPHONES");
  const corRaw = (p.cor || "").trim();
  const cor = corRaw ? corParaPT(corRaw) : "";

  // Maior valor GB/TB = armazenamento (storage)
  const memMatches = [...up.matchAll(/(\d+)\s*(GB|TB)/g)];
  const mems = memMatches.map(m => ({
    raw: `${m[1]}${m[2]}`,
    gb: m[2] === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]),
  }));
  const sorted = [...mems].sort((a, b) => b.gb - a.gb);
  const storage = sorted[0]?.raw || "";
  // RAM: vem de tag [RAM:X] ou, se não, o menor valor GB/TB quando há 2+
  const ramTag = obs.match(/\[RAM:([^\]]+)\]/);
  let ram = ramTag ? ramTag[1].trim().toUpperCase() : "";
  // Limpar valores invalidos
  if (ram && !/\d/.test(ram)) ram = "";
  if (!ram && sorted.length >= 2) {
    ram = sorted[sorted.length - 1].raw;
  }
  // SSD: tag [SSD:X] ou storage principal
  const ssdTag = obs.match(/\[SSD:([^\]]+)\]/);
  let ssd = ssdTag ? ssdTag[1].trim().toUpperCase() : storage;
  if (ssd && !/\d/.test(ssd)) ssd = storage;

  // Tela (polegadas)
  const telaTag = obs.match(/\[TELA:([^\]]+)\]/);
  const telaNome = up.match(/\b(11|13|14|15|16)["”]/);
  const tela = telaTag ? telaTag[1].trim().replace(/"?$/, '"') : (telaNome ? `${telaNome[1]}"` : "");

  // Tamanho mm (watch)
  const mmMatch = up.match(/(\d{2})\s*MM/);
  const tamMm = mmMatch ? `${mmMatch[1]}mm` : "";

  // Conectividade
  const hasCell = /\+\s*CEL|CELLULAR|\+CELL|GPS\s*\+\s*CEL|\bCEL\b/.test(up);
  const hasGps = /\bGPS\b/.test(up);
  const hasWifi = /WI-?FI|WIFI/.test(up);

  const parts: string[] = [];

  if (baseCat === "IPHONES") {
    // Modelo: iPhone N[e] [Pro Max|Pro|Plus|Air]
    const m = up.match(/IPHONE\s*(\d+E?)\s*(PRO\s*MAX|PRO|PLUS|AIR)?/);
    const modelo = m
      ? `iPhone ${m[1].replace(/E$/, "e")}${m[2] ? " " + m[2].replace(/\s+/g, " ").replace(/\bPRO MAX\b/, "Pro Max").replace(/\bPRO\b/, "Pro").replace(/\bPLUS\b/, "Plus").replace(/\bAIR\b/, "Air") : ""}`
      : nomeRaw;
    parts.push(modelo);
    if (storage) parts.push(storage);
    if (cor) parts.push(cor);
  } else if (baseCat === "IPADS") {
    const chipM = up.match(/(M\d+(?:\s*(?:PRO|MAX))?|A\d+(?:\s*PRO)?)/);
    const chip = chipM ? " " + chipM[1].replace(/\s+/g, " ").toUpperCase() : "";
    let modelo = "iPad";
    // Captura geração depois de MINI/AIR/PRO (ex: "IPAD AIR 5", "IPAD MINI 7", "IPAD PRO 6")
    const mMini = up.match(/IPAD\s+MINI\s+(\d+)\b/);
    const mAir = up.match(/IPAD\s+AIR\s+(\d+)\b/);
    const mPro = up.match(/IPAD\s+PRO\s+(\d+)\b/);
    if (mMini) modelo = `iPad Mini ${mMini[1]}`;
    else if (/MINI/.test(up)) modelo = "iPad Mini";
    else if (mAir) modelo = `iPad Air ${mAir[1]}`;
    else if (/AIR/.test(up)) modelo = "iPad Air";
    else if (mPro) modelo = `iPad Pro ${mPro[1]}`;
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
    // Chip: extrair do nome ou inferir dos nucleos/observacao
    const mbChip = up.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?|A\d+\s*PRO)/i)?.[1] || (() => {
      const nucMatch = up.match(/(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU/i)
        || obs.toUpperCase().match(/\[NUCLEOS:(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\]/i);
      if (!nucMatch) return /NEO/.test(up) ? "A18 Pro" : "";
      const c = parseInt(nucMatch[1]), g = parseInt(nucMatch[2]);
      if (c === 6 && g === 5) return "A18 Pro";
      if (c === 8 && (g === 8 || g === 10)) return "M4";
      if (c === 12 && (g === 16 || g === 19)) return "M4 Pro";
      if (c === 14 && g === 20) return "M4 Pro";
      if (c === 16 && g === 40) return "M4 Max";
      return "";
    })();
    parts.push(modelo + (mbChip ? ` ${mbChip}` : ""));
    if (tela) parts.push(tela);
    if (ram) parts.push(ram);
    if (ssd) parts.push(ssd);
    if (cor) parts.push(cor);
  } else if (baseCat === "MAC_MINI") {
    // Chip: extrair do nome ou inferir dos nucleos (nome ou observacao)
    const mmChip = up.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?)/i)?.[1] || (() => {
      const nucMatch = up.match(/(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU/i)
        || obs.toUpperCase().match(/\[NUCLEOS:(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\]/i);
      if (!nucMatch) return "";
      const c = parseInt(nucMatch[1]), g = parseInt(nucMatch[2]);
      if (c === 10 && g === 10) return "M4";
      if (c === 12 && g === 16) return "M4 Pro";
      if (c === 14 && g === 20) return "M4 Pro";
      if (c === 16 && g === 40) return "M4 Max";
      return "";
    })();
    parts.push(`Mac Mini${mmChip ? " " + mmChip : ""}`);
    if (ram) parts.push(ram);
    if (ssd) parts.push(ssd);
  } else if (baseCat === "APPLE_WATCH") {
    let modelo = "Apple Watch";
    const ultra = up.match(/ULTRA\s*(\d+)?/);
    // \bSE\b com lookahead — NÃO pode casar dentro de "SERIES". Aceita "SE", "SE 2", "SE3".
    const se = up.match(/\bSE(?!R)\s*(\d+)?\b/);
    const series = up.match(/(?:SERIES\s*|\bS)(\d+)/);
    if (ultra) modelo = `Apple Watch Ultra${ultra[1] ? " " + ultra[1] : ""}`;
    else if (se) modelo = `Apple Watch SE${se[1] ? " " + se[1] : ""}`;
    else if (series) modelo = `Apple Watch Series ${series[1]}`;
    parts.push(modelo);
    if (tamMm) parts.push(tamMm);
    // Ultra é sempre cellular; os outros respeitam detecção
    if (ultra) parts.push("GPS + Cellular");
    else if (hasCell) parts.push("GPS + Cellular");
    else if (hasGps) parts.push("GPS");
    if (cor) parts.push(cor);
  } else {
    // Fallback: usa o nome limpo
    return cleanProdutoDisplay(nomeRaw);
  }

  return parts.filter(p => p && p !== "=" && p !== "-").join(" ");
}

/** Limpa o nome do produto para exibição: remove código de origem, info de chip e tags. */
function cleanProdutoDisplay(nome: string | null | undefined): string {
  if (!nome) return "";
  let s = String(nome);
  // Remove parêntese com código de origem, ex: "(IN)", "(LL)"
  s = s.replace(/\s*\((LL|JPA|HN|IN|BR|BZ|CH|ZA|KH|TH|SG)\)\s*/gi, " ");
  // Remove " - CHIP FÍSICO...", "+ E-SIM", etc
  s = s.replace(/\s*[-–]\s*CHIP\s*F[IÍ]SICO[^[]*$/i, "");
  s = s.replace(/\s*\+?\s*E[-\s]?SIM\b.*$/i, "");
  s = s.replace(/\s*CHIP\s*F[IÍ]SICO\b.*$/i, "");
  // Remove códigos de origem isolados precedidos por espaço, ex: " HN", " LL"
  s = s.replace(/\s+(LL|JPA|HN|IN|BR|BZ|CH|ZA|KH|TH|SG)\b.*$/i, "");
  // Remove tags [...] residuais
  s = s.replace(/\[[^\]]*\]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/* ── OCR: colar imagem → texto no campo serial ── */
let tesseractWorker: import("tesseract.js").Worker | null = null;
async function getOcrWorker() {
  if (tesseractWorker) return tesseractWorker;
  const Tesseract = await import("tesseract.js");
  tesseractWorker = await Tesseract.createWorker("eng");
  return tesseractWorker;
}

async function ocrFromImage(blob: Blob): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blob);
  const raw = data.text;

  // Estratégia 1: procurar "Serial No." ou "Serial No" seguido do serial
  const serialMatch = raw.match(/Serial\s*No\.?\s*([A-Za-z0-9]{8,14})/i);
  if (serialMatch) return serialMatch[1].toUpperCase();

  // Estratégia 2: procurar "SN:" ou "S/N:" seguido do serial
  const snMatch = raw.match(/S\/?N[:\s]+([A-Za-z0-9]{8,14})/i);
  if (snMatch) return snMatch[1].toUpperCase();

  // Estratégia 3: procurar qualquer bloco de 10-12 caracteres alfanuméricos (tamanho serial Apple)
  const blocks = raw.match(/\b[A-Za-z][A-Za-z0-9]{9,13}\b/g);
  if (blocks) {
    // Preferir blocos que parecem seriais (mistura de letras e números)
    const serial = blocks.find(b => /[A-Z]/i.test(b) && /[0-9]/.test(b));
    if (serial) return serial.toUpperCase();
  }

  // Fallback: limpar tudo e retornar
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function handleSerialPaste(
  e: React.ClipboardEvent<HTMLInputElement>,
  setValue: (val: string) => void,
  setOcrLoading?: (loading: boolean) => void,
) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      if (!blob) return;
      if (setOcrLoading) setOcrLoading(true);
      ocrFromImage(blob)
        .then((text) => {
          if (text) setValue(text);
        })
        .catch(() => {})
        .finally(() => { if (setOcrLoading) setOcrLoading(false); });
      return;
    }
  }
}

const EtiquetasContent = lazy(() => import("@/app/admin/etiquetas/page").then(m => ({ default: m.EtiquetasContent })));

// ── Tradução de cores para português ──────────────────────────────────────────
const COR_PT: Record<string, string> = {
  "MIDNIGHT": "Meia-noite",
  "SILVER": "Prata",
  "STARLIGHT": "Estelar",
  "LAVENDER": "Lavanda",
  "SPACE BLACK": "Preto Espacial",
  "SPACE GRAY": "Cinza Espacial",
  "SPACE GREY": "Cinza Espacial",
  "NATURAL": "Natural",
  "WHITE": "Branco",
  "BLACK": "Preto",
  "BLUE": "Azul",
  "GREEN": "Verde",
  "YELLOW": "Amarelo",
  "RED": "Vermelho",
  "PURPLE": "Roxo",
  "PINK": "Rosa",
  "GOLD": "Dourado",
  "LIGHT GOLD": "Dourado",
  "TITANIUM": "Titânio",
  "DESERT TITANIUM": "Titânio Deserto",
  "BLACK TITANIUM": "Titânio Preto",
  "WHITE TITANIUM": "Titânio Branco",
  "NATURAL TITANIUM": "Titânio Natural",
  "ROSE GOLD": "Ouro Rosa",
  "CORAL": "Coral",
  "PRODUCT RED": "Vermelho",
  "(PRODUCT)RED": "Vermelho",
  "TEAL": "Azul-petróleo",
  "ULTRAMARINE": "Ultramarino",
  "PEBBLE": "Pedregulho",
  "LIGHT BLUE": "Azul Claro",
  "DARK BLUE": "Azul Escuro",
  "PRETO": "Preto",
  "BRANCO": "Branco",
  "AZUL": "Azul",
  "VERDE": "Verde",
  "ROSA": "Rosa",
  "ROXO": "Roxo",
  "VERMELHO": "Vermelho",
  "AMARELO": "Amarelo",
  "DOURADO": "Dourado",
  "ESTELAR": "Estelar",
  "MEIA-NOITE": "Meia-noite",
  "CINZA": "Cinza",
  "LARANJA": "Laranja",
  "COSMIC ORANGE": "Laranja Cósmico",
  "ORANGE": "Laranja",
  "DEEP BLUE": "Azul Profundo",
  "DEEP PURPLE": "Roxo Profundo",
  "ALPINE GREEN": "Verde Alpino",
  "SIERRA BLUE": "Azul Serra",
  "PACIFIC BLUE": "Azul Pacífico",
  "MIDNIGHT GREEN": "Verde Meia-Noite",
  "GRAPHITE": "Grafite",
  "BLUE TITANIUM": "Titânio Azul",
  "STORM BLUE": "Azul Tempestade",
  "CYPRUS GREEN": "Verde Chipre",
  "MULBERRY": "Amora",
  "SAND": "Areia",
  "LIGHT PINK": "Rosa Claro",
  "OLIVE": "Oliva",
  "PRATA": "Prata",
  "PRATEADO": "Prata",
  "ESTELR": "Estelar",
  "BRONZE": "Bronze",
  "CLAY": "Argila",
  "DENIM": "Jeans",
  "STEALTH BLACK": "Preto Furtivo",
  "SILVER BLUE": "Azul Prata",
  "MIST BLUE": "Azul Névoa",
  "AZUL NÉVOA": "Azul Névoa",
  "AZUL NEVOA": "Azul Névoa",
  "SAGE": "Sálvia",
  "JET BLACK": "Preto Brilhante",
  "CLOUD WHITE": "Branco Nuvem",
  "SKY BLUE": "Azul Céu",
  "INDIGO": "Índigo",
  "BLUSH": "Rosa Blush",
  "CITRUS": "Cítrico",
};

function traduzirCor(cor: string | null | undefined): string {
  if (!cor) return "—";
  const upper = cor.toUpperCase().trim();
  return COR_PT[upper] || cor;
}
// Mapa reverso: Português → Inglês (para cores gravadas em PT)
const PT_TO_EN: Record<string, string> = {
  "PRATA": "Silver",
  "PRATEADO": "Silver",
  "PRETO": "Black",
  "BRANCO": "White",
  "AZUL": "Blue",
  "VERDE": "Green",
  "ROSA": "Pink",
  "ROXO": "Purple",
  "VERMELHO": "Red",
  "AMARELO": "Yellow",
  "DOURADO": "Gold",
  "LARANJA": "Orange",
  "CINZA": "Gray",
  "ESTELAR": "Starlight",
  "MEIA-NOITE": "Midnight",
  "GRAFITE": "Graphite",
  "CORAL": "Coral",
  "AREIA": "Sand",
  "OLIVA": "Olive",
  "JEANS": "Denim",
  "BRONZE": "Bronze",
  "ARGILA": "Clay",
  "AMORA": "Mulberry",
  "AZUL PROFUNDO": "Deep Blue",
  "AZUL PACÍFICO": "Pacific Blue",
  "AZUL PACIFICO": "Pacific Blue",
  "AZUL SIERRA": "Sierra Blue",
  "AZUL TEMPESTADE": "Storm Blue",
  "AZUL PRATA": "Silver Blue",
  "VERDE ALPINO": "Alpine Green",
  "VERDE CHIPRE": "Cyprus Green",
  "VERDE MEIA-NOITE": "Midnight Green",
  "ROXO PROFUNDO": "Deep Purple",
  "LARANJA CÓSMICO": "Cosmic Orange",
  "LARANJA COSMICO": "Cosmic Orange",
  "ROSA CLARO": "Light Pink",
  "PRETO FURTIVO": "Stealth Black",
  "PRETO ESPACIAL": "Space Black",
  "CINZA ESPACIAL": "Space Gray",
  "TITÂNIO NATURAL": "Natural Titanium",
  "TITANIO NATURAL": "Natural Titanium",
  "TITÂNIO PRETO": "Black Titanium",
  "TITANIO PRETO": "Black Titanium",
  "TITÂNIO BRANCO": "White Titanium",
  "TITANIO BRANCO": "White Titanium",
  "TITÂNIO DESERTO": "Desert Titanium",
  "TITANIO DESERTO": "Desert Titanium",
  "TITÂNIO AZUL": "Blue Titanium",
  "TITANIO AZUL": "Blue Titanium",
  "TITÂNIO": "Titanium",
  "TITANIO": "Titanium",
  "NATURAL": "Natural",
  "ULTRAMARINO": "Ultramarine",
  "LAVANDA": "Lavender",
  "AZUL NÉVOA": "Mist Blue",
  "AZUL NEVOA": "Mist Blue",
  "SÁLVIA": "Sage",
  "SALVIA": "Sage",
  "PRETO BRILHANTE": "Jet Black",
  "BRANCO NUVEM": "Cloud White",
  "AZUL CÉU": "Sky Blue",
  "AZUL CEU": "Sky Blue",
  "VERDE-AZULADO": "Teal",
};

const ORIGEM_CODES = ["AA","BE","BR","BZ","CH","E","HN","J","LL","LZ","N","QL","VC","ZD","ZP"];

/** Remove código de origem do final de qualquer string (ex: "AZUL PROFUNDO LL" → "AZUL PROFUNDO") */
function stripCode(s: string): string {
  const upper = s.trim().toUpperCase();
  for (const code of ORIGEM_CODES) {
    if (upper.endsWith(` ${code}`)) return s.trim().slice(0, -(code.length + 1)).trim();
  }
  return s.trim();
}

/** Remove o código de origem (LL, VC, BE...) do final do nome de iPhones — só para exibição */
function stripOrigem(nome: string, categoria?: string | null): string {
  if (!nome) return nome;
  if (categoria && categoria !== "IPHONES") return nome;
  return stripCode(nome);
}

/** Retorna o nome PT da cor embutida no nome do produto (quando cor=null) */
function extractCorPT(nome: string): string | null {
  if (!nome) return null;
  const upper = nome.toUpperCase();
  // Custom PT salvo via +PT
  for (const [enKey, ptVal] of Object.entries(CUSTOM_COR_PT)) {
    if (upper.includes(enKey)) return ptVal;
  }
  // Verifica cores EN no nome → retorna tradução PT (do mais longo para o mais curto)
  const enKeys = Object.keys(COR_PT).sort((a, b) => b.length - a.length);
  for (const enKey of enKeys) {
    if (upper.includes(enKey)) return COR_PT[enKey];
  }
  // Verifica do mais longo para o mais curto para evitar matches parciais
  const ptKeys = Object.keys(PT_TO_EN).sort((a, b) => b.length - a.length);
  for (const ptKey of ptKeys) {
    if (upper.includes(ptKey)) {
      return ptKey.charAt(0).toUpperCase() + ptKey.slice(1).toLowerCase();
    }
  }
  return null;
}

/** Extrai a cor EN embutida no nome do produto (quando cor=null) */
function extractCorEN(nome: string): string | null {
  if (!nome) return null;
  const upper = nome.toUpperCase();
  const enKeys = Object.keys(COR_PT).sort((a, b) => b.length - a.length);
  for (const enKey of enKeys) {
    if (upper.includes(enKey)) return enKey;
  }
  return null;
}

/**
 * Retorna o nome para exibição:
 * - Remove código de origem
 * - Substitui cor em português pelo equivalente em inglês (ex: AZUL PROFUNDO → DEEP BLUE)
 * - Quando cor=null, tenta encontrar cor PT no próprio nome do produto
 */
/** Extrai tamanho (42MM, 46MM etc) e pulseira (SPORT BAND S/M etc) de um nome de Apple Watch */
function extractWatchBadges(nome: string): { tamanho: string | null; pulseira: string | null } {
  if (!nome) return { tamanho: null, pulseira: null };
  const upper = nome.toUpperCase();
  const tamMatch = upper.match(/\b(\d{2}MM)\b/);
  const tamanho = tamMatch ? tamMatch[1] : null;
  // Pulseira: se tem "PULSEIRA ..." no nome, pega tudo após (mais confiável)
  let pulseira: string | null = null;
  const pulseiraExplicita = upper.match(/PULSEIRA\s+(.+?)$/);
  if (pulseiraExplicita) {
    pulseira = pulseiraExplicita[1]
      .replace(/\s*GPS\s*\+\s*CELLULAR\b/g, "")
      .replace(/\s*GPS\s*\+\s*CEL\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    // Fallback: pattern conhecido sem label PULSEIRA
    const pulseiraMatch = upper.match(/\b((?:SPORT|BRAIDED SOLO|SOLO|MILANESE|LINK BRACELET|LEATHER|OCEAN|TRAIL|NIKE SPORT|ALPINE)\s*(?:LOOP|BAND)?(?:\s+(?:XS|S|S\/M|M|M\/L|L|XL))?)\b/);
    pulseira = pulseiraMatch ? pulseiraMatch[1].trim() : null;
  }
  return { tamanho, pulseira };
}

function displayNomeProduto(nome: string, cor: string | null | undefined, categoria?: string | null): string {
  let display = stripOrigem(nome, categoria);
  // MacBook/Mac Mini: remover núcleos detalhados do nome exibido (aparece como badge separado)
  if (categoria && (getBaseCat(categoria) === "MACBOOK" || getBaseCat(categoria) === "MAC_MINI")) {
    display = display.replace(/\s*\(\d+C?\s*CPU\/\d+C?\s*GPU\)/gi, "").replace(/\s+/g, " ").trim();
  }
  // Apple Watch: remover "PULSEIRA ..." do nome (aparece como badge) e, para Ultra, remover "GPS + Cellular"
  if (categoria && getBaseCat(categoria) === "APPLE_WATCH") {
    // Remove sufixo "PULSEIRA XYZ..." (até fim da string, já que vem por último)
    display = display.replace(/\s*PULSEIRA\s+.*$/i, "").trim();
    if (/ULTRA/i.test(display)) {
      display = display
        .replace(/\s*GPS\s*\+\s*CELLULAR\b/gi, "")
        .replace(/\s*GPS\s*\+\s*CEL\b/gi, "")
        .replace(/\s+CELLULAR\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  if (!cor) {
    // Sem campo cor: tenta encontrar e traduzir cor PT embutida no nome
    const upper = display.toUpperCase();
    const ptKeys = Object.keys(PT_TO_EN).sort((a, b) => b.length - a.length);
    for (const ptKey of ptKeys) {
      if (upper.includes(ptKey)) {
        const en = PT_TO_EN[ptKey];
        const pattern = ptKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        try { display = display.replace(new RegExp(pattern, "gi"), en.toUpperCase()); } catch { /* ignore */ }
        break;
      }
    }
    return display.toUpperCase();
  }
  // Remove código de origem do campo cor também (ex: "AZUL PROFUNDO LL" → "AZUL PROFUNDO")
  const corClean = (categoria === "IPHONES" || !categoria) ? stripCode(cor) : cor;
  const upper = corClean.toUpperCase().trim();
  const en = PT_TO_EN[upper];
  const corEN = en ? en.toUpperCase() : upper; // cor em inglês (ou original se não tem tradução)
  // Verifica se o nome já contém alguma cor comercial conhecida (EN)
  const displayUpper = display.toUpperCase();
  const nomeJaTemCorEN = Object.keys(COR_PT).sort((a, b) => b.length - a.length)
    .some(enKey => enKey.length >= 3 && displayUpper.includes(enKey));

  if (en) {
    // Substitui a cor em PT pelo equivalente EN no nome (case-insensitive)
    const pattern = upper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const before = display;
    try { display = display.replace(new RegExp(pattern, "gi"), corEN); } catch { /* ignore */ }
    // Se não substituiu e nome NÃO tem cor EN conhecida, anexar
    if (display === before && !display.toUpperCase().includes(corEN) && !nomeJaTemCorEN) {
      display = `${display} ${corEN}`;
    }
  } else {
    // Cor sem tradução — se não está no nome e nome não tem cor conhecida, anexar
    if (!display.toUpperCase().includes(upper) && !nomeJaTemCorEN) {
      display = `${display} ${cor}`;
    }
  }
  return display.toUpperCase();
}

// Mapa custom de cores PT salvas via +PT (persiste no localStorage)
const CUSTOM_COR_PT: Record<string, string> = {};
try {
  const saved = typeof window !== "undefined" ? localStorage.getItem("tigrao_custom_cor_pt") : null;
  if (saved) Object.assign(CUSTOM_COR_PT, JSON.parse(saved));
} catch { /* ignore */ }
function saveCustomCorPT(en: string, pt: string) {
  CUSTOM_COR_PT[en.toUpperCase().trim()] = pt;
  try { localStorage.setItem("tigrao_custom_cor_pt", JSON.stringify(CUSTOM_COR_PT)); } catch { /* ignore */ }
}

/** Retorna só a tradução em português da cor (para exibir em cinza ao lado do nome) */
function corSoPT(cor: string | null | undefined, nome?: string | null): string | null {
  if (!cor) {
    // Sem campo cor: tenta extrair cor PT do nome do produto
    if (nome) return extractCorPT(nome);
    return null;
  }
  // Remove código de origem do campo cor antes de traduzir
  const corClean = stripCode(cor);
  const upper = corClean.toUpperCase().trim();
  // Custom PT salvo via +PT (localStorage)
  const customPt = CUSTOM_COR_PT[upper];
  if (customPt) return customPt;
  const pt = COR_PT[upper]; // cor armazenada em EN → retorna PT
  if (pt && pt.toLowerCase() !== upper.toLowerCase()) return pt;
  if (PT_TO_EN[upper]) return corClean.charAt(0).toUpperCase() + corClean.slice(1).toLowerCase(); // armazenada em PT → retorna formatada
  return null;
}

/** Retorna a cor em EN canônico (ex: "Lavender", "Teal", "Ultramarine") a partir de p.cor (que pode estar em PT ou EN). */
function corEnOriginal(cor: string | null | undefined): string | null {
  if (!cor) return null;
  const clean = stripCode(cor).trim();
  if (!clean || clean === "—") return null;
  const upper = clean.toUpperCase();
  // Já em EN?
  if (COR_PT[upper]) return clean.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  // PT → EN
  const en = PT_TO_EN[upper];
  if (en) return en;
  // Fallback: devolve formatado
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/** Retorna "Silver · Prata" se houver tradução diferente, senão só o original */
function corBilingual(cor: string | null | undefined): string {
  if (!cor) return "—";
  const upper = cor.toUpperCase().trim();
  // Custom PT salvo via +PT
  const customPt = CUSTOM_COR_PT[upper];
  if (customPt) return `${cor} · ${customPt}`;
  // EN → PT
  const pt = COR_PT[upper];
  if (pt && pt.toLowerCase() !== cor.toLowerCase()) return `${cor} · ${pt}`;
  // PT → EN (cores gravadas em português)
  const en = PT_TO_EN[upper];
  if (en) return `${en} · ${cor.charAt(0).toUpperCase() + cor.slice(1).toLowerCase()}`;
  return cor;
}

interface ProdutoEstoque {
  id: string;
  produto: string;
  categoria: string;
  qnt: number;
  custo_unitario: number;
  status: string;
  cor: string | null;
  observacao: string | null;
  tipo: string;
  bateria: number | null;
  data_compra: string | null;
  cliente: string | null;
  fornecedor: string | null;
  imei: string | null;
  serial_no: string | null;
  data_entrada: string | null;
  preco_sugerido: number | null;
  estoque_minimo: number | null;
  pedido_fornecedor_id: string | null;
  origem: string | null;
  garantia: string | null;
  reserva_cliente: string | null;
  reserva_data: string | null;
  reserva_para: string | null;
  reserva_operador: string | null;
  origem_compra: string | null;
  custo_compra: number | null;
  encomenda_id: string | null;
}

interface ImeiSearchResult {
  estoque: ProdutoEstoque[];
  vendas: { id: string; produto: string; cliente: string; data: string; preco_vendido: number; fornecedor: string | null; imei: string | null; [key: string]: unknown }[];
}

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
}

const DEFAULT_CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "SEMINOVOS"] as const;
const STATUS_OPTIONS = ["EM ESTOQUE", "A CAMINHO", "PENDENTE", "ESGOTADO"] as const;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
/** Converte YYYY-MM-DD para DD/MM/YYYY */
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

// Mapear categoria customizada para base estruturada (ex: APPLE_WATCH_ATACADO → APPLE_WATCH)
const STRUCTURED_CATS_LIST = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS", "SEMINOVOS"];
function getBaseCat(cat: string): string {
  // Seminovos usa mesmos campos de iPhones
  if (cat === "SEMINOVOS") return "IPHONES";
  if (STRUCTURED_CATS_LIST.includes(cat)) return cat;
  const sorted = [...STRUCTURED_CATS_LIST].sort((a, b) => b.length - a.length);
  for (const base of sorted) {
    if (cat.startsWith(base + "_") || cat.startsWith(base)) return base;
  }
  return cat;
}

const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MACBOOK_NEO: "MacBook Neo",
  MACBOOK_AIR: "MacBook Air",
  MACBOOK_PRO: "MacBook Pro",
  MAC_MINI: "Mac Mini",
  MAC_STUDIO: "Mac Studio",
  IMAC: "iMac",
  APPLE_WATCH: "Apple Watch",
  APPLE_WATCH_ATACADO: "Apple Watch Atacado",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  SEMINOVOS: "Seminovos",
};

const STATUS_COLORS: Record<string, string> = {
  "EM ESTOQUE": "bg-green-100 text-green-700",
  "A CAMINHO": "bg-blue-100 text-blue-700",
  "PENDENTE": "bg-yellow-100 text-yellow-700",
  "ESGOTADO": "bg-red-100 text-red-600",
};

/** Extrai o "modelo base" de um produto para agrupar em cards */
function getModeloBase(produto: string, categoria: string, observacao?: string | null): string {
  const p = produto.toUpperCase().trim();
  // Inferir categoria quando vier vazia/inválida baseado no nome do produto
  let baseCat = getBaseCat(categoria || "");
  if (!baseCat || !["IPHONES","IPADS","MACBOOK","MAC_MINI","APPLE_WATCH","AIRPODS","ACESSORIOS"].includes(baseCat)) {
    if (/\bIPHONE\b/.test(p)) baseCat = "IPHONES";
    else if (/\bIPAD\b/.test(p)) baseCat = "IPADS";
    else if (/\bMACBOOK\b/.test(p)) baseCat = "MACBOOK";
    else if (/\bMAC\s*MINI\b/.test(p)) baseCat = "MAC_MINI";
    else if (/\bWATCH\b/.test(p)) baseCat = "APPLE_WATCH";
    else if (/\bAIRPODS?\b/.test(p)) baseCat = "AIRPODS";
  }

  // Helpers — pega o MAIOR valor de GB/TB (armazenamento, não RAM)
  const getMem = () => {
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    if (all.length === 0) return "";
    // Converter tudo pra GB e pegar o maior (armazenamento > RAM)
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const biggest = vals.sort((a, b) => b.gb - a.gb)[0];
    return ` ${biggest.raw}`;
  };
  const getSize = () => { const m = p.match(/(\d{2})[""]/); return m ? ` ${m[1]}"` : ""; };

  if (baseCat === "IPHONES") {
    // Captura "16", "16e", "16 Pro", "16 Pro Max", "16 Plus", "16 Air"
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
    // MacBook: agrupar por RAM + SSD (dois GB/TB distintos)
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const sorted = [...vals].sort((a, b) => a.gb - b.gb);
    const ram = sorted.length >= 2 ? ` ${sorted[0].raw}` : "";
    const ssd = sorted.length >= 1 ? ` ${sorted[sorted.length - 1].raw}` : "";
    const memPair = `${ram}${ssd}`;
    const size = getSize();
    // Extrair chip do nome ou inferir dos nucleos
    const chipMatch = p.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?)/i);
    let chip = chipMatch ? ` ${chipMatch[1].replace(/\s+/g, " ").trim()}` : "";
    if (!chip) {
      let nucMatch = p.match(/(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU/i);
      if (!nucMatch && observacao) {
        const obsNuc = observacao.match(/\[NUCLEOS:(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\]/i);
        if (obsNuc) nucMatch = obsNuc;
      }
      if (nucMatch) {
        const c = parseInt(nucMatch[1]), g = parseInt(nucMatch[2]);
        if (c === 8 && (g === 8 || g === 10)) chip = " M4";
        else if (c === 12 && (g === 16 || g === 19)) chip = " M4 Pro";
        else if (c === 14 && g === 20) chip = " M4 Pro";
        else if (c === 16 && g === 40) chip = " M4 Max";
        else if (c === 6 && g === 5) chip = " A18 Pro";
      }
    }
    if (p.includes("NEO")) return `MacBook Neo${chip || " A18 Pro"}${size}${memPair}`;
    if (p.includes("AIR")) return `MacBook Air${chip}${size}${memPair}`;
    if (p.includes("PRO")) return `MacBook Pro${chip}${size}${memPair}`;
    return `MacBook${chip}${memPair}`;
  }
  if (baseCat === "MAC_MINI") {
    // Mac Mini: agrupar por chip + RAM + SSD
    const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
    const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
    const sorted = [...vals].sort((a, b) => a.gb - b.gb);
    const ram = sorted.length >= 2 ? ` ${sorted[0].raw}` : "";
    const ssd = sorted.length >= 1 ? `/${sorted[sorted.length - 1].raw}` : "";
    const memPair = `${ram}${ssd}`;
    // Chip: extrair do nome, dos nucleos no nome, ou da tag [NUCLEOS:...] na observacao
    const chipMatch = p.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?)/i);
    let chip = chipMatch ? ` ${chipMatch[1].replace(/\s+/g, " ").trim()}` : "";
    if (!chip) {
      // Tentar nucleos no nome
      let nucMatch = p.match(/(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU/i);
      // Fallback: nucleos na observacao [NUCLEOS:12C CPU/16C GPU]
      if (!nucMatch && observacao) {
        const obsNuc = observacao.match(/\[NUCLEOS:(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\]/i);
        if (obsNuc) nucMatch = obsNuc;
      }
      if (nucMatch) {
        const c = parseInt(nucMatch[1]), g = parseInt(nucMatch[2]);
        if (c === 10 && g === 10) chip = " M4";
        else if (c === 12 && g === 16) chip = " M4 Pro";
        else if (c === 14 && g === 20) chip = " M4 Pro";
        else if (c === 16 && g === 40) chip = " M4 Max";
      }
    }
    return `Mac Mini${chip}${memPair}`;
  }
  if (baseCat === "APPLE_WATCH") {
    // Watch: agrupar por modelo + geração + tamanho + conectividade
    // GPS e GPS+CELL são modelos diferentes, não compartilham card/balanço
    const sizeW = p.match(/(\d{2})\s*MM/i);
    const sz = sizeW ? ` ${sizeW[1]}mm` : "";
    const isCell = /\+\s*CEL|GPS\s*\+\s*CEL|CELL|CELULAR/.test(p);
    const conn = isCell ? " GPS+CEL" : " GPS";
    // Ultra com geração (Ultra 2, Ultra 3) — Ultra é sempre GPS+CEL, não sufixa
    const ultraMatch = p.match(/ULTRA\s*(\d+)?/);
    if (ultraMatch) {
      const gen = ultraMatch[1] ? ` ${ultraMatch[1]}` : "";
      return `Apple Watch Ultra${gen}${sz}`;
    }
    // SE com geração (SE 2, SE 3)
    const seMatch = p.match(/SE\s*(\d+)/);
    if (seMatch) return `Apple Watch SE ${seMatch[1]}${sz}${conn}`;
    if (p.includes("SE")) return `Apple Watch SE${sz}${conn}`;
    // Series com número
    const seriesMatch = p.match(/(?:SERIES\s*|S)(\d+)/);
    if (seriesMatch) return `Apple Watch Series ${seriesMatch[1]}${sz}${conn}`;
    return `Apple Watch${sz}${conn}`;
  }
  if (baseCat === "AIRPODS") {
    // AirPods com geração
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
      // Separar ANC vs sem ANC (são modelos diferentes)
      const hasANC = p.includes("ANC") || p.includes("COM ANC");
      const noANC = p.includes("SEM ANC");
      if (hasANC && !noANC) return `AirPods ${gen} ANC`;
      if (noANC) return `AirPods ${gen}`;
      return `AirPods ${gen}`;
    }
    return "AirPods";
  }
  // Fallback: normalizar trailing dashes/espaços
  return produto.replace(/\s*[-–]\s*$/, "").trim();
}

export default function EstoquePage() {
  const { password, user, darkMode } = useAdmin();
  const userName = user?.nome ?? "sistema";
  const isAdmin = user?.role === "admin";
  const dm = darkMode;
  // Dark mode color helpers
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgCardAlt = dm ? "bg-[#1A1A1A]" : "bg-[#F5F5F7]";
  const bgCardHover = dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]";
  const borderCard = dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]";
  const borderCardAlt = dm ? "border-[#2C2C2E]" : "border-[#E8E8ED]";
  const borderLight = dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const textMuted = dm ? "text-[#6E6E73]" : "text-[#C7C7CC]";
  const bgSection = dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]";
  const bgHoverBtn = dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F5F5F7]";
  const bgInline = dm ? "bg-[#2C2C2E]" : "bg-white";
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([]);
  const [encomendaMap, setEncomendaMap] = useState<Map<string, string>>(new Map()); // estoque_id → cliente
  const [loading, setLoading] = useState(true);
  const ESTOQUE_TABS = ["estoque", "seminovos", "reservas", "atacado", "pendencias", "acaminho", "reposicao", "esgotados", "acabando", "novo", "scan", "historico", "etiquetas"] as const;
  const [tab, setTab] = useTabParam<"estoque" | "seminovos" | "reservas" | "atacado" | "pendencias" | "acaminho" | "reposicao" | "esgotados" | "acabando" | "novo" | "scan" | "historico" | "etiquetas">("estoque", ESTOQUE_TABS);
  const [historicoLogs, setHistoricoLogs] = useState<{ id: string; created_at: string; usuario: string; acao: string; produto_nome: string; campo: string; valor_anterior: string; valor_novo: string; detalhes: string }[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [filterBateria, setFilterBateria] = useState("");
  const [search, setSearch] = useState("");
  const [filterDataCompra, setFilterDataCompra] = useState("");
  const [acaminhoFilter, setAcaminhoFilter] = useState<"pendentes" | "recebidos" | "todos">("pendentes");
  // Filtros seminovos: linha de modelo e características
  const [filterLinha, setFilterLinha] = useState("");
  const [filterCaract, setFilterCaract] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [editingCusto, setEditingCusto] = useState<Record<string, string>>({});
  const [editingQnt, setEditingQnt] = useState<Record<string, string>>({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set());
  const [editingNome, setEditingNome] = useState<Record<string, string>>({});
  const [editingCorPT, setEditingCorPT] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<Record<string, Record<string, string>>>({});
  const [variacoes, setVariacoes] = useState<{ cor: string; qnt: string }[]>([]);
  const [editingCat, setEditingCat] = useState<Record<string, string>>({});
  const [importingInitial, setImportingInitial] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [detailProduct, setDetailProduct] = useState<ProdutoEstoque | null>(null);
  // Drag-and-drop: ordem customizada das seções de modelo
  const [lineOrder, setLineOrder] = useState<Record<string, string[]>>({});
  const [reorderMode, setReorderMode] = useState(false);
  // Modal de reservar produto
  const [reservaTarget, setReservaTarget] = useState<ProdutoEstoque | null>(null);
  const [reservaForm, setReservaForm] = useState({ cliente: "", data: "", para: "", operador: "" });
  const [reservaSaving, setReservaSaving] = useState(false);
  // Configs do catálogo para o modelo do produto no detalhe (cores por modelo específico)
  const [detailModelConfigs, setDetailModelConfigs] = useState<Record<string, string[]>>({});
  // Mapa completo modelo → [cores EN] do catálogo (usado na reposição)
  const [catalogoCoresMap, setCatalogoCoresMap] = useState<Record<string, string[]>>({});
  const [catalogoCatByModel, setCatalogoCatByModel] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/catalogo-cores")
      .then(r => r.json())
      .then(j => {
        if (j?.modelos) setCatalogoCoresMap(j.modelos);
        if (j?.categorias) setCatalogoCatByModel(j.categorias);
      })
      .catch(() => {});
  }, []);
  // Modelos ocultos da reposição (controle do usuário, localStorage)
  const [reposicaoOcultos, setReposicaoOcultos] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("tigrao_reposicao_ocultos") || "[]")); } catch { return new Set(); }
  });
  const toggleReposicaoOculto = (nomeModelo: string) => {
    setReposicaoOcultos(prev => {
      const next = new Set(prev);
      if (next.has(nomeModelo)) next.delete(nomeModelo); else next.add(nomeModelo);
      localStorage.setItem("tigrao_reposicao_ocultos", JSON.stringify([...next]));
      return next;
    });
  };
  const [showReposicaoConfig, setShowReposicaoConfig] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const showSaved = (field: string) => { setSavedField(field); setTimeout(() => setSavedField(null), 1800); };
  const [editingDetailSerial, setEditingDetailSerial] = useState(false);
  const [editingDetailImei, setEditingDetailImei] = useState(false);
  const [recatMode, setRecatMode] = useState(false);
  const [recatRow, setRecatRow] = useState<ProdutoRowState>(createEmptyProdutoRow);
  // Markup % para preço sugerido por tipo de produto
  const [markupConfig, setMarkupConfig] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("tigrao_markup_config") || "{}"); } catch { return {}; }
  });
  const saveMarkupConfig = (cfg: Record<string, number>) => {
    setMarkupConfig(cfg);
    localStorage.setItem("tigrao_markup_config", JSON.stringify(cfg));
  };
  const [detailAppleId, setDetailAppleId] = useState("");
  const [entradaView, setEntradaView] = useState<{ data: string; fornecedor: string; produtos: ProdutoEstoque[] } | null>(null);
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
  const [novoFornecedorNome, setNovoFornecedorNome] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showDiagnostico, setShowDiagnostico] = useState(false);

  // Balance mode (seminovos)
  const [balanceMode, setBalanceMode] = useState(false);
  const [balanceSelected, setBalanceSelected] = useState<Set<string>>(new Set());
  const [balanceApplying, setBalanceApplying] = useState(false);

  // IMEI search
  const [imeiSearch, setImeiSearch] = useState("");
  const [imeiResult, setImeiResult] = useState<ImeiSearchResult | null>(null);
  const [imeiSearching, setImeiSearching] = useState(false);
  const [showImeiSearch, setShowImeiSearch] = useState(false);

  // Modal de etiqueta obrigatória ao mover
  const [etiquetaModal, setEtiquetaModal] = useState<{
    item: ProdutoEstoque;
    items?: { item: ProdutoEstoque; serial: string }[]; // para múltiplas unidades
    batchItems?: ProdutoEstoque[]; // para mover selecionados em lote
    precoVenda: number | null;
    printed: boolean;
    loading: boolean;
    precoCustom: string;
    tamanho: "pequena" | "media" | "grande";
    dataEntrada: string; // data de entrada no estoque (editável)
  } | null>(null);

  // Confirmação de "Mover para Estoque" com seleção de data no modal de detalhe
  const [moveConfirmId, setMoveConfirmId] = useState<string | null>(null);
  const [moveConfirmData, setMoveConfirmData] = useState<string>(hojeBR());

  // Seleção em lote na aba A Caminho
  const [selectedACaminho, setSelectedACaminho] = useState<Set<string>>(new Set());
  // Grupos expandidos na aba A Caminho (key = "date::baseModel")
  const [expandedACaminhoGroups, setExpandedACaminhoGroups] = useState<Set<string>>(new Set());

  const handleImeiSearch = async () => {
    if (!imeiSearch.trim()) return;
    setImeiSearching(true);
    try {
      const res = await fetch(`/api/estoque?imei=${encodeURIComponent(imeiSearch.trim())}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      });
      if (res.ok) {
        const json = await res.json();
        setImeiResult(json);
      }
    } catch { /* ignore */ }
    setImeiSearching(false);
  };

  // Bulk select helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} produto(s) selecionado(s)?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/estoque", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setEstoque((prev) => prev.filter((r) => !selectedIds.has(r.id)));
        setMsg(`${selectedIds.size} produto(s) excluído(s)`);
        setSelectedIds(new Set());
        setSelectMode(false);
      } else {
        const json = await res.json();
        setMsg("Erro: " + (json.error || "Falha ao excluir"));
      }
    } catch (err) { setMsg("Erro: " + String(err)); }
    setBulkDeleting(false);
  };

  // Categorias dinâmicas
  const [categoriasState, setCategoriasState] = useState<Categoria[]>(() => getCategoriasEstoque());
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ label: "", emoji: "\u{1F4E6}" });
  const [editingCatName, setEditingCatName] = useState("");
  const [editCatLabel, setEditCatLabel] = useState("");
  const CATEGORIAS = categoriasState.map((c) => c.key);
  const catLabelsFromState: Record<string, string> = {};
  categoriasState.forEach((c) => { catLabelsFromState[c.key] = c.label; });
  // Merge com CAT_LABELS estático para backwards compat
  const dynamicCatLabels: Record<string, string> = { ...CAT_LABELS, ...catLabelsFromState };

  function handleAddCategoriaEstoque() {
    if (!newCat.label.trim()) return;
    const key = newCat.label.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    if (!key) return;
    const updated = addCategoriaEstoque({ key, label: newCat.label.trim(), emoji: newCat.emoji, custom: true });
    setCategoriasState(updated);
    setNewCat({ label: "", emoji: "\u{1F4E6}" });
    setShowNewCat(false);
  }

  function handleRemoveCategoriaEstoque(key: string) {
    const cat = categoriasState.find((c) => c.key === key);
    if (!cat?.custom) return;
    if (!confirm(`Remover categoria "${cat.label}"?`)) return;
    const updated = removeCategoriaEstoque(key);
    setCategoriasState(updated);
    if (filterCat === key) setFilterCat("");
  }

  function handleEditCategoriaEstoque(key: string) {
    if (!editCatLabel.trim()) return;
    const updated = editCategoriaEstoque(key, { label: editCatLabel.trim() });
    setCategoriasState(updated);
    setEditingCatName("");
    setEditCatLabel("");
  }

  // Override de títulos de cards (modelo agrupador) — persiste no banco pra sincronizar entre usuários
  const [cardTitleOverrides, setCardTitleOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("tigrao_card_title_overrides") || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    const fetchOverrides = async (migrate = false) => {
      try {
        const r = await fetch("/api/admin/estoque-settings?key=card_title_overrides", {
          headers: { "x-admin-password": password },
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (j.value && typeof j.value === "object" && Object.keys(j.value).length > 0) {
          // Merge remoto com local (local tem prioridade se ainda não sincronizado)
          setCardTitleOverrides(prev => {
            const merged = { ...(j.value as Record<string, string>), ...prev };
            try { localStorage.setItem("tigrao_card_title_overrides", JSON.stringify(merged)); } catch {}
            return merged;
          });
        } else if (migrate) {
          // Migrar do localStorage se existir (só na 1ª carga)
          try {
            const local = JSON.parse(localStorage.getItem("tigrao_card_title_overrides") || "{}") as Record<string, string>;
            if (Object.keys(local).length > 0) {
              setCardTitleOverrides(local);
              fetch("/api/admin/estoque-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "x-admin-password": password },
                body: JSON.stringify({ key: "card_title_overrides", value: local }),
              }).catch(() => {});
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    };
    fetchOverrides(true);
    // Polling a cada 60s + refetch ao voltar de aba oculta (evita disparos em cada foco de janela)
    const interval = setInterval(() => fetchOverrides(false), 60000);
    let wasHidden = false;
    const onVisibility = () => {
      if (document.hidden) { wasHidden = true; return; }
      if (wasHidden) { wasHidden = false; fetchOverrides(false); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingCardTitle, setEditingCardTitle] = useState("");
  const [editCardTitleValue, setEditCardTitleValue] = useState("");
  function saveCardTitleOverride(originalTitle: string, newTitle: string) {
    const updated = { ...cardTitleOverrides, [originalTitle]: newTitle.trim() };
    if (!newTitle.trim() || newTitle.trim() === originalTitle) delete updated[originalTitle];
    setCardTitleOverrides(updated);
    // Persiste no localStorage como fallback imediato
    try { localStorage.setItem("tigrao_card_title_overrides", JSON.stringify(updated)); } catch {}
    // Salva no banco (sincroniza entre usuários)
    fetch("/api/admin/estoque-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ key: "card_title_overrides", value: updated }),
    })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          console.error("[card_title_overrides] save failed", j);
          alert(`Erro ao salvar nome do card no banco: ${j.error || r.statusText}. O nome ficou salvo localmente neste navegador.`);
        }
      })
      .catch(err => {
        console.error("[card_title_overrides] save error", err);
        alert(`Erro de rede ao salvar nome do card. Ficou salvo localmente. Detalhe: ${err?.message || err}`);
      });
    setEditingCardTitle("");
    setEditCardTitleValue("");
  }
  function getCardTitle(modelo: string): string {
    const upModelo = modelo.toUpperCase();
    // 1. Match exato
    const override = cardTitleOverrides[modelo];
    if (override) {
      const upOverride = override.toUpperCase();
      // Guarda: se modelo é SERIES 11 mas override diz "SE 42"/"SE 46", ignora (corrupto)
      if (/SERIES\s*11|S\s*11|\bS11\b/.test(upModelo) && /\bSE\b/.test(upOverride)) {
        return upModelo;
      }
      return upOverride;
    }
    // 2. Fallback: chave antiga sem sufixo " GPS+CEL" ou " GPS" (Apple Watch agrupava sem connectivity antes)
    const semConn = modelo.replace(/\s+GPS\+CEL$/, "").replace(/\s+GPS$/, "");
    if (semConn !== modelo && cardTitleOverrides[semConn]) {
      const base = cardTitleOverrides[semConn];
      const suffix = modelo.endsWith(" GPS+CEL") ? " GPS+CEL" : modelo.endsWith(" GPS") ? " GPS" : "";
      return (base + suffix).toUpperCase();
    }
    return upModelo;
  }

  // Limpa overrides de cardTitle corrompidos (SE 42/SE 46 aplicado a Series 11)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("tigrao_card_title_overrides");
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, string>;
      let changed = false;
      for (const [k, v] of Object.entries(obj)) {
        const upK = (k || "").toUpperCase();
        const upV = (v || "").toUpperCase();
        if (/SERIES\s*11|S\s*11|\bS11\b/.test(upK) && /\bSE\b/.test(upV)) {
          delete obj[k];
          changed = true;
        }
        // Também limpa overrides que contenham "SE 42" ou "SE 46" em modelo Apple Watch
        if ((/WATCH/.test(upK) || /SERIES/.test(upK)) && /SE\s*4[26]/.test(upV)) {
          delete obj[k];
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem("tigrao_card_title_overrides", JSON.stringify(obj));
        setCardTitleOverrides(obj);
      }
    } catch { /* ignore */ }
  }, []);

  // Drag-and-drop para reordenar
  const dragItemRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function handleEstoqueDragEnd() {
    if (!dragItemRef.current || !dragOverRef.current || dragItemRef.current === dragOverRef.current) {
      setDragId(null); return;
    }
    // Reordenar no state local
    setEstoque((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((p) => p.id === dragItemRef.current);
      const toIdx = arr.findIndex((p) => p.id === dragOverRef.current);
      if (fromIdx === -1 || toIdx === -1) return arr;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
    setDragId(null);
    dragItemRef.current = null;
    dragOverRef.current = null;
  }

  // Reordenação de cards (modelo inteiro) via drag-and-drop + botões ▲/▼
  const [cardOrders, setCardOrders] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    const result: Record<string, string[]> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("tigrao_estoque_card_order_")) {
          const cat = k.replace("tigrao_estoque_card_order_", "");
          result[cat] = JSON.parse(localStorage.getItem(k) || "[]");
        }
      }
    } catch { /* ignore */ }
    return result;
  });
  const dragCardRef = useRef<string | null>(null);
  const [dragCardKey, setDragCardKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ modelo: string; position: "before" | "after" } | null>(null);
  function saveCardOrder(cat: string, keys: string[]) {
    setCardOrders(prev => ({ ...prev, [cat]: keys }));
    if (typeof window !== "undefined") {
      localStorage.setItem(`tigrao_estoque_card_order_${cat}`, JSON.stringify(keys));
    }
  }
  function sortByCardOrder(entries: [string, ProdutoEstoque[]][], cat: string): [string, ProdutoEstoque[]][] {
    const order = cardOrders[cat] || [];
    if (!order.length) return entries;
    return [...entries].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  function moveCard(cat: string, modeloEntries: [string, ProdutoEstoque[]][], index: number, direction: "up" | "down") {
    const keys = modeloEntries.map(([m]) => m);
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= keys.length) return;
    [keys[index], keys[targetIdx]] = [keys[targetIdx], keys[index]];
    saveCardOrder(cat, keys);
  }
  function handleCardDragOver(e: React.DragEvent, modelo: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragCardRef.current || dragCardRef.current === modelo) {
      setDropTarget(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";
    setDropTarget({ modelo, position });
  }
  function handleCardDrop(cat: string, modeloEntries: [string, ProdutoEstoque[]][]) {
    if (!dragCardRef.current || !dropTarget) {
      setDragCardKey(null); setDropTarget(null); return;
    }
    const keys = modeloEntries.map(([m]) => m);
    const fromIdx = keys.indexOf(dragCardRef.current);
    let toIdx = keys.indexOf(dropTarget.modelo);
    if (fromIdx === -1 || toIdx === -1) { setDragCardKey(null); setDropTarget(null); return; }
    // Remove from old position
    keys.splice(fromIdx, 1);
    // Recalculate target index after removal
    toIdx = keys.indexOf(dropTarget.modelo);
    if (dropTarget.position === "after") toIdx += 1;
    keys.splice(toIdx, 0, dragCardRef.current);
    saveCardOrder(cat, keys);
    setDragCardKey(null);
    setDropTarget(null);
    dragCardRef.current = null;
  }

  // Duplicar produto do estoque
  // Parsear nome do produto para extrair specs
  function parseProductSpecs(nome: string, cat: string) {
    const baseCat = getBaseCat(cat);
    const n = (nome || "").toUpperCase();
    const storageMatch = n.match(/(\d+(?:TB|GB))/);
    const telaMatch = n.match(/([\d.]+[""])/);
    const storage = storageMatch ? storageMatch[1] : "";
    const tela = telaMatch ? telaMatch[1].replace(/[""]/g, '"') : "";

    if (baseCat === "IPADS") {
      const modelo = n.includes("AIR") ? "AIR" : n.includes("PRO") ? "PRO" : n.includes("MINI") ? "MINI" : "IPAD";
      const conn = n.includes("CELL") ? "WIFI+CELL" : "WIFI";
      const chipMatch = n.match(/(M\d+(?:\s*(?:PRO|MAX))?|A\d+(?:\s*PRO)?)/i);
      const ipad_chip = chipMatch ? chipMatch[1].toUpperCase() : "";
      return { ipad_modelo: modelo, ipad_chip, ipad_tela: tela || "11\"", ipad_storage: storage || "128GB", ipad_conn: conn };
    }
    if (baseCat === "IPHONES") {
      const numMatch = n.match(/IPHONE\s*(\d+)/);
      const modelo = numMatch ? numMatch[1] : "16";
      const linha = n.includes(" PRO MAX") ? "PRO MAX" : n.includes(" PRO") ? "PRO" : n.includes(" PLUS") ? "PLUS" : n.includes(" E") ? "E" : "";
      return { ip_modelo: modelo, ip_linha: linha, ip_storage: storage || "128GB" };
    }
    if (baseCat === "MACBOOK") {
      const tipo = n.includes("PRO") ? "PRO" : "AIR";
      const chipMatch = n.match(/(M\d+(?:\s*PRO|\s*MAX)?)/i);
      const ramMatch = n.match(/(\d+GB)\s/);
      return { mb_modelo: tipo, mb_tela: tela || "13\"", mb_chip: chipMatch ? chipMatch[1] : "M4", mb_ram: ramMatch ? ramMatch[1] : "16GB", mb_storage: storage || "256GB" };
    }
    if (baseCat === "MAC_MINI") {
      const chipMatch = n.match(/(M\d+(?:\s*PRO)?)/i);
      const nucleosMatch = n.match(/\((\d+C?\s*CPU\/\d+C?\s*GPU)\)/i);
      const ramMatch = n.match(/(\d+GB)\s/);
      return { mm_chip: chipMatch ? chipMatch[1] : "M4", mm_nucleos: nucleosMatch ? nucleosMatch[1] : "10C CPU/10C GPU", mm_ram: ramMatch ? ramMatch[1] : "16GB", mm_storage: storage || "256GB" };
    }
    if (baseCat === "APPLE_WATCH") {
      const modeloMatch = n.match(/(SERIES\s*\d+|SE|ULTRA\s*\d*)/i);
      const tamMatch = n.match(/(\d+mm)/i);
      const conn = n.includes("CELL") ? "GPS+CELL" : "GPS";
      return { aw_modelo: modeloMatch ? modeloMatch[1] : "SERIES 10", aw_tamanho: tamMatch ? tamMatch[1] : "42mm", aw_conn: conn };
    }
    if (baseCat === "AIRPODS") {
      return { air_modelo: n.trim() || "AIRPODS 4" };
    }
    return {};
  }

  // Duplicar produto: abre form pré-preenchido com mesmas cores
  function handleDuplicarProduto(prodItems: ProdutoEstoque[]) {
    const p = prodItems[0];
    const cat = p.categoria || "IPHONES";
    // Primeira cor vai no form principal, demais vão em variações
    const firstItem = prodItems[0];
    const restItems = prodItems.slice(1);
    setForm((f) => ({
      ...f,
      produto: p.produto,
      categoria: cat,
      custo_unitario: String(p.custo_unitario || ""),
      tipo: p.tipo || "NOVO",
      fornecedor: p.fornecedor || "",
      cor: firstItem.cor || "",
      qnt: String(firstItem.qnt || 1),
      imei: "",
      observacao: "",
    }));
    // Parsear nome do produto para preencher specs corretamente
    const parsedSpecs = parseProductSpecs(p.produto, cat);
    setSpec((s) => ({ ...s, ...parsedSpecs }));
    // Demais cores vão como variações
    setVariacoes(
      restItems.map((item) => ({ cor: item.cor || "", qnt: String(item.qnt || 1) }))
    );
    setTab("novo");
    setMsg("Produto duplicado! Altere memoria/custo e clique Adicionar.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Catálogo dinâmico de modelos ──────────────────────────────────────────
  const [catalogoModelos, setCatalogoModelos] = useState<{id: string; categoria_key: string; nome: string; ordem: number; ativo: boolean}[]>([]);
  // Mapa modelo_id -> array de cores válidas (em inglês canônico)
  const [coresPorModelo, setCoresPorModelo] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!password) return;
    fetch("/api/admin/catalogo", { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(json => { if (Array.isArray(json.modelos)) setCatalogoModelos(json.modelos); })
      .catch(() => {});
    fetch("/api/admin/catalogo?all_configs=1", { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(json => {
        if (!Array.isArray(json.configs)) return;
        const byModel: Record<string, string[]> = {};
        for (const c of json.configs as { modelo_id: string; tipo_chave: string; valor: string }[]) {
          if (c.tipo_chave !== "cores") continue;
          if (!byModel[c.modelo_id]) byModel[c.modelo_id] = [];
          byModel[c.modelo_id].push(c.valor);
        }
        setCoresPorModelo(byModel);
      })
      .catch(() => {});
  }, [password]);

  // Dado um nome de produto, devolve as cores válidas do catálogo (em EN canônico)
  const getCoresValidasParaProduto = useCallback((produtoNome: string, categoriaEstoque: string): string[] => {
    if (!produtoNome || !catalogoModelos.length) return [];
    const CAT_CATALOG: Record<string, string[]> = {
      IPHONES: ["IPHONES"], MACBOOK: ["MACBOOK_AIR", "MACBOOK_PRO", "MACBOOK_NEO"],
      MAC_MINI: ["MAC_MINI"], IPADS: ["IPADS"], APPLE_WATCH: ["APPLE_WATCH"],
      AIRPODS: ["AIRPODS"], ACESSORIOS: ["ACESSORIOS"],
    };
    const keys = CAT_CATALOG[categoriaEstoque] || [];
    if (!keys.length) return [];
    const catModelos = catalogoModelos.filter(m => keys.includes(m.categoria_key) && m.ativo !== false);
    const prodNorm = normalizeModelName(produtoNome);
    const match = catModelos
      .map(m => ({ m, norm: normalizeModelName(m.nome) }))
      .filter(({ norm }) => modelMatchesProduct(norm, prodNorm))
      .sort((a, b) => b.norm.length - a.norm.length)[0];
    if (!match) return [];
    return coresPorModelo[match.m.id] || [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogoModelos, coresPorModelo]);
  function getCatModelos(catKey: string, fallback: string[]): string[] {
    const db = catalogoModelos.filter(m => m.categoria_key === catKey && m.ativo !== false).sort((a, b) => a.ordem - b.ordem).map(m => m.nome);
    return db.length > 0 ? db : fallback;
  }

  // Normalize model name for matching: strip diacritics, prefixes, generation suffixes
  function normalizeModelName(name: string): string {
    return name
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[°ºª]/g, "")
      .replace(/^APPLE\s+WATCH\s+/i, "")
      .replace(/^IPHONE\s+/i, "")
      .replace(/^IPAD\s+/i, "")
      .replace(/^MACBOOK\s+/i, "")
      .replace(/\bGERACAO\b/gi, "")
      .replace(/\bGEN\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Check if all words from model name appear in product name (order-independent)
  function modelMatchesProduct(modelNorm: string, prodNorm: string): boolean {
    const modelWords = modelNorm.split(/\s+/).filter(w => w.length > 0);
    if (!modelWords.length) return false;
    return modelWords.every(w => prodNorm.includes(w));
  }

  // Fetch configs do catálogo quando o modal de detalhe abre (para cores por modelo específico)
  useEffect(() => {
    if (!detailProduct || !password || !catalogoModelos.length) { setDetailModelConfigs({}); return; }
    const CAT_CATALOG: Record<string, string[]> = {
      IPHONES: ["IPHONES"], MACBOOK: ["MACBOOK_AIR", "MACBOOK_PRO", "MACBOOK_NEO"],
      MAC_MINI: ["MAC_MINI"], IPADS: ["IPADS"], APPLE_WATCH: ["APPLE_WATCH"],
      AIRPODS: ["AIRPODS"], ACESSORIOS: ["ACESSORIOS"],
    };
    const keys = CAT_CATALOG[detailProduct.categoria] || [];
    const catModelos = catalogoModelos.filter(m => keys.includes(m.categoria_key) && m.ativo !== false);
    const prodNorm = normalizeModelName(detailProduct.produto);
    const match = catModelos
      .map(m => ({ m, norm: normalizeModelName(m.nome) }))
      .filter(({ norm }) => modelMatchesProduct(norm, prodNorm))
      .sort((a, b) => b.norm.length - a.norm.length)[0];
    if (!match) { setDetailModelConfigs({}); return; }
    fetch(`/api/admin/catalogo?modelo_id=${match.m.id}`, { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(d => {
        if (!d.configs) return;
        const grouped: Record<string, string[]> = {};
        d.configs.forEach((c: { tipo_chave: string; valor: string }) => {
          if (!grouped[c.tipo_chave]) grouped[c.tipo_chave] = [];
          grouped[c.tipo_chave].push(c.valor);
        });
        setDetailModelConfigs(grouped);
      })
      .catch(() => setDetailModelConfigs({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailProduct?.id, detailProduct?.categoria, catalogoModelos.length, password]);

  const [form, setForm] = useState({
    produto: "", categoria: "IPHONES", qnt: "1", custo_unitario: "",
    status: "EM ESTOQUE", cor: "", observacao: "", tipo: "NOVO",
    bateria: "", cliente: "", fornecedor: "", imei: "", serial_no: "", garantia: "",
    origem_compra: "",
  });

  // Campos estruturados por categoria
  const [spec, setSpec] = useState({
    // IPHONES
    ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
    // MACBOOK
    mb_modelo: "AIR", mb_tela: "13\"", mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
    // MAC_MINI
    mm_chip: "M4", mm_nucleos: "10C CPU/10C GPU", mm_ram: "16GB", mm_storage: "256GB",
    // IPADS
    ipad_modelo: "AIR", ipad_chip: "", ipad_tela: "11\"", ipad_storage: "128GB", ipad_conn: "WIFI",
    // APPLE_WATCH
    aw_modelo: "SERIES 11", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "", aw_band: "",
    // AIRPODS
    air_modelo: "AIRPODS 4",
    // SEMINOVOS — subtipo define quais campos mostrar
    semi_subtipo: "IPHONES",
  });
  const setS = (field: string, value: string) => setSpec((s) => ({ ...s, [field]: value }));

  // Estado para modo A_CAMINHO (pedido fornecedor unificado)
  const BANCOS: Banco[] = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"];
  type BancoValores = Record<Banco, string>;
  const emptyBancoValores = (): BancoValores => ({ ITAU: "", INFINITE: "", MERCADO_PAGO: "", ESPECIE: "" });
  const [pedidoProdutos, setPedidoProdutos] = useState<ProdutoRowState[]>([createEmptyProdutoRow()]);
  const [bancoValores, setBancoValores] = useState<BancoValores>(emptyBancoValores());
  const [descricaoGasto, setDescricaoGasto] = useState("");
  const totalPagamento = BANCOS.reduce((s, b) => s + (parseFloat(bancoValores[b]) || 0), 0);

  // Gerar nome do produto automaticamente a partir dos campos estruturados
  const buildProdutoName = (cat: string): string => {
    const effectiveCat = cat === "SEMINOVOS" ? spec.semi_subtipo : cat;
    const c = form.cor ? ` ${form.cor}` : "";
    switch (getBaseCat(effectiveCat)) {
      case "IPHONES": {
        const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
        // Origem (LL/J/HN/...) NÃO entra no nome — é gravada no campo `origem` da row.
        return `IPHONE ${spec.ip_modelo}${linha} ${spec.ip_storage}${c}`.toUpperCase();
      }
      case "MAC_MINI":
        const mmNucleos = spec.mm_nucleos ? ` (${spec.mm_nucleos})` : "";
        return `MAC MINI ${spec.mm_chip}${mmNucleos} ${spec.mm_ram} ${spec.mm_storage}`.toUpperCase();
      case "MACBOOK": {
        const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : spec.mb_modelo === "NEO" ? "MACBOOK NEO" : "MACBOOK PRO";
        const tela = spec.mb_modelo === "NEO" ? spec.mb_tela || '13"' : spec.mb_tela;
        // Núcleos NÃO entra no nome — fica apenas como spec visível nos detalhes.
        return `${tipo} ${spec.mb_chip} ${tela} ${spec.mb_ram} ${spec.mb_storage}${c}`.toUpperCase();
      }
      case "IPADS": {
        const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
        const chip = spec.ipad_chip ? ` ${spec.ipad_chip}` : "";
        const conn = spec.ipad_conn === "WIFI+CELL" ? " WIFI+CELLULAR" : "";
        return `${modelo}${chip} ${spec.ipad_tela} ${spec.ipad_storage}${conn}${c}`.toUpperCase();
      }
      case "APPLE_WATCH": {
        const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CEL" : " GPS";
        const pulseira = spec.aw_pulseira ? ` PULSEIRA ${spec.aw_pulseira}` : "";
        return `APPLE WATCH ${spec.aw_modelo} ${spec.aw_tamanho}${conn}${c}${pulseira}`.toUpperCase();
      }
      case "AIRPODS":
        return `${spec.air_modelo}${c}`.toUpperCase();
      default:
        return "";
    }
  };

  const formBaseCat = form.categoria === "SEMINOVOS" ? getBaseCat(spec.semi_subtipo) : getBaseCat(form.categoria);
  const hasStructuredFields = STRUCTURED_CATS_LIST.includes(formBaseCat) || form.categoria === "SEMINOVOS";

  // Cores efetivas: para iPhones, filtra por modelo selecionado
  const coresEfetivas = formBaseCat === "IPHONES" ? getIphoneCores(spec.ip_modelo) : CORES_POR_CATEGORIA[formBaseCat];

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } });
      if (res.ok) {
        const json = await res.json();
        const data: ProdutoEstoque[] = json.data ?? [];
        setEstoque(data);
        // Buscar encomendas vinculadas para badge de reserva
        fetch("/api/encomendas", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } })
          .then(r => r.json())
          .then(j => {
            const map = new Map<string, string>();
            for (const enc of j.data ?? []) {
              if (enc.estoque_id && enc.cliente) map.set(enc.estoque_id, enc.cliente);
            }
            setEncomendaMap(map);
          }).catch(() => {});
        // Migração: corrigir categorias legadas (MACBOOK_NEO/AIR/PRO → MACBOOK)
        const legacyMap: Record<string, string> = { MACBOOK_NEO: "MACBOOK", MACBOOK_AIR: "MACBOOK", MACBOOK_PRO: "MACBOOK", APPLE_WATCH_ATACADO: "APPLE_WATCH" };
        const toFix = data.filter(p => legacyMap[p.categoria]);
        if (toFix.length > 0) {
          for (const p of toFix) {
            fetch(`/api/estoque`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ id: p.id, categoria: legacyMap[p.categoria] }) }).catch(() => {});
          }
          setEstoque(prev => prev.map(p => legacyMap[p.categoria] ? { ...p, categoria: legacyMap[p.categoria] } : p));
        }
        // Migração: normalizar nomes de Apple Watch
        const watchFixes: { id: string; produto: string; cor: string | null }[] = [];
        const allColors = new Set(["MIDNIGHT", "SILVER", "STARLIGHT", "GOLD", "GRAPHITE", "ONYX BLACK", "SPACE BLACK", "SPACE GRAY", "JET BLACK", "PINK", "RED", "ROSE GOLD", "SLATE", "NATURAL", "NATURAL TITANIUM", "BLACK TITANIUM", "WHITE", "BLACK", "BLUE"]);
        for (const p of data) {
          const cat = legacyMap[p.categoria] || p.categoria;
          if (cat !== "APPLE_WATCH") continue;
          const nome = (p.produto || "").toUpperCase().trim();
          // Caso 1: nome é só uma cor (ex: "SILVER", "JET BLACK")
          if (allColors.has(nome)) {
            // Não podemos saber o modelo, mas podemos mover a cor para o campo cor e limpar o nome
            if (!p.cor || p.cor.toUpperCase() === nome) {
              watchFixes.push({ id: p.id, produto: nome, cor: nome });
            }
            continue;
          }
          // Caso 2: normalizar GPS+CELLULAR → GPS+CEL
          let fixed = nome;
          if (fixed.includes("GPS+CELLULAR")) {
            fixed = fixed.replace(/GPS\+CELLULAR/g, "GPS+CEL");
          }
          // Caso 3: CELLULAR → CEL (standalone)
          if (fixed.includes(" CELLULAR ") || fixed.endsWith(" CELLULAR")) {
            fixed = fixed.replace(/\bCELLULAR\b/g, "CEL");
          }
          // Caso 4: remover "APPLE WATCH " duplicado
          fixed = fixed.replace(/^APPLE WATCH APPLE WATCH/i, "APPLE WATCH");
          // Caso 5: garantir que começa com "APPLE WATCH"
          if (!fixed.startsWith("APPLE WATCH")) {
            // Pode ser "SERIES 11 GPS 46MM..." sem prefixo
            if (/^(SERIES|SE|ULTRA)\s/i.test(fixed)) {
              fixed = `APPLE WATCH ${fixed}`;
            }
          }
          if (fixed !== nome) {
            watchFixes.push({ id: p.id, produto: fixed, cor: p.cor });
          }
        }
        if (watchFixes.length > 0) {
          for (const fix of watchFixes) {
            fetch(`/api/estoque`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ id: fix.id, produto: fix.produto, cor: fix.cor }) }).catch(() => {});
          }
          setEstoque(prev => prev.map(p => {
            const fix = watchFixes.find(f => f.id === p.id);
            return fix ? { ...p, produto: fix.produto, cor: fix.cor } : p;
          }));
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) { const json = await res.json(); setFornecedores(json.data ?? []); }
    } catch { /* ignore */ }
  }, [password]);

  // Fetch inicial + refetch ao voltar de aba oculta (sem polling constante)
  const refetchAll = useCallback(() => { fetchEstoque(); fetchFornecedores(); }, [fetchEstoque, fetchFornecedores]);
  useEffect(() => { refetchAll(); }, [refetchAll]);
  useAutoRefetch(refetchAll, !!password);

  // Carregar ordem customizada das seções do estoque
  useEffect(() => {
    if (!password) return;
    fetch("/api/admin/estoque-settings?key=estoque_line_order", { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(d => { if (d.value) setLineOrder(d.value); })
      .catch(() => {});
  }, [password]);

  const saveLineOrder = useCallback(async (newOrder: Record<string, string[]>) => {
    setLineOrder(newOrder);
    await fetch("/api/admin/estoque-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ key: "estoque_line_order", value: newOrder }),
    }).catch(() => {});
  }, [password]);

  const moveLineInOrder = useCallback((cat: string, sortedNames: string[], fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= sortedNames.length) return;
    const items = Array.from(sortedNames);
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    saveLineOrder({ ...lineOrder, [cat]: items });
  }, [lineOrder, saveLineOrder]);

  // Reset estados de edição quando abre novo produto no modal
  useEffect(() => {
    setEditingDetailSerial(false);
    setEditingDetailImei(false);
    // Extrai Apple ID do observacao se houver (formato "APPLE ID: xxx\n...")
    if (detailProduct?.observacao) {
      const match = detailProduct.observacao.match(/^APPLE ID:\s*(.+?)(\n|$)/im);
      setDetailAppleId(match ? match[1].trim() : "");
    } else {
      setDetailAppleId("");
    }
  }, [detailProduct?.id]);

  const handleAddFornecedor = async () => {
    if (!novoFornecedorNome.trim()) return;
    const res = await fetch("/api/fornecedores", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({ nome: novoFornecedorNome }),
    });
    const json = await res.json();
    if (json.ok && json.data) {
      setFornecedores((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      set("fornecedor", json.data.nome);
      setNovoFornecedorNome("");
      setShowNovoFornecedor(false);
      setMsg("Fornecedor cadastrado!");
    } else {
      setMsg("Erro: " + (json.error || "Falha ao cadastrar"));
    }
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const apiPatch = async (id: string, fields: Record<string, unknown>) => {
    const res = await fetch("/api/estoque", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Erro ${res.status} ao salvar`);
    }
    return res;
  };

  const handleApplyBalance = async () => {
    if (balanceSelected.size === 0) return;
    const selectedItems = estoque.filter((p) => balanceSelected.has(p.id));
    const totalCusto = selectedItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
    const totalQnt = selectedItems.reduce((s, p) => s + p.qnt, 0);
    if (totalQnt === 0) return;
    const avgCusto = Math.round(totalCusto / totalQnt);
    if (!confirm(`Aplicar custo médio de ${fmt(avgCusto)} a ${balanceSelected.size} item(ns)?`)) return;
    setBalanceApplying(true);
    try {
      for (const item of selectedItems) {
        await apiPatch(item.id, { custo_unitario: avgCusto });
      }
      setEstoque((prev) => prev.map((p) => balanceSelected.has(p.id) ? { ...p, custo_unitario: avgCusto } : p));
      setMsg(`Balanço aplicado: ${balanceSelected.size} item(ns) com custo ${fmt(avgCusto)}`);
      setBalanceSelected(new Set());
      setBalanceMode(false);
    } catch {
      setMsg("Erro ao aplicar balanço");
    } finally {
      setBalanceApplying(false);
    }
  };

  const handleUpdateQnt = async (item: ProdutoEstoque, newQnt: number) => {
    const newStatus = newQnt === 0 ? "ESGOTADO" : item.status === "ESGOTADO" ? "EM ESTOQUE" : item.status;
    await apiPatch(item.id, { qnt: newQnt, status: newStatus });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, qnt: newQnt, status: newStatus } : p));
    const e = { ...editingQnt }; delete e[item.id]; setEditingQnt(e);
  };

  const handleSaveCusto = async (item: ProdutoEstoque) => {
    const val = parseFloat((editingCusto[item.id] ?? "").replace(",", "."));
    if (isNaN(val)) return;
    await apiPatch(item.id, { custo_unitario: val });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, custo_unitario: val } : p));
    const e = { ...editingCusto }; delete e[item.id]; setEditingCusto(e);
  };

  // Editar balanço (média do modelo — aplicar a todas as unidades do modelo)
  const [editBalancoKey, setEditBalancoKey] = useState<string>("");
  const [editBalancoVal, setEditBalancoVal] = useState<string>("");
  const handleSaveBalanco = async (modeloItems: ProdutoEstoque[]) => {
    const val = parseFloat(editBalancoVal.replace(",", "."));
    if (isNaN(val) || val <= 0) return;
    const ids = modeloItems.map(p => p.id);
    await Promise.all(ids.map(id => apiPatch(id, { custo_unitario: val })));
    setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, custo_unitario: val } : p));
    setEditBalancoKey(""); setEditBalancoVal("");
    setMsg(`Balanço aplicado: ${modeloItems.length} unidades → ${fmt(val)}`);
  };

  // Editar preço em massa (todas as unidades de um grupo)
  const [bulkCustoKey, setBulkCustoKey] = useState<string>("");
  const [bulkCustoVal, setBulkCustoVal] = useState<string>("");
  const handleBulkCusto = async (items: ProdutoEstoque[]) => {
    const val = parseFloat(bulkCustoVal.replace(",", "."));
    if (isNaN(val) || val <= 0) return;
    const ids = items.map(p => p.id);
    await Promise.all(ids.map(id => apiPatch(id, { custo_unitario: val })));
    setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, custo_unitario: val } : p));
    setBulkCustoKey(""); setBulkCustoVal("");
    setMsg(`Preco atualizado para ${items.length} unidades: R$ ${val.toLocaleString("pt-BR")}`);
  };

  // Quantidade mínima em massa (todas as unidades de um grupo)
  const [bulkMinimoKey, setBulkMinimoKey] = useState<string>("");
  const [bulkMinimoVal, setBulkMinimoVal] = useState<string>("");
  const handleBulkMinimo = async (items: ProdutoEstoque[]) => {
    const val = parseInt(bulkMinimoVal);
    if (isNaN(val) || val < 0) return;
    const ids = items.map(p => p.id);
    await Promise.all(ids.map(id => apiPatch(id, { estoque_minimo: val })));
    setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, estoque_minimo: val } : p));
    setBulkMinimoKey(""); setBulkMinimoVal("");
    setMsg(`Qtd. mínima definida como ${val} para ${items.length} variante(s)`);
  };

  // Edição genérica de campo inline
  const startEditField = (id: string, field: string, value: string) => {
    setEditingField((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };
  const cancelEditField = (id: string, field: string) => {
    setEditingField((prev) => {
      const copy = { ...prev };
      if (copy[id]) { delete copy[id][field]; if (Object.keys(copy[id]).length === 0) delete copy[id]; }
      return copy;
    });
  };
  const saveField = async (id: string, field: string) => {
    const val = editingField[id]?.[field] ?? "";
    const dbVal = field === "bateria" ? (val ? parseInt(val) : null) : (val || null);
    await apiPatch(id, { [field]: dbVal });
    setEstoque((prev) => prev.map((p) => p.id === id ? { ...p, [field]: dbVal } : p));
    cancelEditField(id, field);
  };
  const getEditVal = (id: string, field: string) => editingField[id]?.[field];
  const isEditingField = (id: string, field: string) => editingField[id]?.[field] !== undefined;

  const handleSaveNome = async (ids: string[], newNome: string) => {
    if (!newNome.trim()) return;
    for (const id of ids) {
      await apiPatch(id, { produto: newNome.trim() });
    }
    setEstoque((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, produto: newNome.trim() } : p));
    const key = ids[0];
    const e = { ...editingNome }; delete e[key]; setEditingNome(e);
    setMsg(`Nome atualizado para "${newNome.trim()}"`);
  };

  // handleDuplicar referência legada — usa handleDuplicarProduto
  const handleDuplicar = (p: ProdutoEstoque) => handleDuplicarProduto([p]);

  // Categorias que NÃO precisam de IMEI (só serial)
  const CATS_SEM_IMEI = ["MACBOOK", "MAC_MINI", "IMAC", "MAC_STUDIO", "AIRPODS", "ACESSORIOS", "OUTROS"];
  // Categorias que NÃO precisam de serial (completamente opcional)
  const CATS_SEM_SERIAL = ["ACESSORIOS", "OUTROS"];

  // Valida se seminovo tem serial/IMEI obrigatórios para sair de pendência
  const validarSeminovoParaEstoque = (item: ProdutoEstoque): string | null => {
    // AirPods dentro de ACESSORIOS ou categoria AIRPODS: serial obrigatório
    const isAirpods = item.categoria === "AIRPODS" || item.produto?.toUpperCase().includes("AIRPOD");
    const precisaSerial = !CATS_SEM_SERIAL.includes(item.categoria) || isAirpods;
    if (precisaSerial && !item.serial_no) {
      return `Preencha o número de série de "${item.produto}" antes de mover para estoque.`;
    }
    if (!CATS_SEM_IMEI.includes(item.categoria) && !item.imei) {
      return `Preencha o IMEI de "${item.produto}" antes de mover para estoque.`;
    }
    if (!item.fornecedor || item.fornecedor.trim() === "") {
      return `Preencha o fornecedor de "${item.produto}" antes de mover para estoque.`;
    }
    return null;
  };

  // Abre modal de etiqueta obrigatória antes de mover
  const handleMoverParaEstoque = (item: ProdutoEstoque) => {
    const erro = item.tipo === "PENDENCIA" ? validarSeminovoParaEstoque(item) : null;
    if (erro) {
      setMsg(erro);
      return;
    }
    // Etiqueta interna = preço de custo (custo_unitario)
    setEtiquetaModal({ item, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media", dataEntrada: hojeBR() });
  };

  // Abre modal para múltiplas unidades com seriais
  const handleMoverMultiploComEtiqueta = (item: ProdutoEstoque, serials: string[]) => {
    const items = serials.map((s, i) => ({
      item: { ...item, serial_no: s, id: i === 0 ? item.id : `new-${i}` },
      serial: s,
    }));
    setEtiquetaModal({ item, items, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media", dataEntrada: hojeBR() });
  };

  // Mover selecionados em lote
  const handleMoverSelecionados = () => {
    const itens = aCaminho.filter(p => selectedACaminho.has(p.id));
    if (itens.length === 0) { setMsg("Selecione pelo menos 1 produto"); return; }
    // Verificar serial obrigatório
    const semSerial = itens.filter(p => !p.serial_no && !CATS_SEM_SERIAL.includes(p.categoria));
    if (semSerial.length > 0) {
      setMsg(`Preencha o serial de: ${semSerial.map(p => p.produto).join(", ")}`);
      return;
    }
    setEtiquetaModal({ item: itens[0], batchItems: itens, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media", dataEntrada: hojeBR() });
  };

  // Imprimir etiqueta do modal — formato Brother QL-820NWB 62mm continuous tape
  // Imprimir etiqueta(s) avulsa — pode ser 1 item ou array de items
  const handlePrintEtiquetaDirect = (produtosParaImprimir: ProdutoEstoque[]) => {
    if (produtosParaImprimir.length === 0) return;
    const win = window.open("", "_blank", "width=600,height=400");
    if (!win) return;

    const labelsHtml = produtosParaImprimir.map((p, idx) => {
      const serial = p.serial_no || "";
      const imei = p.imei || "";
      const qrData = serial || imei || p.id;
      const cor = p.cor || "";
      const fornecedor = p.fornecedor || "";
      const gradeMatch = (p.observacao || "").match(/\[GRADE_(A\+|AB|A|B)\]/);
      const grade = gradeMatch ? gradeMatch[1] : "";
      // Layout vertical: QR em cima, texto embaixo — para fita 29mm
      return `<div class="label">
        <div style="text-align:center;padding:0.5mm 1mm 0.3mm">
          <canvas id="qr-${idx}" data-qr="${String(qrData).replace(/"/g, "&quot;")}"></canvas>
        </div>
        <div style="padding:0 1.5mm 0.5mm;text-align:center">
          <div style="font-size:6pt;font-weight:900;line-height:1.15;word-break:break-word;color:#000">${p.produto}</div>
          ${cor ? `<div style="font-size:5.5pt;font-weight:bold;line-height:1.2;margin-top:0.2mm;color:#000">${formatCorEtiquetaPTEN(cor)}</div>` : ""}
          ${serial ? `<div style="font-size:5.5pt;font-family:monospace;font-weight:bold;line-height:1.25;margin-top:0.3mm;color:#000">S/N: ${serial}</div>` : ""}
          ${imei ? `<div style="font-size:5.5pt;font-family:monospace;font-weight:bold;line-height:1.25;color:#000">IMEI: ${imei}</div>` : ""}
          ${(p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA") && p.bateria ? `<div style="font-size:5.5pt;font-weight:bold;line-height:1.25;margin-top:0.2mm;color:#000">🔋 Bateria: ${p.bateria}%</div>` : ""}
          ${grade ? `<div style="font-size:6pt;font-weight:900;line-height:1.25;margin-top:0.2mm;color:#000;background:#FFF3CD;padding:0.3mm 1mm;border-radius:1mm;display:inline-block">Grade ${grade}</div>` : ""}
          ${fornecedor ? `<div style="font-size:5.5pt;font-weight:bold;line-height:1.2;margin-top:0.2mm;color:#000">${fornecedor}</div>` : ""}
        </div>
      </div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
      <style>
        @page{size:29mm 50mm;margin:0}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0}
        .label{
          width:29mm;
          overflow:hidden;display:block;
          break-after:page;break-inside:avoid;
        }
        .label:last-child{break-after:auto}
        canvas{display:block;width:22mm;height:22mm;margin:0 auto}
      </style></head><body>
      ${labelsHtml}
      <script>
        document.querySelectorAll('canvas[data-qr]').forEach(function(canvas){
          var data=canvas.getAttribute('data-qr');
          var qr=qrcode(0,'L');qr.addData(data);qr.make();
          var size=500;canvas.width=size;canvas.height=size;
          var ctx=canvas.getContext('2d');
          var cells=qr.getModuleCount();
          var qz=4;var totalCells=cells+qz*2;var cs=size/totalCells;var offset=qz*cs;
          ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000';
          for(var r=0;r<cells;r++)for(var c=0;c<cells;c++)
            if(qr.isDark(r,c))ctx.fillRect(Math.floor(offset+c*cs),Math.floor(offset+r*cs),Math.ceil(cs),Math.ceil(cs));
        });
        window.onload=function(){setTimeout(function(){window.print()},600)};
      <\/script></body></html>`);
    win.document.close();
  };

  // Etiqueta específica pra pendências (produtos na troca) — com dados do cliente
  const handlePrintEtiquetaPendencia = (p: ProdutoEstoque) => {
    const serial = p.serial_no || "";
    const imei = p.imei || "";
    const qrData = serial || imei || p.id;
    const corLine = p.cor ? formatCorEtiquetaPTEN(p.cor) : "";
    const obs = p.observacao || "";
    const gradeMatch = obs.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
    const grade = gradeMatch || null;
    const hasCaixa = obs.includes("[COM_CAIXA]");
    const hasCabo = obs.includes("[COM_CABO]");
    const win = window.open("", "_blank", "width=600,height=400");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta Troca</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
      <style>
        @page{size:29mm 62mm;margin:0}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0}
        .label{width:29mm;overflow:hidden;display:block}
        canvas{display:block;width:22mm;height:22mm;margin:0 auto;margin-top:1mm}
        .info{padding:0 1.5mm 1mm;text-align:center}
        .produto{font-size:6pt;font-weight:900;line-height:1.2;color:#000;word-break:break-word}
        .badges{font-size:5pt;margin-top:0.5mm;color:#555;line-height:1.3}
        .sn{font-size:5pt;font-family:monospace;font-weight:bold;color:#000;line-height:1.3;margin-top:0.3mm}
        .cliente{font-size:6pt;font-weight:900;color:#E8740E;line-height:1.3;margin-top:0.5mm;word-break:break-word;text-transform:uppercase}
        .data{font-size:5pt;color:#555;margin-top:0.2mm}
        .custo{font-size:6pt;font-weight:900;color:#000;margin-top:0.3mm}
        .label-troca{font-size:4.5pt;letter-spacing:0.5px;text-transform:uppercase;color:#888;margin-top:0.5mm}
      </style></head><body>
      <div class="label">
        <canvas id="qr0" data-qr="${String(qrData).replace(/"/g, "&quot;")}"></canvas>
        <div class="info">
          <div class="produto">${p.produto}</div>
          ${corLine ? `<div class="badges" style="font-weight:bold;color:#000">${corLine}</div>` : ""}
          <div class="badges">${[
            p.bateria ? `🔋 ${p.bateria}%` : "",
            grade ? `Grade ${grade}` : "",
            hasCaixa ? "Com caixa" : "",
            hasCabo ? "Com cabo" : "",
          ].filter(Boolean).join(" · ") || ""}</div>
          ${serial ? `<div class="sn">S/N: ${serial}</div>` : ""}
          ${imei ? `<div class="sn">IMEI: ${imei}</div>` : ""}
          ${p.cliente ? `<div class="cliente">👤 ${p.cliente}</div>` : ""}
          ${p.data_compra ? `<div class="data">📅 ${p.data_compra.split("-").reverse().join("/")}</div>` : ""}
          <div class="label-troca">Produto na troca</div>
        </div>
      </div>
      <script>
        document.querySelectorAll('canvas[data-qr]').forEach(function(canvas){
          var data=canvas.getAttribute('data-qr');
          var qr=qrcode(0,'L');qr.addData(data);qr.make();
          var size=500;canvas.width=size;canvas.height=size;
          var ctx=canvas.getContext('2d');
          var cells=qr.getModuleCount();
          var qz=4;var totalCells=cells+qz*2;var cs=size/totalCells;var offset=qz*cs;
          ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000';
          for(var r=0;r<cells;r++)for(var c=0;c<cells;c++)
            if(qr.isDark(r,c))ctx.fillRect(Math.floor(offset+c*cs),Math.floor(offset+r*cs),Math.ceil(cs),Math.ceil(cs));
        });
        window.onload=function(){setTimeout(function(){window.print()},600)};
      <\/script></body></html>`);
    win.document.close();
  };

  const handlePrintEtiquetaModal = () => {
    if (!etiquetaModal) return;
    const { item, items, batchItems } = etiquetaModal;

    const produtosParaImprimir = batchItems
      ? batchItems
      : items
        ? items.map(i => i.item)
        : [item];

    handlePrintEtiquetaDirect(produtosParaImprimir);
    setEtiquetaModal(prev => prev ? { ...prev, printed: true } : null);
  };

  // Confirmar movimentação após etiqueta impressa
  const handleConfirmarMover = async () => {
    if (!etiquetaModal) return;
    const { item, items, batchItems } = etiquetaModal;

    // Coleta produtos afetados pra rebalancear preço médio depois
    const produtosAfetados = new Set<string>();

    const dataEntrada = etiquetaModal.dataEntrada || hojeBR();
    if (batchItems && batchItems.length > 0) {
      for (const p of batchItems) {
        const novoTipo = p.tipo === "PENDENCIA" ? "SEMINOVO" : p.tipo === "A_CAMINHO" ? getCondicaoFromObs(p) : "NOVO";
        await apiPatch(p.id, { tipo: novoTipo, status: "EM ESTOQUE", data_entrada: dataEntrada });
        produtosAfetados.add(`${p.categoria}|||${getModeloBase(p.produto, p.categoria)}`);
      }
      setMsg(`${batchItems.length} produtos movidos para estoque com etiquetas!`);
      setSelectedACaminho(new Set());
    } else if (items && items.length > 1) {
      const novoTipo = item.tipo === "PENDENCIA" ? "SEMINOVO" : item.tipo === "A_CAMINHO" ? getCondicaoFromObs(item) : "NOVO";
      await apiPatch(item.id, { serial_no: items[0].serial, qnt: 1, tipo: novoTipo, status: "EM ESTOQUE", data_entrada: dataEntrada });
      for (let i = 1; i < items.length; i++) {
        await fetch("/api/estoque", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
          body: JSON.stringify({
            produto: item.produto, categoria: item.categoria, qnt: 1,
            custo_unitario: item.custo_unitario, cor: item.cor, fornecedor: item.fornecedor,
            serial_no: items[i].serial, tipo: novoTipo, status: "EM ESTOQUE", data_entrada: dataEntrada,
          }),
        });
      }
      produtosAfetados.add(`${item.categoria}|||${getModeloBase(item.produto, item.categoria)}`);
      setMsg(`${items.length} unidades movidas para estoque com etiquetas!`);
    } else {
      const novoTipo = item.tipo === "PENDENCIA" ? "SEMINOVO" : item.tipo === "A_CAMINHO" ? getCondicaoFromObs(item) : "NOVO";
      await apiPatch(item.id, { tipo: novoTipo, status: "EM ESTOQUE", data_entrada: dataEntrada });
      produtosAfetados.add(`${item.categoria}|||${getModeloBase(item.produto, item.categoria)}`);
      setMsg(`${item.produto} movido para estoque com etiqueta impressa!`);
    }

    // Rebalancear preço médio pra cada grupo de modelo afetado
    for (const key of produtosAfetados) {
      const [categoria, modelo] = key.split("|||");
      await fetch("/api/estoque?action=rebalance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ categoria, modelo }),
      });
    }

    setEtiquetaModal(null);
    fetchEstoque();
  };

  /** Retorna o modelo base de um produto sem a cor (ex: "IPHONE 17 256GB") */
  const getBaseModelACaminho = (produto: string): string => {
    const COLOR_WORDS = new Set([
      "BLACK","WHITE","RED","BLUE","GREEN","YELLOW","PINK","PURPLE","GOLD","SILVER",
      "NATURAL","TITANIUM","COSMIC","LAVENDER","SAGE","TEAL","ULTRAMARINE","MIDNIGHT",
      "STARLIGHT","ROSE","DESERT","DEEP","DARK","ORANGE","GRAY","GREY","PRETO","BRANCO",
      "AZUL","ROSA","PRATA","VERDE","VERMELHO","AMARELO","ROXO","CINZA","DOURADO",
      "JET","SLATE","OCEAN","PRETA","MILANES","MILANESE","LAKE",
    ]);
    const words = produto.split(/\s+/);
    // Para MacBook/iPad/Mac Mini a RAM também é "XXGB" — usar o ÚLTIMO match (SSD real)
    let storageIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (/^\d+(GB|TB)$/i.test(words[i])) storageIdx = i;
    }
    // Watches/AirPods: sem storage, agrupar por modelo+tamanho
    if (storageIdx === -1) {
      const sizeIdx = words.findIndex(w => /^\d+MM$/i.test(w));
      if (sizeIdx !== -1) {
        // Pega até o tamanho (ex: "APPLE WATCH ULTRA 3 49MM"), remove cores
        const baseParts = words.slice(0, sizeIdx + 1).filter(w => !COLOR_WORDS.has(w.toUpperCase()));
        // Incluir GPS/GPS+CEL/CELLULAR após tamanho
        const nextWord = sizeIdx + 1 < words.length ? words[sizeIdx + 1].toUpperCase() : "";
        if (/^(GPS(\+CEL)?|CELLULAR|WI-FI|5G|4G|LTE)$/i.test(nextWord)) {
          baseParts.push(words[sizeIdx + 1]);
        }
        return baseParts.join(" ");
      }
      // Sem storage nem tamanho: remover cores do nome
      return words.filter(w => !COLOR_WORDS.has(w.toUpperCase()) && !/^PULSEIRA$/i.test(w)).join(" ");
    }
    const baseParts = words.slice(0, storageIdx + 1).filter(w => !COLOR_WORDS.has(w.toUpperCase()));
    // Incluir sufixo de conectividade (WI-FI, CELLULAR) que aparece logo após o storage
    const connectWords = new Set(["WI-FI","CELLULAR","5G","4G","LTE"]);
    if (storageIdx + 1 < words.length && connectWords.has(words[storageIdx + 1].toUpperCase())) {
      baseParts.push(words[storageIdx + 1]);
    }
    return baseParts.join(" ");
  };

  /** Extrai a condição (NOVO/NAO_ATIVADO/SEMINOVO) do campo observacao de um produto A_CAMINHO */
  const getCondicaoFromObs = (p: ProdutoEstoque): string => {
    if (!p.observacao) return "NOVO";
    const match = p.observacao.match(/^\[(NAO_ATIVADO|SEMINOVO)\]/);
    return match ? match[1] : "NOVO";
  };

  /** Limpa tags de condição/caixa/grade do campo observacao para exibição */
  const cleanObs = (obs: string | null): string | null => {
    if (!obs) return null;
    return obs
      .replace(/\[(NAO_ATIVADO|SEMINOVO|COM_CAIXA|COM_CABO|COM_FONTE|COM_PULSEIRA|EX_PENDENCIA)\]/g, "")
      .replace(/\[GRADE_(A\+|AB|A|B)\]/g, "")
      .replace(/\[CICLOS:\d+\]/g, "")
      .replace(/\[PULSEIRA_TAM:[^\]]+\]/g, "")
      .replace(/\[BAND:[^\]]+\]/g, "")
      .replace(/\[RESP:[^\]]+\]/g, "")
      .replace(/\[COM_QUEM:[^\]]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim() || null;
  };
  /** Extrai todas as tags [...] da observação */
  const extractTags = (obs: string | null): string => {
    if (!obs) return "";
    const tags = obs.match(/\[(NAO_ATIVADO|SEMINOVO|COM_CAIXA|COM_CABO|COM_FONTE|COM_PULSEIRA|EX_PENDENCIA|GRADE_(A\+|AB|A|B)|CICLOS:\d+|RESP:[^\]]+)\]/g);
    return tags ? tags.join(" ") : "";
  };
  /** Extrai [RESP:xxx] da observação */
  const getResp = (obs: string | null): string => {
    if (!obs) return "";
    const m = obs.match(/\[RESP:([^\]]+)\]/);
    return m ? m[1] : "";
  };
  /** Substitui/remove tag [RESP:xxx] numa observação */
  const setResp = (obs: string | null, resp: string): string | null => {
    const base = (obs || "").replace(/\[RESP:[^\]]+\]/g, "").trim();
    const trimmed = resp.trim();
    const val = trimmed ? `[RESP:${trimmed}] ${base}`.trim() : base;
    return val || null;
  };

  const handleSubmitMulti = async () => {
    if (pedidoProdutos.length === 0) { setMsg("Adicione pelo menos 1 produto"); return; }
    if (form.tipo === "A_CAMINHO" && !form.origem_compra) { setMsg("⚠️ Selecione a origem da compra para produtos A Caminho"); return; }

    const status = form.tipo === "A_CAMINHO" ? "A CAMINHO" : "EM ESTOQUE";
    const tipo = form.tipo;
    let successCount = 0;
    let errorMsg = "";
    const mergeMessages: string[] = [];

    for (const p of pedidoProdutos) {
      // Para categorias estruturadas, SEMPRE usar buildProdutoName (ignora p.produto livre)
      const isStructured = STRUCTURED_CATS_LIST.includes(getBaseCat(p.categoria));
      const nome = (isStructured ? buildProdutoNameFromSpec(p.categoria, p.spec, p.cor) : p.produto || "").toUpperCase();
      if (!nome) continue;
      const res = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({
          produto: nome,
          categoria: p.categoria,
          qnt: parseInt(p.qnt) || 1,
          custo_unitario: parseFloat(p.custo_unitario) || 0,
          status,
          cor: p.cor || null,
          tipo,
          fornecedor: p.fornecedor || null,
          imei: p.imei || null,
          serial_no: p.serial_no || null,
          origem_compra: form.origem_compra || null,
          data_entrada: hojeBR(),
          observacao: (form.tipo === "A_CAMINHO" && p.condicao && p.condicao !== "NOVO")
            ? `[${p.condicao}]`
            : null,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        successCount++;
        if (json.merged && json.mergeDetails) {
          mergeMessages.push(`🔄 ${p.produto || nome}: ${json.mergeDetails.log}`);
        }
      } else { errorMsg = json.error; }
    }

    if (successCount > 0) {
      const mergeInfo = mergeMessages.length > 0 ? ` | ${mergeMessages.join(" | ")}` : "";
      setMsg(`${successCount} produto(s) adicionados${status === "A CAMINHO" ? " como A Caminho" : " ao estoque"}!${mergeInfo}${errorMsg ? ` (${errorMsg})` : ""}`);
      setPedidoProdutos([createEmptyProdutoRow()]);
      fetchEstoque();
      setFilterCat(pedidoProdutos[0]?.categoria || "");
    } else {
      setMsg("Erro: " + (errorMsg || "Nenhum produto adicionado"));
    }
  };

  const handleSubmit = async (keepForm = false) => {
    const nomeProduto = form.produto || (hasStructuredFields ? buildProdutoName(form.categoria) : "");
    if (!nomeProduto) { setMsg("Preencha o nome do produto"); return; }
    if (form.tipo === "A_CAMINHO" && !form.origem_compra) { setMsg("⚠️ Selecione a origem da compra para produtos A Caminho"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({
        produto: nomeProduto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 0, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
        cor: form.cor || null, observacao: form.observacao || null,
        tipo: form.tipo, bateria: form.bateria ? parseInt(form.bateria) : null,
        cliente: form.cliente || null, fornecedor: form.fornecedor || null,
        imei: form.imei || null, serial_no: form.serial_no || null,
        garantia: form.garantia || null, origem_compra: form.origem_compra || null,
        data_entrada: hojeBR(),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      // Se houve merge (preço médio), mostrar mensagem detalhada
      if (json.merged && json.mergeDetails) {
        const d = json.mergeDetails;
        setMsg(`🔄 Produto mesclado! ${d.log}`);
      } else {
        // Verificar se produto existe no mostruário
        try {
          const lojaRes = await fetch("/api/loja?format=grouped");
          const lojaData = await lojaRes.json();
          const lojaProdutos = lojaData.produtos || [];
          const prodNome = form.produto.toLowerCase();
          const existeNoMostruario = lojaProdutos.some((p: { nome: string }) => prodNome.includes(p.nome.toLowerCase()) || p.nome.toLowerCase().includes(prodNome));
          if (!existeNoMostruario) {
            setMsg(`Produto adicionado! 💡 "${form.produto}" nao esta no mostruario. Deseja publicar no site? Va em Mostruario > + Novo Produto`);
          } else {
            setMsg("Produto adicionado!");
          }
        } catch {
          setMsg("Produto adicionado!");
        }
      }
      // Criar variações de cor adicionais
      const validVariacoes = variacoes.filter((v) => v.cor.trim());
      const varResults: string[] = [];
      for (const v of validVariacoes) {
        try {
          const vRes = await fetch("/api/estoque", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
            body: JSON.stringify({
              produto: nomeProduto, categoria: form.categoria,
              qnt: parseInt(v.qnt) || 1, custo_unitario: parseFloat(form.custo_unitario) || 0,
              status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
              cor: v.cor.trim(), observacao: form.observacao || null,
              tipo: form.tipo, fornecedor: form.fornecedor || null,
            }),
          });
          const vJson = await vRes.json();
          if (!vJson.ok) {
            varResults.push(`❌ ${v.cor}: ${vJson.error}`);
          } else if (vJson.merged) {
            varResults.push(`🔄 ${v.cor}: mesclado (ja existia)`);
          } else {
            varResults.push(`✅ ${v.cor}: criado`);
          }
        } catch (e) {
          varResults.push(`❌ ${v.cor}: ${String(e)}`);
        }
      }
      if (validVariacoes.length > 0) {
        const errors = varResults.filter((r) => r.startsWith("❌"));
        if (errors.length > 0) {
          setMsg(`Produto adicionado. Cores: ${varResults.join(" | ")}`);
        } else {
          setMsg(`Produto adicionado com ${validVariacoes.length + 1} variacoes de cor! (${varResults.join(" | ")})`);
        }
      }

      if (keepForm) {
        // Duplicar: mantém specs, cor, fornecedor, custo — limpa só IMEI, Serial e quantidade
        setForm((f) => ({ ...f, imei: "", serial_no: "", qnt: "1" }));
        setMsg("Produto adicionado! Preencha IMEI/Serial do proximo.");
      } else {
        setForm((f) => ({ ...f, produto: "", qnt: "1", custo_unitario: "", cor: "", observacao: "", bateria: "", cliente: "", fornecedor: "", imei: "", serial_no: "" }));
        setSpec({
          ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
          mb_modelo: "AIR", mb_tela: "13\"", mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
          mm_chip: "M4", mm_nucleos: "10C CPU/10C GPU", mm_ram: "16GB", mm_storage: "256GB",
          ipad_modelo: "AIR", ipad_chip: "", ipad_tela: "11\"", ipad_storage: "128GB", ipad_conn: "WIFI",
          aw_modelo: "SERIES 11", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "", aw_band: "",
          air_modelo: "AIRPODS 4",
          semi_subtipo: "IPHONES",
        });
        setTab("estoque");
      }
      setVariacoes([]);
      fetchEstoque();
      setFilterCat(form.categoria);
    } else { setMsg("Erro: " + json.error); }
  };

  // Adicionar variação de cor (mesmo produto, cor diferente)
  const handleAddVariacao = async () => {
    if (!form.cor) { setMsg("Preencha a cor da variacao"); return; }
    const nomeProduto = form.produto || (hasStructuredFields ? buildProdutoName(form.categoria) : "");
    if (!nomeProduto) { setMsg("Preencha o produto primeiro"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({
        produto: nomeProduto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 1, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
        cor: form.cor, observacao: form.observacao || null,
        tipo: form.tipo, bateria: form.bateria ? parseInt(form.bateria) : null,
        cliente: form.cliente || null, fornecedor: form.fornecedor || null,
        imei: form.imei || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(`Variacao "${form.cor}" adicionada!`);
      // Limpa só cor, qtd e imei para adicionar outra variação rapidamente
      setForm((f) => ({ ...f, cor: "", qnt: "1", imei: "" }));
      fetchEstoque();
    } else { setMsg("Erro: " + json.error); }
  };

  const handleImportInitial = async () => {
    setImportingInitial(true); setMsg("");
    try {
      const res = await fetch("/estoque-initial.json");
      const rows = await res.json();
      const importRes = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ action: "import", rows }),
      });
      const json = await importRes.json();
      if (json.ok) { setMsg(`${json.imported} produtos importados!`); fetchEstoque(); }
      else setMsg("Erro: " + json.error);
    } catch (err) { setMsg("Erro: " + String(err)); }
    setImportingInitial(false);
  };

  // Reservados: produtos movidos para a aba Reservas (ficam escondidos das outras listas)
  const isReservado = (p: ProdutoEstoque) => !!p.reserva_cliente;
  const reservados = estoque.filter(isReservado);

  // Filtrar por tipo (sempre excluindo reservados)
  const novos = estoque.filter((p) => !isReservado(p) && (p.tipo || "NOVO") === "NOVO");
  // Seminovos agora engloba SEMINOVO + NAO_ATIVADO (aba "Não Ativados" foi removida)
  const seminovos = estoque.filter((p) => !isReservado(p) && (p.tipo === "SEMINOVO" || p.tipo === "NAO_ATIVADO") && p.status !== "ESGOTADO");
  const atacado = estoque.filter((p) => !isReservado(p) && p.tipo === "ATACADO");
  const emEstoque = novos; // Aba Estoque = só lacrados (NOVO)
  const pendencias = estoque.filter((p) => !isReservado(p) && p.tipo === "PENDENCIA");
  const aCaminho = estoque.filter((p) => !isReservado(p) && p.tipo === "A_CAMINHO" && p.status === "A CAMINHO");
  // Produtos que tinham pedido (A_CAMINHO) mas já foram movidos para estoque
  // Produtos que tinham pedido (A_CAMINHO) mas já foram movidos para estoque — identificados por terem data_compra
  const pedidosRecebidos = estoque.filter((p) => p.tipo !== "A_CAMINHO" && !!p.pedido_fornecedor_id && !["PENDENCIA", "SEMINOVO"].includes(p.tipo));
  const acabando = novos.filter((p) => p.qnt === 1);

  // Esgotados: qnt=0 em NOVO. Marcar se já está a caminho
  const produtosACaminho = new Set(aCaminho.map((p) => p.produto.toUpperCase()));
  const esgotados = novos.filter((p) => p.qnt === 0);

  // Reposição: agrupar por modelo+cor e verificar se está abaixo do mínimo
  // Conta itens EM ESTOQUE + A CAMINHO — se a soma cobre o mínimo, não aparece
  const reposicaoCount = (() => {
    const groups: Record<string, { qntEstoque: number; qntACaminho: number; min: number | null }> = {};
    for (const p of novos) {
      const base = getModeloBase(p.produto, p.categoria).toUpperCase();
      const cor = (p.cor || "").toUpperCase();
      const key = `${base}|||${cor}`;
      if (!groups[key]) groups[key] = { qntEstoque: 0, qntACaminho: 0, min: null };
      groups[key].qntEstoque += p.qnt;
      if (typeof p.estoque_minimo === "number" && p.estoque_minimo > 0) {
        groups[key].min = p.estoque_minimo;
      }
    }
    for (const p of aCaminho) {
      const base = getModeloBase(p.produto, p.categoria).toUpperCase();
      const cor = (p.cor || "").toUpperCase();
      const key = `${base}|||${cor}`;
      if (!groups[key]) groups[key] = { qntEstoque: 0, qntACaminho: 0, min: null };
      groups[key].qntACaminho += p.qnt;
    }
    let count = 0;
    for (const g of Object.values(groups)) {
      const total = g.qntEstoque + g.qntACaminho;
      if ((g.min && total < g.min) || (g.qntEstoque === 0 && g.qntACaminho === 0)) count++;
    }
    return count;
  })();

  const acaminhoList =
    acaminhoFilter === "pendentes" ? aCaminho :
    acaminhoFilter === "recebidos" ? pedidosRecebidos :
    [...aCaminho, ...pedidosRecebidos];

  const currentList =
    tab === "seminovos" ? seminovos :
    tab === "reservas" ? reservados :
    tab === "acaminho" ? acaminhoList :
    tab === "atacado" ? atacado :
    tab === "pendencias" ? pendencias :
    tab === "esgotados" ? esgotados :
    tab === "acabando" ? acabando :
    emEstoque;

  const filtered = currentList.filter((p) => {
    if (filterCat && p.categoria !== filterCat) return false;
    if (filterBateria) {
      const bat = p.bateria;
      if (filterBateria === "90" && (!bat || bat < 90)) return false;
      if (filterBateria === "85" && (!bat || bat < 85 || bat >= 90)) return false;
      if (filterBateria === "80" && (!bat || bat < 80 || bat >= 85)) return false;
      if (filterBateria === "low" && (!bat || bat >= 80)) return false;
      if (filterBateria === "none" && bat) return false;
    }
    if (filterDataCompra && tab === "acaminho" && p.data_compra !== filterDataCompra) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.produto.toLowerCase().includes(s) && !(p.cor?.toLowerCase().includes(s)) && !(p.imei?.toLowerCase().includes(s)) && !(p.serial_no?.toLowerCase().includes(s))) return false;
    }
    // Filtro por linha de modelo (seminovos/pendências)
    if (filterLinha && (tab === "seminovos" || tab === "pendencias")) {
      if (!p.produto.toUpperCase().includes(filterLinha.toUpperCase())) return false;
    }
    // Filtro por características (seminovos/pendências)
    if (filterCaract.length > 0 && (tab === "seminovos" || tab === "pendencias")) {
      const obs = (p.observacao || "").toUpperCase();
      for (const f of filterCaract) {
        if (f === "COM_CAIXA" && !obs.includes("[COM_CAIXA]")) return false;
        if (f === "SEM_CAIXA" && obs.includes("[COM_CAIXA]")) return false;
        if (f === "COM_CABO" && !obs.includes("[COM_CABO]")) return false;
        if (f === "COM_GARANTIA" && !p.garantia) return false;
        if (f === "GRADE_A+" && !obs.includes("[GRADE_A+]")) return false;
        if (f === "GRADE_A" && !obs.includes("[GRADE_A]")) return false;
        if (f === "GRADE_AB" && !obs.includes("[GRADE_AB]")) return false;
        if (f === "GRADE_B" && !obs.includes("[GRADE_B]")) return false;
        if (f === "COM_FONTE" && !obs.includes("[COM_FONTE]")) return false;
        if (f === "COM_PULSEIRA" && !obs.includes("[COM_PULSEIRA]")) return false;
      }
    }
    return true;
  });

  // Agrupar por categoria (ou por data+cliente nas pendências), depois por modelo base
  const byCat: Record<string, Record<string, ProdutoEstoque[]>> = {};
  filtered.forEach((p) => {
    let catKey: string;
    if (tab === "pendencias") {
      const date = p.data_compra || p.data_entrada || "Sem data";
      const cliente = (p.fornecedor || p.cliente || "Sem cliente").toUpperCase();
      catKey = `${date}|||${cliente}`;
    } else {
      catKey = p.categoria;
    }
    if (!byCat[catKey]) byCat[catKey] = {};
    const modelo = getModeloBase(p.produto, p.categoria, p.observacao);
    if (!byCat[catKey][modelo]) byCat[catKey][modelo] = [];
    byCat[catKey][modelo].push(p);
  });

  // KPIs
  const totalProdutos = emEstoque.length;
  const totalUnidades = emEstoque.reduce((s, p) => s + p.qnt, 0);
  const valorEstoque = emEstoque.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const valorSeminovos = seminovos.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const valorACaminho = aCaminho.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const qntCls = `w-20 px-3 py-2 rounded-xl border text-sm text-center shrink-0 focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  const isPendenciasTab = tab === "pendencias";
  const isACaminhoTab = tab === "acaminho";
  const isEditableItemTab = isPendenciasTab || isACaminhoTab;

  // renderProductRow removido — agora renderizado inline com agrupamento por produto/cor

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? (dm ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-700") : (dm ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700")}`}>{msg}</div>}
      {ocrLoading && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold shadow-lg animate-pulse">Lendo serial da imagem...</div>}

      {/* Modal Etiqueta Obrigatória */}
      {etiquetaModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => {}}>
          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border shadow-2xl w-full max-w-lg mx-4 overflow-hidden`} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
              <div>
                <h3 className={`text-lg font-bold ${textPrimary}`}>🏷️ Imprimir Etiqueta</h3>
                <p className={`text-xs ${textSecondary}`}>Obrigatorio antes de mover para estoque</p>
              </div>
              <button onClick={() => setEtiquetaModal(null)} className={`p-2 rounded-lg ${bgHoverBtn} ${textSecondary}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              {/* Produto(s) info */}
              {etiquetaModal.batchItems ? (
                <div className={`rounded-xl p-4 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"} space-y-1 max-h-48 overflow-y-auto`}>
                  <p className={`font-bold text-sm ${textPrimary} mb-2`}>{etiquetaModal.batchItems.length} produtos — QR codes em grade</p>
                  {etiquetaModal.batchItems.map(p => (
                    <div key={p.id} className={`flex justify-between text-xs ${textSecondary} py-0.5`}>
                      <span className="truncate flex-1">{p.produto.toUpperCase()} {p.cor ? `(${p.cor})` : ""}</span>
                      <span className="font-mono ml-2 text-[10px]">{p.serial_no || p.imei || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`rounded-xl p-4 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                  <p className={`font-bold ${textPrimary}`}>{etiquetaModal.item.produto}</p>
                  <div className={`flex gap-3 mt-1 text-xs ${textSecondary}`}>
                    {etiquetaModal.item.cor && <span>{etiquetaModal.item.cor}</span>}
                    {etiquetaModal.item.serial_no && <span>SN: {etiquetaModal.item.serial_no}</span>}
                    {etiquetaModal.items && <span>{etiquetaModal.items.length} unidades</span>}
                  </div>
                </div>
              )}

              {/* Info impressora */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Brother QL-820NWB — {etiquetaModal.batchItems ? "QR codes em grade pra recortar" : "Etiqueta QR 62mm"}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t space-y-3" style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
              {/* Data de entrada editável */}
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold shrink-0 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>📅 Data de entrada:</span>
                <input
                  type="date"
                  value={etiquetaModal.dataEntrada}
                  onChange={(e) => setEtiquetaModal(prev => prev ? { ...prev, dataEntrada: e.target.value } : null)}
                  className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-semibold ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                />
              </div>
              <div className="flex gap-3">
              {!etiquetaModal.printed ? (
                <>
                  <button onClick={() => setEtiquetaModal(null)} className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmarMover}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Mover sem etiqueta
                  </button>
                  <button
                    onClick={handlePrintEtiquetaModal}
                    disabled={etiquetaModal.loading}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimir Etiqueta
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handlePrintEtiquetaModal} className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} flex items-center justify-center gap-1`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Reimprimir
                  </button>
                  <button
                    onClick={handleConfirmarMover}
                    className="flex-[2] px-4 py-3 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Confirmar — Mover para Estoque
                  </button>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMEI Search */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => { setShowImeiSearch(!showImeiSearch); if (showImeiSearch) { setImeiResult(null); setImeiSearch(""); } }}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${showImeiSearch ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E] hover:text-[#E8740E]`}`}
        >
          IMEI
        </button>
        {showImeiSearch && (
          <>
            <input
              value={imeiSearch}
              onChange={(e) => setImeiSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImeiSearch()}
              placeholder="Buscar por IMEI..."
              className={`flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "border-[#D2D2D7]"}`}
              autoFocus
            />
            <button
              onClick={handleImeiSearch}
              disabled={imeiSearching}
              className="px-4 py-2.5 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {imeiSearching ? "..." : "Buscar"}
            </button>
          </>
        )}
      </div>

      {/* IMEI Search Results */}
      {imeiResult && (
        <div className={`${bgCard} border border-[#E8740E] rounded-2xl p-5 shadow-sm space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-bold ${textPrimary}`}>Resultado IMEI: {imeiSearch}</h3>
            <button onClick={() => { setImeiResult(null); setImeiSearch(""); setShowImeiSearch(false); }} className="text-[#86868B] hover:text-red-500 text-sm">Fechar</button>
          </div>

          {imeiResult.estoque.length === 0 && imeiResult.vendas.length === 0 ? (
            <p className={`${textSecondary} text-sm`}>Nenhum registro encontrado para este IMEI.</p>
          ) : (
            <div className="space-y-3">
              {/* Estoque entries */}
              {imeiResult.estoque.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 ${bgSection} rounded-xl`}>
                  <span className="text-lg">📦</span>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${textPrimary}`}>{item.produto} {item.cor || ""}</p>
                    <p className={`text-xs ${textSecondary}`}>
                      {item.fornecedor ? `Comprado de ${item.fornecedor}` : "Fornecedor n/a"}
                      {item.data_compra ? ` em ${item.data_compra}` : ""}
                      {item.custo_unitario ? ` por R$ ${Math.round(item.custo_unitario).toLocaleString("pt-BR")}` : ""}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>IMEI: {item.imei} | Status: {item.status} | Tipo: {item.tipo}</p>
                  </div>
                </div>
              ))}

              {/* Vendas entries */}
              {imeiResult.vendas.map((venda) => (
                <div key={venda.id} className={`flex items-center gap-3 p-3 ${dm ? "bg-green-900/20" : "bg-green-50"} rounded-xl`}>
                  <span className="text-lg">💰</span>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${textPrimary}`}>{venda.produto}</p>
                    <p className={`text-xs ${textSecondary}`}>
                      Vendido para {venda.cliente || "N/A"}
                      {venda.data ? ` em ${venda.data}` : ""}
                      {venda.preco_vendido ? ` por R$ ${Math.round(venda.preco_vendido).toLocaleString("pt-BR")}` : ""}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>IMEI: {venda.imei}</p>
                  </div>
                </div>
              ))}

              {/* Timeline summary */}
              {(imeiResult.estoque.length > 0 || imeiResult.vendas.length > 0) && (
                <div className="p-3 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl">
                  <p className="text-xs text-white/60 mb-1">Rastreamento</p>
                  <p className="text-white text-sm">
                    {imeiResult.estoque.map((e) =>
                      `${e.fornecedor || "?"} ${e.data_compra ? `(${e.data_compra})` : ""} → R$ ${Math.round(e.custo_unitario || 0).toLocaleString("pt-BR")}`
                    ).join(" | ")}
                    {imeiResult.estoque.length > 0 && imeiResult.vendas.length > 0 && " → "}
                    {imeiResult.vendas.map((v) =>
                      `Vendido para ${v.cliente || "?"} ${v.data ? `(${v.data})` : ""} → R$ ${Math.round(v.preco_vendido || 0).toLocaleString("pt-BR")}`
                    ).join(" | ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {estoque.length === 0 && !loading && (
        <div className={`${bgCard} border ${borderCard} rounded-2xl p-8 text-center shadow-sm`}>
          <p className={`${textSecondary} mb-4`}>Estoque vazio. Importar produtos da planilha ESTOQUE 2026?</p>
          <button onClick={handleImportInitial} disabled={importingInitial} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {importingInitial ? "Importando..." : "Importar Estoque da Planilha"}
          </button>
        </div>
      )}

      {/* KPIs — Estilo Apple clean */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Produtos", value: totalProdutos, sub: "SKUs cadastrados" },
          { label: "Unidades", value: totalUnidades, sub: "em estoque" },
          { label: "Valor Total", value: fmt(valorEstoque), sub: "investido" },
          { label: "Seminovos", value: seminovos.length, sub: fmt(valorSeminovos) },
          { label: "Pendencias", value: pendencias.length, sub: "aguardando" },
          { label: "A Caminho", value: aCaminho.length, sub: fmt(valorACaminho) },
        ].map((kpi) => (
          <div key={kpi.label} className={`${bgCard} border ${borderCard} rounded-2xl p-4 hover:shadow-md transition-shadow`}>
            <p className={`${textSecondary} text-[11px] font-medium tracking-wide`}>{kpi.label}</p>
            <p className={`text-[22px] font-bold mt-1 ${textPrimary}`}>{kpi.value}</p>
            <p className={`${textMuted} text-[11px] mt-0.5`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Diagnóstico de valores */}
      <div>
        <button onClick={() => setShowDiagnostico(!showDiagnostico)} className={`text-[11px] font-medium ${textMuted} hover:text-[#E8740E] transition-colors`}>
          {showDiagnostico ? "▼ Fechar diagnóstico" : "▶ Diagnóstico de valores"}
        </button>
        {showDiagnostico && (() => {
          // Valor TOTAL de tudo no banco (todos os tipos)
          const valorTudo = estoque.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
          const valorPendencias = pendencias.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
          // Sem custo
          const semCusto = estoque.filter((p) => !p.custo_unitario && p.qnt > 0);
          // Por categoria
          const porCat: Record<string, { qnt: number; valor: number; items: number }> = {};
          estoque.forEach((p) => {
            if (!porCat[p.categoria]) porCat[p.categoria] = { qnt: 0, valor: 0, items: 0 };
            porCat[p.categoria].qnt += p.qnt;
            porCat[p.categoria].valor += p.qnt * (p.custo_unitario || 0);
            porCat[p.categoria].items++;
          });
          // Por tipo
          const porTipo: Record<string, { qnt: number; valor: number; items: number }> = {};
          estoque.forEach((p) => {
            const t = p.tipo || "NOVO";
            if (!porTipo[t]) porTipo[t] = { qnt: 0, valor: 0, items: 0 };
            porTipo[t].qnt += p.qnt;
            porTipo[t].valor += p.qnt * (p.custo_unitario || 0);
            porTipo[t].items++;
          });
          return (
            <div className={`mt-3 ${bgCard} border ${borderCard} rounded-2xl p-4 space-y-4 text-xs`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>DASHBOARD (Novos+Seminovos)</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorEstoque)}</p>
                  <p className={`${textMuted}`}>{emEstoque.length} SKUs, {totalUnidades} un.</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>TUDO (incluindo pendências/a caminho)</p>
                  <p className={`text-lg font-bold text-[#E8740E]`}>{fmt(valorTudo)}</p>
                  <p className={`${textMuted}`}>{estoque.length} SKUs, {estoque.reduce((s, p) => s + p.qnt, 0)} un.</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>PENDÊNCIAS</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorPendencias)}</p>
                  <p className={`${textMuted}`}>{pendencias.length} SKUs</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>A CAMINHO</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorACaminho)}</p>
                  <p className={`${textMuted}`}>{aCaminho.length} SKUs</p>
                </div>
              </div>

              <div>
                <p className={`${textSecondary} font-bold text-[10px] uppercase mb-2`}>Por Tipo</p>
                <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                  <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Tipo</th><th className="text-right px-2 py-1">SKUs</th><th className="text-right px-2 py-1">Unidades</th><th className="text-right px-2 py-1">Valor</th></tr></thead>
                  <tbody>{Object.entries(porTipo).sort((a, b) => b[1].valor - a[1].valor).map(([tipo, d]) => (
                    <tr key={tipo} className={`border-b ${borderLight}`}><td className="px-2 py-1 font-medium">{tipo}</td><td className="text-right px-2 py-1">{d.items}</td><td className="text-right px-2 py-1">{d.qnt}</td><td className="text-right px-2 py-1 font-semibold">{fmt(d.valor)}</td></tr>
                  ))}</tbody>
                </table>
              </div>

              <div>
                <p className={`${textSecondary} font-bold text-[10px] uppercase mb-2`}>Por Categoria</p>
                <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                  <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Categoria</th><th className="text-right px-2 py-1">SKUs</th><th className="text-right px-2 py-1">Unidades</th><th className="text-right px-2 py-1">Valor</th></tr></thead>
                  <tbody>{Object.entries(porCat).sort((a, b) => b[1].valor - a[1].valor).map(([cat, d]) => (
                    <tr key={cat} className={`border-b ${borderLight}`}><td className="px-2 py-1 font-medium">{dynamicCatLabels[cat] || cat}</td><td className="text-right px-2 py-1">{d.items}</td><td className="text-right px-2 py-1">{d.qnt}</td><td className="text-right px-2 py-1 font-semibold">{fmt(d.valor)}</td></tr>
                  ))}</tbody>
                </table>
              </div>

              {semCusto.length > 0 && (
                <div>
                  <p className={`text-[10px] font-bold uppercase mb-2 text-red-500`}>⚠ Produtos SEM custo unitário (qnt {'>'} 0)</p>
                  <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                    <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Produto</th><th className="text-left px-2 py-1">Cor</th><th className="text-right px-2 py-1">Qnt</th><th className="text-left px-2 py-1">Tipo</th><th className="text-left px-2 py-1">Cat</th></tr></thead>
                    <tbody>{semCusto.map((p) => (
                      <tr key={p.id} className={`border-b ${borderLight}`}><td className="px-2 py-1">{p.produto.toUpperCase()}</td><td className="px-2 py-1">{p.cor || "—"}</td><td className="text-right px-2 py-1">{p.qnt}</td><td className="px-2 py-1">{p.tipo}</td><td className="px-2 py-1">{p.categoria}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Tabs — Segmented control Apple style */}
      {tab !== "etiquetas" && (
      <div className="space-y-3">
        <div className={`inline-flex items-center gap-1 p-1 rounded-xl overflow-x-auto max-w-full ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
          {([
            { key: "estoque", label: "Lacrados", count: emEstoque.length },
            { key: "seminovos", label: "Seminovos", count: seminovos.length },
            { key: "reservas", label: "Reservas", count: reservados.length },
            { key: "atacado", label: "Atacado", count: atacado.length },
            { key: "acaminho", label: "Produtos a Caminho", count: aCaminho.length },
            { key: "pendencias", label: "Pendências", count: pendencias.length },
            { key: "reposicao", label: "Reposição", count: reposicaoCount },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
                tab === t.key
                  ? `${dm ? "bg-[#3A3A3C]" : "bg-white shadow-sm"} ${textPrimary}`
                  : `${textSecondary} hover:${textPrimary}`
              }`}>
              {t.label}
              {t.count > 0 && <span className={`ml-1.5 text-[10px] ${tab === t.key ? "text-[#E8740E]" : textMuted}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center overflow-x-auto">
          <button onClick={() => setTab("scan")} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all shrink-0 ${tab === "scan" ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E]`}`}>
            Scan
          </button>
          {isAdmin && <button onClick={() => setTab("novo" as typeof tab)} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${tab === "novo" ? "bg-[#E8740E] text-white" : "bg-[#E8740E]/10 text-[#E8740E] border border-[#E8740E]/20 hover:bg-[#E8740E] hover:text-white"}`}>
            + Adicionar
          </button>}
          <button onClick={() => setTab("historico" as typeof tab)} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${tab === "historico" ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E]`}`}>
            Historico
          </button>
          {isAdmin && (
            <button
              onClick={async () => {
                if (!confirm("Recalcular balanço de TODOS os produtos em estoque?\n\nAgrupa por categoria + modelo (ignora cor) e aplica média ponderada do custo de compra.")) return;
                setMsg("⏳ Recalculando balanços...");
                try {
                  const r = await fetch("/api/admin/recalc-balancos", { method: "POST", headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } });
                  const j = await r.json();
                  if (!r.ok) { setMsg(`❌ ${j.error || "Erro ao recalcular"}`); return; }
                  setMsg(`✅ ${j.updated} produto(s) atualizados em ${j.groups} grupo(s)`);
                  fetchEstoque();
                } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : "Erro"}`); }
              }}
              title="Recalcula custo_unitario (balanço) de todos os produtos em estoque, agrupando por categoria+modelo (ignora cor) — média ponderada do custo_compra"
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all shrink-0 ${bgCard} border ${borderCard} ${textSecondary} hover:border-blue-500 hover:text-blue-500`}
            >
              🔄 Recalc Balanços
            </button>
          )}
          {isAdmin && !["novo", "scan", "historico", "etiquetas"].includes(tab) && (
            <button
              onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${selectMode ? "bg-red-500 text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-red-500 hover:text-red-500`}`}
            >
              {selectMode ? "Cancelar" : "Selecionar"}
            </button>
          )}
          {isAdmin && (tab === "estoque" || tab === "seminovos") && !selectMode && (
            <button
              onClick={() => {
                // Filtra itens visíveis (da aba atual) que têm serial ou IMEI
                const itensVisiveis = tab === "estoque"
                  ? estoque.filter(p => !isReservado(p) && p.tipo === "NOVO" && p.status === "EM ESTOQUE" && p.qnt > 0)
                  : estoque.filter(p => !isReservado(p) && (p.tipo === "SEMINOVO" || p.tipo === "NAO_ATIVADO") && p.status !== "ESGOTADO");
                const comSerial = itensVisiveis.filter(p => p.serial_no || p.imei);
                const semSerial = itensVisiveis.length - comSerial.length;
                if (comSerial.length === 0) {
                  setMsg("⚠️ Nenhum produto nessa aba tem serial/IMEI cadastrado. Cadastre primeiro antes de imprimir.");
                  return;
                }
                if (semSerial > 0) {
                  if (!confirm(`${comSerial.length} produto(s) com serial/IMEI serão impressos.\n\n⚠️ ${semSerial} produto(s) SEM serial/IMEI serão ignorados (precisa cadastrar o serial primeiro).\n\nContinuar?`)) return;
                }
                handlePrintEtiquetaDirect(comSerial);
                setMsg(`🏷️ ${comSerial.length} etiqueta(s) enviada(s) pra impressão!${semSerial > 0 ? ` (${semSerial} ignorados por falta de serial)` : ""}`);
              }}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${bgCard} border ${borderCard} text-[#E8740E] hover:bg-[#E8740E] hover:text-white hover:border-[#E8740E]`}
            >
              🏷️ Imprimir Todas Etiquetas
            </button>
          )}
          {isAdmin && tab === "seminovos" && !selectMode && (
            <button
              onClick={() => { setBalanceMode(!balanceMode); if (balanceMode) setBalanceSelected(new Set()); }}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${balanceMode ? "bg-blue-500 text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-blue-500 hover:text-blue-500`}`}
            >
              {balanceMode ? "Cancelar Balanço" : "Balancear Preços"}
            </button>
          )}

          <div className="flex-1" />

          {/* Filtros inline */}
          {!["novo", "scan", "historico"].includes(tab) && (<>
            {filterCat && tab === "estoque" ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setFilterCat("")} className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#E8740E]" : "bg-[#E5E5EA] text-[#1D1D1F] hover:bg-[#E8740E] hover:text-white"} transition-colors`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  Voltar
                </button>
                <span className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{dynamicCatLabels[filterCat] || filterCat}</span>
              </div>
            ) : (
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA]"}`}>
                <option value="">Todas categorias</option>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{dynamicCatLabels[c] || c}</option>)}
              </select>
            )}
            {(tab === "seminovos" || tab === "pendencias") && (
              <select value={filterBateria} onChange={(e) => setFilterBateria(e.target.value)} className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA]"}`}>
                <option value="">🔋 Bateria</option>
                <option value="90">90%+</option>
                <option value="85">85-89%</option>
                <option value="80">80-84%</option>
                <option value="low">Abaixo de 80%</option>
                <option value="none">Sem info</option>
              </select>
            )}
            {tab === "acaminho" && (<>
              {/* Filtro: Pendentes / Recebidos / Todos */}
              <div className={`flex rounded-lg overflow-hidden border text-[11px] font-semibold ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"}`}>
                {([["pendentes", "Pendentes"], ["recebidos", "Recebidos"], ["todos", "Todos"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAcaminhoFilter(val)}
                    className={`px-3 py-1.5 transition-colors ${acaminhoFilter === val ? "bg-[#E8740E] text-white" : dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Filtro por data de pedido */}
              {(() => {
                const datasDisponiveis = [...new Set(acaminhoList.map(p => p.data_compra).filter(Boolean))].sort().reverse() as string[];
                return datasDisponiveis.length > 0 ? (
                  <select
                    value={filterDataCompra}
                    onChange={(e) => setFilterDataCompra(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA]"}`}
                  >
                    <option value="">Todos os pedidos</option>
                    {datasDisponiveis.map(d => (
                      <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>
                    ))}
                  </select>
                ) : null;
              })()}
            </>)}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className={`px-3 py-1.5 rounded-lg border text-[11px] w-44 focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "bg-white border-[#E5E5EA]"}`} />
            <button onClick={() => setShowNewCat(!showNewCat)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E] hover:text-[#E8740E] transition-colors`}>
              + Categoria
            </button>
          </>)}
        </div>
        {/* Filtros extras para seminovos/pendências */}
        {(tab === "seminovos" || tab === "pendencias") && (
          <div className={`flex flex-wrap items-center gap-2 px-4 pb-3`}>
            {/* Filtro por linha de modelo */}
            <select
              value={filterLinha}
              onChange={(e) => setFilterLinha(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA]"}`}
            >
              <option value="">Todas as linhas</option>
              {(() => {
                const list = tab === "seminovos" ? seminovos : pendencias;
                const linhas = new Set<string>();
                list.forEach(p => {
                  const m = p.produto.match(/^(IPHONE\s+\d+[A-Z\s]*?|MACBOOK\s+\w+|IPAD\s+\w+|APPLE\s+WATCH\s+\S+|AIRPODS\s+\S+)/i);
                  if (m) linhas.add(m[1].toUpperCase().trim());
                });
                return [...linhas].sort().map(l => <option key={l} value={l}>{l}</option>);
              })()}
            </select>
            {/* Filtro por características */}
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${dm ? "text-[#86868B]" : "text-[#86868B]"} ml-1`}>Filtrar:</span>
            {[
              { key: "COM_CAIXA", label: "📦 Caixa" },
              { key: "SEM_CAIXA", label: "📦✕ Sem caixa" },
              { key: "COM_CABO", label: "🔌 Cabo" },
              { key: "COM_GARANTIA", label: "🛡️ Garantia" },
              { key: "GRADE_A+", label: "A+" },
              { key: "GRADE_A", label: "A" },
              { key: "GRADE_AB", label: "AB" },
              { key: "GRADE_B", label: "B" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterCaract(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key])}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  filterCaract.includes(key)
                    ? "bg-[#E8740E] text-white border-[#E8740E]"
                    : `${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`
                }`}
              >
                {label}
              </button>
            ))}
            {(filterLinha || filterCaract.length > 0 || filterBateria) && (
              <button
                onClick={() => { setFilterLinha(""); setFilterCaract([]); setFilterBateria(""); }}
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 transition-colors"
              >
                ✕ Limpar filtros
              </button>
            )}
          </div>
        )}
        </div>
      )}

      {/* Preços Sugeridos por tipo */}
      {tab === "novo" && (
        <div className={`mt-4 p-4 rounded-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]"}`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${textPrimary} mb-3`}>💰 Markup para Preço Sugerido</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: "NOVO", label: "Lacrado" },
              { key: "SEMINOVO", label: "Seminovo" },
              { key: "NAO_ATIVADO", label: "Não Ativado" },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <p className={`text-[11px] ${textSecondary} mb-1`}>{label}</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="200"
                    value={markupConfig[key] || ""}
                    onChange={(e) => saveMarkupConfig({ ...markupConfig, [key]: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className={`w-full px-2 py-1.5 rounded-lg border text-[13px] text-center ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                  />
                  <span className={`text-[13px] ${textSecondary}`}>%</span>
                </div>
              </div>
            ))}
          </div>
          <p className={`text-[10px] ${textSecondary} mt-2`}>Ex: custo R$ 2.000 com 50% → sugestão R$ 3.000</p>
        </div>
      )}

      {/* Form criar categoria */}
      {tab !== "etiquetas" && showNewCat && (
        <div className={`${bgCard} border border-[#E8740E] rounded-2xl p-4 shadow-sm space-y-3`}>
          <h3 className={`font-semibold text-sm ${textPrimary}`}>Nova Categoria de Estoque</h3>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <p className={`text-[10px] font-bold ${textSecondary} uppercase mb-1`}>Emoji</p>
              <div className="flex gap-1 flex-wrap max-w-xs">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewCat({ ...newCat, emoji: e })}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                      newCat.emoji === e ? "bg-[#E8740E] text-white" : `${bgSection} ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#E8E8ED]"}`
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className={`text-[10px] font-bold ${textSecondary} uppercase mb-1`}>Nome da Categoria</p>
              <input
                value={newCat.label}
                onChange={(e) => setNewCat({ ...newCat, label: e.target.value })}
                placeholder="Ex: Samsung, Cabos, etc."
                className={`w-full px-3 py-2 border rounded-lg text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7]"}`}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategoriaEstoque()}
              />
            </div>
            <button onClick={handleAddCategoriaEstoque} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors">Criar</button>
            <button onClick={() => setShowNewCat(false)} className={`px-4 py-2 rounded-xl border ${borderCard} ${textSecondary} text-sm ${bgHoverBtn} transition-colors`}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ===== ABA REPOSIÇÃO ===== */}
      {tab === "reposicao" ? (() => {
        const stripOrigemRepo = (nome: string) => nome
          .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ)(?=\s|$|\()(\s*\([^)]*\))?/gi, "")
          .replace(/[-–]\s*(CHIP\s+(F[ÍI]SICO\s*\+\s*)?)?E-?SIM/gi, "")
          .replace(/[-–]\s*CHIP\s+VIRTUAL/gi, "")
          .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")
          .replace(/\s{2,}/g, " ").trim();

        // Extrair modelo base (sem cor): "IPHONE 17 PRO MAX 256GB SILVER" → "IPHONE 17 PRO MAX 256GB"
        const extractBase = (nome: string) => {
          const m = nome.match(/^(.+?\d+\s*(?:GB|TB))/i);
          return m ? m[1].trim().toUpperCase() : nome.toUpperCase();
        };
        // Extrair cor do nome
        const extractCor = (nome: string, corField: string | null | undefined) => {
          const base = extractBase(nome);
          const rest = nome.slice(base.length).trim();
          return rest || corField || null;
        };

        const catOrder = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS"];

        // === Lógica: estoque como fonte da estrutura (preserva variantes por categoria
        // via getModeloBase: iPad storage/conect, MacBook ram/ssd/cor, Watch tamanho/conect/cor, Mac Mini ram/ssd).
        // Catálogo é usado apenas para FILTRAR cores fantasmas (que não estão cadastradas).
        type RepoGroup = { qntEstoque: number; qntACaminho: number; totalDisponivel: number; min: number; corEN: string; corPT: string; corDisplay: string; falta: number };
        const byCatModel: Record<string, Record<string, RepoGroup[]>> = {};

        // Normalização em tokens (igual gerar-link): geração 2ND/2º→2, remove GB/TB/MM/GPS/etc
        const normGen = (s: string) => s
          .replace(/(\d+)\s*(ST|ND|RD|TH)\b/gi, "$1")
          .replace(/(\d+)\s*[º°]/g, "$1")
          .replace(/\bGENERATION\b/gi, "GEN")
          .replace(/\bGERAÇÃO\b/gi, "GEN");
        const stripRepoNoise = (s: string) => normGen(s)
          .replace(/\b\d+\s*(GB|TB)\b/gi, "")
          .replace(/\b\d+\s*MM\b/gi, "")
          .replace(/\b(GPS|CELLULAR|WI[- ]?FI|CELL)\b/gi, "")
          .replace(/[""\(\)\+\-]/g, " ")
          .replace(/\s+/g, " ").trim();
        const STOP_REPO = new Set(["de","the","with","com","e","a","o","gen"]);
        const expandSynonymsRepo = (toks: string[]): string[] => {
          const set = new Set(toks);
          if (set.has("ipad")) {
            if (set.has("a16")) set.add("11");
            if (set.has("11")) set.add("a16");
            if (set.has("a14")) set.add("10");
            if (set.has("10")) set.add("a14");
          }
          return [...set];
        };
        const tokenize = (s: string) => expandSynonymsRepo(stripRepoNoise(s).toLowerCase().split(/\s+/).filter(t => t && !STOP_REPO.has(t)));

        // Index catálogo: nomeCat original → { tokens, cores normalizadas }
        type CatEntry = { nomeCat: string; tokens: string[]; cores: Set<string> };
        const catEntries: CatEntry[] = [];
        for (const [nomeCat, coresCat] of Object.entries(catalogoCoresMap)) {
          if (!coresCat) continue;
          const set = new Set<string>();
          for (const c of coresCat) {
            set.add(c.toLowerCase());
            const pt = COR_PT[c.toUpperCase()];
            if (pt) set.add(pt.toLowerCase());
          }
          catEntries.push({ nomeCat, tokens: tokenize(nomeCat), cores: set });
        }

        // Acha melhor entry do catálogo por tokens: todos tokens do catálogo devem estar no produto.
        const findCatEntry = (baseModelo: string): CatEntry | null => {
          const baseTokens = new Set(tokenize(baseModelo));
          let best: CatEntry | null = null;
          let bestCount = 0;
          for (const e of catEntries) {
            if (e.tokens.length === 0) continue;
            if (e.tokens.every(t => baseTokens.has(t)) && e.tokens.length > bestCount) {
              best = e;
              bestCount = e.tokens.length;
            }
          }
          return best;
        };

        // Agrupar estoque por categoria → modelo base (preservando variantes)
        // Inclui TANTO itens EM ESTOQUE quanto A CAMINHO pra calcular falta real
        type Acc = { qntEstoque: number; qntACaminho: number; min: number };
        const acc = new Map<string, Map<string, Map<string, Acc>>>(); // cat → base → corNorm → dados
        const corDisplayMap = new Map<string, string>(); // corNorm → display original
        const corENMap = new Map<string, string>(); // corNorm → EN

        // Helper pra adicionar item ao acumulador
        const addToAcc = (p: ProdutoEstoque, isACaminho: boolean) => {
          const base = getModeloBase(p.produto, p.categoria).toUpperCase();
          const cat = p.categoria || "OUTROS";
          const corRaw = (p.cor || extractCor(stripOrigemRepo(p.produto), null) || "").toString().trim();
          if (!corRaw) return;
          const corUpper = corRaw.toUpperCase();
          const enFromPT = PT_TO_EN[corUpper];
          const corEN = enFromPT || corUpper;
          const corNorm = corEN.toLowerCase();

          if (!acc.has(cat)) acc.set(cat, new Map());
          const catMap = acc.get(cat)!;
          if (!catMap.has(base)) catMap.set(base, new Map());
          const baseMap = catMap.get(base)!;
          const cur = baseMap.get(corNorm) || { qntEstoque: 0, qntACaminho: 0, min: 0 };
          if (isACaminho) { cur.qntACaminho += p.qnt; } else { cur.qntEstoque += p.qnt; }
          if (typeof p.estoque_minimo === "number" && p.estoque_minimo > 0) {
            cur.min = Math.max(cur.min, p.estoque_minimo);
          }
          baseMap.set(corNorm, cur);
          if (!corDisplayMap.has(corNorm)) {
            const simples = corParaPT(corEN) || corParaPT(corRaw) || corRaw;
            corDisplayMap.set(corNorm, simples);
            corENMap.set(corNorm, corEN);
          }
        };

        // Itens em estoque
        for (const p of novos) addToAcc(p, false);
        // Itens a caminho (já comprados, pendentes de chegada)
        for (const p of aCaminho) addToAcc(p, true);

        // Converter + filtrar cores que não estão no catálogo + aplicar hide via modal
        for (const [cat, catMap] of acc.entries()) {
          for (const [base, baseMap] of catMap.entries()) {
            const catEntry = findCatEntry(base);
            // Hide via modal: usuário oculta pelo nome do catálogo
            if (catEntry && reposicaoOcultos.has(catEntry.nomeCat)) continue;
            const catCores = catEntry?.cores || null;
            const grupo: RepoGroup[] = [];
            for (const [corNorm, dados] of baseMap.entries()) {
              // Se tem catálogo, filtra. Se não tem, mostra tudo.
              if (catCores && catCores.size > 0) {
                const corEN = corENMap.get(corNorm) || corNorm;
                const hasIt = catCores.has(corNorm) || catCores.has(corEN.toLowerCase());
                if (!hasIt) continue;
              }
              const corEN = corENMap.get(corNorm) || corNorm.toUpperCase();
              const corPT = COR_PT[corEN.toUpperCase()] || "";
              grupo.push({
                qntEstoque: dados.qntEstoque,
                qntACaminho: dados.qntACaminho,
                totalDisponivel: dados.qntEstoque + dados.qntACaminho,
                min: dados.min,
                corEN,
                corPT,
                corDisplay: corDisplayMap.get(corNorm) || corEN,
                falta: 0,
              });
            }
            if (grupo.length > 0) {
              if (!byCatModel[cat]) byCatModel[cat] = {};
              byCatModel[cat][base] = grupo;
            }
          }
        }

        // Calcular falta e filtrar apenas quem está abaixo do mínimo (ou esgotado)
        const byCatModelFiltered: Record<string, Record<string, RepoGroup[]>> = {};
        for (const [cat, models] of Object.entries(byCatModel)) {
          for (const [base, cores] of Object.entries(models)) {
            const abaixo = cores.filter(c => {
              // Falta = mínimo - (em estoque + a caminho)
              // Se já tem o suficiente contando os a caminho, NÃO aparece na reposição
              c.falta = c.min > 0 ? Math.max(0, c.min - c.totalDisponivel) : (c.qntEstoque === 0 && c.qntACaminho === 0 ? 1 : 0);
              return (c.min > 0 && c.totalDisponivel < c.min) || (c.qntEstoque === 0 && c.qntACaminho === 0);
            });
            if (abaixo.length > 0) {
              if (!byCatModelFiltered[cat]) byCatModelFiltered[cat] = {};
              byCatModelFiltered[cat][base] = abaixo;
            }
          }
        }

        const sortedCats = Object.keys(byCatModelFiltered).sort((a, b) => {
          const ia = catOrder.indexOf(a); const ib = catOrder.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        const totalFalta = Object.values(byCatModelFiltered).reduce((s, models) =>
          s + Object.values(models).reduce((s2, cores) => s2 + cores.reduce((s3, c) => s3 + c.falta, 0), 0), 0);

        // Build copy text
        const buildCopyText = () => {
          const lines: string[] = ["*COMPRAR PRODUTOS*", ""];
          for (const cat of sortedCats) {
            lines.push(`*${dynamicCatLabels[cat] || cat}*`);
            const modelos = Object.entries(byCatModelFiltered[cat]).sort(([a], [b]) => a.localeCompare(b));
            for (const [base, cores] of modelos) {
              lines.push(`\n${base}`);
              for (const c of cores.sort((a, b) => b.falta - a.falta)) {
                const aCaminhoTxt = c.qntACaminho > 0 ? ` (${c.qntACaminho} a caminho)` : "";
                lines.push(`${c.qntEstoque === 0 && c.qntACaminho === 0 ? "🔴" : "🟡"} ${c.corDisplay}: ${c.qntEstoque} em estoque${aCaminhoTxt} / mín ${c.min} → falta ${c.falta}`);
              }
            }
            lines.push("");
          }
          return lines.join("\n");
        };

        return (
          <div className="space-y-4">
            {/* Header */}
            <div className={`${bgCard} border ${borderCard} rounded-2xl p-6 shadow-sm`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-[18px] font-bold ${textPrimary}`}>Reposição de Estoque</h2>
                  <p className={`text-[13px] mt-1 ${textSecondary}`}>
                    {totalFalta > 0 ? `${totalFalta} unidades precisam ser compradas` : "Estoque OK!"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowReposicaoConfig(true)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${dm ? "border-[#3A3A3C] text-[#F5F5F7] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#1D1D1F] hover:bg-[#F2F2F7]"}`}
                    title="Controlar quais modelos aparecem na reposição">
                    ⚙️ Modelos
                  </button>
                  {totalFalta > 0 && (
                    <button onClick={() => { navigator.clipboard.writeText(buildCopyText()); setMsg("Lista copiada!"); }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors">
                      📋 Copiar Lista
                    </button>
                  )}
                </div>
              </div>
            </div>

            {showReposicaoConfig && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowReposicaoConfig(false)}>
                <div className={`${bgCard} border ${borderCard} rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl`} onClick={(e) => e.stopPropagation()}>
                  <div className={`px-5 py-4 border-b ${borderCard} flex items-center justify-between`}>
                    <div>
                      <h3 className={`text-[15px] font-bold ${textPrimary}`}>Modelos na Reposição</h3>
                      <p className={`text-[11px] ${textMuted} mt-0.5`}>Desmarque modelos que você não quer ver na lista de reposição.</p>
                    </div>
                    <button onClick={() => setShowReposicaoConfig(false)} className={`text-[18px] ${textSecondary} hover:text-red-500`}>✕</button>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-3">
                    {(() => {
                      // Agrupa modelos por categoria
                      const grupos: Record<string, string[]> = {};
                      for (const nome of Object.keys(catalogoCoresMap)) {
                        const cat = catalogoCatByModel[nome] || "OUTROS";
                        if (!grupos[cat]) grupos[cat] = [];
                        grupos[cat].push(nome);
                      }
                      const catOrderCfg = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "OUTROS"];
                      const cats = Object.keys(grupos).sort((a, b) => {
                        const ia = catOrderCfg.indexOf(a), ib = catOrderCfg.indexOf(b);
                        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                      });
                      return cats.map(cat => {
                        const modelos = grupos[cat].sort((a, b) => a.localeCompare(b));
                        const totalOcultos = modelos.filter(m => reposicaoOcultos.has(m)).length;
                        const totalVisiveis = modelos.length - totalOcultos;
                        return (
                          <details key={cat} open className={`rounded-xl border ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"}`}>
                            <summary className={`px-3 py-2 cursor-pointer select-none flex items-center justify-between ${dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]"} rounded-t-xl`}>
                              <span className={`text-[12px] font-bold uppercase tracking-wider ${textPrimary}`}>{dynamicCatLabels[cat] || cat}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] ${textMuted}`}>{totalVisiveis}/{modelos.length}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const todosOcultos = totalOcultos === modelos.length;
                                    const next = new Set(reposicaoOcultos);
                                    for (const m of modelos) {
                                      if (todosOcultos) next.delete(m); else next.add(m);
                                    }
                                    setReposicaoOcultos(next);
                                    localStorage.setItem("tigrao_reposicao_ocultos", JSON.stringify([...next]));
                                  }}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${dm ? "border-[#3A3A3C] hover:bg-[#1C1C1E]" : "border-[#D2D2D7] hover:bg-white"}`}
                                >
                                  {totalOcultos === modelos.length ? "Marcar todos" : "Desmarcar todos"}
                                </button>
                              </div>
                            </summary>
                            <div className="p-2 space-y-0.5">
                              {modelos.map(nome => {
                                const oculto = reposicaoOcultos.has(nome);
                                return (
                                  <label key={nome} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer ${dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]"}`}>
                                    <input type="checkbox" checked={!oculto} onChange={() => toggleReposicaoOculto(nome)} className="w-4 h-4 accent-[#E8740E]" />
                                    <span className={`text-[13px] ${oculto ? textMuted : textPrimary} ${oculto ? "line-through" : ""}`}>{nome}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {sortedCats.length === 0 ? (
              <div className={`${bgCard} border ${borderCard} rounded-2xl p-8 text-center`}>
                <p className={`text-[40px] mb-2`}>✅</p>
                <p className={`text-[15px] font-bold ${textPrimary}`}>Estoque completo!</p>
                <p className={`text-[13px] ${textSecondary} mt-1`}>Todos os produtos estão acima do mínimo configurado.</p>
                <p className={`text-[11px] ${textMuted} mt-3`}>Configure o estoque mínimo abrindo um produto lacrado e definindo o campo "Estoque Mínimo".</p>
              </div>
            ) : (
              sortedCats.map(cat => {
                const modelos = Object.entries(byCatModelFiltered[cat]).sort(([a], [b]) => a.localeCompare(b));
                const totalFaltaCat = modelos.reduce((s, [, cores]) => s + cores.reduce((s2, c) => s2 + c.falta, 0), 0);
                return (
                  <div key={cat} className={`${bgCard} border ${borderCard} rounded-2xl overflow-hidden shadow-sm`}>
                    <div className={`px-5 py-3 border-b ${borderCard} flex items-center justify-between`}>
                      <h3 className={`text-[14px] font-bold ${textPrimary}`}>{dynamicCatLabels[cat] || cat}</h3>
                      <span className="text-[11px] font-bold text-red-500">{totalFaltaCat} un. faltando</span>
                    </div>
                    <div className="divide-y" style={{ borderColor: dm ? "#2C2C2E" : "#F2F2F7" }}>
                      {modelos.map(([base, cores]) => (
                        <div key={base} className="px-5 py-3">
                          <p className={`text-[13px] font-bold ${textPrimary} mb-2`}>{base}</p>
                          <div className="grid gap-1.5">
                            {cores.sort((a, b) => b.falta - a.falta).map((c, i) => (
                              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                                c.qntEstoque === 0 && c.qntACaminho === 0
                                  ? (dm ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-100")
                                  : (dm ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-yellow-50 border border-yellow-100")
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px]">{c.qntEstoque === 0 && c.qntACaminho === 0 ? "🔴" : "🟡"}</span>
                                  <span className={`text-[13px] font-semibold ${textPrimary}`}>{c.corPT ? (c.corPT.charAt(0).toUpperCase() + c.corPT.slice(1).toLowerCase()) : (c.corEN || "—")}</span>
                                  {c.qntACaminho > 0 && (
                                    <span className="text-[10px] font-bold text-blue-500 px-1.5 py-0.5 rounded-full bg-blue-500/10">✈️ {c.qntACaminho} a caminho</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-[12px] ${textSecondary}`}>
                                    {c.qntEstoque}{c.qntACaminho > 0 ? `+${c.qntACaminho}` : ""}/{c.min}
                                  </span>
                                  {c.falta > 0 && (
                                    <span className={`text-[12px] font-bold ${c.qntEstoque === 0 && c.qntACaminho === 0 ? "text-red-500" : "text-yellow-600"}`}>
                                      comprar {c.falta}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {/* Dica */}
            <div className={`px-5 py-3 rounded-xl border border-dashed ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
              <p className={`text-[11px] ${textMuted}`}>
                💡 Para definir o estoque mínimo de um produto, abra um produto lacrado → campo "Estoque Mínimo". O mínimo é por cor: todos os itens da mesma cor compartilham o mesmo mínimo.
              </p>
            </div>
          </div>
        );
      })()

      : tab === "novo" ? (
        /* FORMULÁRIO */
        <div className={`${bgCard} border ${borderCard} rounded-2xl p-8 shadow-sm space-y-8`}>
          <div>
            <h2 className={`text-[20px] font-bold ${textPrimary}`}>Adicionar Produto</h2>
            <p className={`text-[13px] mt-1 ${textSecondary}`}>Preencha os dados do produto para cadastrar no estoque</p>
          </div>

          {/* Row 1: Categoria + Tipo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => {
              const newCat = e.target.value;
              set("categoria", newCat); set("produto", "");
              // Sincronizar mb_modelo com categoria específica de MacBook
              if (newCat === "MACBOOK_NEO") { setS("mb_modelo", "NEO"); setS("mb_chip", "A18 Pro"); setS("mb_nucleos", "6C CPU/5C GPU"); setS("mb_tela", '13"'); }
              else if (newCat === "MACBOOK_AIR") setS("mb_modelo", "AIR");
              else if (newCat === "MACBOOK_PRO") setS("mb_modelo", "PRO");
            }} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{dynamicCatLabels[c] || c}</option>)}
            </select></div>
            {form.categoria === "SEMINOVOS" ? (
              <div><p className={labelCls}>Tipo de Seminovo</p><select value={spec.semi_subtipo} onChange={(e) => setS("semi_subtipo", e.target.value)} className={inputCls}>
                <option value="IPHONES">iPhone Seminovo</option>
                <option value="MACBOOK">MacBook Seminovo</option>
                <option value="IPADS">iPad Seminovo</option>
                <option value="APPLE_WATCH">Apple Watch Seminovo</option>
                <option value="ACESSORIOS">Acessórios Seminovo</option>
              </select></div>
            ) : (
              <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                <option value="NOVO">Novo (Lacrado)</option>
                <option value="NAO_ATIVADO">Não Ativado</option>
                <option value="SEMINOVO">Seminovo</option>
                <option value="A_CAMINHO">A Caminho</option>
              </select></div>
            )}
          </div>

          {/* MODO MULTI-PRODUTO (NOVO e A_CAMINHO) */}
          {(form.tipo === "NOVO" || form.tipo === "A_CAMINHO") && form.categoria !== "SEMINOVOS" ? (
            <div className="space-y-4">
              {form.tipo === "A_CAMINHO" && (
                <div className={`p-3 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#E8740E]/20"}`}>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    IMEI e serial sao opcionais — preencha quando o produto chegar. Para pagamento, use <strong>Gastos &rarr; FORNECEDOR</strong>.
                  </p>
                </div>
              )}

              {/* Cards de produtos */}
              <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"} space-y-4`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Produtos</p>
                  {pedidoProdutos.length > 0 && (
                    <p className={`text-xs font-semibold ${textSecondary}`}>
                      {pedidoProdutos.length} produto(s) | Total: <span className="text-[#E8740E]">{fmt(pedidoProdutos.reduce((s, p) => s + (parseFloat(p.custo_unitario) || 0) * (parseInt(p.qnt) || 1), 0))}</span>
                    </p>
                  )}
                </div>
                {pedidoProdutos.map((row, i) => (
                  <ProdutoSpecFields
                    key={i}
                    row={row}
                    onChange={(updated) => {
                      const nv = [...pedidoProdutos];
                      nv[i] = updated;
                      setPedidoProdutos(nv);
                    }}
                    onRemove={() => pedidoProdutos.length > 1 ? setPedidoProdutos(pedidoProdutos.filter((_, j) => j !== i)) : undefined}
                    onDuplicate={() => {
                      const clone = { ...row, spec: { ...row.spec }, imei: "", serial_no: "" };
                      const nv = [...pedidoProdutos];
                      nv.splice(i + 1, 0, clone);
                      setPedidoProdutos(nv);
                    }}
                    fornecedores={fornecedores}
                    inputCls={inputCls}
                    labelCls={labelCls}
                    darkMode={dm}
                    index={i}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPedidoProdutos([...pedidoProdutos, createEmptyProdutoRow()])}
                  className={`w-full py-3 rounded-xl border-2 border-dashed ${dm ? "border-[#3A3A3C] text-[#636366] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"} text-sm font-semibold transition-colors`}
                >
                  + Adicionar Produto
                </button>
              </div>

              <button onClick={handleSubmitMulti} className="w-full py-4 rounded-2xl bg-[#E8740E] text-white text-[15px] font-semibold hover:bg-[#D06A0D] transition-colors shadow-sm active:scale-[0.99]">
                {form.tipo === "A_CAMINHO" ? `Adicionar ${pedidoProdutos.length} como A Caminho` : `Adicionar ${pedidoProdutos.length} ao Estoque`}
              </button>
            </div>
          ) : (
          <>
          {/* Campos específicos por categoria (SEMINOVO) */}
          {formBaseCat === "IPHONES" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={spec.ip_modelo} onChange={(e) => { setS("ip_modelo", e.target.value); set("cor", ""); }} className={inputCls}>
                {getCatModelos("IPHONES", ["11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX", "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX", "15", "15 PLUS", "15 PRO", "15 PRO MAX", "16", "16 PLUS", "16 PRO", "16 PRO MAX", "16E", "17", "17 AIR", "17 PRO", "17 PRO MAX"]).map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.ip_storage} onChange={(e) => setS("ip_storage", e.target.value)} className={inputCls}>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
              <div><p className={labelCls}>Origem</p><select value={spec.ip_origem} onChange={(e) => setS("ip_origem", e.target.value)} className={inputCls}>
                <option value="">— Opcional —</option>
                {IPHONE_ORIGENS.map((o) => <option key={o}>{o}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "MACBOOK" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              {(() => {
                const mbMods = getCatModelos("MACBOOK", ["AIR", "PRO", "NEO"]);
                return (
                  <div><p className={labelCls}>Modelo</p><select value={mbMods.includes(spec.mb_modelo) ? spec.mb_modelo : "__custom__"} onChange={(e) => { const v = e.target.value === "__custom__" ? "" : e.target.value; setS("mb_modelo", v); if (v === "NEO") { setS("mb_chip", "A18 Pro"); setS("mb_nucleos", "6C CPU/5C GPU"); setS("mb_tela", '13"'); } }} className={inputCls}>
                    {mbMods.map((m) => <option key={m} value={m}>{m === "AIR" ? "MacBook Air" : m === "PRO" ? "MacBook Pro" : m === "NEO" ? "MacBook Neo" : `MacBook ${m}`}</option>)}
                    <option value="__custom__">Outro (digitar)</option>
                  </select>
                  {!mbMods.includes(spec.mb_modelo) && spec.mb_modelo !== "" ? (
                    <input value={spec.mb_modelo} onChange={(e) => setS("mb_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
                  ) : null}</div>
                );
              })()}
              {spec.mb_modelo !== "NEO" && (
                <div><p className={labelCls}>Tela</p><select value={spec.mb_tela} onChange={(e) => setS("mb_tela", e.target.value)} className={inputCls}>
                  {spec.mb_modelo === "AIR"
                    ? [<option key='13"' value='13"'>13 polegadas</option>, <option key='15"' value='15"'>15 polegadas</option>]
                    : [<option key='14"' value='14"'>14 polegadas</option>, <option key='16"' value='16"'>16 polegadas</option>]
                  }
                </select></div>
              )}
              <div><p className={labelCls}>Chip</p><select value={spec.mb_chip} onChange={(e) => setS("mb_chip", e.target.value)} className={inputCls}>
                {spec.mb_modelo === "NEO"
                  ? [<option key="A18 Pro" value="A18 Pro">A18 Pro</option>]
                  : ["M1", "M2", "M3", "M4", "M4 PRO", "M4 MAX", "M5", "M5 PRO"].map((c) => <option key={c} value={c}>{c}</option>)
                }
              </select></div>
              <div><p className={labelCls}>Núcleos</p><select value={spec.mb_nucleos} onChange={(e) => setS("mb_nucleos", e.target.value)} className={inputCls}>
                <option value="" disabled>— Selecionar —</option>
                {(spec.mb_modelo === "NEO"
                  ? ["6C CPU/5C GPU"]
                  : ["8C CPU/7C GPU", "8C CPU/8C GPU", "8C CPU/10C GPU", "10C CPU/8C GPU", "10C CPU/10C GPU", "12C CPU/16C GPU", "12C CPU/19C GPU", "14C CPU/20C GPU", "14C CPU/32C GPU", "16C CPU/40C GPU"]
                ).map((n) => <option key={n}>{n}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mb_ram} onChange={(e) => setS("mb_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB", "128GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mb_storage} onChange={(e) => setS("mb_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "MAC_MINI" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Chip</p><select value={spec.mm_chip} onChange={(e) => setS("mm_chip", e.target.value)} className={inputCls}>
                {["M1", "M2", "M2 PRO", "M4", "M4 PRO", "M5", "M5 PRO"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mm_ram} onChange={(e) => setS("mm_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "24GB", "32GB", "48GB", "64GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mm_storage} onChange={(e) => setS("mm_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "IPADS" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              {(() => {
                const ipadMods = getCatModelos("IPADS", ["IPAD", "MINI", "AIR", "PRO"]);
                const ipadKnown = [...ipadMods, "__custom__"];
                return (
                  <div><p className={labelCls}>Modelo</p><select value={ipadMods.includes(spec.ipad_modelo) ? spec.ipad_modelo : "__custom__"} onChange={(e) => setS("ipad_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                    {ipadMods.map((m) => {
                      const u = m.toUpperCase();
                      let label: string;
                      if (u === "IPAD") label = "iPad";
                      else if (u === "MINI") label = "iPad Mini";
                      else if (u === "AIR") label = "iPad Air";
                      else if (u === "PRO") label = "iPad Pro";
                      else if (/^MINI\s*\d+/.test(u)) label = `iPad Mini ${u.replace(/^MINI\s*/, "")}`;
                      else if (/^AIR\s*\d+/.test(u)) label = `iPad Air ${u.replace(/^AIR\s*/, "")}`;
                      else if (/^PRO\s*\d+/.test(u)) label = `iPad Pro ${u.replace(/^PRO\s*/, "")}`;
                      else label = `iPad ${m}`;
                      return <option key={m} value={m}>{label}</option>;
                    })}
                    <option value="__custom__">Outro (digitar)</option>
                  </select>
                  {!ipadKnown.includes(spec.ipad_modelo) || spec.ipad_modelo === "" ? (
                    <input value={spec.ipad_modelo} onChange={(e) => setS("ipad_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
                  ) : null}</div>
                );
              })()}
              <div><p className={labelCls}>Chip</p><select value={spec.ipad_chip || ""} onChange={(e) => setS("ipad_chip", e.target.value)} className={inputCls}>
                <option value="">— Sem chip —</option>
                <option value="M1">M1</option>
                <option value="M2">M2</option>
                <option value="M3">M3</option>
                <option value="M4">M4</option>
                <option value="M5">M5</option>
                <option value="A16">A16</option>
                <option value="A17 PRO">A17 Pro</option>
              </select></div>
              <div><p className={labelCls}>Tela</p><select value={spec.ipad_tela} onChange={(e) => setS("ipad_tela", e.target.value)} className={inputCls}>
                {['8.3"', '10.9"', '11"', '13"'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.ipad_storage} onChange={(e) => setS("ipad_storage", e.target.value)} className={inputCls}>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
              <div><p className={labelCls}>Conectividade</p><select value={spec.ipad_conn} onChange={(e) => setS("ipad_conn", e.target.value)} className={inputCls}>
                <option value="WIFI">WiFi</option>
                <option value="WIFI+CELL">WiFi + Cellular (5G)</option>
              </select></div>
            </div>
          )}

          {formBaseCat === "APPLE_WATCH" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              {(() => {
                const watchMods = getCatModelos("APPLE_WATCH", ["SE 2", "SE 3", "SERIES 11", "ULTRA 3", "ULTRA 3 MILANES"]);
                return (
                  <div><p className={labelCls}>Modelo</p><select value={watchMods.includes(spec.aw_modelo) ? spec.aw_modelo : "__custom__"} onChange={(e) => setS("aw_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                    {watchMods.map((m) => <option key={m}>{m}</option>)}
                    <option value="__custom__">Outro (digitar)</option>
                  </select>
                  {!watchMods.includes(spec.aw_modelo) && spec.aw_modelo !== "" ? (
                    <input value={spec.aw_modelo} onChange={(e) => setS("aw_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
                  ) : null}</div>
                );
              })()}
              <div><p className={labelCls}>Tamanho</p><select value={spec.aw_tamanho} onChange={(e) => setS("aw_tamanho", e.target.value)} className={inputCls}>
                {["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
              <div><p className={labelCls}>Conectividade</p><select value={spec.aw_conn} onChange={(e) => setS("aw_conn", e.target.value)} className={inputCls}>
                <option value="GPS">GPS</option>
                <option value="GPS+CELL">GPS + Cellular</option>
              </select></div>
              <div><p className={labelCls}>Pulseira</p><select value={spec.aw_pulseira} onChange={(e) => setS("aw_pulseira", e.target.value)} className={inputCls}>
                <option value="" disabled>— Selecionar —</option>
                {WATCH_PULSEIRAS.map((p) => <option key={p}>{p}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "AIRPODS" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              {(() => {
                const airMods = getCatModelos("AIRPODS", ["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX 2024 USB-C"]);
                return (
                  <div><p className={labelCls}>Modelo</p><select value={airMods.includes(spec.air_modelo) ? spec.air_modelo : "__custom__"} onChange={(e) => setS("air_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                    {airMods.map((m) => <option key={m}>{m}</option>)}
                    <option value="__custom__">Outro (digitar)</option>
                  </select>
                  {!airMods.includes(spec.air_modelo) && spec.air_modelo !== "" ? (
                    <input value={spec.air_modelo} onChange={(e) => setS("air_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
                  ) : null}</div>
                );
              })()}
            </div>
          )}

          {/* Categorias sem campos estruturados: texto livre */}
          {!hasStructuredFields && (
            <div><p className={labelCls}>Nome do Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: Cabo USB-C Lightning 1m" className={inputCls} /></div>
          )}

          {/* Nome do produto — editável, pré-preenchido automaticamente */}
          {hasStructuredFields && (() => {
            const autoName = buildProdutoName(form.categoria);
            // Atualizar se vazio OU se o nome atual parece auto-gerado (começa igual ao prefixo da categoria)
            const prefixoCat = (form.categoria || "").replace(/_/g, " ").split(" ")[0].toUpperCase();
            const pareceAutoGerado = !form.produto || (prefixoCat && form.produto.toUpperCase().startsWith(prefixoCat));
            if (pareceAutoGerado && autoName) {
              setTimeout(() => set("produto", autoName), 0);
            }
            return (
              <div className={`px-5 py-4 rounded-2xl border-2 border-[#E8740E]/30 ${dm ? "bg-[#E8740E]/10" : "bg-[#E8740E]/5"} space-y-2`}>
                <div className="flex items-center justify-between">
                  <p className={`text-[11px] font-medium ${textSecondary}`}>Nome do produto</p>
                  <button
                    type="button"
                    onClick={() => set("produto", autoName)}
                    className="text-[11px] text-[#E8740E] hover:text-[#F5A623] font-semibold"
                  >
                    Regenerar
                  </button>
                </div>
                <input
                  value={form.produto}
                  onChange={(e) => set("produto", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA] text-[#1D1D1F]"} border`}
                />
              </div>
            );
          })()}

          {/* IMEI e Serial */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={labelCls}>IMEI</p>
              <input value={form.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Opcional — preencha quando chegar" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Serial No {ocrLoading && <span className="text-xs text-orange-500 ml-1">Lendo serial...</span>}</p>
              <input value={form.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Opcional — cole imagem ou digite" className={inputCls}
                onPaste={(e) => handleSerialPaste(e, (v) => set("serial_no", v), setOcrLoading)} />
            </div>
          </div>

          {/* Custo e Fornecedor */}
          <div className="grid grid-cols-2 gap-4">
            <div><p className={labelCls}>Custo unitario (R$)</p><input type="number" value={form.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} /></div>
            <div>
              <p className={labelCls}>Fornecedor</p>
              {showNovoFornecedor ? (
                <div className="flex gap-1">
                  <input
                    value={novoFornecedorNome}
                    onChange={(e) => setNovoFornecedorNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFornecedor(); if (e.key === "Escape") setShowNovoFornecedor(false); }}
                    placeholder="Nome do fornecedor"
                    className={inputCls}
                    autoFocus
                  />
                  <button onClick={handleAddFornecedor} className="px-3 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-bold shrink-0">+</button>
                  <button onClick={() => setShowNovoFornecedor(false)} className={`px-2 py-2 rounded-xl border ${borderCard} ${textSecondary} text-xs shrink-0`}>X</button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls}>
                    <option value="">— Selecionar —</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                  <button onClick={() => setShowNovoFornecedor(true)} className={`px-3 py-2 rounded-xl border ${borderCard} ${textSecondary} hover:border-[#E8740E] hover:text-[#E8740E] text-xs font-bold shrink-0`} title="Cadastrar novo fornecedor">+</button>
                </div>
              )}
            </div>
            {/* Origem da Compra */}
            <div>
              <p className={labelCls}>
                Origem da Compra
                {form.tipo === "A_CAMINHO" && !form.origem_compra && (
                  <span className="text-red-500 ml-1">* obrigatoria</span>
                )}
              </p>
              <select value={form.origem_compra || ""} onChange={(e) => set("origem_compra", e.target.value)}
                className={`${inputCls} ${form.tipo === "A_CAMINHO" && !form.origem_compra ? "!border-red-400" : ""}`}>
                <option value="">— Selecionar —</option>
                <option value="RJ">🏙️ Rio de Janeiro (mesmo dia)</option>
                <option value="SAO_PAULO">🚚 São Paulo (1 dia)</option>
                <option value="PARAGUAI">🇵🇾 Paraguai (~15 dias)</option>
                <option value="EUA">🇺🇸 Estados Unidos (25-30 dias)</option>
              </select>
            </div>
          </div>

          {/* Cores e Quantidades */}
          <div className={`p-4 rounded-xl ${bgSection} space-y-3`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Cores e Quantidades</p>
            {/* Primeira cor (principal) */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-[#E8740E] flex items-center justify-center shrink-0" title="Cor principal">
                <span className="text-xs">🎨</span>
              </div>
              {coresEfetivas ? (
                <select value={form.cor} onChange={(e) => set("cor", e.target.value)} className={`${inputCls} flex-1`} style={{ width: "auto" }}>
                  {COR_OBRIGATORIA.includes(formBaseCat) ? <option value="" disabled>— Selecionar —</option> : <option value="">— Opcional —</option>}
                  {coresEfetivas.map((c) => <option key={c} value={c}>{c}{COR_EN_TO_PT[c] ? ` · ${COR_EN_TO_PT[c]}` : ""}</option>)}
                </select>
              ) : (
                <input value={form.cor} onChange={(e) => set("cor", e.target.value)} placeholder="Ex: Silver, Azul, Preto..." className={`${inputCls} flex-1`} style={{ width: "auto" }} />
              )}
              <input type="number" value={form.qnt} onChange={(e) => set("qnt", e.target.value)} className={qntCls} placeholder="Qtd" />
              <span className={`text-xs ${textSecondary} w-6`}>un.</span>
              <span className="w-5"></span>
            </div>
            {/* Cores adicionais */}
            {variacoes.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                {coresEfetivas ? (
                  <select value={v.cor} onChange={(e) => { const nv = [...variacoes]; nv[i].cor = e.target.value; setVariacoes(nv); }} className={`${inputCls} flex-1`} style={{ width: "auto" }}>
                    {COR_OBRIGATORIA.includes(formBaseCat) ? <option value="" disabled>— Selecionar —</option> : <option value="">— Opcional —</option>}
                    {coresEfetivas.map((c) => <option key={c} value={c}>{c}{COR_EN_TO_PT[c] ? ` · ${COR_EN_TO_PT[c]}` : ""}</option>)}
                  </select>
                ) : (
                  <input value={v.cor} onChange={(e) => { const nv = [...variacoes]; nv[i].cor = e.target.value; setVariacoes(nv); }} placeholder="Cor" className={`${inputCls} flex-1`} style={{ width: "auto" }} />
                )}
                <input type="number" value={v.qnt} onChange={(e) => { const nv = [...variacoes]; nv[i].qnt = e.target.value; setVariacoes(nv); }} className={qntCls} placeholder="Qtd" />
                <span className={`text-xs ${textSecondary} w-6`}>un.</span>
                <button onClick={() => setVariacoes(variacoes.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-sm font-bold w-5">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setVariacoes([...variacoes, { cor: "", qnt: "1" }])} className={`w-full py-2 rounded-lg border border-dashed ${dm ? "border-[#3A3A3C] text-[#636366] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"} text-xs font-medium transition-colors`}>
              + Outra cor
            </button>
          </div>
          {form.tipo === "SEMINOVO" && (() => {
            const cat = form.categoria || "";
            const showCabo = ["IPHONES", "MACBOOK", "IPADS", "APPLE_WATCH"].includes(cat);
            const showCarregador = ["MACBOOK", "IPADS"].includes(cat);
            const showPulseira = cat === "APPLE_WATCH";
            const showCiclos = cat === "MACBOOK";
            return (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Bateria %</p><input type="number" value={form.bateria} onChange={(e) => set("bateria", e.target.value)} placeholder="Ex: 92" className={inputCls} /></div>
              <div><p className={labelCls}>Garantia</p><input value={form.garantia} onChange={(e) => set("garantia", e.target.value)} placeholder="DD/MM/AAAA ou MM/AAAA" className={inputCls} /></div>
              <div><p className={labelCls}>Grade</p><select value={form.observacao?.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1] || ""} onChange={(e) => {
                const obs = form.observacao || "";
                const cleaned = obs.replace(/\[GRADE_(A\+|AB|A|B)\]/g, "").trim();
                const tag = e.target.value ? `[GRADE_${e.target.value}]` : "";
                set("observacao", tag ? `${cleaned} ${tag}`.trim() : cleaned || "");
              }} className={inputCls}>
                <option value="">— Sem grade —</option>
                <option value="A+">A+</option><option value="A">A</option><option value="AB">AB</option><option value="B">B</option>
              </select></div>
              <div className="flex gap-3 items-end flex-wrap">
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.observacao?.includes("[COM_CAIXA]") || false} onChange={(e) => {
                  const obs = form.observacao || "";
                  set("observacao", e.target.checked ? `${obs} [COM_CAIXA]`.trim() : obs.replace("[COM_CAIXA]", "").trim());
                }} className="accent-[#E8740E]" /> 📦 Caixa</label>
                {showCabo && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.observacao?.includes("[COM_CABO]") || false} onChange={(e) => {
                  const obs = form.observacao || "";
                  set("observacao", e.target.checked ? `${obs} [COM_CABO]`.trim() : obs.replace("[COM_CABO]", "").trim());
                }} className="accent-[#E8740E]" /> 🔌 Cabo</label>}
                {showCarregador && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.observacao?.includes("[COM_FONTE]") || false} onChange={(e) => {
                  const obs = form.observacao || "";
                  set("observacao", e.target.checked ? `${obs} [COM_FONTE]`.trim() : obs.replace("[COM_FONTE]", "").trim());
                }} className="accent-[#E8740E]" /> 🔋 Carregador</label>}
                {showPulseira && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.observacao?.includes("[COM_PULSEIRA]") || false} onChange={(e) => {
                  const obs = form.observacao || "";
                  set("observacao", e.target.checked ? `${obs} [COM_PULSEIRA]`.trim() : obs.replace("[COM_PULSEIRA]", "").trim());
                }} className="accent-[#E8740E]" /> ⌚ Pulseira</label>}
              </div>
              {showCiclos && (
                <div><p className={labelCls}>Ciclos de Bateria</p><input type="number" value={form.observacao?.match(/\[CICLOS:(\d+)\]/)?.[1] || ""} onChange={(e) => {
                  const obs = form.observacao || "";
                  const cleaned = obs.replace(/\[CICLOS:\d+\]/g, "").trim();
                  set("observacao", e.target.value ? `${cleaned} [CICLOS:${e.target.value}]`.trim() : cleaned || "");
                }} placeholder="Ex: 120" className={inputCls} /></div>
              )}
              <div><p className={labelCls}>Cliente (comprado de)</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} className={inputCls} /></div>
              <div><p className={labelCls}>Observacoes</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Detalhes adicionais..." className={inputCls} /></div>
            </div>
            );
          })()}
          {form.tipo !== "SEMINOVO" && (
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          )}
          <button onClick={() => handleSubmit(false)} className="w-full py-4 rounded-2xl bg-[#E8740E] text-white text-[15px] font-semibold hover:bg-[#D06A0D] transition-colors shadow-sm active:scale-[0.99]">
            {variacoes.length > 0 ? `Adicionar ${variacoes.length + 1} cores` : form.tipo === "NAO_ATIVADO" ? "Adicionar Não Ativado" : "Adicionar Seminovo"}
          </button>
          </>
          )}
        </div>
      ) : (
        /* LISTA */
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-[#86868B]">Carregando...</div>
          ) : tab === "acaminho" ? (
            /* ── PLANILHA PRODUTOS A CAMINHO (pendentes + recebidos) ── */
            (() => {
              // Inclui itens pendentes E os já recebidos (pedidosRecebidos), filtrados por categoria/busca
              const recebidosFiltrados = pedidosRecebidos.filter(p => {
                if (filterDataCompra && p.data_compra !== filterDataCompra) return false;
                if (filterCat && p.categoria !== filterCat) return false;
                if (search) {
                  const s = search.toLowerCase();
                  if (!p.produto.toLowerCase().includes(s) && !(p.cor?.toLowerCase().includes(s))) return false;
                }
                return true;
              });
              const allItems = acaminhoFilter === "pendentes" ? filtered
                : acaminhoFilter === "recebidos" ? recebidosFiltrados
                : [...filtered, ...recebidosFiltrados];
              // Configuração de origens
              const ORIGEM_CONFIG: Record<string, { emoji: string; label: string; dias: number; cor: string }> = {
                RJ: { emoji: "🏙️", label: "RIO DE JANEIRO", dias: 0, cor: "bg-green-600" },
                SAO_PAULO: { emoji: "🚚", label: "SÃO PAULO", dias: 1, cor: "bg-blue-600" },
                PARAGUAI: { emoji: "🇵🇾", label: "PARAGUAI", dias: 15, cor: "bg-yellow-600" },
                EUA: { emoji: "🇺🇸", label: "ESTADOS UNIDOS", dias: 30, cor: "bg-red-600" },
              };
              const ORIGEM_ORDER = ["RJ", "SAO_PAULO", "PARAGUAI", "EUA", "SEM_ORIGEM"];

              // Calcula previsão de chegada
              const calcPrevisao = (dataCompra: string | null, origem: string | null): string | null => {
                if (!dataCompra || !origem || !ORIGEM_CONFIG[origem]) return null;
                const d = new Date(dataCompra + "T12:00:00");
                d.setDate(d.getDate() + ORIGEM_CONFIG[origem].dias);
                return d.toISOString().split("T")[0];
              };

              // Agrupar por origem (em vez de por data)
              const byOrigem: Record<string, typeof allItems> = {};
              allItems.forEach(p => {
                const orig = p.origem_compra && ORIGEM_CONFIG[p.origem_compra] ? p.origem_compra : "SEM_ORIGEM";
                if (!byOrigem[orig]) byOrigem[orig] = [];
                byOrigem[orig].push(p);
              });
              // Dentro de cada origem, ordena por data de compra (mais recente primeiro)
              for (const items of Object.values(byOrigem)) {
                items.sort((a, b) => (b.data_compra || "").localeCompare(a.data_compra || ""));
              }
              const sortedOrigens = ORIGEM_ORDER.filter(o => byOrigem[o]?.length > 0);

              if (sortedOrigens.length === 0) return (
                <div className={`${bgCard} border ${borderCard} rounded-2xl p-12 text-center shadow-sm`}>
                  <p className={textSecondary}>Nenhum produto a caminho.</p>
                </div>
              );
              const grandTotal = filtered.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);

              // Usa selectedACaminho do estado do componente pra edição em lote
              return (
                <div className="space-y-4">
                  {/* Resumo por origem + botão WhatsApp atacado */}
                  {aCaminho.length > 0 && (
                    <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#F5D5B0]"} border space-y-3`}>
                      {/* Resumo por origem */}
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const origemConfig: Record<string, { emoji: string; label: string; prazo: string }> = {
                            EUA: { emoji: "🇺🇸", label: "EUA", prazo: "25-30 dias" },
                            PARAGUAI: { emoji: "🇵🇾", label: "Paraguai", prazo: "~15 dias" },
                            SAO_PAULO: { emoji: "🚚", label: "São Paulo", prazo: "1 dia" },
                            RJ: { emoji: "🏙️", label: "Rio de Janeiro", prazo: "mesmo dia" },
                          };
                          const byOrigem: Record<string, number> = {};
                          let semOrigem = 0;
                          for (const p of aCaminho) {
                            if (p.origem_compra && origemConfig[p.origem_compra]) {
                              byOrigem[p.origem_compra] = (byOrigem[p.origem_compra] || 0) + p.qnt;
                            } else {
                              semOrigem += p.qnt;
                            }
                          }
                          return (
                            <>
                              {Object.entries(byOrigem).map(([orig, qnt]) => {
                                const c = origemConfig[orig];
                                return (
                                  <span key={orig} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "bg-[#3A3A3C] text-[#F5F5F7]" : "bg-white text-[#1D1D1F]"} border ${dm ? "border-[#48484A]" : "border-[#D2D2D7]"}`}>
                                    {c.emoji} {c.label}: <b>{qnt} un.</b> <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>({c.prazo})</span>
                                  </span>
                                );
                              })}
                              {semOrigem > 0 && (
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} border ${dm ? "border-[#48484A]" : "border-[#E5E5EA]"}`}>
                                  📦 Sem origem: <b>{semOrigem} un.</b>
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {/* Botão copiar texto atacado */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-bold ${textPrimary}`}>📋 Texto para WhatsApp (Atacado)</p>
                          <p className={`text-[11px] ${textMuted}`}>{aCaminho.length} produto(s) a caminho</p>
                        </div>
                        <button
                          onClick={() => {
                            const catEmoji: Record<string, string> = { IPHONES: "📱", IPADS: "📱", MACBOOK: "💻", MAC_MINI: "🖥️", APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌" };
                            const catLabel: Record<string, string> = { IPHONES: "iPhones", IPADS: "iPads", MACBOOK: "MacBooks", MAC_MINI: "Mac Mini", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios" };
                            const catOrder = ["AIRPODS", "APPLE_WATCH", "IPADS", "IPHONES", "MACBOOK", "MAC_MINI", "ACESSORIOS"];
                            const fonte = selectedACaminho.size > 0 ? aCaminho.filter(p => selectedACaminho.has(p.id)) : aCaminho;
                            const groups: Record<string, string[]> = {};
                            for (const p of fonte) {
                              const cat = p.categoria || "OUTROS";
                              if (!groups[cat]) groups[cat] = [];
                              const nome = (p.produto || "").replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP)\s*(\([^)]*\))?/gi, "")
                                .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
                                .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")
                                .replace(/\s{2,}/g, " ").trim();
                              const cor = p.cor ? ` – ${corParaPT(p.cor) || p.cor}` : "";
                              groups[cat].push(`${nome}${cor}`);
                            }
                            const lines: string[] = ["🎁 *ESTOQUE – ATACADO*", ""];
                            const sortedCatsAtacado = Object.keys(groups).sort((a, b) => {
                              const ia = catOrder.indexOf(a); const ib = catOrder.indexOf(b);
                              return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                            });
                            for (const cat of sortedCatsAtacado) {
                              const emoji = catEmoji[cat] || "📦";
                              const label = catLabel[cat] || cat;
                              lines.push(`${emoji} *${label}*`);
                              const seen = new Set<string>();
                              for (const item of groups[cat]) {
                                if (!seen.has(item)) { seen.add(item); lines.push(item); }
                              }
                              lines.push("");
                            }
                            navigator.clipboard.writeText(lines.join("\n").trim());
                            setMsg(selectedACaminho.size > 0 ? `📋 Texto copiado (${selectedACaminho.size} selecionados)!` : "📋 Texto copiado! Cole no WhatsApp.");
                          }}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
                        >
                          📋 {selectedACaminho.size > 0 ? `Copiar ${selectedACaminho.size} Selecionados` : "Copiar Texto Atacado"}
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Barra de edição em lote */}
                  {selectedACaminho.size > 0 && (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-blue-50 border-blue-200"} border`}>
                      <span className={`text-sm font-semibold ${textPrimary}`}>{selectedACaminho.size} selecionado(s)</span>
                      <span className={`text-xs ${textSecondary}`}>Definir origem:</span>
                      {Object.entries(ORIGEM_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={async () => {
                            const ids = Array.from(selectedACaminho);
                            for (const id of ids) {
                              await apiPatch(id, { origem_compra: key });
                            }
                            setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, origem_compra: key } : p));
                            setSelectedACaminho(new Set());
                            setMsg(`${ids.length} produto(s) → ${cfg.emoji} ${cfg.label}`);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${cfg.cor} text-white hover:opacity-80 transition-opacity`}
                        >
                          {cfg.emoji} {cfg.label}
                        </button>
                      ))}
                      <button onClick={() => setSelectedACaminho(new Set())} className={`ml-auto text-xs ${textSecondary} hover:text-red-500`}>Limpar</button>
                    </div>
                  )}

                  {/* Cards por ORIGEM */}
                  {sortedOrigens.map(origemKey => {
                    const items = byOrigem[origemKey];
                    const pendentes = items.filter(p => p.tipo === "A_CAMINHO");
                    const recebidos = items.filter(p => p.tipo !== "A_CAMINHO");
                    const origemTotal = pendentes.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
                    const cfg = ORIGEM_CONFIG[origemKey];
                    const headerColor = cfg ? cfg.cor : "bg-gray-500";
                    const headerLabel = cfg ? `${cfg.emoji} ${cfg.label} (${cfg.dias === 0 ? "mesmo dia" : `D+${cfg.dias}`})` : "📦 SEM ORIGEM DEFINIDA";
                    return (
                      <div key={origemKey} className={`${bgCard} border ${borderCard} rounded-2xl overflow-hidden shadow-sm`}>
                        <div className={`px-4 py-2.5 flex items-center justify-between ${headerColor}`}>
                          <span className="font-bold text-white text-[13px]">
                            {headerLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            {origemKey === "SEM_ORIGEM" && pendentes.length > 0 && (
                              <button
                                onClick={() => setSelectedACaminho(new Set(pendentes.map(p => p.id)))}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                              >
                                Selecionar todos ({pendentes.length})
                              </button>
                            )}
                            {pendentes.length > 0 && (
                              <span className="text-white/80 text-[11px] font-medium">{pendentes.length} a caminho</span>
                            )}
                            {recebidos.length > 0 && (
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pendentes.length > 0 ? "bg-white/20 text-white" : "bg-white/30 text-white"}`}>
                                ✅ {recebidos.length} recebido{recebidos.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Barra rapida: definir origem pra todos do grupo SEM_ORIGEM */}
                        {origemKey === "SEM_ORIGEM" && pendentes.length > 0 && selectedACaminho.size === 0 && (
                          <div className={`flex items-center gap-2 px-4 py-2 ${dm ? "bg-[#2C2C2E]" : "bg-yellow-50"} border-b ${dm ? "border-[#3A3A3C]" : "border-yellow-200"}`}>
                            <span className={`text-[11px] font-medium ${dm ? "text-[#98989D]" : "text-yellow-700"}`}>Definir origem para todos:</span>
                            {Object.entries(ORIGEM_CONFIG).map(([key, cfg]) => (
                              <button
                                key={key}
                                onClick={async () => {
                                  const ids = pendentes.map(p => p.id);
                                  for (const id of ids) {
                                    await apiPatch(id, { origem_compra: key });
                                  }
                                  setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, origem_compra: key } : p));
                                  setMsg(`✅ ${ids.length} produto(s) → ${cfg.emoji} ${cfg.label}`);
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${cfg.cor} text-white hover:opacity-80 transition-opacity`}
                              >
                                {cfg.emoji} {cfg.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Barra de ações em lote */}
                        {selectedACaminho.size > 0 && (
                          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl mb-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-[#FFF5EB] border border-[#E8740E]/30"}`}>
                            <span className={`text-xs font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{selectedACaminho.size} selecionado{selectedACaminho.size > 1 ? "s" : ""}</span>
                            <button onClick={() => {
                              const itens = aCaminho.filter(p => selectedACaminho.has(p.id));
                              if (itens.length === 0) return;
                              handlePrintEtiquetaDirect(itens);
                            }} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">🏷️ Imprimir Etiquetas</button>
                            <button onClick={handleMoverSelecionados} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">📦 Mover → Estoque</button>
                            <button onClick={() => setSelectedACaminho(new Set())} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"} transition-colors`}>Limpar</button>
                          </div>
                        )}
                        <table className="w-full">
                          <thead>
                            <tr className={`text-[10px] font-bold uppercase tracking-wider border-b ${dm ? "border-[#3A3A3C] text-[#6E6E73]" : "border-[#F0F0F5] text-[#86868B]"}`}>
                              <th className="px-2 py-2 w-8"><input type="checkbox" checked={pendentes.length > 0 && pendentes.every(p => selectedACaminho.has(p.id))} onChange={() => { if (pendentes.every(p => selectedACaminho.has(p.id))) { setSelectedACaminho(new Set()); } else { setSelectedACaminho(new Set(pendentes.map(p => p.id))); } }} className="accent-[#E8740E]" /></th>
                              <th className="px-4 py-2 text-left">Modelo</th>
                              <th className="px-4 py-2 text-center w-16">Qtd.</th>
                              <th className="px-4 py-2 text-right w-24">Valor unit.</th>
                              <th className="px-4 py-2 text-left w-28">Fornecedor</th>
                              <th className="px-4 py-2 text-center w-24">Compra</th>
                              <th className="px-4 py-2 text-center w-24">Previsão</th>
                              <th className="px-4 py-2 text-right w-24">Total</th>
                              {isAdmin && <th className="px-2 py-2 w-20"></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // Agrupar itens por modelo base (pendentes ou recebidos conforme filtro)
                              const pendentesDate = acaminhoFilter === "recebidos"
                                ? items.filter(p => p.tipo !== "A_CAMINHO")
                                : items.filter(p => p.tipo === "A_CAMINHO");
                              const groupMap = new Map<string, typeof pendentesDate>();
                              pendentesDate.forEach(p => {
                                const base = getBaseModelACaminho(p.produto);
                                if (!groupMap.has(base)) groupMap.set(base, []);
                                groupMap.get(base)!.push(p);
                              });
                              return Array.from(groupMap.entries()).flatMap(([baseModel, group]) => {
                                const groupKey = `${origemKey}::${baseModel}`;
                                const isExpanded = expandedACaminhoGroups.has(groupKey);
                                const totalQnt = group.reduce((s, p) => s + p.qnt, 0);
                                const totalVal = group.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
                                const allSelected = group.every(p => selectedACaminho.has(p.id));
                                const fornecedorUniq = group.every(p => p.fornecedor === group[0].fornecedor) ? group[0].fornecedor : "—";
                                const isSingleUnit = group.length === 1 && group[0].qnt === 1;
                                const rows = [];
                                // Linha de grupo (sumário)
                                rows.push(
                                  <tr key={`grp-${groupKey}`}
                                    className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"} cursor-pointer transition-colors ${
                                      allSelected ? (dm ? "bg-[#E8740E]/10" : "bg-[#FFF5EB]") :
                                      (dm ? "hover:bg-[#252525]" : "hover:bg-[#FAFAFA]")
                                    }`}
                                    onClick={() => {
                                      if (isSingleUnit) { setDetailProduct(group[0]); return; }
                                      setExpandedACaminhoGroups(prev => { const n = new Set(prev); if (n.has(groupKey)) n.delete(groupKey); else n.add(groupKey); return n; });
                                    }}>
                                    <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                                      <input type="checkbox" checked={allSelected} onChange={() => setSelectedACaminho(prev => { const n = new Set(prev); if (allSelected) group.forEach(p => n.delete(p.id)); else group.forEach(p => n.add(p.id)); return n; })} className="accent-[#E8740E]" />
                                    </td>
                                    <td className={`px-4 py-3 text-sm font-semibold ${textPrimary}`}>
                                      <span>{isSingleUnit ? group[0].produto : baseModel}</span>
                                      {isSingleUnit && group[0].cor && !group[0].produto.toUpperCase().includes((group[0].cor || "").toUpperCase()) && (
                                        <span className={`ml-2 text-[11px] font-normal ${textSecondary}`}>{group[0].cor}</span>
                                      )}
                                      {!isSingleUnit && (
                                        <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F0F0F5] text-[#86868B]"}`}>
                                          {group.length} variantes
                                        </span>
                                      )}
                                      {isSingleUnit && (group[0].serial_no || group[0].imei) && (
                                        <span className={`ml-2 text-[10px] font-mono ${dm ? "text-green-400" : "text-green-600"}`}>
                                          ✅ {group[0].serial_no || group[0].imei}
                                          <button onClick={e => { e.stopPropagation(); handlePrintEtiquetaDirect([group[0]]); }} className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">🏷️</button>
                                        </span>
                                      )}
                                      {isSingleUnit && encomendaMap.has(group[0].id) && (
                                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${dm ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                                          Reservado: {encomendaMap.get(group[0].id)}
                                        </span>
                                      )}
                                      {!isSingleUnit && group.some(p => encomendaMap.has(p.id)) && (
                                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${dm ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                                          Reservado
                                        </span>
                                      )}
                                    </td>
                                    <td className={`px-4 py-3 text-center text-sm font-bold ${textPrimary}`}>{totalQnt}</td>
                                    <td className={`px-4 py-3 text-right text-sm ${textSecondary}`}>{group[0].custo_unitario ? fmt(group[0].custo_unitario) : "—"}</td>
                                    <td className={`px-4 py-3 text-sm ${textSecondary}`}>{fornecedorUniq || "—"}</td>
                                    <td className={`px-4 py-3 text-center text-[11px] ${textSecondary}`}>{group[0].data_compra ? group[0].data_compra.split("-").reverse().join("/") : "—"}</td>
                                    <td className={`px-4 py-3 text-center text-[11px] font-semibold ${(() => {
                                      const prev = calcPrevisao(group[0].data_compra, group[0].origem_compra);
                                      if (!prev) return textSecondary;
                                      const hoje = new Date().toISOString().split("T")[0];
                                      return prev <= hoje ? "text-green-600" : "text-[#E8740E]";
                                    })()}`}>{(() => {
                                      const prev = calcPrevisao(group[0].data_compra, group[0].origem_compra);
                                      return prev ? prev.split("-").reverse().join("/") : "—";
                                    })()}</td>
                                    <td className={`px-4 py-3 text-right text-sm font-bold ${textPrimary}`}>{totalVal > 0 ? fmt(totalVal) : "—"}</td>
                                    {isAdmin && <td className="px-2 py-3 text-center">
                                      {!isSingleUnit ? (
                                        <span className={`text-[11px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{isExpanded ? "▲" : "▼"}</span>
                                      ) : (
                                        <button onClick={e => { e.stopPropagation(); handlePrintEtiquetaDirect([group[0]]); }} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${dm ? "bg-[#3A3A3C] text-purple-400 hover:bg-purple-500 hover:text-white" : "bg-purple-50 text-purple-500 hover:bg-purple-500 hover:text-white"}`}>🏷️ Etiqueta</button>
                                      )}
                                    </td>}
                                  </tr>
                                );
                                // Linhas expandidas (itens individuais, agrupados por cor)
                                if (isExpanded && !isSingleUnit) {
                                  [...group].sort((a, b) => (a.cor || "").localeCompare(b.cor || "")).forEach(p => {
                                    const ptLabel = corSoPT(p.cor, p.produto);
                                    rows.push(
                                      <tr key={p.id}
                                        className={`border-b ${dm ? "border-[#2C2C2E] bg-[#1A1A1C] hover:bg-[#222]" : "border-[#F5F5F7] bg-[#FAFAFA] hover:bg-[#F5F5F7]"} cursor-pointer transition-colors ${selectedACaminho.has(p.id) ? (dm ? "!bg-[#E8740E]/10" : "!bg-[#FFF5EB]") : ""}`}>
                                        <td className="px-2 py-2 text-center pl-6" onClick={e => e.stopPropagation()}>
                                          <input type="checkbox" checked={selectedACaminho.has(p.id)} onChange={() => setSelectedACaminho(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="accent-[#E8740E]" />
                                        </td>
                                        <td className={`px-4 py-2 text-[13px] font-medium ${textPrimary} pl-8`} onClick={() => setDetailProduct(p)}>
                                          <span className={`mr-1 ${dm ? "text-[#6E6E73]" : "text-[#C0C0C5]"}`}>└</span>
                                          {(() => {
                                            if (!p.cor) return p.produto;
                                            const pt = corParaPT(p.cor);
                                            const en = corEnOriginal(p.cor);
                                            return <>{pt}{en && en.toLowerCase() !== pt.toLowerCase() && <span className={`ml-1 text-[11px] font-normal ${textSecondary}`}>{en}</span>}</>;
                                          })()}
                                          {(p.serial_no || p.imei) && (
                                            <span className={`ml-2 text-[10px] font-mono ${dm ? "text-green-400" : "text-green-600"}`}>
                                              ✅ {p.serial_no || p.imei}
                                              <button onClick={e => { e.stopPropagation(); handlePrintEtiquetaDirect([p]); }} className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">🏷️</button>
                                            </span>
                                          )}
                                          {encomendaMap.has(p.id) && (
                                            <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${dm ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                                              Reservado: {encomendaMap.get(p.id)}
                                            </span>
                                          )}
                                        </td>
                                        <td className={`px-4 py-2 text-center text-sm font-bold ${textPrimary}`} onClick={() => setDetailProduct(p)}>{p.qnt}</td>
                                        <td className={`px-4 py-2 text-right text-sm ${textSecondary}`} onClick={() => setDetailProduct(p)}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</td>
                                        <td className={`px-4 py-2 text-sm ${textSecondary}`} onClick={() => setDetailProduct(p)}>{p.fornecedor || "—"}</td>
                                        <td className={`px-4 py-2 text-center text-[11px] ${textSecondary}`} onClick={() => setDetailProduct(p)}>{p.data_compra ? p.data_compra.split("-").reverse().join("/") : "—"}</td>
                                        <td className={`px-4 py-2 text-center text-[11px] font-semibold ${(() => {
                                          const prev = calcPrevisao(p.data_compra, p.origem_compra);
                                          if (!prev) return textSecondary;
                                          const hoje = new Date().toISOString().split("T")[0];
                                          return prev <= hoje ? "text-green-600" : "text-[#E8740E]";
                                        })()}`} onClick={() => setDetailProduct(p)}>{(() => {
                                          const prev = calcPrevisao(p.data_compra, p.origem_compra);
                                          return prev ? prev.split("-").reverse().join("/") : "—";
                                        })()}</td>
                                        <td className={`px-4 py-2 text-right text-sm font-bold ${textPrimary}`} onClick={() => setDetailProduct(p)}>{p.custo_unitario ? fmt(p.qnt * p.custo_unitario) : "—"}</td>
                                        {isAdmin && <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                                          <button onClick={() => handlePrintEtiquetaDirect([p])} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${dm ? "bg-[#3A3A3C] text-purple-400 hover:bg-purple-500 hover:text-white" : "bg-purple-50 text-purple-500 hover:bg-purple-500 hover:text-white"}`}>🏷️ Etiqueta</button>
                                        </td>}
                                      </tr>
                                    );
                                  });
                                }
                                return rows;
                              });
                            })()}
                          </tbody>
                          {pendentes.length > 0 && (
                            <tfoot>
                              <tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                                <td className={`px-4 py-2 text-[11px] font-bold ${textSecondary}`} colSpan={isAdmin ? 8 : 6}>TOTAL PENDENTE</td>
                                <td className="px-4 py-2 text-right text-sm font-bold text-[#E8740E]" colSpan={isAdmin ? 2 : 1}>{fmt(origemTotal)}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    );
                  })}
                  {sortedOrigens.length > 1 && grandTotal > 0 && (
                    <div className={`${bgCard} border ${borderCard} rounded-xl px-4 py-3 flex items-center justify-between`}>
                      <span className={`text-xs font-bold ${textSecondary}`}>TOTAL PENDENTE ({filtered.length} {filtered.length === 1 ? "produto" : "produtos"} a caminho)</span>
                      <span className="text-base font-bold text-[#E8740E]">{fmt(grandTotal)}</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : !filterCat && ["estoque", "atacado", "pendencias"].includes(tab) ? (
            /* TELA DE CATEGORIAS */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {categoriasState.map((cat) => {
                const sourceList = tab === "pendencias" ? pendencias : tab === "atacado" ? atacado : emEstoque;
                const items = sourceList.filter((p) => p.categoria === cat.key);
                const count = items.length;
                const units = items.reduce((s, p) => s + p.qnt, 0);
                const valorTotal = items.reduce((s, p) => s + (p.custo_unitario || 0) * p.qnt, 0);
                if (count === 0) return null;
                const isEditing = editingCatName === cat.key;
                return (
                  <div key={cat.key} className={`${bgCard} border ${borderCard} rounded-2xl overflow-hidden hover:border-[#E8740E] hover:shadow-md transition-all group relative cursor-pointer`} onClick={() => !isEditing && setFilterCat(cat.key)}>
                    {/* Accent bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-[#E8740E] to-[#F5A623] opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Edit button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCatName(cat.key); setEditCatLabel(cat.label); }}
                      className={`absolute top-3 right-3 w-6 h-6 rounded-md flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10 ${dm ? "bg-[#3A3A3C] text-[#A1A1A6]" : "bg-[#F2F2F7] text-[#86868B]"} hover:text-[#E8740E]`}
                      title="Editar nome"
                    >
                      ✏️
                    </button>
                    <div className="p-4">
                      {/* Emoji + Label */}
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-[28px] leading-none mt-0.5">{cat.emoji}</span>
                        <div className="flex-1 min-w-0 pt-0.5">
                          {isEditing ? (
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                value={editCatLabel}
                                onChange={(e) => setEditCatLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleEditCategoriaEstoque(cat.key); if (e.key === "Escape") setEditingCatName(""); }}
                                className={`w-full px-2 py-1 rounded-lg border text-sm font-bold ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7]"} focus:outline-none focus:border-[#E8740E]`}
                                autoFocus
                              />
                              <div className="flex gap-1">
                                <button onClick={() => handleEditCategoriaEstoque(cat.key)} className="px-2 py-1 rounded text-[10px] font-semibold bg-[#E8740E] text-white">Salvar</button>
                                <button onClick={() => setEditingCatName("")} className={`px-2 py-1 rounded text-[10px] ${textSecondary}`}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <h3 className={`font-semibold text-[13px] leading-tight ${textPrimary} group-hover:text-[#E8740E] transition-colors`}>{cat.label}</h3>
                          )}
                        </div>
                      </div>
                      {/* Stats */}
                      <div className={`flex items-center justify-between pt-2 border-t ${dm ? "border-[#3A3A3C]" : "border-[#F2F2F7]"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-bold ${dm ? "text-[#F5A623]" : "text-[#E8740E]"}`}>{units} un.</span>
                          <span className={`text-[11px] ${textMuted}`}>· {count} mod.</span>
                        </div>
                        {valorTotal > 0 && <span className={`text-[10px] font-medium ${textMuted}`}>R$ {Math.round(valorTotal).toLocaleString("pt-BR")}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Produtos pendentes sem categoria válida — alerta + auto-fix */}
              {tab === "pendencias" && isAdmin && (() => {
                const semCat = pendencias.filter(p => !p.categoria || !CATEGORIAS.includes(p.categoria));
                if (semCat.length === 0) return null;
                return (
                  <div className={`col-span-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border ${dm ? "bg-yellow-900/20 border-yellow-700/40 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-yellow-800"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="text-xs font-bold">{semCat.length} produto{semCat.length > 1 ? "s" : ""} sem categoria válida</p>
                        <p className="text-[11px] opacity-70">Esses itens não aparecem nas categorias acima</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const detectCat = (nome: string): string => {
                          const n = (nome || "").toUpperCase();
                          if (n.includes("MACBOOK NEO") && CATEGORIAS.includes("MACBOOK_NEO")) return "MACBOOK_NEO";
                          if (n.includes("MACBOOK AIR") && CATEGORIAS.includes("MACBOOK_AIR")) return "MACBOOK_AIR";
                          if (n.includes("MACBOOK PRO") && CATEGORIAS.includes("MACBOOK_PRO")) return "MACBOOK_PRO";
                          if (n.includes("MACBOOK") && CATEGORIAS.includes("MACBOOK")) return "MACBOOK";
                          if (n.includes("MAC MINI") && CATEGORIAS.includes("MAC_MINI")) return "MAC_MINI";
                          if (n.includes("MAC STUDIO") && CATEGORIAS.includes("MAC_STUDIO")) return "MAC_STUDIO";
                          if (n.includes("IMAC") && CATEGORIAS.includes("IMAC")) return "IMAC";
                          if (n.includes("IPAD") && CATEGORIAS.includes("IPADS")) return "IPADS";
                          if (n.includes("APPLE WATCH") && CATEGORIAS.includes("APPLE_WATCH")) return "APPLE_WATCH";
                          if (n.includes("AIRPOD") && CATEGORIAS.includes("AIRPODS")) return "AIRPODS";
                          if (n.includes("IPHONE") && CATEGORIAS.includes("IPHONES")) return "IPHONES";
                          return CATEGORIAS[0] || "IPHONES";
                        };
                        let fixed = 0;
                        for (const p of semCat) {
                          const cat = detectCat(p.produto);
                          await apiPatch(p.id, { categoria: cat });
                          setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, categoria: cat } : x));
                          fixed++;
                        }
                        setMsg(`✅ ${fixed} produto${fixed > 1 ? "s" : ""} corrigido${fixed > 1 ? "s" : ""}!`);
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
                    >
                      Corrigir automaticamente
                    </button>
                  </div>
                );
              })()}
            </div>
          ) : Object.keys(byCat).length === 0 ? (
            <div className={`${bgCard} border ${borderCard} rounded-2xl p-12 text-center shadow-sm`}>
              <p className={textSecondary}>Nenhum produto encontrado.</p>
            </div>
          ) : (
            <>
            {/* Resumo por origem + botão WhatsApp atacado — A Caminho */}
            {isACaminhoTab && aCaminho.length > 0 && (
              <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#F5D5B0]"} border mb-3 space-y-3`}>
                {/* Resumo por origem */}
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const origemConfig: Record<string, { emoji: string; label: string; prazo: string }> = {
                      EUA: { emoji: "🇺🇸", label: "EUA", prazo: "25-30 dias" },
                      PARAGUAI: { emoji: "🇵🇾", label: "Paraguai", prazo: "~15 dias" },
                      SAO_PAULO: { emoji: "🚚", label: "São Paulo", prazo: "1 dia" },
                      RJ: { emoji: "🏙️", label: "Rio de Janeiro", prazo: "mesmo dia" },
                    };
                    const byOrigem: Record<string, number> = {};
                    let semOrigem = 0;
                    for (const p of aCaminho) {
                      if (p.origem_compra && origemConfig[p.origem_compra]) {
                        byOrigem[p.origem_compra] = (byOrigem[p.origem_compra] || 0) + p.qnt;
                      } else {
                        semOrigem += p.qnt;
                      }
                    }
                    return (
                      <>
                        {Object.entries(byOrigem).map(([orig, qnt]) => {
                          const c = origemConfig[orig];
                          return (
                            <span key={orig} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "bg-[#3A3A3C] text-[#F5F5F7]" : "bg-white text-[#1D1D1F]"} border ${dm ? "border-[#48484A]" : "border-[#D2D2D7]"}`}>
                              {c.emoji} {c.label}: <b>{qnt} un.</b> <span className={`${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>({c.prazo})</span>
                            </span>
                          );
                        })}
                        {semOrigem > 0 && (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} border ${dm ? "border-[#48484A]" : "border-[#E5E5EA]"}`}>
                            📦 Sem origem: <b>{semOrigem} un.</b>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                {/* Botão copiar */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-bold ${textPrimary}`}>📋 Texto para WhatsApp (Atacado)</p>
                    <p className={`text-[11px] ${textMuted}`}>{aCaminho.length} produto(s) a caminho — gera texto agrupado por categoria</p>
                  </div>
                <button
                  onClick={() => {
                    // Agrupa por categoria
                    const catEmoji: Record<string, string> = {
                      IPHONES: "📱", IPADS: "📱", MACBOOK: "💻", MAC_MINI: "🖥️",
                      APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌",
                    };
                    const catLabel: Record<string, string> = {
                      IPHONES: "iPhones", IPADS: "iPads", MACBOOK: "MacBooks", MAC_MINI: "Mac Mini",
                      APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios",
                    };
                    const catOrder = ["AIRPODS", "APPLE_WATCH", "IPADS", "IPHONES", "MACBOOK", "MAC_MINI", "ACESSORIOS"];

                    // Agrupa por categoria → lista de "modelo – cor"
                    const fonte = selectedACaminho.size > 0 ? aCaminho.filter(p => selectedACaminho.has(p.id)) : aCaminho;
                    const groups: Record<string, string[]> = {};
                    for (const p of fonte) {
                      const cat = p.categoria || "OUTROS";
                      if (!groups[cat]) groups[cat] = [];
                      // Extrai nome limpo + cor
                      const nome = (p.produto || "").replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP)\s*(\([^)]*\))?/gi, "")
                        .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
                        .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")
                        .replace(/\s{2,}/g, " ").trim();
                      const cor = p.cor ? ` – ${corParaPT(p.cor) || p.cor}` : "";
                      groups[cat].push(`${nome}${cor}`);
                    }

                    // Monta texto
                    const lines: string[] = ["🎁 *ESTOQUE – ATACADO*", ""];
                    const sortedCats = Object.keys(groups).sort((a, b) => {
                      const ia = catOrder.indexOf(a); const ib = catOrder.indexOf(b);
                      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                    });
                    for (const cat of sortedCats) {
                      const emoji = catEmoji[cat] || "📦";
                      const label = catLabel[cat] || cat;
                      lines.push(`${emoji} *${label}*`);
                      // Remove duplicatas mantendo ordem
                      const seen = new Set<string>();
                      for (const item of groups[cat]) {
                        if (!seen.has(item)) { seen.add(item); lines.push(item); }
                      }
                      lines.push("");
                    }

                    navigator.clipboard.writeText(lines.join("\n").trim());
                    setMsg(selectedACaminho.size > 0 ? `📋 Texto copiado (${selectedACaminho.size} selecionados)!` : "📋 Texto copiado! Cole no WhatsApp.");
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
                >
                  📋 {selectedACaminho.size > 0 ? `Copiar ${selectedACaminho.size} Selecionados` : "Copiar Texto Atacado"}
                </button>
                </div>
              </div>
            )}

            {/* Barra de seleção em lote — A Caminho (admin only) */}
            {false && filtered.length > 0 && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#F5D5B0]"} border`}>
                <input
                  type="checkbox"
                  checked={selectedACaminho.size === filtered.length && filtered.length > 0}
                  onChange={() => {
                    if (selectedACaminho.size === filtered.length) {
                      setSelectedACaminho(new Set());
                    } else {
                      setSelectedACaminho(new Set(filtered.map(p => p.id)));
                    }
                  }}
                  className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                />
                <span className={`text-sm ${textPrimary}`}>
                  {selectedACaminho.size > 0 ? `${selectedACaminho.size} selecionado${selectedACaminho.size > 1 ? "s" : ""}` : "Selecionar todos"}
                </span>
                {selectedACaminho.size > 0 && (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={handleMoverSelecionados}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Mover {selectedACaminho.size} → Estoque
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Excluir ${selectedACaminho.size} produto(s) selecionado(s)?`)) return;
                        const ids = [...selectedACaminho];
                        await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ ids }) });
                        setEstoque(prev => prev.filter(e => !selectedACaminho.has(e.id)));
                        setSelectedACaminho(new Set());
                        setMsg(`${ids.length} produto(s) excluído(s)`);
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Excluir {selectedACaminho.size}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* ========== CARD VIEW PARA PENDÊNCIAS ========== */}
            {isPendenciasTab && (() => {
              // Coletar todos os itens com data e cliente
              const allPendItems = Object.entries(byCat)
                .flatMap(([cat, modelos]) => {
                  const [dateStr, cliente] = cat.split("|||");
                  return Object.values(modelos).flat().map(p => ({ ...p, _groupDate: dateStr, _groupCliente: cliente }));
                });
              // Agrupar por DATA (não por cliente)
              const byDate: Record<string, (typeof allPendItems)> = {};
              allPendItems.forEach(p => {
                if (!byDate[p._groupDate]) byDate[p._groupDate] = [];
                byDate[p._groupDate].push(p);
              });
              return Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, items]) => {
                const fmtD = dateStr !== "Sem data" ? dateStr.split("-").reverse().join("/") : "Sem data";
                return (
                  <div key={dateStr} className="space-y-3">
                    <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${dm ? "bg-[#E8740E]/20 text-[#E8740E]" : "bg-[#FFF3E8] text-[#E8740E]"}`}>{fmtD}</span>
                      <span className={`text-xs font-normal ${textSecondary}`}>{items.length} produto{items.length !== 1 ? "s" : ""}</span>
                    </h2>
                    <div className="flex flex-wrap gap-3">
                      {items.map(p => {
                        const obs = p.observacao || "";
                        const gradeMatch = obs.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
                        const hasCaixa = obs.includes("[COM_CAIXA]") || /com\s+caixa/i.test(obs);
                        const hasCabo = obs.includes("[COM_CABO]") || /com\s+cabo/i.test(obs);
                        const hasFonte = obs.includes("[COM_FONTE]") || /com\s+(fonte|carregador)/i.test(obs);
                        const comQuem = obs.match(/\[COM_QUEM:([^\]]+)\]/)?.[1] || "";
                        const obsLimpo = cleanObs(obs);
                        const cliente = p._groupCliente || "";
                        return (
                          <div key={p.id} className={`${bgCard} border ${borderCard} rounded-xl p-3 sm:p-4 space-y-2 hover:shadow-md transition-shadow cursor-pointer w-[calc(50%_-_6px)] sm:w-[280px] shrink-0`} onClick={() => setDetailProduct(p)}>
                            {/* Cliente */}
                            <p className={`text-[10px] font-semibold uppercase tracking-wider ${textSecondary}`}>👤 {cliente}</p>
                            {/* Produto + Cor */}
                            <div>
                              <p className={`font-bold text-sm ${textPrimary}`}>{formatProdutoDisplay(p)}</p>
                              {p.cor && <p className={`text-xs ${textSecondary}`}>{p.cor}</p>}
                            </div>
                            {/* Badges: bateria, grade, acessórios */}
                            <div className="flex flex-wrap gap-1.5">
                              {p.bateria && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.bateria >= 90 ? "bg-green-100 text-green-700" : p.bateria >= 85 ? "bg-yellow-100 text-yellow-700" : p.bateria >= 80 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>🔋 {p.bateria}%</span>
                              )}
                              {gradeMatch && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${gradeMatch === "A+" ? "bg-amber-100 text-amber-700" : gradeMatch === "A" ? "bg-green-100 text-green-700" : gradeMatch === "AB" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>{gradeMatch}</span>}
                              {hasCaixa && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">📦 Caixa</span>}
                              {hasCabo && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">🔌 Cabo</span>}
                              {hasFonte && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">🔋 Fonte</span>}
                              {comQuem && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">👤 {comQuem}</span>}
                            </div>
                            {/* Preço + IMEI/Serial */}
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-bold ${p.custo_unitario ? "text-[#E8740E]" : "text-red-500"}`}>{p.custo_unitario ? fmt(p.custo_unitario) : "Sem preço"}</span>
                              {(p.imei || p.serial_no) && (
                                <span className={`text-[10px] font-mono ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>{p.serial_no || p.imei || ""}</span>
                              )}
                            </div>
                            {obsLimpo && <p className={`text-[10px] ${textMuted} truncate`}>{obsLimpo}</p>}
                            {/* Ações */}
                            <div className="flex gap-2 pt-1 border-t border-dashed" style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
                              <button onClick={(e) => { e.stopPropagation(); handlePrintEtiquetaPendencia(p); }} className={`text-[10px] px-2 py-1 rounded border transition-colors ${dm ? "border-[#E8740E]/40 text-[#E8740E] hover:bg-[#E8740E] hover:text-white" : "border-[#E8740E]/40 text-[#E8740E] hover:bg-[#E8740E] hover:text-white"}`}>🏷️ Etiqueta</button>
                              <button onClick={(e) => { e.stopPropagation(); setBulkCustoKey(p.produto); setBulkCustoVal(String(p.custo_unitario || "")); }} className={`text-[10px] px-2 py-1 rounded border transition-colors ${dm ? "border-[#3A3A3C] text-[#86868B] hover:text-[#E8740E] hover:border-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:text-[#E8740E] hover:border-[#E8740E]"}`}>Editar preço</button>
                              <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`Excluir "${formatProdutoDisplay(p)}"?`)) return; try { const res = await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ ids: [p.id] }) }); if (res.ok) { setEstoque(prev => prev.filter(r => r.id !== p.id)); setMsg("Produto excluído"); } else { const json = await res.json(); setMsg("Erro: " + (json.error || "Falha ao excluir")); } } catch (err) { setMsg("Erro: " + String(err)); } }} className={`text-[10px] px-2 py-1 rounded border transition-colors ${dm ? "border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white" : "border-red-400/40 text-red-500 hover:bg-red-500 hover:text-white"}`}>🗑️ Excluir</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
            {/* ========== CARD VIEW (todas as outras abas) ========== */}
            {!isPendenciasTab && (() => {
              const catEntries = Object.entries(byCat).sort(([a], [b]) => a.localeCompare(b));
              const catData = catEntries.map(([cat, modelos]) => {
                const allItems = Object.values(modelos).flat()
                  .filter(p => !(tab === "estoque" && p.qnt === 0))
                  .filter(p => !(tab === "seminovos" && p.qnt === 0));
                if (allItems.length === 0) return null;
                const grouped: Record<string, typeof allItems> = {};
                allItems.forEach(p => {
                  const base = getModeloBase(p.produto, p.categoria, p.observacao).toUpperCase();
                  const cor = p.cor ? corParaPT(p.cor).toUpperCase() : "";
                  const key = `${base}|||${cor}`;
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(p);
                });
                const storageToNum = (name: string): number => { const m = name.match(/(\d+)\s*(GB|TB)/i); if (!m) return 0; return m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]); };
                const groupEntries = Object.entries(grouped).sort(([a], [b]) => { const sa = storageToNum(a); const sb = storageToNum(b); if (sa !== sb) return sa - sb; return a.localeCompare(b); });
                const byLine: Record<string, typeof groupEntries> = {};
                groupEntries.forEach(entry => {
                  const [key] = entry;
                  const modeloFull = key.split("|||")[0];
                  if (!byLine[modeloFull]) byLine[modeloFull] = [];
                  byLine[modeloFull].push(entry);
                });
                const savedOrder = lineOrder[cat] || [];
                const lineNames = Object.keys(byLine);
                const sortedLineNames = savedOrder.length > 0
                  ? [...lineNames].sort((a, b) => {
                      const ia = savedOrder.indexOf(a);
                      const ib = savedOrder.indexOf(b);
                      if (ia === -1 && ib === -1) return 0;
                      if (ia === -1) return 1;
                      if (ib === -1) return 1;
                      return ia - ib;
                    })
                  : lineNames;
                const totalQnt = allItems.reduce((s, p) => s + p.qnt, 0);
                const totalVal = allItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
                return { cat, byLine, sortedLineNames, groupEntries, totalQnt, totalVal };
              }).filter(Boolean) as { cat: string; byLine: Record<string, [string, any[]][]>; sortedLineNames: string[]; groupEntries: [string, any[]][]; totalQnt: number; totalVal: number }[];

              return (
              <>
              {catData.map(({ cat, byLine, sortedLineNames, groupEntries, totalQnt, totalVal }) => (
              <div key={cat} className="space-y-5">
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  {(dynamicCatLabels[cat] || cat)}
                  <span className={`text-xs font-normal ${textSecondary}`}>
                    {groupEntries.length} modelo{groupEntries.length !== 1 ? "s" : ""} | {totalQnt} un. | {fmt(totalVal)}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); setReorderMode(!reorderMode); }} className={`ml-auto text-[11px] px-2 py-1 rounded-lg transition-colors ${reorderMode ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    {reorderMode ? "Pronto" : "Reordenar"}
                  </button>
                </h2>
                <div className="space-y-4">
                {sortedLineNames.map((lineName, lineIdx) => {
                  const lineEntries = byLine[lineName];
                  if (!lineEntries) return null;
                  const lineQnt = lineEntries.reduce((s, [, items]) => s + items.reduce((ss, p) => ss + p.qnt, 0), 0);
                  return (
                  <div key={lineName} className="space-y-2">
                    <h3 className={`text-sm font-semibold ${textSecondary} flex items-center gap-2`}>
                      {reorderMode && (
                        <span className="flex flex-col gap-0 mr-1">
                          <button onClick={(e) => { e.stopPropagation(); moveLineInOrder(cat, sortedLineNames, lineIdx, lineIdx - 1); }} disabled={lineIdx === 0} className={`text-[10px] leading-none px-1 py-0.5 rounded transition-colors ${lineIdx === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-[#E8740E] hover:text-white cursor-pointer"}`}>▲</button>
                          <button onClick={(e) => { e.stopPropagation(); moveLineInOrder(cat, sortedLineNames, lineIdx, lineIdx + 1); }} disabled={lineIdx === sortedLineNames.length - 1} className={`text-[10px] leading-none px-1 py-0.5 rounded transition-colors ${lineIdx === sortedLineNames.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-[#E8740E] hover:text-white cursor-pointer"}`}>▼</button>
                        </span>
                      )}
                      {lineName}
                      <span className={`text-[11px] font-normal ${textMuted}`}>{lineQnt} un.</span>
                    </h3>
                    <div className="flex flex-wrap gap-3">
                  {lineEntries.map(([groupKey, items]) => {
                    const rep = items[0];
                    const qntTotal = items.reduce((s, p) => s + p.qnt, 0);
                    const avgCusto = qntTotal > 0 ? Math.round(items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0) / qntTotal) : (rep.custo_unitario || 0);
                    const corPt = rep.cor ? corParaPT(rep.cor) : "";
                    const isUsado = items.some(p => p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA");
                    const cardExpanded = expandedModels.has(groupKey);
                    return (
                      <div key={groupKey} className={`${bgCard} border ${borderCard} rounded-xl p-3 sm:p-4 space-y-2 hover:shadow-md transition-shadow cursor-pointer w-[calc(50%_-_6px)] sm:w-[280px] shrink-0`} onClick={() => { if (items.length === 1) { setDetailProduct(items[0]); } else { setExpandedModels(prev => { const s = new Set(prev); s.has(groupKey) ? s.delete(groupKey) : s.add(groupKey); return s; }); } }}>
                        {/* Produto + Cor */}
                        <div>
                          <p className={`font-bold text-xs sm:text-sm ${textPrimary} leading-tight`}>{formatProdutoDisplay(rep)}</p>
                          {corPt && <p className={`text-[10px] sm:text-xs ${textSecondary} mt-0.5`}>{corPt}</p>}
                        </div>
                        {/* Quantidade */}
                        <div className="flex items-center gap-2">
                          <span className={`text-xs sm:text-sm font-bold ${qntTotal === 0 ? "text-red-500" : qntTotal === 1 ? "text-yellow-500" : "text-green-500"}`}>
                            {qntTotal === 0 ? "Esgotado" : `${qntTotal} un.`}
                          </span>
                          {isUsado && (() => {
                            const bats = items.filter(p => p.bateria).map(p => p.bateria!);
                            const grades = [...new Set(items.map(p => (p.observacao || "").match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1]).filter(Boolean))];
                            return (<div className="flex flex-wrap gap-1">
                              {bats.length > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${Math.min(...bats) >= 90 ? "bg-green-100 text-green-700" : Math.min(...bats) >= 85 ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>🔋 {bats.length === 1 ? `${bats[0]}%` : `${Math.min(...bats)}-${Math.max(...bats)}%`}</span>}
                              {grades.map(g => <span key={g} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${g === "A+" ? "bg-amber-100 text-amber-700" : g === "A" ? "bg-green-100 text-green-700" : g === "AB" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>{g}</span>)}
                            </div>);
                          })()}
                        </div>
                        {/* Preço */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs sm:text-sm font-bold ${avgCusto ? "text-[#E8740E]" : "text-red-500"}`}>{avgCusto ? fmt(avgCusto) : "Sem preço"}</span>
                          {items.length > 1 && <span className={`text-[10px] ${textMuted}`}>{cardExpanded ? "▲" : "▼"} ver seriais</span>}
                          {items.length === 1 && (rep.imei || rep.serial_no) && (
                            <span className={`text-[10px] font-mono ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>{rep.serial_no || rep.imei || ""}</span>
                          )}
                        </div>
                        {/* Seriais expandidos */}
                        {cardExpanded && items.length > 1 && (
                          <div className={`pt-2 mt-1 border-t border-dashed space-y-1`} style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
                            {items.map(p => (
                              <div key={p.id} className={`flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg transition-colors ${dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]"}`} onClick={(e) => { e.stopPropagation(); setDetailProduct(p); }}>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono ${dm ? "text-[#98989D]" : "text-[#636366]"}`}>{p.serial_no || p.imei || "—"}</span>
                                  {p.bateria && <span className={`text-[9px] px-1 rounded ${p.bateria >= 90 ? "bg-green-100 text-green-700" : p.bateria >= 85 ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>🔋{p.bateria}%</span>}
                                </div>
                                <span className={`text-[10px] ${textSecondary}`}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                    </div>
                  </div>
                  );
                })}
                </div>
              </div>
              ))}
              </>
              );
            })()}
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: HISTORICO ═══════════ */}
      {tab === "historico" && (
        <HistoricoTab password={password} logs={historicoLogs} setLogs={setHistoricoLogs} loading={historicoLoading} setLoading={setHistoricoLoading} />
      )}

      {/* ═══════════ TAB: SCAN (Entrada por Serial Number) ═══════════ */}
      {tab === "scan" && (
        <ScanEntradaTab password={password} userName={userName} onSuccess={() => { fetchEstoque(); setMsg("✅ Produto cadastrado com sucesso!"); }} />
      )}

      {/* ═══════════ TAB: ETIQUETAS (Legacy) ═══════════ */}
      {tab === "etiquetas" && (
        <Suspense fallback={<div className="text-center py-8 text-[#86868B]">Carregando...</div>}>
          <EtiquetasContent embedded />
        </Suspense>
      )}

      {/* Floating bulk action bar */}
      {selectMode && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
          <span className={`text-sm font-semibold ${textPrimary}`}>{selectedIds.size} selecionado(s)</span>
          <button
            onClick={() => { setSelectedIds(new Set(filtered.map((p) => p.id))); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F2F2F7] text-[#1D1D1F]"} hover:bg-[#E8740E] hover:text-white transition-colors`}
          >
            Selecionar todos ({filtered.length})
          </button>
          {selectedIds.size > 0 && <>
          <button
            onClick={() => {
              const itens = estoque.filter(p => selectedIds.has(p.id));
              if (itens.length > 0) handlePrintEtiquetaDirect(itens);
            }}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
          >
            🏷️ Imprimir Etiquetas ({selectedIds.size})
          </button>
          {tab === "estoque" && (
            <button
              onClick={async () => {
                if (!confirm(`Mover ${selectedIds.size} produto(s) para Atacado?`)) return;
                const ids = Array.from(selectedIds);
                for (const id of ids) {
                  await apiPatch(id, { tipo: "ATACADO" });
                }
                setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, tipo: "ATACADO" } : p));
                setMsg(`${ids.length} produto(s) movido(s) para Atacado!`);
                setSelectedIds(new Set()); setSelectMode(false);
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              → Atacado ({selectedIds.size})
            </button>
          )}
          {tab === "estoque" && (
            <button
              onClick={async () => {
                if (!confirm(`Mover ${selectedIds.size} produto(s) para Pendências?`)) return;
                const ids = Array.from(selectedIds);
                for (const id of ids) {
                  await apiPatch(id, { tipo: "PENDENCIA", status: "PENDENTE" });
                }
                setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, tipo: "PENDENCIA", status: "PENDENTE" } : p));
                setMsg(`${ids.length} produto(s) movido(s) para Pendências!`);
                setSelectedIds(new Set()); setSelectMode(false);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dm ? "bg-yellow-900/50 text-yellow-400 hover:bg-yellow-700" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"}`}
            >
              → Pendências ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? "Excluindo..." : `Excluir ${selectedIds.size}`}
          </button>
          </>}
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Floating balance bar */}
      {balanceMode && tab === "seminovos" && balanceSelected.size > 0 && (() => {
        const selItems = estoque.filter((p) => balanceSelected.has(p.id));
        const totalCusto = selItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
        const totalQnt = selItems.reduce((s, p) => s + p.qnt, 0);
        const avgCusto = totalQnt > 0 ? Math.round(totalCusto / totalQnt) : 0;
        return (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
            <span className={`text-sm font-semibold ${textPrimary}`}>{balanceSelected.size} selecionado(s)</span>
            <span className={`text-sm ${textSecondary}`}>Custo medio: <span className="font-bold text-blue-500">{fmt(avgCusto)}</span></span>
            <button
              onClick={handleApplyBalance}
              disabled={balanceApplying}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {balanceApplying ? "Aplicando..." : "Aplicar Balanço"}
            </button>
            <button
              onClick={() => { setBalanceSelected(new Set()); setBalanceMode(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}
            >
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* Modal de detalhes do produto */}
      {detailProduct && (() => {
        const p = detailProduct;
        const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
        const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
        const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
        const mS = dm ? "text-[#98989D]" : "text-[#86868B]";
        const isLac = p.tipo === "NOVO" || p.tipo === "A_CAMINHO" || p.tipo === "NAO_ATIVADO";
        const dataE = p.data_entrada || p.data_compra;
        // reset serial/imei edit mode when a different product opens
        // (tracked via editingDetailSerial / editingDetailImei in page state)
        const cpIco = <svg className="w-3 h-3 opacity-40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
        const canEdit = isAdmin || p.tipo === "PENDENCIA" || p.status === "PENDENTE" || p.status === "A CAMINHO";
        // IMEI/Serial editável para pendências (qualquer user) ou admin (qualquer status)
        const isPendente = p.tipo === "PENDENCIA" || p.status === "PENDENTE" || p.status === "A CAMINHO";
        const canEditImei = isPendente || isAdmin;
        const canEditSerial = isPendente || isAdmin;
        const saved = (f: string) => savedField === f ? <span className="ml-1 text-[10px] font-semibold text-green-500 animate-pulse">Salvo!</span> : null;
        const saveSerial = async () => {
          const el = document.getElementById(`serial-single-${p.id}`) as HTMLInputElement;
          const val = el?.value?.trim().toUpperCase() || null;
          if (val === (p.serial_no || null)) { setEditingDetailSerial(false); return; }
          try {
            await apiPatch(p.id, { serial_no: val });
            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, serial_no: val } : x));
            setDetailProduct(prev => prev ? { ...prev, serial_no: val } : null);
            showSaved("serial");
            setEditingDetailSerial(false);
          } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
        };
        const saveImei = async () => {
          const el = document.getElementById(`imei-single-${p.id}`) as HTMLInputElement;
          const val = el?.value?.trim() || null;
          if (val === (p.imei || null)) { setEditingDetailImei(false); return; }
          try {
            await apiPatch(p.id, { imei: val });
            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, imei: val } : x));
            setDetailProduct(prev => prev ? { ...prev, imei: val } : null);
            showSaved("imei");
            setEditingDetailImei(false);
          } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailProduct(null)} onKeyDown={(e) => { if (e.key === "Escape") setDetailProduct(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className={`w-full max-w-lg mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                <h3 className={`text-sm font-bold ${mP}`}>{canEdit ? "Editar Item" : "Detalhes do Item"} {p.serial_no ? `- ${p.serial_no}` : ""}</h3>
                <div className="flex items-center gap-2">
                  {p.tipo === "PENDENCIA" && (
                    <button
                      onClick={async () => {
                        if (!p.serial_no || !p.imei) {
                          setMsg("Preencha o Numero de Serie e IMEI antes de gerar o Termo de Procedencia.");
                          return;
                        }
                        const condicaoParts: string[] = [];
                        if (p.bateria) condicaoParts.push(`Bateria ${p.bateria}%`);
                        if (p.garantia) condicaoParts.push(`Garantia: ${p.garantia}`);
                        const gradeMatch = (p.observacao || "").match(/\[GRADE_(A\+|AB|A|B)\]/);
                        if (gradeMatch) condicaoParts.push(`Grade ${gradeMatch[1]}`);
                        try {
                          const res = await fetch("/api/admin/termo-procedencia", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
                            body: JSON.stringify({
                              cliente_nome: p.cliente || "",
                              aparelhos: [{
                                modelo: p.produto,
                                capacidade: (p.produto.match(/\d+\s*GB/i) || [""])[0] || "",
                                cor: p.cor || "",
                                imei: p.imei,
                                serial: p.serial_no,
                                condicao: condicaoParts.join(", "),
                              }],
                              pendencia_id: p.id,
                            }),
                          });
                          if (res.headers.get("content-type")?.includes("pdf")) {
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `TERMO_PROCEDENCIA_${(p.cliente || "item").replace(/\s+/g, "_")}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } else {
                            const json = await res.json();
                            setMsg("Erro: " + (json.error || "falha ao gerar termo"));
                          }
                        } catch (err) {
                          setMsg("Erro ao gerar Termo: " + String(err instanceof Error ? err.message : err));
                        }
                      }}
                      disabled={!p.serial_no || !p.imei}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        p.serial_no && p.imei
                          ? "bg-[#E8740E] text-white hover:bg-[#D06A0D]"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                      title={!p.serial_no || !p.imei ? "Preencha Serial e IMEI primeiro" : "Gerar Termo de Procedencia"}
                    >
                      📜 Termo
                    </button>
                  )}
                  {(p.serial_no || p.imei) && (
                    <button
                      onClick={() => handlePrintEtiquetaDirect([p])}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0066CC] text-white hover:bg-[#0055AA] transition-colors"
                    >
                      Etiqueta
                    </button>
                  )}
                  {/* Termo da main removido — usamos o botão com validação de Serial+IMEI acima */}
                  <button onClick={() => setDetailProduct(null)} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
                </div>
              </div>
              {/* Produto — editável para pendências */}
              <div className={`mx-4 mt-4 p-4 rounded-xl border ${mSec}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 mr-3">
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Produto (modelo + memoria) {saved("produto")}</p>
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={p.produto}
                        onBlur={async (e) => {
                          const val = e.target.value.trim().toUpperCase();
                          if (val && val !== p.produto) {
                            await apiPatch(p.id, { produto: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, produto: val } : x));
                            setDetailProduct({ ...p, produto: val });
                            showSaved("produto");
                          }
                        }}
                        className={`w-full text-[15px] font-bold mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    ) : (<>
                      <p className={`text-[16px] font-bold ${mP} mt-0.5`}>
                        {formatProdutoDisplay(p)}
                        {(() => {
                          const en = corEnOriginal(p.cor);
                          const pt = p.cor ? corParaPT(p.cor) : "";
                          if (!en || (pt && en.toLowerCase() === pt.toLowerCase())) return null;
                          return <span className={`ml-2 text-[13px] font-normal ${mS}`}>{en}</span>;
                        })()}
                      </p>
                      {p.categoria === "APPLE_WATCH" && (() => {
                        const { tamanho, pulseira } = extractWatchBadges(p.produto);
                        if (!tamanho && !pulseira) return null;
                        return (
                          <div className="flex gap-1.5 mt-1">
                            {tamanho && <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#E5E5EA] text-[#636366]"}`}>{tamanho}</span>}
                            {pulseira && <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${dm ? "bg-[#2C2C2E] text-[#8E8E93]" : "bg-[#F2F2F7] text-[#8E8E93]"}`}>{pulseira}</span>}
                          </div>
                        );
                      })()}
                    </>)}
                  </div>
                  <div className="text-right"><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Status</p><span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${p.status === "EM ESTOQUE" ? "bg-green-100 text-green-700" : p.status === "A CAMINHO" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>{p.status}</span></div>
                </div>
                {/* Vincular ao catálogo — para pendências */}
                {canEdit && (
                  <div className="mb-3">
                    <button
                      onClick={() => {
                        if (!recatMode) {
                          // Pre-popular spec a partir do nome atual (modelo/storage/ram/chip/nucleos)
                          const base = createEmptyProdutoRow();
                          const baseCat = getBaseCat(p.categoria || "IPHONES");
                          const nome = (p.produto || "").toUpperCase();
                          const spec = { ...base.spec };
                          const storageMatch = nome.match(/(\d+(?:GB|TB))/);
                          const ramMatch = nome.match(/(\d+GB)\s+\d+(?:GB|TB)/); // RAM antes do storage
                          const nucleosMatch = nome.match(/\((\d+C?\s*CPU\/\d+C?\s*GPU)\)/i);
                          const telaMatch = nome.match(/(\d{2}")/);
                          if (baseCat === "IPHONES") {
                            if (storageMatch) spec.ip_storage = storageMatch[1];
                            const modMatch = nome.match(/IPHONE\s+([0-9A-Z\s]+?)(?:\s+\d+(?:GB|TB)|$)/);
                            if (modMatch) spec.ip_modelo = modMatch[1].trim();
                          } else if (baseCat === "MACBOOK") {
                            if (nome.includes("AIR")) spec.mb_modelo = "AIR";
                            else if (nome.includes("NEO")) spec.mb_modelo = "NEO";
                            else if (nome.includes("PRO")) spec.mb_modelo = "PRO";
                            const chipMatch = nome.match(/\b(M[1-9](?:\s+PRO|\s+MAX)?)\b/);
                            if (chipMatch) spec.mb_chip = chipMatch[1];
                            if (telaMatch) spec.mb_tela = telaMatch[1];
                            if (ramMatch) spec.mb_ram = ramMatch[1];
                            if (storageMatch) spec.mb_storage = storageMatch[1];
                            if (nucleosMatch) spec.mb_nucleos = nucleosMatch[1];
                          }
                          setRecatRow({ ...base, categoria: baseCat || p.categoria || "IPHONES", spec, cor: p.cor || "" });
                          setRecatMode(true);
                        } else {
                          setRecatMode(false);
                        }
                      }}
                      className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                        recatMode
                          ? "bg-[#E8740E]/10 border-[#E8740E]/40 text-[#E8740E]"
                          : `border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E] hover:text-[#E8740E]`
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                      {recatMode ? "Fechar catálogo" : "Vincular ao catálogo"}
                    </button>
                    {recatMode && (
                      <div className={`mt-2 p-3 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                        <p className={`text-[11px] ${mS} mb-3`}>Selecione o modelo correto para gerar o nome estruturado:</p>
                        <ProdutoSpecFields
                          row={recatRow}
                          onChange={setRecatRow}
                          onRemove={() => setRecatMode(false)}
                          fornecedores={[]}
                          inputCls={`text-[13px] w-full px-2 py-1.5 rounded-lg border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                          labelCls={`text-[10px] font-semibold uppercase tracking-wider ${mS} mb-0.5 block`}
                          darkMode={dm}
                          index={0}
                          compactMode
                        />
                        {recatRow.produto && (
                          <div className={`mt-2 p-2.5 rounded-lg ${dm ? "bg-[#2C2C2E]" : "bg-[#F0F0F5]"}`}>
                            <p className={`text-[10px] ${mS}`}>Novo nome gerado:</p>
                            <p className={`text-[13px] font-bold ${mP} mt-0.5`}>{recatRow.produto}</p>
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            // Gerar nome sem ip_origem (origin não deve aparecer no nome de seminovos/pendentes)
                            const specSemOrigem = { ...recatRow.spec, ip_origem: "" };
                            const novoNome = buildProdutoNameFromSpec(recatRow.categoria, specSemOrigem, recatRow.cor) || recatRow.produto;
                            if (!novoNome) { setMsg("Selecione o modelo para gerar o nome"); return; }
                            const novaCor = recatRow.cor || null;
                            const novaCategoria = recatRow.categoria || p.categoria;
                            // Salvar nucleos na observacao se MacBook/Mac Mini
                            const specNucleos = recatRow.spec?.mb_nucleos || recatRow.spec?.mm_nucleos || "";
                            let novaObs = p.observacao || "";
                            if (specNucleos) {
                              novaObs = novaObs.replace(/\s*\[NUCLEOS:[^\]]+\]/gi, "").trim();
                              novaObs = (novaObs + ` [NUCLEOS:${specNucleos}]`).trim();
                            }
                            try {
                              const nomeAntigo = p.produto;
                              const patchData: Record<string, unknown> = { produto: novoNome, categoria: novaCategoria, cor: novaCor };
                              if (specNucleos) patchData.observacao = novaObs;
                              await apiPatch(p.id, patchData);
                              const updatedFields = { produto: novoNome, categoria: novaCategoria, cor: novaCor, ...(specNucleos ? { observacao: novaObs } : {}) };
                              setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, ...updatedFields } : x));
                              setDetailProduct(prev => prev ? { ...prev, ...updatedFields } : null);
                              let vendaMsg = "";
                              if (p.fornecedor) {
                                const res = await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
                                  body: JSON.stringify({ action: "sync_by_cliente_data", cliente: p.fornecedor, data_compra: p.data_entrada || p.data_compra, produto_antigo: nomeAntigo, produto: novoNome, cor: novaCor, categoria: novaCategoria }),
                                });
                                const json = await res.json();
                                vendaMsg = json.updated > 0 ? ` ${json.updated} venda(s) sincronizada(s).` : " Nenhuma venda vinculada encontrada.";
                              }
                              setMsg(`✅ Produto recategorizado!${vendaMsg}`);
                              setRecatMode(false);
                            } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
                          }}
                          disabled={!recatRow.produto}
                          className="mt-2 w-full py-2 rounded-xl text-sm font-bold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ✓ Aplicar e sincronizar venda
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {/* Origem — para iPhones: admin/pendências editam, outros visualizam */}
                {p.categoria === "IPHONES" && (isAdmin || canEdit || p.origem) && (
                  <div className="mb-3">
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Origem{(isAdmin || canEdit) ? " (opcional)" : ""} {saved("origem")}</p>
                    {(isAdmin || canEdit) ? (
                      <select
                        value={p.origem ?? ""}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          try {
                            await apiPatch(p.id, { origem: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, origem: val } : x));
                            setDetailProduct(prev => prev ? { ...prev, origem: val } : null);
                            showSaved("origem");
                          } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
                        }}
                        className={`w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      >
                        <option value="">— Sem origem —</option>
                        {IPHONE_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                        {/* Fallback: se o valor salvo no banco não bate com nenhum option canônico
                            (ex: formatação antiga / vinda de outro fluxo), renderiza ele mesmo
                            como uma opção extra para o select conseguir exibi-lo. */}
                        {p.origem && !IPHONE_ORIGENS.includes(p.origem) && (
                          <option value={p.origem}>{p.origem}</option>
                        )}
                      </select>
                    ) : (
                      <p className={`text-[13px] ${mP} mt-0.5`}>{p.origem}</p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {(() => {
                    const qnt = p.qnt || 1;
                    const needsMultiple = (isAdmin || isPendente) && !p.serial_no && qnt > 1;
                    const pencilIco = <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>;
                    const inpCls = `text-[13px] font-mono px-2 py-1.5 rounded-lg border w-full ${dm ? "bg-[#1C1C1E] border-[#0071E3] text-[#F5F5F7]" : "bg-white border-[#0071E3] text-[#1D1D1F]"} focus:outline-none`;
                    if (needsMultiple) {
                      /* ── Múltiplas unidades: serial + IMEI por aparelho ── */
                      return (
                        <div className="col-span-2">
                          <button
                            onClick={() => setEditingDetailSerial(v => !v)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${editingDetailSerial ? "bg-[#E8740E] text-white border-[#E8740E]" : `${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"}`}`}
                          >
                            {editingDetailSerial ? "▲ Fechar" : "▼ Registrar seriais e IMEIs"} ({qnt} aparelhos)
                          </button>
                          {editingDetailSerial && (
                            <div className="mt-3 space-y-2">
                              {/* Header */}
                              <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                                <span className={`text-[10px] uppercase ${mS} w-16`}></span>
                                <span className={`text-[10px] uppercase font-semibold ${mS}`}>Serial</span>
                                <span className={`text-[10px] uppercase font-semibold ${mS}`}>IMEI</span>
                              </div>
                              {Array.from({ length: qnt }, (_, i) => (
                                <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                                  <span className={`text-[11px] font-semibold ${mS} w-16`}>#{i + 1}</span>
                                  <input
                                    id={`detail-serial-${p.id}-${i}`}
                                    placeholder="Serial"
                                    style={{ textTransform: "uppercase" }}
                                    onPaste={(e) => handleSerialPaste(e, (v) => { const el = document.getElementById(`detail-serial-${p.id}-${i}`) as HTMLInputElement; if (el) el.value = v; }, setOcrLoading)}
                                    className={`text-[13px] font-mono px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                                  />
                                  <input
                                    id={`detail-imei-${p.id}-${i}`}
                                    placeholder="IMEI"
                                    className={`text-[13px] font-mono px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                                  />
                                </div>
                              ))}
                              <button onClick={async () => {
                                type UnitData = { serial: string; imei: string };
                                const units: UnitData[] = [];
                                for (let i = 0; i < qnt; i++) {
                                  const sEl = document.getElementById(`detail-serial-${p.id}-${i}`) as HTMLInputElement;
                                  const iEl = document.getElementById(`detail-imei-${p.id}-${i}`) as HTMLInputElement;
                                  const serial = sEl?.value?.trim().toUpperCase() || "";
                                  const imei = iEl?.value?.trim() || "";
                                  if (serial || imei) units.push({ serial, imei });
                                }
                                if (units.length === 0) { setMsg("Preencha pelo menos 1 serial ou IMEI."); return; }
                                const remaining = qnt - units.length;
                                try {
                                  await apiPatch(p.id, { serial_no: units[0].serial || null, imei: units[0].imei || null, qnt: 1 });
                                  for (let i = 1; i < units.length; i++) {
                                    await fetch("/api/estoque", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
                                      body: JSON.stringify({
                                        produto: p.produto, categoria: p.categoria, qnt: 1,
                                        custo_unitario: p.custo_unitario, cor: p.cor, fornecedor: p.fornecedor,
                                        serial_no: units[i].serial || null, imei: units[i].imei || null,
                                        tipo: p.tipo, status: p.status,
                                        data_compra: p.data_compra, data_entrada: p.data_entrada, pedido_fornecedor_id: p.pedido_fornecedor_id,
                                      }),
                                    });
                                  }
                                  if (remaining > 0) {
                                    await fetch("/api/estoque", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
                                      body: JSON.stringify({
                                        produto: p.produto, categoria: p.categoria, qnt: remaining,
                                        custo_unitario: p.custo_unitario, cor: p.cor, fornecedor: p.fornecedor,
                                        tipo: p.tipo, status: p.status,
                                        data_compra: p.data_compra, data_entrada: p.data_entrada, pedido_fornecedor_id: p.pedido_fornecedor_id,
                                      }),
                                    });
                                  }
                                  setMsg(`✅ ${units.length} aparelho(s) registrado(s)!${remaining > 0 ? ` ${remaining} sem serial/IMEI mantidos.` : ""}`);
                                  setDetailProduct(null);
                                  await fetchEstoque();
                                } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
                              }} className="w-full py-2 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors mt-1">
                                💾 Salvar aparelhos
                              </button>
                              <p className={`text-[10px] text-center ${mS}`}>Deixe em branco os que não tiver. Eles ficam agrupados sem serial/IMEI.</p>
                            </div>
                          )}
                        </div>
                      );
                    }
                    /* ── 1 unidade ── */
                    return (<>
                      {(p.serial_no || isAdmin || isPendente) && (
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Numero de Serie {saved("serial")}</p>
                          {isPendente ? (
                            /* Campo direto para produtos pendentes — salva ao pressionar ✓ ou Enter */
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                id={`serial-single-${p.id}`}
                                type="text"
                                defaultValue={p.serial_no || ""}
                                placeholder="Digitar S/N"
                                style={{ textTransform: "uppercase" }}
                                onPaste={(e) => handleSerialPaste(e, (v) => { const el = document.getElementById(`serial-single-${p.id}`) as HTMLInputElement; if (el) el.value = v; }, setOcrLoading)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveSerial(); } }}
                                className={`flex-1 text-[13px] font-mono px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                              />
                              <button onMouseDown={(e) => e.preventDefault()} onClick={saveSerial} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm" title="Salvar serial">✓</button>
                            </div>
                          ) : isAdmin ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              {editingDetailSerial ? (
                                <>
                                  <input
                                    type="text"
                                    defaultValue={p.serial_no || ""}
                                    id={`edit-serial-${p.id}`}
                                    style={{ textTransform: "uppercase" }}
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value.toUpperCase().trim();
                                        await apiPatch(p.id, { serial_no: val || null });
                                        setDetailProduct({ ...p, serial_no: val || null });
                                        setEditingDetailSerial(false);
                                        setMsg("Serial atualizado!");
                                      }
                                      if (e.key === "Escape") setEditingDetailSerial(false);
                                    }}
                                    autoFocus
                                    className={`flex-1 text-[13px] font-mono px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                                  />
                                  <button onClick={async () => {
                                    const el = document.getElementById(`edit-serial-${p.id}`) as HTMLInputElement;
                                    const val = el?.value.toUpperCase().trim() || "";
                                    await apiPatch(p.id, { serial_no: val || null });
                                    setDetailProduct({ ...p, serial_no: val || null });
                                    setEditingDetailSerial(false);
                                    setMsg("Serial atualizado!");
                                  }} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm">✓</button>
                                  <button onClick={() => setEditingDetailSerial(false)} className={`shrink-0 ${mS} hover:text-red-500`}>✕</button>
                                </>
                              ) : (
                                <>
                                  <span className={`text-[13px] font-mono ${mP} flex-1`}>{p.serial_no || <span className={mS}>—</span>}</span>
                                  {p.serial_no && <button onClick={() => { navigator.clipboard.writeText(p.serial_no || ""); setMsg("Serial copiado"); }} className={`shrink-0 ${mS} hover:text-[#E8740E]`}>{cpIco}</button>}
                                  <button onClick={() => setEditingDetailSerial(true)} className={`shrink-0 ${mS} hover:text-[#E8740E]`} title="Editar serial">✏️</button>
                                </>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => { navigator.clipboard.writeText(p.serial_no || ""); setMsg("Serial copiado"); }} className={`text-[13px] font-mono ${mP} hover:text-[#E8740E] flex items-center gap-1.5 mt-0.5`}>{p.serial_no} {cpIco}</button>
                          )}
                        </div>
                      )}
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Condicao</p>
                        {(canEdit || isAdmin) ? (
                          <select
                            value={p.tipo === "NAO_ATIVADO" ? "NAO_ATIVADO" : isLac ? "NOVO" : "SEMINOVO"}
                            onChange={async (e) => {
                              const novo = e.target.value as "NOVO" | "SEMINOVO" | "NAO_ATIVADO";
                              try {
                                await apiPatch(p.id, { tipo: novo });
                                setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, tipo: novo } : x));
                                setDetailProduct({ ...p, tipo: novo });
                                showSaved("tipo");
                                setMsg(`Condição alterada para ${novo === "NOVO" ? "Lacrado" : novo === "NAO_ATIVADO" ? "Não Ativado" : "Usado"}`);
                              } catch (err) {
                                setMsg("❌ " + String(err instanceof Error ? err.message : err));
                              }
                            }}
                            className={`mt-0.5 text-[11px] font-semibold px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                          >
                            <option value="NOVO">🔵 Lacrado</option>
                            <option value="NAO_ATIVADO">🟣 Não Ativado</option>
                            <option value="SEMINOVO">🟡 Usado</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${p.tipo === "NAO_ATIVADO" ? "bg-purple-100 text-purple-700" : isLac ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{p.tipo === "NAO_ATIVADO" ? "Não Ativado" : isLac ? "Lacrado" : "Usado"}</span>
                        )}
                      </div>
                      {/* Caixa badge */}
                      {(p.observacao?.includes("[COM_CAIXA]") || /com\s+caixa/i.test(p.observacao || "")) && (
                        <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Caixa</p>
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 bg-green-100 text-green-700">📦 Com Caixa</span></div>
                      )}
                      {/* Cabo badge */}
                      {(p.observacao?.includes("[COM_CABO]") || /com\s+cabo/i.test(p.observacao || "")) && (
                        <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cabo</p>
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 bg-green-100 text-green-700">🔌 Com Cabo</span></div>
                      )}
                      {/* Carregador badge */}
                      {(p.observacao?.includes("[COM_FONTE]") || /com\s+(fonte|carregador)/i.test(p.observacao || "")) && (
                        <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Carregador</p>
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 bg-green-100 text-green-700">🔋 Com Carregador</span></div>
                      )}
                      {/* Apple Watch: tamanho + pulseira info */}
                      {p.categoria === "APPLE_WATCH" && (() => {
                        const { tamanho, pulseira: pulseiraFromName } = extractWatchBadges(p.produto);
                        const pulseiraTam = p.observacao?.match(/\[PULSEIRA_TAM:([^\]]+)\]/)?.[1];
                        const bandModel = p.observacao?.match(/\[BAND:([^\]]+)\]/)?.[1] || pulseiraFromName;
                        return (<>
                          {tamanho && <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Tamanho</p>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#E5E5EA] text-[#636366]"}`}>⌚ {tamanho}</span></div>}
                          {pulseiraTam && <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Tamanho Pulseira</p>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#E5E5EA] text-[#636366]"}`}>{pulseiraTam}</span></div>}
                          {bandModel && <div className="col-span-2"><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Modelo Pulseira</p>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${dm ? "bg-[#2C2C2E] text-[#8E8E93]" : "bg-[#F2F2F7] text-[#8E8E93]"}`}>{bandModel}</span></div>}
                        </>);
                      })()}
                      {/* Ciclos badge */}
                      {(() => {
                        const ciclos = p.observacao?.match(/\[CICLOS:(\d+)\]/)?.[1];
                        if (!ciclos) return null;
                        return <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Ciclos</p>
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 bg-blue-100 text-blue-700">🔄 {ciclos} ciclos</span></div>;
                      })()}
                      {/* Grade badge — detecta tag [GRADE_X] ou texto livre */}
                      {(() => {
                        const GRADE_TAG: Record<string, string> = { "A+": "A+", A: "A", AB: "AB", B: "B" };
                        const tagKey = p.observacao?.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
                        const g = tagKey ? GRADE_TAG[tagKey]
                          : p.observacao?.match(/\bGRADE\s*(A\+|AB|A|B)\b/i)?.[1]?.toUpperCase();
                        if (!g) return null;
                        const cls = g === "A+" ? "bg-amber-100 text-amber-700"
                          : g === "A" ? "bg-green-100 text-green-700"
                          : g === "AB" ? "bg-yellow-100 text-yellow-700"
                          : "bg-orange-100 text-orange-700";
                        return <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Grade</p>
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${cls}`}>Grade {g}</span></div>;
                      })()}
                      {/* Origem para categorias não-iPhone (se existir) */}
                      {p.origem && p.categoria !== "IPHONES" && <div className="col-span-2"><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Origem</p><p className={`text-[13px] ${mP} mt-0.5`}>{p.origem}</p></div>}
                    </>);
                  })()}
                  {/* Cor — dropdown pelo catálogo da categoria */}
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cor {saved("cor")}</p>
                    {(canEdit || isAdmin) ? (() => {
                      // Cores: prioriza configs do catálogo por modelo, senão fallback genérico
                      const coresKey = p.categoria === "APPLE_WATCH" ? "cores_aw" : "cores";
                      const catalogCores = detailModelConfigs[coresKey];
                      const coresCat = catalogCores?.length ? catalogCores
                        : p.categoria === "IPHONES"
                          ? getIphoneCores(p.produto?.match(/IPHONE\s+(\d+[A-Z\s]*)/i)?.[1]?.trim().toUpperCase() || "")
                          : CORES_POR_CATEGORIA[p.categoria || ""] || [];
                      return coresCat.length > 0 ? (
                        <select
                          value={p.cor || ""}
                          onChange={async (e) => {
                            const val = e.target.value || null;
                            // Se o nome do produto contém a cor antiga, substituir pela nova
                            let newProduto = p.produto;
                            if (p.cor && p.produto) {
                              const oldCorUpper = p.cor.toUpperCase();
                              const prodUpper = p.produto.toUpperCase();
                              if (prodUpper.includes(oldCorUpper)) {
                                newProduto = val
                                  ? p.produto.replace(new RegExp(oldCorUpper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), val.toUpperCase())
                                  : p.produto.replace(new RegExp("\\s*" + oldCorUpper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "");
                              }
                            }
                            const updates: Record<string, unknown> = { cor: val };
                            if (newProduto !== p.produto) updates.produto = newProduto;
                            await apiPatch(p.id, updates);
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, cor: val, produto: newProduto } : x));
                            setDetailProduct({ ...p, cor: val, produto: newProduto });
                            showSaved("cor");
                          }}
                          className={`w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        >
                          <option value="">— Selecionar —</option>
                          {p.cor && !coresCat.includes(p.cor) && <option key={p.cor} value={p.cor}>{p.cor}{COR_EN_TO_PT[p.cor.toUpperCase()] ? ` · ${COR_EN_TO_PT[p.cor.toUpperCase()]}` : ""}</option>}
                          {coresCat.map((c) => <option key={c} value={c}>{c}{COR_EN_TO_PT[c] ? ` · ${COR_EN_TO_PT[c]}` : ""}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          defaultValue={p.cor || ""}
                          placeholder="Ex: TITANIO NATURAL"
                          onBlur={async (e) => {
                            const val = e.target.value.trim().toUpperCase() || null;
                            if (val !== (p.cor || null)) {
                              await apiPatch(p.id, { cor: val });
                              setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, cor: val } : x));
                              setDetailProduct({ ...p, cor: val });
                              showSaved("cor");
                            }
                          }}
                          className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        />
                      );
                    })() : p.cor ? (
                      <p className={`text-[13px] ${mP} mt-0.5`}>{corBilingual(p.cor)}</p>
                    ) : null}
                  </div>
                  {canEdit && getBaseCat(p.categoria || "") === "MACBOOK" && (() => {
                    // Núcleos NÃO vive no nome — guardado como tag [NUCLEOS:...] na observacao
                    const cleanNome = (p.produto || "").replace(/\s*\([^)]*CPU\/[^)]*GPU\)\s*/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
                    const storages: string[] = [];
                    cleanNome.replace(/\b(\d+(?:GB|TB))\b/g, (m) => { storages.push(m); return m; });
                    const curRam = storages[storages.length - 2] || "";
                    const curSsd = storages[storages.length - 1] || "";
                    const telaMatch = cleanNome.match(/(\d{2}")/);
                    const curTela = telaMatch ? telaMatch[1] : "";
                    const obsRaw = p.observacao || "";
                    const nucTagMatch = obsRaw.match(/\[NUCLEOS:([^\]]+)\]/i);
                    // Fallback: se ainda tem no nome antigo, ler de lá
                    const nucNomeMatch = (p.produto || "").match(/\((\d+C?\s*CPU\/\d+C?\s*GPU)\)/i);
                    const curNucleos = nucTagMatch ? nucTagMatch[1].trim() : (nucNomeMatch ? nucNomeMatch[1] : "");
                    const stripNucFromName = (s: string) => s.replace(/\s*\([^)]*CPU\/[^)]*GPU\)\s*/gi, " ").replace(/\s+/g, " ").trim();
                    const updateMacbookField = async (field: "ram" | "ssd" | "tela" | "nucleos", val: string) => {
                      let novo = stripNucFromName(p.produto || "");
                      let novaObs = obsRaw;
                      if (field === "ram") {
                        if (curRam) novo = novo.replace(new RegExp(`\\b${curRam}\\b(?=\\s+\\d+(?:GB|TB)\\b)`), val || curRam);
                      } else if (field === "ssd") {
                        if (curSsd) novo = novo.replace(new RegExp(`\\b${curSsd}\\b(?!.*\\b\\d+(?:GB|TB)\\b)`), val || curSsd);
                      } else if (field === "tela") {
                        if (curTela) novo = novo.replace(new RegExp(`${curTela.replace('"','\\"')}`), val || curTela);
                        else if (val) {
                          // insere tela após o chip (M1/M2/.../Mx)
                          novo = novo.replace(/(\bM[1-9](?:\s+PRO|\s+MAX)?\b)/i, `$1 ${val}`);
                        }
                      } else if (field === "nucleos") {
                        // Remove tag antiga e insere nova (se val)
                        novaObs = novaObs.replace(/\s*\[NUCLEOS:[^\]]+\]/gi, "").trim();
                        if (val) novaObs = (novaObs + ` [NUCLEOS:${val}]`).trim();
                      }
                      novo = novo.trim();
                      const updates: Record<string, unknown> = { produto: novo };
                      if (field === "nucleos" || novaObs !== obsRaw) updates.observacao = novaObs || null;
                      await apiPatch(p.id, updates);
                      setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, produto: novo, observacao: (updates.observacao as string | null) ?? x.observacao } : x));
                      setDetailProduct({ ...p, produto: novo, observacao: (updates.observacao as string | null) ?? p.observacao });
                      showSaved(field);
                    };
                    const selCls = `w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`;
                    // Sincroniza com o catálogo
                    const ramList = (detailModelConfigs.ram?.length ? detailModelConfigs.ram : MACBOOK_RAMS);
                    const ssdList = (detailModelConfigs.ssd?.length ? detailModelConfigs.ssd : MACBOOK_STORAGES);
                    const telaList = (detailModelConfigs.telas?.length ? detailModelConfigs.telas : ['13"', '14"', '15"', '16"']);
                    // Sempre usar lista completa de nucleos (nao limitar pelo catalogo)
                    const nucleosList = MACBOOK_NUCLEOS;
                    return (
                      <>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Núcleos {saved("nucleos")}</p>
                          <select value={curNucleos} onChange={(e) => updateMacbookField("nucleos", e.target.value)} className={selCls}>
                            <option value="">— Não informar —</option>
                            {curNucleos && !nucleosList.includes(curNucleos) && <option value={curNucleos}>{curNucleos}</option>}
                            {nucleosList.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Tela {saved("tela")}</p>
                          <select value={curTela} onChange={(e) => updateMacbookField("tela", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curTela && !telaList.includes(curTela) && <option value={curTela}>{curTela}</option>}
                            {telaList.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>RAM {saved("ram")}</p>
                          <select value={curRam} onChange={(e) => updateMacbookField("ram", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curRam && !ramList.includes(curRam) && <option value={curRam}>{curRam}</option>}
                            {ramList.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>SSD {saved("ssd")}</p>
                          <select value={curSsd} onChange={(e) => updateMacbookField("ssd", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curSsd && !ssdList.includes(curSsd) && <option value={curSsd}>{curSsd}</option>}
                            {ssdList.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </>
                    );
                  })()}
                  {canEdit && getBaseCat(p.categoria || "") === "MAC_MINI" && (() => {
                    const cleanNome = (p.produto || "").replace(/=/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
                    const storages: string[] = [];
                    cleanNome.replace(/\b(\d+(?:GB|TB))\b/g, (m) => { storages.push(m); return m; });
                    const sorted = storages.map(s => ({ raw: s, gb: s.includes("TB") ? parseInt(s) * 1024 : parseInt(s) })).sort((a, b) => a.gb - b.gb);
                    const curRam = sorted.length >= 2 ? sorted[0].raw : "";
                    const curSsd = sorted.length >= 1 ? sorted[sorted.length - 1].raw : "";
                    const obsRaw = p.observacao || "";
                    const nucTagMatch = obsRaw.match(/\[NUCLEOS:([^\]]+)\]/i);
                    const curNucleos = nucTagMatch ? nucTagMatch[1].trim() : "";
                    const updateMmField = async (field: "ram" | "ssd" | "nucleos", val: string) => {
                      let novo = (p.produto || "").replace(/=/g, " ").replace(/\s+/g, " ").trim();
                      let novaObs = obsRaw;
                      if (field === "ram" && curRam) {
                        novo = novo.replace(new RegExp(`\\b${curRam}\\b`), val || curRam);
                      } else if (field === "ssd" && curSsd) {
                        // Substituir a última ocorrência de storage
                        const idx = novo.toUpperCase().lastIndexOf(curSsd);
                        if (idx >= 0) novo = novo.slice(0, idx) + (val || curSsd) + novo.slice(idx + curSsd.length);
                      } else if (field === "nucleos") {
                        novaObs = novaObs.replace(/\s*\[NUCLEOS:[^\]]+\]/gi, "").trim();
                        if (val) novaObs = (novaObs + ` [NUCLEOS:${val}]`).trim();
                      }
                      novo = novo.trim();
                      const updates: Record<string, unknown> = { produto: novo };
                      if (field === "nucleos" || novaObs !== obsRaw) updates.observacao = novaObs || null;
                      await apiPatch(p.id, updates);
                      setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, produto: novo, observacao: (updates.observacao as string | null) ?? x.observacao } : x));
                      setDetailProduct({ ...p, produto: novo, observacao: (updates.observacao as string | null) ?? p.observacao });
                      showSaved(field);
                    };
                    const selCls = `w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`;
                    const MM_SSDS = ["256GB", "512GB", "1TB", "2TB"];
                    return (
                      <>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Nucleos {saved("nucleos")}</p>
                          <select value={curNucleos} onChange={(e) => updateMmField("nucleos", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curNucleos && !MAC_MINI_NUCLEOS.includes(curNucleos) && <option value={curNucleos}>{curNucleos}</option>}
                            {MAC_MINI_NUCLEOS.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>RAM {saved("ram")}</p>
                          <select value={curRam} onChange={(e) => updateMmField("ram", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curRam && !MAC_MINI_RAMS.includes(curRam) && <option value={curRam}>{curRam}</option>}
                            {MAC_MINI_RAMS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>SSD {saved("ssd")}</p>
                          <select value={curSsd} onChange={(e) => updateMmField("ssd", e.target.value)} className={selCls}>
                            <option value="">— Selecionar —</option>
                            {curSsd && !MM_SSDS.includes(curSsd) && <option value={curSsd}>{curSsd}</option>}
                            {MM_SSDS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </>
                    );
                  })()}
                  {(p.imei || isAdmin || canEditImei) && !CATS_SEM_IMEI.includes(getBaseCat(p.categoria || "")) && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>IMEI {saved("imei")}</p>
                      {canEditImei ? (
                        /* Campo direto para produtos pendentes — salva ao pressionar ✓ ou Enter */
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            id={`imei-single-${p.id}`}
                            type="text"
                            defaultValue={p.imei || ""}
                            placeholder="Digitar IMEI"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveImei(); } }}
                            className={`flex-1 text-[13px] font-mono px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                          />
                          <button onMouseDown={(e) => e.preventDefault()} onClick={saveImei} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm" title="Salvar IMEI">✓</button>
                        </div>
                      ) : isAdmin ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[13px] font-mono ${mP} flex-1`}>{p.imei || <span className={mS}>—</span>}</span>
                          {p.imei && <button onClick={() => { navigator.clipboard.writeText(p.imei || ""); setMsg("IMEI copiado"); }} className={`shrink-0 ${mS} hover:text-[#E8740E]`}>{cpIco}</button>}
                        </div>
                      ) : p.imei ? (
                        <button onClick={() => { navigator.clipboard.writeText(p.imei || ""); setMsg("IMEI copiado"); }} className={`text-[13px] font-mono ${mP} hover:text-[#E8740E] flex items-center gap-1.5 mt-0.5`}>{p.imei} {cpIco}</button>
                      ) : null}
                    </div>
                  )}
                  {/* Bateria — só para seminovos/usados */}
                  {!isLac && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Bateria (%) {saved("bateria")}</p>
                      {(canEdit || isAdmin) ? (
                        <input
                          type="number"
                          min={0} max={100}
                          defaultValue={p.bateria || ""}
                          placeholder="Ex: 92"
                          onBlur={async (e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            if (val !== p.bateria) {
                              await apiPatch(p.id, { bateria: val });
                              setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, bateria: val } : x));
                              setDetailProduct({ ...p, bateria: val });
                              showSaved("bateria");
                            }
                          }}
                          className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        />
                      ) : p.bateria ? (
                        <p className={`text-[13px] ${mP} mt-0.5`}>{p.bateria}%</p>
                      ) : null}
                    </div>
                  )}
                  {/* Garantia — seminovos/usados */}
                  {!isLac && (p.garantia || isAdmin || canEdit) && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Garantia {saved("garantia")}</p>
                      {(canEdit || isAdmin) ? (() => {
                        const saveGarantia = async () => {
                          const el = document.getElementById(`garantia-${p.id}`) as HTMLInputElement;
                          const val = el?.value?.trim() || null;
                          if (val !== (p.garantia || null)) {
                            await apiPatch(p.id, { garantia: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, garantia: val } : x));
                            setDetailProduct({ ...p, garantia: val });
                            showSaved("garantia");
                          }
                        };
                        return (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            id={`garantia-${p.id}`}
                            type="text"
                            defaultValue={p.garantia || ""}
                            placeholder="DD/MM/AAAA ou MM/AAAA"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveGarantia(); } }}
                            className={`flex-1 text-[13px] px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                          />
                          <button
                            id={`garantia-btn-${p.id}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={saveGarantia}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
                            title="Salvar garantia"
                          >✓</button>
                        </div>);
                      })() : (
                        <p className={`text-[13px] ${mP} mt-0.5`}>{p.garantia}</p>
                      )}
                    </div>
                  )}
                  {/* Grade + Caixa + Cabo + Carregador */}
                  {!isLac && (canEdit || isAdmin) && (() => {
                    const GRADE_TAG: Record<string, string> = { "A+": "A+", A: "A", AB: "AB", B: "B" };
                    const tagKey = p.observacao?.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
                    const currentGrade = tagKey ? GRADE_TAG[tagKey]
                      : p.observacao?.match(/\bGRADE\s*(A\+|AB|A|B)\b/i)?.[1]?.toUpperCase() || "";
                    const hasCaixa = p.observacao?.includes("[COM_CAIXA]") || /com\s+caixa/i.test(p.observacao || "");
                    const hasCabo = p.observacao?.includes("[COM_CABO]") || /com\s+cabo/i.test(p.observacao || "");
                    const hasFonte = p.observacao?.includes("[COM_FONTE]") || /com\s+(fonte|carregador)/i.test(p.observacao || "");
                    const hasPulseira = p.observacao?.includes("[COM_PULSEIRA]") || /com\s+pulseira/i.test(p.observacao || "");
                    const currentCiclos = p.observacao?.match(/\[CICLOS:(\d+)\]/)?.[1] || "";
                    const selCls = `w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`;
                    const cat = p.categoria || "";
                    // Cabo: iPhones, MacBook, iPad, Apple Watch
                    const showCabo = ["IPHONES", "MACBOOK", "IPADS", "APPLE_WATCH"].includes(cat);
                    // Carregador: MacBook, iPad
                    const showCarregador = ["MACBOOK", "IPADS"].includes(cat);
                    // Pulseira: Apple Watch
                    const showPulseira = cat === "APPLE_WATCH";
                    // Ciclos: MacBook
                    const showCiclos = cat === "MACBOOK" && p.tipo !== "NOVO" && p.tipo !== "A_CAMINHO";
                    const getLatestObs = () => {
                      // Lê observacao mais recente do estado (não do closure stale)
                      const el = document.getElementById(`obs-${p.id}`) as HTMLTextAreaElement;
                      // Fallback: ler do estoque state
                      let latest = p.observacao || "";
                      setEstoque(prev => { const found = prev.find(x => x.id === p.id); if (found) latest = found.observacao || ""; return prev; });
                      return latest;
                    };
                    const toggleTag = async (tag: string, label: string, has: boolean, want: boolean) => {
                      if (want === has) return;
                      const obs = getLatestObs();
                      let newObs: string | null;
                      if (!want) {
                        newObs = obs.replace(`[${tag}]`, "").replace(/\s+/g, " ").trim() || null;
                      } else {
                        newObs = `${obs} [${tag}]`.trim();
                      }
                      await apiPatch(p.id, { observacao: newObs });
                      setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: newObs } : x));
                      setDetailProduct(prev => prev ? { ...prev, observacao: newObs } : null);
                      showSaved(tag.toLowerCase());
                    };
                    return (
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Grade {saved("grade")}</p>
                          <select value={currentGrade} onChange={async (e) => {
                            const newGrade = e.target.value;
                            const obs = getLatestObs();
                            const cleaned = obs
                              .replace(/\[GRADE_(A\+|AB|A|B)\]/g, "")
                              .replace(/\bGRADE\s*(A\+|AB|A|B)\b/gi, "")
                              .trim();
                            const gradeTag = newGrade ? `[GRADE_${newGrade}]` : "";
                            const finalObs = gradeTag ? `${cleaned} ${gradeTag}`.trim() : (cleaned || null);
                            await apiPatch(p.id, { observacao: finalObs });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: finalObs } : x));
                            setDetailProduct(prev => prev ? { ...prev, observacao: finalObs } : null);
                            showSaved("grade");
                          }} className={selCls}>
                            <option value="">— Sem grade —</option>
                            <option value="A+">A+</option>
                            <option value="A">A</option>
                            <option value="AB">AB</option>
                            <option value="B">B</option>
                          </select>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Caixa {saved("com_caixa")}</p>
                          <select value={hasCaixa ? "SIM" : "NAO"} onChange={(e) => toggleTag("COM_CAIXA", "Com caixa", hasCaixa, e.target.value === "SIM")} className={selCls}>
                            <option value="NAO">Sem caixa</option>
                            <option value="SIM">📦 Com caixa</option>
                          </select>
                        </div>
                        {showCabo && (
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cabo {saved("com_cabo")}</p>
                            <select value={hasCabo ? "SIM" : "NAO"} onChange={(e) => toggleTag("COM_CABO", "Com cabo", hasCabo, e.target.value === "SIM")} className={selCls}>
                              <option value="NAO">Sem cabo</option>
                              <option value="SIM">🔌 Com cabo</option>
                            </select>
                          </div>
                        )}
                        {showCarregador && (
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Carregador {saved("com_fonte")}</p>
                            <select value={hasFonte ? "SIM" : "NAO"} onChange={(e) => toggleTag("COM_FONTE", "Com carregador", hasFonte, e.target.value === "SIM")} className={selCls}>
                              <option value="NAO">Sem carregador</option>
                              <option value="SIM">🔋 Com carregador</option>
                            </select>
                          </div>
                        )}
                        {showCiclos && (
                          <div>
                            <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Ciclos de Bateria {saved("ciclos")}</p>
                            <input
                              type="number" min={0}
                              defaultValue={currentCiclos}
                              placeholder="Ex: 120"
                              onBlur={async (e) => {
                                const val = e.target.value.trim();
                                const obs = getLatestObs();
                                const cleaned = obs.replace(/\[CICLOS:\d+\]/g, "").trim();
                                const finalObs = val ? `${cleaned} [CICLOS:${val}]`.trim() : (cleaned || null);
                                if (finalObs !== obs) {
                                  await apiPatch(p.id, { observacao: finalObs });
                                  setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: finalObs } : x));
                                  setDetailProduct(prev => prev ? { ...prev, observacao: finalObs } : null);
                                  showSaved("ciclos");
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Apple Watch: Tamanho e Modelo de Pulseira — sempre visível */}
              {p.categoria === "APPLE_WATCH" && (canEdit || isAdmin) && (() => {
                const selCls = `w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`;
                const getLatestObs = () => { let latest = p.observacao || ""; setEstoque(prev => { const found = prev.find(x => x.id === p.id); if (found) latest = found.observacao || ""; return prev; }); return latest; };
                return (
                  <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                    <p className={`text-xs font-bold ${mP} mb-3`}>Pulseira</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Tamanho Pulseira {saved("pulseira_tam")}</p>
                        <select value={p.observacao?.match(/\[PULSEIRA_TAM:([^\]]+)\]/)?.[1] || ""} onChange={async (e) => {
                          const val = e.target.value;
                          const obs = getLatestObs();
                          const cleaned = obs.replace(/\[PULSEIRA_TAM:[^\]]+\]/g, "").trim();
                          const finalObs = val ? `${cleaned} [PULSEIRA_TAM:${val}]`.trim() : (cleaned || null);
                          await apiPatch(p.id, { observacao: finalObs });
                          setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: finalObs } : x));
                          setDetailProduct(prev => prev ? { ...prev, observacao: finalObs } : null);
                          showSaved("pulseira_tam");
                        }} className={selCls}>
                          <option value="">— Selecionar —</option>
                          <option value="S/M">S/M</option>
                          <option value="M/L">M/L</option>
                          <option value="One Size">One Size</option>
                        </select>
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Modelo Pulseira {saved("band_model")}</p>
                        <select value={p.observacao?.match(/\[BAND:([^\]]+)\]/)?.[1] || ""} onChange={async (e) => {
                          const val = e.target.value;
                          const obs = getLatestObs();
                          const cleaned = obs.replace(/\[BAND:[^\]]+\]/g, "").trim();
                          const finalObs = val ? `${cleaned} [BAND:${val}]`.trim() : (cleaned || null);
                          // Also update pulseira in product name to keep them in sync
                          const currentProduto = p.produto || "";
                          const nomeSemPulseira = currentProduto.replace(/\s*PULSEIRA\s+.*$/i, "").trim();
                          const novoProduto = val ? `${nomeSemPulseira} PULSEIRA ${val}`.toUpperCase() : nomeSemPulseira;
                          const updates: Record<string, unknown> = { observacao: finalObs };
                          if (novoProduto !== currentProduto) updates.produto = novoProduto;
                          await apiPatch(p.id, updates);
                          setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: finalObs, ...(novoProduto !== currentProduto ? { produto: novoProduto } : {}) } : x));
                          setDetailProduct(prev => prev ? { ...prev, observacao: finalObs, ...(novoProduto !== currentProduto ? { produto: novoProduto } : {}) } : null);
                          showSaved("band_model");
                        }} className={selCls}>
                          <option value="">— Selecionar —</option>
                          {WATCH_BAND_MODELS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Especificações */}
              {(() => {
                const obs = p.observacao || "";
                const nome = p.produto || "";
                const baseCat = getBaseCat(p.categoria || "IPHONES");
                const isSeminovo = p.categoria === "SEMINOVOS" || p.tipo === "SEMINOVO";
                const tag = (re: RegExp) => { const m = obs.match(re); return m ? m[1] : null; };
                const has = (re: RegExp) => re.test(obs);
                // Armazenamento (maior valor GB/TB do nome)
                const upNome = nome.toUpperCase();
                const memAll = [...upNome.matchAll(/(\d+)\s*(GB|TB)/g)].map(m => ({ raw: `${m[1]}${m[2]}`, gb: m[2] === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
                const armazenamento = memAll.length ? memAll.sort((a, b) => b.gb - a.gb)[0].raw : null;
                const gradeRaw = obs.match(/\[GRADE_(APLUS|AB|A|B)\]/);
                const grade = gradeRaw ? (gradeRaw[1] === "APLUS" ? "A+" : gradeRaw[1]) : null;
                const ciclos = tag(/\[CICLOS:(\d+)\]/);
                let ram = tag(/\[RAM:([^\]]+)\]/);
                let ssd = tag(/\[SSD:([^\]]+)\]/);
                // Limpar valores invalidos (ex: "=")
                if (ram && !/\d/.test(ram)) ram = null;
                if (ssd && !/\d/.test(ssd)) ssd = null;
                // Fallback: extrair RAM e SSD do nome (2 valores GB/TB → menor=RAM, maior=SSD)
                if ((!ram || !ssd) && (baseCat === "MACBOOK" || baseCat === "MAC_MINI")) {
                  const cleanNome = nome.replace(/=/g, " ");
                  const gbVals = [...cleanNome.matchAll(/(\d+)\s*(GB|TB)/gi)].map(m => ({
                    raw: `${m[1]}${m[2].toUpperCase()}`,
                    gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]),
                  })).sort((a, b) => a.gb - b.gb);
                  if (!ram && gbVals.length >= 2) ram = gbVals[0].raw;
                  if (!ssd && gbVals.length >= 1) ssd = gbVals[gbVals.length - 1].raw;
                }
                let cpu = tag(/\[CPU:([^\]]+)\]/);
                let gpu = tag(/\[GPU:([^\]]+)\]/);
                // Fallback 1: extrai de [NUCLEOS:6C CPU/5C GPU]
                if (!cpu || !gpu) {
                  const nucTag = obs.match(/\[NUCLEOS:(\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\]/i);
                  if (nucTag) { cpu = cpu || nucTag[1]; gpu = gpu || nucTag[2]; }
                }
                // Fallback 2: extrai do nome ex "(10C CPU/8C GPU)"
                if (!cpu || !gpu) {
                  const m = nome.match(/\((\d+)C?\s*CPU\s*\/\s*(\d+)C?\s*GPU\)/i);
                  if (m) { cpu = cpu || m[1]; gpu = gpu || m[2]; }
                }
                const tela = tag(/\[TELA:([^\]]+)\]/);
                const pulseiraTam = tag(/\[PULSEIRA_TAM:([^\]]+)\]/);
                const band = tag(/\[BAND:([^\]]+)\]/);
                const comCaixa = has(/\[COM_CAIXA\]/);
                const comCabo = has(/\[COM_CABO\]/);
                const comFonte = has(/\[COM_FONTE\]/);
                // Inferências do nome
                const telaNome = nome.match(/\b(11|13|14|15|16)["”]/);
                const isCellular = /CELLULAR|CEL\b|\+CEL/i.test(nome);
                const isWifi = /WI-?FI|WIFI/i.test(nome) && !isCellular;
                const isGps = /\bGPS\b/i.test(nome);
                const tamMm = nome.match(/(\d{2})\s?MM/i);
                const origemM = nome.match(/\b(LL|JPA|HN|IN|BR)\b\s*$/i);
                const origem = origemM ? origemM[1].toUpperCase() : null;
                const bateriaM = nome.match(/(\d{2,3})\s?%/);
                const bateria = bateriaM ? bateriaM[1] + "%" : null;
                const telaFinal = tela || (telaNome ? telaNome[1] + '"' : null);

                const rows: Array<[string, string]> = [];
                const push = (l: string, v: string | null | undefined) => { if (v) rows.push([l, v]); };

                if (baseCat === "IPHONES") {
                  push("Armazenamento", armazenamento);
                  push("Cor", p.cor ? corParaPT(p.cor) : null);
                  push("Origem", origem);
                  push("Bateria", bateria);
                  if (isSeminovo) {
                    push("Caixa", comCaixa ? "Com Caixa" : "Sem Caixa");
                    push("Cabo", comCabo ? "Com Cabo" : "Sem Cabo");
                  } else {
                    push("Caixa", comCaixa ? "Sim" : null);
                    push("Cabo", comCabo ? "Sim" : null);
                  }
                  push("Grade", grade);
                } else if (baseCat === "IPADS") {
                  push("Tamanho", telaFinal);
                  push("Armazenamento", armazenamento);
                  push("Cor", p.cor ? corParaPT(p.cor) : null);
                  push("Conectividade", isCellular ? "Wi-Fi + Cellular" : (isWifi ? "Wi-Fi" : null));
                  push("Bateria", bateria);
                  push("Caixa", comCaixa ? "Sim" : null);
                  push("Cabo", comCabo ? "Sim" : null);
                  push("Fonte", comFonte ? "Sim" : null);
                  push("Grade", grade);
                } else if (baseCat === "MACBOOK") {
                  push("Tamanho", telaFinal);
                  push("RAM", ram);
                  push("SSD", ssd);
                  const mbChipName = nome.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?|A\d+\s*PRO)/i)?.[1] || (() => {
                    if (cpu && gpu) {
                      const c = parseInt(cpu), g = parseInt(gpu);
                      if (c === 8 && (g === 8 || g === 10)) return "M4";
                      if (c === 10 && g === 10) return "M4";
                      if (c === 12 && (g === 16 || g === 19)) return "M4 Pro";
                      if (c === 14 && g === 20) return "M4 Pro";
                      if (c === 16 && g === 40) return "M4 Max";
                      if (c === 6 && g === 5) return "A18 Pro";
                      if (c === 8 && g === 7) return "M3";
                      if (c === 11 && g === 14) return "M3 Pro";
                      if (c === 12 && g === 18) return "M3 Pro";
                      if (c === 14 && g === 30) return "M3 Max";
                    }
                    // Fallback: Neo = A18 Pro
                    if (/NEO/i.test(nome)) return "A18 Pro";
                    return null;
                  })();
                  const nucleos = cpu && gpu ? `${cpu}C CPU / ${gpu}C GPU` : null;
                  push("Chip", mbChipName && nucleos ? `${mbChipName} (${nucleos})` : mbChipName || nucleos);
                  push("Cor", p.cor ? corParaPT(p.cor) : null);
                  push("Ciclos de bateria", ciclos);
                  push("Grade", grade);
                } else if (baseCat === "MAC_MINI") {
                  push("RAM", ram);
                  push("SSD", ssd);
                  const mmChipName = nome.match(/(M\d+\s*(?:PRO|MAX|ULTRA)?)/i)?.[1] || (() => {
                    if (!cpu || !gpu) return null;
                    const c = parseInt(cpu), g = parseInt(gpu);
                    if (c === 10 && g === 10) return "M4";
                    if (c === 12 && g === 16) return "M4 Pro";
                    if (c === 14 && g === 20) return "M4 Pro";
                    if (c === 16 && g === 40) return "M4 Max";
                    if (c === 10 && g === 8) return "M4";
                    if (c === 8 && g === 10) return "M3";
                    if (c === 12 && g === 18) return "M3 Pro";
                    return null;
                  })();
                  const mmNucleos = cpu && gpu ? `${cpu}C CPU / ${gpu}C GPU` : null;
                  push("Chip", mmChipName && mmNucleos ? `${mmChipName} (${mmNucleos})` : mmChipName || mmNucleos);
                  push("Cor", p.cor ? corParaPT(p.cor) : null);
                } else if (baseCat === "APPLE_WATCH") {
                  push("Tamanho", tamMm ? tamMm[1] + "mm" : null);
                  push("Conectividade", isCellular ? "GPS + Cellular" : (isGps ? "GPS" : null));
                  push("Cor", p.cor ? corParaPT(p.cor) : null);
                  push("Modelo da pulseira", band);
                  push("Tamanho da pulseira", pulseiraTam);
                  push("Caixa", comCaixa ? "Sim" : null);
                  push("Cabo", comCabo ? "Sim" : null);
                  push("Carregador", has(/\[CARREGADOR\]/) ? "Sim" : null);
                  push("Grade", grade);
                } else {
                  // Outros: tudo que não foi parseado em tags conhecidas
                  const limpo = obs.replace(/\[[^\]]*\]/g, "").trim();
                  if (limpo) push("Observação", limpo);
                }
                if (rows.length === 0 && !(canEdit && isAdmin)) return null;
                // Helper para reescrever tag no observacao
                const setTag = async (tagName: string, value: string | null) => {
                  let newObs = (p.observacao || "").replace(new RegExp(`\\[${tagName}:[^\\]]*\\]`, "g"), "").trim();
                  if (value && value.trim()) newObs = `${newObs} [${tagName}:${value.trim()}]`.trim();
                  await apiPatch(p.id, { observacao: newObs });
                  setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: newObs } : x));
                  setDetailProduct({ ...p, observacao: newObs });
                  showSaved("spec");
                };
                const editableTags: { label: string; tag: string; current: string }[] = [];
                // MacBook e Mac Mini: editados via dropdowns acima (Nucleos/Tela/RAM/SSD)
                // Apenas iPad usa editableTags para tela
                if (baseCat === "IPADS") editableTags.push({ label: "Tamanho (tela)", tag: "TELA", current: tela || "" });
                if (baseCat === "APPLE_WATCH") {
                  editableTags.push({ label: "Modelo da pulseira", tag: "BAND", current: band || "" });
                  editableTags.push({ label: "Tamanho da pulseira", tag: "PULSEIRA_TAM", current: pulseiraTam || "" });
                }
                return (
                  <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                    <p className={`text-xs font-bold ${mP} mb-3`}>Especificações</p>
                    {rows.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {rows.map(([label, value]) => {
                          // Cor: mostrar PT principal + EN canônico em cinza
                          if (label === "Cor" && p.cor) {
                            const en = corEnOriginal(p.cor);
                            const pt = corParaPT(p.cor);
                            return (
                              <div key={label}>
                                <p className={`text-[10px] uppercase tracking-wider ${mS}`}>{label}</p>
                                <p className={`text-[13px] font-bold mt-0.5 ${mP}`}>
                                  {pt}
                                  {en && en.toLowerCase() !== pt.toLowerCase() && (
                                    <span className={`ml-1.5 text-[11px] font-normal ${mS}`}>{en}</span>
                                  )}
                                </p>
                              </div>
                            );
                          }
                          return (
                            <div key={label}>
                              <p className={`text-[10px] uppercase tracking-wider ${mS}`}>{label}</p>
                              <p className={`text-[13px] font-bold mt-0.5 ${mP}`}>{value}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {canEdit && isAdmin && editableTags.length > 0 && (
                      <>
                        <p className={`text-[10px] uppercase tracking-wider mt-4 mb-2 ${mS}`}>Editar (admin)</p>
                        <div className="grid grid-cols-2 gap-3">
                          {editableTags.map(({ label, tag, current }) => (
                            <div key={tag}>
                              <p className={`text-[10px] uppercase tracking-wider ${mS}`}>{label}</p>
                              <input
                                defaultValue={current}
                                placeholder="—"
                                onBlur={(e) => { const v = e.target.value.trim(); if (v !== current) setTag(tag, v || null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className={`w-full text-[13px] font-bold mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
              {/* Financeiro */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Informacoes Financeiras</p>
                <div className={`grid ${canEdit && isAdmin ? "grid-cols-4" : "grid-cols-3"} gap-3`}>
                  {canEdit && isAdmin && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Quantidade</p>
                      <input
                        type="number" min={0}
                        defaultValue={p.qnt}
                        onBlur={async (e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 0 && val !== p.qnt) {
                            await handleUpdateQnt(p, val);
                            setDetailProduct({ ...p, qnt: val });
                            showSaved("qnt");
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className={`w-full text-[14px] font-bold mt-0.5 px-2 py-1 rounded-lg border text-center ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    </div>
                  )}
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Preco de Compra</p>
                    {canEdit && isAdmin ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[13px] ${mS}`}>R$</span>
                        <input
                          type="text" inputMode="numeric"
                          defaultValue={p.custo_unitario ? String(p.custo_unitario) : ""}
                          placeholder="0"
                          onBlur={async (e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            const num = val ? parseInt(val) : null;
                            if (num !== p.custo_unitario) {
                              await apiPatch(p.id, { custo_unitario: num });
                              setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, custo_unitario: num ?? 0 } : x));
                              setDetailProduct({ ...p, custo_unitario: num ?? 0 });
                              showSaved("custo");
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className={`flex-1 text-[14px] font-bold px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        />
                      </div>
                    ) : (
                      <p className={`text-[14px] font-bold ${mP} mt-0.5`}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</p>
                    )}
                  </div>
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Categoria</p><p className={`text-[13px] ${mP} mt-0.5`}>{p.categoria}</p></div>
                </div>
                {/* Estoque mínimo — para lacrados, editável pelo admin */}
                {p.tipo === "NOVO" && isAdmin && (
                  <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: dm ? "#3A3A3C" : "#E8E8ED" }}>
                    <p className={`text-[10px] uppercase tracking-wider ${mS} mb-1`}>Estoque Minimo (pra reposicao)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0}
                        defaultValue={p.estoque_minimo ?? ""}
                        placeholder="Ex: 3"
                        onBlur={async (e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          if (val !== p.estoque_minimo) {
                            await apiPatch(p.id, { estoque_minimo: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, estoque_minimo: val } : x));
                            setDetailProduct({ ...p, estoque_minimo: val });
                            showSaved("estoque_min");
                          }
                        }}
                        className={`w-24 px-3 py-2 rounded-lg border text-[14px] font-bold text-center ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-blue-400" : "bg-white border-[#D2D2D7] text-blue-600"} focus:border-[#E8740E] focus:outline-none`}
                      />
                      <span className={`text-[12px] ${mS}`}>
                        {p.estoque_minimo ? `Atual: ${p.qnt} / Min: ${p.estoque_minimo} ${p.qnt < p.estoque_minimo ? "⚠️ REPOR" : "✅ OK"}` : "Nao definido"}
                      </span>
                    </div>
                  </div>
                )}
                {/* Preço sugerido — só para seminovos, editável pelo admin */}
                {(p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA" || p.tipo === "NOVO" || p.tipo === "NAO_ATIVADO") && isAdmin && (
                  <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: dm ? "#3A3A3C" : "#E8E8ED" }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Preco Sugerido de Venda</p>
                      {p.custo_unitario && markupConfig[p.tipo] ? (
                        <button
                          onClick={async () => {
                            const sugestao = Math.round(p.custo_unitario! * (1 + markupConfig[p.tipo] / 100));
                            await apiPatch(p.id, { preco_sugerido: sugestao });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, preco_sugerido: sugestao } : x));
                            setDetailProduct({ ...p, preco_sugerido: sugestao });
                            setMsg("Preço sugerido calculado!");
                          }}
                          className="text-[10px] font-semibold text-[#E8740E] hover:underline"
                        >
                          💡 Sugerir {markupConfig[p.tipo]}% → R$ {Math.round((p.custo_unitario || 0) * (1 + markupConfig[p.tipo] / 100)).toLocaleString("pt-BR")}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] ${mS}`}>R$</span>
                      <input
                        type="text" inputMode="numeric"
                        defaultValue={p.preco_sugerido ? String(p.preco_sugerido) : ""}
                        placeholder="Ex: 6500"
                        onBlur={async (e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          const num = val ? parseInt(val) : null;
                          if (num !== p.preco_sugerido) {
                            await apiPatch(p.id, { preco_sugerido: num });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, preco_sugerido: num } : x));
                            setDetailProduct({ ...p, preco_sugerido: num });
                            showSaved("preco_sug");
                          }
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg border text-[14px] font-bold ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-green-400" : "bg-white border-[#D2D2D7] text-green-600"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    </div>
                    {p.preco_sugerido && p.custo_unitario ? (
                      <p className={`text-[11px] mt-1 ${p.preco_sugerido > p.custo_unitario ? "text-green-500" : "text-red-500"}`}>
                        Margem: {fmt(p.preco_sugerido - p.custo_unitario)} ({((p.preco_sugerido - p.custo_unitario) / p.preco_sugerido * 100).toFixed(1)}%)
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Datas + Observação */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Data de Entrada</p>
                    {isAdmin ? (
                      <input type="date" defaultValue={p.data_entrada || p.data_compra || ""} onBlur={async (e) => {
                        const val = e.target.value || null;
                        if (val !== (p.data_entrada || p.data_compra || null)) {
                          await apiPatch(p.id, { data_entrada: val });
                          setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, data_entrada: val } : x));
                          setDetailProduct({ ...p, data_entrada: val });
                          showSaved("data");
                        }
                      }} className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`} />
                    ) : <p className={`text-[13px] ${mP} mt-0.5`}>{fmtDate(dataE)}</p>}
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Fornecedor</p>
                    {isAdmin ? (
                      <div className="mt-0.5 space-y-1.5">
                        <p className={`text-[13px] ${mP} mt-0.5 font-medium`}>{p.fornecedor || "—"}</p>
                        {p.fornecedor && (
                          <button
                            onClick={() => { setDetailProduct(null); window.location.href = `/admin/clientes?q=${encodeURIComponent(p.fornecedor!)}`; }}
                            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${dm ? "bg-[#3A3A3C] border-[#E8740E]/60 text-[#E8740E] hover:bg-[#E8740E] hover:text-white hover:border-[#E8740E]" : "bg-[#FFF3E8] border-[#E8740E] text-[#E8740E] hover:bg-[#E8740E] hover:text-white"}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            Ver perfil
                          </button>
                        )}
                      </div>
                    ) : p.fornecedor ? (
                      <button
                        onClick={() => { setDetailProduct(null); window.location.href = `/admin/clientes?q=${encodeURIComponent(p.fornecedor!)}`; }}
                        className={`text-[13px] mt-0.5 font-medium text-[#E8740E] hover:underline text-left`}
                      >
                        {p.fornecedor}
                        <span className={`ml-1 text-[10px] ${textMuted}`}>↗</span>
                      </button>
                    ) : <p className={`text-[13px] ${mP} mt-0.5`}>Não informado</p>}
                  </div>
                  {/* Origem da compra */}
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Origem da Compra</p>
                    {isAdmin ? (
                      <select
                        value={p.origem_compra || ""}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          try {
                            await apiPatch(p.id, { origem_compra: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, origem_compra: val } : x));
                            setDetailProduct({ ...p, origem_compra: val });
                            showSaved("origem_compra");
                          } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
                        }}
                        className={`mt-0.5 text-[12px] font-semibold w-full px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      >
                        <option value="">— Não definido —</option>
                        <option value="RJ">🏙️ Rio de Janeiro</option>
                        <option value="SAO_PAULO">🚚 São Paulo</option>
                        <option value="PARAGUAI">🇵🇾 Paraguai</option>
                        <option value="EUA">🇺🇸 Estados Unidos</option>
                      </select>
                    ) : (
                      <p className={`text-[13px] ${mP} mt-0.5`}>
                        {p.origem_compra === "RJ" ? "🏙️ Rio de Janeiro" :
                         p.origem_compra === "SAO_PAULO" ? "🚚 São Paulo" :
                         p.origem_compra === "PARAGUAI" ? "🇵🇾 Paraguai" :
                         p.origem_compra === "EUA" ? "🇺🇸 Estados Unidos" : "—"}
                      </p>
                    )}
                  </div>
                </div>
                {(p.tipo === "PENDENCIA" || p.status === "PENDENTE") && (
                  <div className="mt-3">
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Responsável pela pendência {saved("resp")}</p>
                    <div className="flex gap-1 mt-0.5">
                      <input
                        id={`resp-${p.id}`}
                        key={`resp-${p.id}`}
                        defaultValue={getResp(p.observacao)}
                        placeholder="Ex: Bia, Entregador João…"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); } }}
                        className={`flex-1 text-[13px] px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={async () => {
                          const el = document.getElementById(`resp-${p.id}`) as HTMLInputElement;
                          const novo = setResp(p.observacao, el?.value || "");
                          if (novo !== (p.observacao || null)) {
                            await apiPatch(p.id, { observacao: novo });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: novo } : x));
                            setDetailProduct(prev => prev ? { ...prev, observacao: novo } : null);
                            showSaved("resp");
                          }
                        }}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm"
                        title="Salvar responsável"
                      >✓</button>
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Observacao {saved("obs")}</p>
                  {(canEdit || isAdmin) ? (() => {
                    const saveObs = async () => {
                      const el = document.getElementById(`obs-${p.id}`) as HTMLTextAreaElement;
                      let latestObs = p.observacao || "";
                      setEstoque(prev => { const found = prev.find(x => x.id === p.id); if (found) latestObs = found.observacao || ""; return prev; });
                      const existingTags = extractTags(latestObs);
                      const userText = el?.value?.trim() || "";
                      const val = userText ? `${existingTags} ${userText}`.trim() : (existingTags || null);
                      if (val !== (latestObs || null)) {
                        await apiPatch(p.id, { observacao: val });
                        setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: val } : x));
                        setDetailProduct(prev => prev ? { ...prev, observacao: val } : null);
                        showSaved("obs");
                      }
                    };
                    return (
                    <div className="flex gap-1 mt-0.5">
                      <textarea
                        id={`obs-${p.id}`}
                        key={`obs-${p.id}`}
                        defaultValue={cleanObs(p.observacao) || ""}
                        placeholder="Ex: GARANTIA APPLE AGOSTO - LEVES MARCAS NA TELA"
                        rows={2}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveObs(); } }}
                        className={`flex-1 text-[13px] px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none resize-none`}
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={saveObs}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm self-end"
                        title="Salvar observação"
                      >✓</button>
                    </div>);
                  })() : cleanObs(p.observacao) ? (
                    <p className={`text-[13px] ${mP} mt-0.5`}>{cleanObs(p.observacao)}</p>
                  ) : <p className={`text-[13px] ${mS} mt-0.5`}>—</p>}
                </div>
              </div>
              {/* Operações Relacionadas */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className={`text-xs font-bold ${mP}`}>Operacoes Relacionadas</p>
                  <div className="flex gap-2 flex-wrap">
                    {(p.status === "PENDENTE" || p.tipo === "PENDENCIA" || p.status === "A CAMINHO") && (
                      moveConfirmId === p.id ? (
                        /* Confirmação inline com seleção de data */
                        <div className={`flex items-center gap-2 p-2 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]"}`}>
                          <span className={`text-[11px] font-semibold shrink-0 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>📅 Entrada:</span>
                          <input
                            type="date"
                            value={moveConfirmData}
                            onChange={(e) => setMoveConfirmData(e.target.value)}
                            className={`flex-1 px-2 py-1 rounded-lg border text-xs font-semibold ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                          />
                          <button
                            onClick={async () => {
                              if (p.tipo === "PENDENCIA") {
                                const erro = validarSeminovoParaEstoque(p);
                                if (erro) { setMsg(erro); return; }
                              }
                              try {
                                const novoTipo = p.tipo === "PENDENCIA" ? "SEMINOVO" : p.tipo === "A_CAMINHO" ? getCondicaoFromObs(p) : p.tipo;
                                const res = await fetch("/api/estoque", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ id: p.id, status: "EM ESTOQUE", tipo: novoTipo, data_entrada: moveConfirmData || hojeBR() }) });
                                const json = await res.json();
                                if (json.error) { setMsg("Erro: " + json.error); return; }
                                setMsg("✅ Movido para estoque!");
                                setMoveConfirmId(null);
                                setDetailProduct(null);
                                fetchEstoque();
                              } catch { setMsg("Erro ao mover"); }
                            }}
                            className="px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors shrink-0"
                          >✓ Confirmar</button>
                          <button onClick={() => setMoveConfirmId(null)} className={`px-2 py-1 rounded-lg text-xs font-bold ${dm ? "text-[#98989D] hover:text-red-400" : "text-[#86868B] hover:text-red-500"} transition-colors`}>✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (p.tipo === "PENDENCIA") {
                              handleMoverParaEstoque(p);
                            } else {
                              setMoveConfirmData(hojeBR());
                              setMoveConfirmId(p.id);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Mover para Estoque
                        </button>
                      )
                    )}
                    {/* Mover para Pendências — quando item está EM ESTOQUE e admin quer reclassificar como usado */}
                    {isAdmin && p.status === "EM ESTOQUE" && p.tipo !== "PENDENCIA" && (
                      <button
                        onClick={async () => {
                          if (!confirm("Mover para Pendências (seminovo/usado)?")) return;
                          try {
                            await apiPatch(p.id, { tipo: "PENDENCIA", status: "PENDENTE" });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, tipo: "PENDENCIA", status: "PENDENTE" } : x));
                            setDetailProduct(null);
                            setMsg(`${p.produto} movido para Pendências!`);
                          } catch { setMsg("Erro ao mover"); }
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-700" : "bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Mover para Pendencias
                      </button>
                    )}
                    {/* Mover para Atacado — quando item está EM ESTOQUE e é NOVO */}
                    {isAdmin && p.status === "EM ESTOQUE" && p.tipo === "NOVO" && (
                      <button
                        onClick={async () => {
                          if (!confirm("Mover para Atacado?")) return;
                          try {
                            await apiPatch(p.id, { tipo: "ATACADO" });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, tipo: "ATACADO" } : x));
                            setDetailProduct(null);
                            setMsg(`${p.produto} movido para Atacado!`);
                          } catch { setMsg("Erro ao mover"); }
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-blue-900/30 text-blue-400 hover:bg-blue-700" : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        Mover para Atacado
                      </button>
                    )}
                    {/* Mover para A Caminho — quando item está EM ESTOQUE e precisa reimprimir etiqueta */}
                    {isAdmin && p.status === "EM ESTOQUE" && (p.tipo === "NOVO" || p.tipo === "A_CAMINHO") && (
                      <button
                        onClick={async () => {
                          if (!confirm("Mover de volta para Produtos a Caminho? O item sairá do estoque e poderá ter a etiqueta impressa novamente.")) return;
                          try {
                            await apiPatch(p.id, { tipo: "A_CAMINHO", status: "A CAMINHO" });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, tipo: "A_CAMINHO", status: "A CAMINHO" } : x));
                            setDetailProduct(null);
                            setMsg(`${p.produto} movido para A Caminho!`);
                          } catch { setMsg("Erro ao mover"); }
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-orange-900/30 text-orange-400 hover:bg-orange-700" : "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        Mover para A Caminho
                      </button>
                    )}
                    {/* Voltar ao Estoque — quando item está no Atacado */}
                    {isAdmin && p.tipo === "ATACADO" && (
                      <button
                        onClick={async () => {
                          if (!confirm("Voltar para Estoque (Lacrados)?")) return;
                          try {
                            await apiPatch(p.id, { tipo: "NOVO" });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, tipo: "NOVO" } : x));
                            setDetailProduct(null);
                            setMsg(`${p.produto} voltou para Lacrados!`);
                          } catch { setMsg("Erro ao mover"); }
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-green-900/30 text-green-400 hover:bg-green-700" : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        Voltar ao Estoque
                      </button>
                    )}
                    {/* Reservar / Liberar reserva */}
                    {isAdmin && !p.reserva_cliente && p.status === "EM ESTOQUE" && (
                      <button
                        onClick={() => {
                          const hoje = new Date().toISOString().slice(0, 10);
                          setReservaForm({ cliente: "", data: hoje, para: hoje, operador: userName || "" });
                          setReservaTarget(p);
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-purple-900/30 text-purple-300 hover:bg-purple-800" : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Reservar
                      </button>
                    )}
                    {isAdmin && p.reserva_cliente && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Liberar reserva de ${p.reserva_cliente}?`)) return;
                          try {
                            await apiPatch(p.id, { reserva_cliente: null, reserva_data: null, reserva_para: null, reserva_operador: null });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, reserva_cliente: null, reserva_data: null, reserva_para: null, reserva_operador: null } : x));
                            setDetailProduct(null);
                            setMsg(`Reserva liberada: ${p.produto}`);
                          } catch (err) { setMsg("❌ " + String(err instanceof Error ? err.message : err)); }
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-orange-900/30 text-orange-300 hover:bg-orange-800" : "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        Liberar Reserva
                      </button>
                    )}
                    <button
                      onClick={() => { setDetailProduct(null); const params = new URLSearchParams({ tab: "nova", produto: p.produto, custo: String(p.custo_unitario || 0), categoria: p.categoria || "", estoque_id: p.id }); if (p.serial_no) params.set("serial", p.serial_no); if (p.cor) params.set("cor", p.cor); if (p.fornecedor) params.set("fornecedor", p.fornecedor); window.location.href = `/admin/vendas?${params.toString()}`; }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#F5A623] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
                      Criar Venda
                    </button>
                    <button
                      onClick={async () => {
                        // Buscar produtos que entraram junto (mesmo fornecedor + mesma data)
                        const dataRef = p.data_entrada || p.data_compra;
                        const forn = p.fornecedor;
                        if (!dataRef || !forn) { setMsg("Sem dados de entrada para este produto"); return; }
                        try {
                          const res = await fetch(`/api/estoque?action=entrada&data=${dataRef}&fornecedor=${encodeURIComponent(forn)}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } });
                          const json = await res.json();
                          if (json.data && json.data.length > 0) {
                            setEntradaView({ data: dataRef, fornecedor: forn, produtos: json.data });
                          } else {
                            setMsg("Nenhum registro de entrada encontrado");
                          }
                        } catch { setMsg("Erro ao buscar entrada"); }
                      }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${dm ? "border-[#3A3A3C] text-[#F5F5F7] hover:border-[#E8740E]" : "border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                      Ver Entrada
                    </button>
                  </div>
                </div>
              </div>
              <div className="h-4" />
            </div>
          </div>
        );
      })()}

      {/* Modal Ver Entrada — produtos que entraram juntos */}
      {entradaView && <EntradaModal entradaView={entradaView} setEntradaView={setEntradaView} setDetailProduct={setDetailProduct} setMsg={setMsg} password={password} userName={userName} dm={dm} fetchEstoque={fetchEstoque} />}

      {/* Modal Reservar Produto */}
      {reservaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !reservaSaving && setReservaTarget(null)}>
          <div className={`w-full max-w-md rounded-2xl p-6 ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-white border border-[#E5E5EA]"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-base font-bold ${textPrimary}`}>Reservar Produto</h3>
              <button onClick={() => !reservaSaving && setReservaTarget(null)} className={`${textMuted} hover:${textPrimary}`}>✕</button>
            </div>
            <div className={`mb-4 px-3 py-2 rounded-lg ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
              <p className={`text-sm font-semibold ${textPrimary}`}>{reservaTarget.produto}</p>
              <p className={`text-[11px] ${textMuted}`}>{reservaTarget.cor || ""}{reservaTarget.serial_no ? ` — SN: ${reservaTarget.serial_no}` : ""}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`block text-[11px] uppercase tracking-wider mb-1 ${textMuted}`}>Cliente *</label>
                <input
                  type="text"
                  value={reservaForm.cliente}
                  onChange={(e) => setReservaForm(f => ({ ...f, cliente: e.target.value }))}
                  placeholder="Nome do cliente"
                  className={`w-full text-[13px] px-3 py-2 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[11px] uppercase tracking-wider mb-1 ${textMuted}`}>Data da Reserva *</label>
                  <input
                    type="date"
                    value={reservaForm.data}
                    onChange={(e) => setReservaForm(f => ({ ...f, data: e.target.value }))}
                    className={`w-full text-[13px] px-3 py-2 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] uppercase tracking-wider mb-1 ${textMuted}`}>Para Qual Dia *</label>
                  <input
                    type="date"
                    value={reservaForm.para}
                    onChange={(e) => setReservaForm(f => ({ ...f, para: e.target.value }))}
                    className={`w-full text-[13px] px-3 py-2 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-[11px] uppercase tracking-wider mb-1 ${textMuted}`}>Operador *</label>
                <input
                  type="text"
                  value={reservaForm.operador}
                  onChange={(e) => setReservaForm(f => ({ ...f, operador: e.target.value }))}
                  placeholder="Quem fez a reserva"
                  className={`w-full text-[13px] px-3 py-2 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => !reservaSaving && setReservaTarget(null)}
                disabled={reservaSaving}
                className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F2F2F7] text-[#1D1D1F]"}`}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!reservaForm.cliente.trim() || !reservaForm.data || !reservaForm.para || !reservaForm.operador.trim()) {
                    setMsg("❌ Preencha todos os campos da reserva");
                    return;
                  }
                  setReservaSaving(true);
                  try {
                    const patch = {
                      reserva_cliente: reservaForm.cliente.trim(),
                      reserva_data: reservaForm.data,
                      reserva_para: reservaForm.para,
                      reserva_operador: reservaForm.operador.trim(),
                    };
                    await apiPatch(reservaTarget.id, patch);
                    setEstoque(prev => prev.map(x => x.id === reservaTarget.id ? { ...x, ...patch } : x));
                    setMsg(`✅ Reservado para ${patch.reserva_cliente}`);
                    setReservaTarget(null);
                    setDetailProduct(null);
                  } catch (err) {
                    setMsg("❌ " + String(err instanceof Error ? err.message : err));
                  } finally {
                    setReservaSaving(false);
                  }
                }}
                disabled={reservaSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#E8740E] text-white text-[13px] font-semibold hover:bg-[#F5A623] disabled:opacity-50"
              >
                {reservaSaving ? "Salvando..." : "Confirmar Reserva"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Modal de Entrada de Produtos ── */
function EntradaModal({ entradaView, setEntradaView, setDetailProduct, setMsg, password, userName, dm, fetchEstoque }: {
  entradaView: { data: string; fornecedor: string; produtos: ProdutoEstoque[] };
  setEntradaView: (v: { data: string; fornecedor: string; produtos: ProdutoEstoque[] } | null) => void;
  setDetailProduct: (p: ProdutoEstoque | null) => void;
  setMsg: (m: string) => void;
  password: string;
  userName: string;
  dm: boolean;
  fetchEstoque: () => void;
}) {
  const { data, fornecedor, produtos: initialProdutos } = entradaView;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [produtos, setProdutos] = useState(initialProdutos);
  const [saving, setSaving] = useState(false);

  const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
  const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const mS = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `px-2 py-1 rounded-lg border text-xs focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#3A3A3C] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const totalCusto = produtos.reduce((s, p) => s + Number(p.custo_unitario || 0), 0);

  const startEdit = (p: ProdutoEstoque) => {
    setEditingId(p.id);
    setEditFields({
      produto: p.produto,
      serial_no: p.serial_no || "",
      imei: p.imei || "",
      custo_unitario: String(p.custo_unitario || ""),
      cor: p.cor || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    const orig = produtos.find((p) => p.id === editingId);
    if (!orig) { setSaving(false); return; }
    if (editFields.produto !== orig.produto) updates.produto = editFields.produto;
    if (editFields.serial_no !== (orig.serial_no || "")) updates.serial_no = editFields.serial_no || null;
    if (editFields.imei !== (orig.imei || "")) updates.imei = editFields.imei || null;
    if (editFields.cor !== (orig.cor || "")) updates.cor = editFields.cor || null;
    if (editFields.custo_unitario !== String(orig.custo_unitario || "")) updates.custo_unitario = parseFloat(editFields.custo_unitario) || 0;

    if (Object.keys(updates).length > 0) {
      await fetch("/api/estoque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ id: editingId, ...updates }),
      });
      setProdutos((prev) => prev.map((p) => p.id === editingId ? { ...p, ...updates } as ProdutoEstoque : p));
      fetchEstoque();
      setMsg("Produto atualizado!");
    }
    setEditingId(null);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEntradaView(null)} onKeyDown={(e) => { if (e.key === "Escape") { if (editingId) setEditingId(null); else setEntradaView(null); } }} tabIndex={-1} ref={(el: HTMLDivElement | null) => el?.focus()}>
      <div className={`w-full max-w-3xl mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
          <div>
            <h3 className={`text-sm font-bold ${mP}`}>Entrada de Produtos</h3>
            <p className={`text-xs ${mS}`}>{fmtDate(data)} — {fornecedor}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold ${mS}`}>{produtos.length} itens | {fmt(totalCusto)}</span>
            <button onClick={() => setEntradaView(null)} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#E8E8ED] bg-[#F9F9FB]"}`}>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Produto</th>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Serial</th>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Status</th>
                <th className={`px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Custo</th>
                <th className={`px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider ${mS} w-20`}></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className={`border-b ${dm ? "border-[#3A3A3C] hover:bg-[#2C2C2E]" : "border-[#F0F0F5] hover:bg-[#FAFAFA]"} transition-colors ${editingId === p.id ? (dm ? "bg-[#2C2C2E]" : "bg-[#FFF8F0]") : ""}`}>
                    <td className={`px-4 py-3 ${mP}`}>
                      <div className="font-medium text-xs">{p.produto}</div>
                      {p.cor && <span className={`text-[10px] ${mS}`}>{p.cor}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-purple-500">{p.serial_no || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.status === "EM ESTOQUE" ? "bg-green-100 text-green-700" : p.status === "VENDIDO" || p.status === "ESGOTADO" ? "bg-gray-100 text-gray-600" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mP}`}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${dm ? "text-[#F5A623] hover:bg-[#E8740E]/20" : "text-[#E8740E] hover:bg-[#E8740E]/10"}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEntradaView(null); setDetailProduct(p); }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${dm ? "text-[#98989D] hover:bg-[#3A3A3C]" : "text-[#86868B] hover:bg-[#F0F0F5]"}`}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === p.id && (
                    <tr className={`border-b ${dm ? "border-[#E8740E]/30 bg-[#E8740E]/5" : "border-[#E8740E]/20 bg-[#FFF8F0]"}`}>
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <div><p className={`text-[10px] uppercase ${mS}`}>Produto</p><input value={editFields.produto} onChange={(e) => setEditFields({ ...editFields, produto: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Serial</p><input value={editFields.serial_no} onChange={(e) => setEditFields({ ...editFields, serial_no: e.target.value })} className={`${inputCls} w-full font-mono`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>IMEI</p><input value={editFields.imei} onChange={(e) => setEditFields({ ...editFields, imei: e.target.value })} className={`${inputCls} w-full font-mono`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Cor</p><input value={editFields.cor} onChange={(e) => setEditFields({ ...editFields, cor: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Custo (R$)</p><input type="number" value={editFields.custo_unitario} onChange={(e) => setEditFields({ ...editFields, custo_unitario: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div className="flex items-end gap-2">
                            <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] disabled:opacity-50">{saving ? "..." : "Salvar"}</button>
                            <button onClick={() => setEditingId(null)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Cancelar</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3">
          <button onClick={() => setEntradaView(null)} className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Histórico de Movimentações ── */
type LogEntry = { id: string; created_at: string; usuario: string; acao: string; produto_nome: string; campo: string; valor_anterior: string; valor_novo: string; detalhes: string };

function HistoricoTab({ password, logs, setLogs, loading, setLoading }: {
  password: string; logs: LogEntry[]; setLogs: (l: LogEntry[]) => void; loading: boolean; setLoading: (b: boolean) => void;
}) {
  const { darkMode: dm } = useAdmin();
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque?action=historico&limit=200", { headers: { "x-admin-password": password, "x-admin-user": "sistema" } });
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [password, setLogs, setLoading]);

  useEffect(() => { if (logs.length === 0) fetchLogs(); }, [fetchLogs, logs.length]);

  const ACAO_EMOJI: Record<string, string> = { alteracao: "✏️", exclusao: "🗑️", entrada: "📥", saida: "📤", criacao: "➕" };

  if (loading) return <div className="text-center py-8 text-[#86868B]">Carregando historico...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#86868B] uppercase">{logs.length} movimentacoes</h3>
        <button onClick={fetchLogs} className="px-3 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold">🔄 Atualizar</button>
      </div>
      {logs.length === 0 ? (
        <p className="text-center text-[#86868B] py-8">Nenhuma movimentacao registrada</p>
      ) : (
        <div className={`${dm ? "bg-[#1C1C1E]" : "bg-white"} rounded-2xl border ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"} overflow-hidden`}>
          <div className={`divide-y ${dm ? "divide-[#2C2C2E]" : "divide-[#F5F5F7]"}`}>
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5">{ACAO_EMOJI[log.acao] || "📋"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{log.produto_nome}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} font-medium uppercase`}>{log.acao}</span>
                  </div>
                  {log.campo && (
                    <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"} mt-0.5`}>
                      <span className="font-medium">{log.campo}:</span>{" "}
                      {log.valor_anterior && <span className="line-through text-red-400">{log.valor_anterior}</span>}
                      {log.valor_anterior && log.valor_novo && " → "}
                      {log.valor_novo && <span className={`${dm ? "text-green-400" : "text-green-600"} font-medium`}>{log.valor_novo}</span>}
                    </p>
                  )}
                  {log.detalhes && <p className={`text-[11px] ${dm ? "text-[#98989D]" : "text-[#86868B]"} mt-0.5`}>{log.detalhes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{new Date(log.created_at).toLocaleDateString("pt-BR")}</p>
                  <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-[10px] font-medium text-[#E8740E] mt-0.5">{log.usuario}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Scan Entrada (Serial Number) ── */
function ScanEntradaTab({ password, userName, onSuccess }: { password: string; userName: string; onSuccess: () => void }) {
  const { darkMode: dm } = useAdmin();
  const [step, setStep] = useState<"scan" | "form" | "result">("scan");
  const [serialNo, setSerialNo] = useState("");
  const [scanResult, setScanResult] = useState<{ found: boolean; status?: string; produto?: Record<string, unknown>; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    categoria: "IPHONES", produto: "", cor: "", armazenamento: "",
    custo_unitario: "", fornecedor: "", data_compra: hojeBR(),
    imei: "", imei2: "", observacao: "",
  });
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": "sistema" } })
      .then(r => r.json()).then(d => setFornecedores(d.data ?? d.fornecedores ?? [])).catch(() => {});
  }, [password]);

  const handleScan = async (code: string) => {
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName), "Content-Type": "application/json" },
        body: JSON.stringify({ serial_no: code }),
      });
      const data = await res.json();
      setScanResult(data);
      setSerialNo(code);

      if (!data.found) {
        // Produto novo — abrir formulário com form resetado
        setForm({
          categoria: "IPHONES", produto: "", cor: "", armazenamento: "",
          custo_unitario: "", fornecedor: "", data_compra: hojeBR(),
          imei: "", imei2: "", observacao: "",
        });
        setStep("form");
      } else if (data.status === "EM_ESTOQUE") {
        setStep("result");
        setSuccess(`⚠️ Produto já em estoque: ${data.produto?.produto || code}`);
      } else if (data.status === "VENDIDO") {
        setStep("result");
        setError(`❌ Produto já vendido: ${data.message || code}`);
      }
    } catch {
      setError("Erro ao consultar. Verifique sua conexão.");
    }
  };

  const handleSave = async () => {
    if (!form.produto && !form.armazenamento) {
      setError("Preencha pelo menos o produto e armazenamento");
      return;
    }
    setSaving(true); setError("");

    // Build product name from specs
    const produtoNome = form.produto || `${form.categoria} ${form.armazenamento}`;

    try {
      const res = await fetch("/api/scan", {
        method: "PUT",
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName), "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_no: serialNo,
          imei: form.imei,
          imei2: form.imei2,
          categoria: form.categoria,
          produto: produtoNome,
          cor: form.cor,
          armazenamento: form.armazenamento,
          custo_unitario: form.custo_unitario ? Number(form.custo_unitario) : 0,
          fornecedor: form.fornecedor,
          data_compra: form.data_compra,
          observacao: form.observacao,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setSuccess(`✅ ${data.message}`);
        setStep("result");
        onSuccess();
        // Reset for next scan
        setTimeout(() => {
          setStep("scan");
          setSerialNo("");
          setScanResult(null);
          setSuccess("");
          setForm(f => ({ ...f, produto: "", cor: "", armazenamento: "", custo_unitario: "", imei: "", imei2: "", observacao: "" }));
        }, 2000);
      } else {
        setError(data.error || "Erro ao salvar");
      }
    } catch {
      setError("Erro de conexão");
    }
    setSaving(false);
  };

  const labelCls = `text-xs font-semibold uppercase tracking-wide mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
  const inputCls = `w-full px-3 py-2.5 border rounded-xl text-sm focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] outline-none ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const selectCls = inputCls + " appearance-none";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h2 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>📦 Entrada de Produto</h2>
        <p className={`text-sm mt-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Escaneie o Serial Number da caixa do produto</p>
      </div>

      {error && <div className={`px-4 py-3 rounded-xl text-sm ${dm ? "bg-red-900/30 border border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>{error}</div>}
      {success && <div className={`px-4 py-3 rounded-xl text-sm ${dm ? "bg-green-900/30 border border-green-800 text-green-400" : "bg-green-50 border border-green-200 text-green-700"}`}>{success}</div>}

      {/* STEP 1: Scan */}
      {step === "scan" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4`}>
          <p className={`text-sm text-center ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Bipe com o leitor USB ou use a câmera do celular</p>
          <BarcodeScanner onScan={handleScan} placeholder="Serial Number..." />
        </div>
      )}

      {/* STEP 2: Formulário de Cadastro */}
      {step === "form" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4`}>
          <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-green-50 border border-green-200"}`}>
            <p className={`text-sm font-medium ${dm ? "text-[#F5F5F7]" : "text-green-800"}`}>🆕 Produto novo detectado</p>
            <p className={`text-xs font-mono mt-1 ${dm ? "text-[#A1A1A6]" : "text-green-600"}`}>SN: {serialNo}</p>
          </div>

          {/* Categoria */}
          <div>
            <p className={labelCls}>Categoria</p>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={selectCls}>
              {DEFAULT_CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
            </select>
          </div>

          {/* Produto (nome completo) */}
          <div>
            <p className={labelCls}>Produto (nome completo)</p>
            <input value={form.produto} onChange={e => setForm(f => ({ ...f, produto: e.target.value }))} placeholder="Ex: IPHONE 17 PRO MAX 256GB" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Armazenamento */}
            <div>
              <p className={labelCls}>Armazenamento</p>
              <select value={form.armazenamento} onChange={e => setForm(f => ({ ...f, armazenamento: e.target.value }))} className={selectCls}>
                <option value="">—</option>
                {["64GB","128GB","256GB","512GB","1TB","2TB"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Cor */}
            <div>
              <p className={labelCls}>Cor</p>
              <input value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} placeholder="Ex: Titânio Natural" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Custo */}
            <div>
              <p className={labelCls}>Custo (R$)</p>
              <input type="number" value={form.custo_unitario} onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))} placeholder="0" className={inputCls} />
            </div>
            {/* Fornecedor */}
            <div>
              <p className={labelCls}>Fornecedor</p>
              <select value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className={selectCls}>
                <option value="">— Selecionar —</option>
                {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          {/* IMEI (só iPhones) */}
          {getBaseCat(form.categoria) === "IPHONES" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={labelCls}>IMEI</p>
                <input value={form.imei} onChange={e => setForm(f => ({ ...f, imei: e.target.value }))} placeholder="Opcional" className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>IMEI 2</p>
                <input value={form.imei2} onChange={e => setForm(f => ({ ...f, imei2: e.target.value }))} placeholder="Opcional" className={inputCls} />
              </div>
            </div>
          )}

          {/* Data compra */}
          <div>
            <p className={labelCls}>Data da Compra</p>
            <input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} className={inputCls} />
          </div>

          {/* Observação */}
          <div>
            <p className={labelCls}>Observação</p>
            <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" className={inputCls} />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setStep("scan"); setSerialNo(""); setScanResult(null); setError(""); }}
              className={`flex-1 py-3 rounded-xl border font-medium transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}
            >
              ← Voltar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.produto}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-40"
            >
              {saving ? "Salvando..." : "✅ Cadastrar no Estoque"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Resultado */}
      {step === "result" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4 text-center`}>
          {scanResult?.found && scanResult?.produto && (
            <div className="space-y-2">
              <p className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{String(scanResult.produto.produto || "")}</p>
              <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{String(scanResult.produto.cor || "")} — SN: {serialNo}</p>
              <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Status: <span className="font-medium">{String(scanResult.produto.status || scanResult.status || "")}</span></p>
            </div>
          )}
          <button
            onClick={() => { setStep("scan"); setSerialNo(""); setScanResult(null); setError(""); setSuccess(""); }}
            className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
          >
            📟 Escanear outro produto
          </button>
        </div>
      )}
    </div>
  );
}
