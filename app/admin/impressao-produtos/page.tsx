"use client";
import { useState, useEffect, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS, CAT_LABELS } from "@/lib/produto-specs";
import { corParaPT } from "@/lib/cor-pt";
import { cleanProdutoDisplay } from "@/lib/produto-display";

interface EstoqueItem {
  id: string;
  produto: string;
  cor: string | null;
  categoria: string;
  qnt: number;
  observacao: string | null;
  serial_no: string | null;
  status: string;
}

interface LinhaEstilo {
  texto: string;
  bold: boolean;
  size: number; // pt
}

interface EtiquetaFila {
  id: string;
  linhas: LinhaEstilo[]; // sempre 3 posições (cor/config podem vir vazias)
  qtd: number;
}

// Default: todas as linhas bold 11pt (mesmo peso visual). O operador
// ajusta individualmente se uma linha específica precisar de outro
// tamanho ou perder o negrito.
const DEFAULT_BOLD = true;
const DEFAULT_SIZE = 11;
const SIZE_OPTIONS = [7, 8, 9, 10, 11, 12, 14, 16];

function linhaVazia(): LinhaEstilo {
  return { texto: "", bold: DEFAULT_BOLD, size: DEFAULT_SIZE };
}

// ── CSS print (Brother QL-820NWB 62mm x 45mm) ──
// Estilo de cada linha vem inline em `gerarHtmlEtiqueta` — o CSS aqui
// cuida só de layout e página.
const PRINT_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{margin:0;padding:0;width:100%}
  body{font-family:Arial,Helvetica,sans-serif;color:#1D1D1F}
  .wrap{text-align:center;padding:5mm 5mm 3mm 5mm;display:flex;flex-direction:column;justify-content:center;height:100%;min-height:45mm}
  @page{size:62mm 45mm;margin:0}
`;

function estiloLinha(l: LinhaEstilo, idx: number): string {
  return [
    `font-size:${l.size}pt`,
    `font-weight:${l.bold ? "bold" : "normal"}`,
    "line-height:1.2",
    "text-transform:uppercase",
    idx > 0 ? "margin-top:1.5mm" : "",
  ].filter(Boolean).join(";");
}

function gerarHtmlEtiqueta(linhas: LinhaEstilo[]): string {
  const divs = linhas
    .filter(l => l.texto.trim())
    .map((l, i) => `<div style="${estiloLinha(l, i)}">${l.texto}</div>`)
    .join("");
  return `<div class="wrap">${divs}</div>`;
}

// ── Extrai nome base do produto (sem cor, sem storage) ──
function extrairNomeBase(produto: string, categoria: string): string {
  const up = produto.toUpperCase().trim();

  if (categoria === "IPHONES" || /\bIPHONE\b/.test(up)) {
    const m = up.match(/IPHONE\s*(\d+E?)\s*(PRO\s*MAX|PRO|PLUS|AIR)?/);
    if (m) return `IPHONE ${m[1]}${m[2] ? " " + m[2].replace(/\s+/g, " ") : ""}`;
  }
  if (categoria === "IPADS" || /\bIPAD\b/.test(up)) {
    let modelo = "IPAD";
    if (/MINI/.test(up)) modelo = "IPAD MINI";
    else if (/AIR/.test(up)) modelo = "IPAD AIR";
    else if (/PRO/.test(up)) modelo = "IPAD PRO";
    const chipM = up.match(/(M\d+(?:\s*(?:PRO|MAX))?|A\d+(?:\s*PRO)?)/);
    if (chipM) modelo += " " + chipM[1].replace(/\s+/g, " ");
    return modelo;
  }
  if (categoria === "MACBOOK" || /\bMACBOOK\b/.test(up)) {
    let modelo = "MACBOOK";
    if (/NEO/.test(up)) modelo = "MACBOOK NEO";
    else if (/AIR/.test(up)) modelo = "MACBOOK AIR";
    else if (/PRO/.test(up)) modelo = "MACBOOK PRO";
    const chipM = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX)?/);
    if (chipM) modelo += ` M${chipM[1]}${chipM[2] ? " " + chipM[2].replace(/\s+/g, " ") : ""}`;
    return modelo;
  }
  if (categoria === "MAC_MINI" || /\bMAC\s*MINI\b/.test(up)) {
    let modelo = "MAC MINI";
    const chipM = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX)?/);
    if (chipM) modelo += ` M${chipM[1]}${chipM[2] ? " " + chipM[2].replace(/\s+/g, " ") : ""}`;
    return modelo;
  }
  if (categoria === "MAC_STUDIO" || /\bMAC\s*STUDIO\b/.test(up)) {
    let modelo = "MAC STUDIO";
    const chipM = up.match(/M(\d+)\s*(PRO\s*MAX|PRO|MAX|ULTRA)?/);
    if (chipM) modelo += ` M${chipM[1]}${chipM[2] ? " " + chipM[2].replace(/\s+/g, " ") : ""}`;
    return modelo;
  }
  if (categoria === "APPLE_WATCH" || /\bAPPLE\s*WATCH\b/.test(up)) {
    let modelo = "APPLE WATCH";
    const ultra = up.match(/ULTRA\s*(\d+)?/);
    const se = up.match(/\bSE(?!R)\s*(\d+)?\b/);
    const series = up.match(/(?:SERIES\s*|\bS)(\d+)/);
    if (ultra) modelo = `APPLE WATCH ULTRA${ultra[1] ? " " + ultra[1] : ""}`;
    else if (se) modelo = `APPLE WATCH SE${se[1] ? " " + se[1] : ""}`;
    else if (series) modelo = `APPLE WATCH SERIES ${series[1]}`;
    return modelo;
  }
  if (categoria === "AIRPODS" || /\bAIRPODS?\b/.test(up)) {
    const m = up.match(/AIRPODS?\s*(PRO)?\s*(\d+)?/i);
    if (m) return `AIRPODS${m[1] ? " PRO" : ""}${m[2] ? " " + m[2] : ""}`;
  }

  // Fallback: limpar sufixos de cor e specs
  return cleanProdutoDisplay(produto).toUpperCase();
}

// ── Extrai configuração (tela, RAM, SSD, storage, tamanho, conectividade) ──
function extrairConfig(produto: string, categoria: string, observacao: string | null): string {
  const src = `${produto} ${observacao || ""}`.toUpperCase();
  const parts: string[] = [];

  // Tela
  const telaTag = (observacao || "").match(/\[TELA:([^\]]+)\]/);
  const telaNome = src.match(/\b(11|13|14|15|16)[""]/);
  const tela = telaTag ? telaTag[1].trim().replace(/"?$/, '"') : (telaNome ? `${telaNome[1]}"` : "");

  // Memórias (RAM + Storage)
  const memMatches = Array.from(src.matchAll(/(\d+)\s*(GB|TB)/g));
  const mems = memMatches.map(m => ({ raw: `${m[1]}${m[2]}`, gb: m[2] === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
  const sorted = [...mems].sort((a, b) => b.gb - a.gb);
  const storage = sorted[0]?.raw || "";
  const ramTag = (observacao || "").match(/\[RAM:([^\]]+)\]/);
  let ram = ramTag ? ramTag[1].trim().toUpperCase() : "";
  if (!ram && sorted.length >= 2) ram = sorted[sorted.length - 1].raw;
  const ssdTag = (observacao || "").match(/\[SSD:([^\]]+)\]/);
  const ssd = ssdTag ? ssdTag[1].trim().toUpperCase() : storage;

  // Tamanho mm (Watch)
  const mmMatch = src.match(/(\d{2})\s*MM/);
  const tamMm = mmMatch ? `${mmMatch[1]}mm` : "";

  // Conectividade
  const hasCell = /\+\s*CEL|CELLULAR|\+CELL|GPS\s*\+\s*CEL|\bCEL\b/.test(src);
  const hasGps = /\bGPS\b/.test(src);

  const baseCat = categoria.startsWith("IPHONES") ? "IPHONES" : categoria.startsWith("IPADS") ? "IPADS" : categoria;

  if (baseCat === "IPHONES") {
    if (storage) parts.push(storage);
  } else if (baseCat === "IPADS") {
    if (tela) parts.push(tela);
    if (storage) parts.push(storage);
    if (hasCell) parts.push("Wi-Fi + Cellular");
  } else if (baseCat === "MACBOOK" || baseCat === "MAC_MINI" || baseCat === "MAC_STUDIO") {
    if (tela) parts.push(tela);
    if (ram && ssd && ram !== ssd) {
      parts.push(`${ram} | ${ssd}`);
    } else if (storage) {
      parts.push(storage);
    }
  } else if (baseCat === "APPLE_WATCH") {
    if (tamMm) parts.push(tamMm);
    if (hasCell) parts.push("GPS + Cellular");
    else if (hasGps) parts.push("GPS");
  }

  return parts.join(" ");
}

export default function ImpressaoProdutosPage() {
  const { password, darkMode: dm } = useAdmin();

  // Estoque data
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [catFiltro, setCatFiltro] = useState<string>("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const sugRef = useRef<HTMLDivElement>(null);

  // Campos editáveis da etiqueta — 3 linhas com texto + estilo
  const [linhas, setLinhas] = useState<LinhaEstilo[]>([linhaVazia(), linhaVazia(), linhaVazia()]);
  const [qtd, setQtd] = useState(1);

  function atualizarLinha(idx: number, patch: Partial<LinhaEstilo>) {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }
  function resetLinhas() {
    setLinhas([linhaVazia(), linhaVazia(), linhaVazia()]);
  }

  // Fila de impressão
  const [fila, setFila] = useState<EtiquetaFila[]>([]);

  // Buscar estoque
  useEffect(() => {
    if (!password) return;
    setLoadingEstoque(true);
    fetch("/api/admin/estoque", { headers: { "x-admin-password": password }, cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (Array.isArray(j.data)) setEstoque(j.data);
      })
      .catch(() => {})
      .finally(() => setLoadingEstoque(false));
  }, [password]);

  // Click outside to close suggestions
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sugRef.current && !sugRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Produtos filtrados (agrupar por modelo único — sem duplicar seriais)
  const produtosUnicos = (() => {
    const map = new Map<string, EstoqueItem>();
    for (const p of estoque) {
      if (p.status === "ESGOTADO" && p.qnt <= 0) continue;
      const key = `${p.produto}||${p.cor}||${p.categoria}`;
      if (!map.has(key)) map.set(key, p);
    }
    return Array.from(map.values());
  })();

  const sugestoes = produtosUnicos.filter(p => {
    if (catFiltro && p.categoria !== catFiltro) return false;
    if (buscaProduto) {
      const search = buscaProduto.toUpperCase();
      return (p.produto || "").toUpperCase().includes(search) || (p.cor || "").toUpperCase().includes(search);
    }
    return true;
  }).slice(0, 20);

  function selecionarProduto(p: EstoqueItem) {
    const nome = extrairNomeBase(p.produto, p.categoria);
    const config = extrairConfig(p.produto, p.categoria, p.observacao);
    const cor = p.cor ? corParaPT(p.cor).toUpperCase() : "";
    // Ao selecionar, reseta estilo pros defaults (bold 11pt em todas).
    setLinhas([
      { texto: nome, bold: DEFAULT_BOLD, size: DEFAULT_SIZE },
      { texto: config, bold: DEFAULT_BOLD, size: DEFAULT_SIZE },
      { texto: cor, bold: DEFAULT_BOLD, size: DEFAULT_SIZE },
    ]);
    setBuscaProduto(cleanProdutoDisplay(p.produto));
    setShowSuggestions(false);
  }

  function adicionarFila() {
    if (!linhas[0].texto.trim()) return;
    setFila([...fila, {
      id: Date.now().toString(),
      linhas: linhas.map(l => ({ ...l, texto: l.texto.trim() })),
      qtd,
    }]);
    resetLinhas();
    setQtd(1);
    setBuscaProduto("");
  }

  function removerFila(id: string) {
    setFila(fila.filter(f => f.id !== id));
  }

  function imprimirUma() {
    if (!linhas[0].texto.trim()) return;
    const win = window.open("", "_blank", "width=300,height=300");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta Produto</title>
      <style>${PRINT_CSS}</style></head><body>
      ${gerarHtmlEtiqueta(linhas)}
      <script>window.onload=function(){window.print();window.close();};<\/script></body></html>`);
    win.document.close();
  }

  function imprimirFila() {
    if (fila.length === 0) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const pages: string[] = [];
    for (const item of fila) {
      for (let i = 0; i < item.qtd; i++) {
        pages.push(`<div class="page">${gerarHtmlEtiqueta(item.linhas)}</div>`);
      }
    }
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Impressão em Lote</title>
      <style>${PRINT_CSS}
        .page{page-break-after:always}
        .page:last-child{page-break-after:auto}
      </style></head><body>
      ${pages.join("")}
      <script>window.onload=function(){window.print();window.close();};<\/script></body></html>`);
    win.document.close();
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] focus:border-[#E8740E]" : "bg-white border-[#D2D2D7] text-[#1D1D1F] focus:border-[#E8740E]"}`;
  const labelCls = `text-[10px] font-semibold uppercase tracking-wide mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
  const cardCls = `p-5 rounded-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"}`;
  const totalEtiquetas = fila.reduce((s, f) => s + f.qtd, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>🖨️ Impressão Produtos</h1>
        {fila.length > 0 && (
          <button onClick={() => setFila([])} className="text-xs text-red-500 hover:underline">🗑️ Limpar fila</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Coluna esquerda: busca + campos + ações ── */}
        <div className="space-y-4">
          {/* Busca no estoque */}
          <div className={cardCls}>
            <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>🔍 Buscar Produto do Estoque</p>
            <div className="flex gap-2 mb-2">
              <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
                className={`px-2 py-2 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}>
                <option value="">Todas categorias</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
              </select>
            </div>
            <div className="relative" ref={sugRef}>
              <input
                value={buscaProduto}
                onChange={e => { setBuscaProduto(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={loadingEstoque ? "Carregando estoque..." : "Digite para buscar..."}
                className={inputCls}
              />
              {showSuggestions && sugestoes.length > 0 && (
                <div className={`absolute z-50 left-0 right-0 top-full mt-1 rounded-xl border shadow-lg max-h-[300px] overflow-y-auto ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
                  {sugestoes.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selecionarProduto(p)}
                      className={`w-full text-left px-3 py-2.5 text-xs border-b last:border-b-0 hover:bg-opacity-50 transition-colors ${dm ? "border-[#3A3A3C] hover:bg-[#3A3A3C] text-[#F5F5F7]" : "border-[#F0F0F5] hover:bg-[#F5F5F7] text-[#1D1D1F]"}`}
                    >
                      <span className="font-semibold">{cleanProdutoDisplay(p.produto)}</span>
                      {p.cor && <span className={`ml-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>• {corParaPT(p.cor)}</span>}
                      <span className={`ml-2 text-[10px] ${dm ? "text-[#6E6E73]" : "text-[#AEAEB2]"}`}>{CAT_LABELS[p.categoria] || p.categoria}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Campos editáveis */}
          <div className={cardCls}>
            <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>✏️ Conteúdo da Etiqueta</p>
            <div className="space-y-3">
              {(["Linha 1 — Nome do produto", "Linha 2 — Configuração", "Linha 3 — Cor"] as const).map((rotulo, i) => {
                const placeholder = i === 0 ? "Ex: MACBOOK AIR M5" : i === 1 ? 'Ex: 15" 16GB | 512GB' : "Ex: PRETO";
                const linha = linhas[i];
                return (
                  <div key={i}>
                    <p className={labelCls}>{rotulo}</p>
                    <input
                      value={linha.texto}
                      onChange={e => atualizarLinha(i, { texto: e.target.value.toUpperCase() })}
                      placeholder={placeholder}
                      className={`${inputCls} ${linha.bold ? "font-bold" : ""}`}
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={() => atualizarLinha(i, { bold: !linha.bold })}
                        title={linha.bold ? "Tirar negrito" : "Aplicar negrito"}
                        className={`w-8 h-7 rounded text-xs font-bold transition-colors ${linha.bold ? "bg-[#E8740E] text-white" : (dm ? "bg-[#2C2C2E] text-[#86868B] border border-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7]")}`}
                      >
                        B
                      </button>
                      <select
                        value={linha.size}
                        onChange={e => atualizarLinha(i, { size: Number(e.target.value) })}
                        title="Tamanho da fonte"
                        className={`px-2 py-1 rounded text-xs border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
                      >
                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}pt</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-end gap-3 pt-1">
                <div className="w-20">
                  <p className={labelCls}>Qtd</p>
                  <input type="number" min={1} max={50} value={qtd} onChange={e => setQtd(Math.max(1, parseInt(e.target.value) || 1))} className={`${inputCls} text-center`} />
                </div>
                <button onClick={adicionarFila} disabled={!linhas[0].texto.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  + Adicionar à fila
                </button>
                <button onClick={imprimirUma} disabled={!linhas[0].texto.trim()} className="py-2.5 px-4 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 transition-colors">
                  🖨️ Imprimir
                </button>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-xl border border-dashed ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#D2D2D7] bg-[#FAFAFA]"}`}>
            <p className={`text-[11px] leading-relaxed ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
              💡 Selecione um produto do estoque para auto-preencher, ou digite livremente. Use <strong>&quot;+ Adicionar à fila&quot;</strong> para montar um lote, ou <strong>&quot;🖨️ Imprimir&quot;</strong> para imprimir direto.
            </p>
          </div>
        </div>

        {/* ── Coluna direita: preview + fila ── */}
        <div className="space-y-4">
          {/* Preview */}
          <div className={cardCls}>
            <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>👁️ Preview</p>
            <div className={`mx-auto border-2 border-dashed rounded-lg ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`} style={{ width: "62mm", height: "45mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", padding: "3mm 5mm", fontFamily: "Arial, Helvetica, sans-serif" }}>
                {linhas.map((l, i) => {
                  const placeholders = ["NOME DO PRODUTO", "CONFIGURAÇÃO", "COR"];
                  const show = l.texto || (i === 0 || !linhas[0].texto);
                  if (!show) return null;
                  const temTexto = !!l.texto;
                  return (
                    <div key={i} style={{
                      fontSize: `${l.size}pt`,
                      fontWeight: l.bold ? "bold" : "normal",
                      lineHeight: 1.2,
                      textTransform: "uppercase",
                      marginTop: i > 0 ? "1.5mm" : 0,
                      color: temTexto ? (dm ? "#F5F5F7" : "#1D1D1F") : (dm ? "#555" : "#CCC"),
                    }}>{l.texto || placeholders[i]}</div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Fila de impressão */}
          <div className={cardCls}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>📋 Fila de Impressão</p>
              {fila.length > 0 && (
                <button onClick={imprimirFila} className="py-1.5 px-4 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">
                  🖨️ Imprimir Tudo ({totalEtiquetas} {totalEtiquetas === 1 ? "etiqueta" : "etiquetas"})
                </button>
              )}
            </div>
            {fila.length === 0 ? (
              <p className={`text-xs text-center py-6 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Nenhuma etiqueta na fila.</p>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {fila.map(f => (
                  <div key={f.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F5F5F7] border-[#E5E5EA]"}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{f.linhas[0]?.texto}</p>
                      {(f.linhas[1]?.texto || f.linhas[2]?.texto) && <p className={`text-[10px] truncate ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{[f.linhas[1]?.texto, f.linhas[2]?.texto].filter(Boolean).join(" • ")}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs font-semibold text-[#E8740E] bg-[#FFF5EB] px-2 py-0.5 rounded-full">×{f.qtd}</span>
                      <button onClick={() => removerFila(f.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
