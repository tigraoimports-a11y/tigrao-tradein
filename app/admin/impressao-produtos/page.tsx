"use client";
import { useState, useEffect } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";

interface ProdutoEstoque {
  id: string;
  produto: string;
  categoria: string;
  cor: string | null;
  observacao: string | null;
  qnt: number;
  status: string;
}

interface EtiquetaFila {
  id: string;
  linha1: string;
  linha2: string;
  linha3: string;
  qtd: number;
}

// ── Parsear nome do produto em 3 linhas ──
function parseProduto(nome: string, cor: string | null, obs: string | null): { linha1: string; linha2: string; linha3: string } {
  const upper = nome.toUpperCase();

  // Cor em PT (maiúscula)
  const corPT = cor ? corParaPT(cor).toUpperCase() : "";

  // Detectar padrões comuns
  // MacBook: "MacBook Air M5 15 16GB 512GB Preto" → L1: MACBOOK AIR M5, L2: 15" 16GB | 512GB, L3: PRETO
  const macMatch = upper.match(/^(MACBOOK\s+(?:AIR|PRO)\s+(?:M\d+(?:\s+(?:PRO|MAX|ULTRA))?)?)/);
  if (macMatch) {
    const base = macMatch[1].trim();
    // Extrair tela, RAM, armazenamento
    const telaMatch = upper.match(/\b(1[3-6](?:[.,]\d)?)\s*(?:"|POL|POLEGADAS?)?/);
    const ramMatch = upper.match(/\b(\d+)\s*GB\b/);
    const storageMatch = upper.match(/\b(\d+)\s*(?:GB|TB)\b/g);
    const tela = telaMatch ? `${telaMatch[1]}"` : "";
    const ram = ramMatch ? `${ramMatch[1]}GB` : "";
    // Armazenamento é o último match de GB/TB (ou o segundo se tem RAM)
    let storage = "";
    if (storageMatch && storageMatch.length > 1) {
      storage = storageMatch[storageMatch.length - 1].replace(/\s+/g, "").toUpperCase();
    } else if (storageMatch && !ramMatch) {
      storage = storageMatch[0].replace(/\s+/g, "").toUpperCase();
    }
    // Nucleos da observação [NUCLEOS:X]
    const nucleosMatch = obs?.match(/\[NUCLEOS:(\d+)\]/);
    const nucleos = nucleosMatch ? `${nucleosMatch[1]}N` : "";

    const configParts = [tela, nucleos, ram, storage].filter(Boolean);
    const config = configParts.length > 1
      ? `${configParts.slice(0, -1).join(" ")} | ${configParts[configParts.length - 1]}`
      : configParts.join(" ");

    return { linha1: base, linha2: config, linha3: corPT };
  }

  // Mac Mini: "Mac Mini M4 Pro 24GB 512GB" → L1: MAC MINI M4 PRO, L2: 24GB | 512GB, L3: COR
  const miniMatch = upper.match(/^(MAC\s*MINI\s+(?:M\d+(?:\s+(?:PRO|MAX|ULTRA))?)?)/);
  if (miniMatch) {
    const base = miniMatch[1].trim();
    const ramMatch = upper.match(/\b(\d+)\s*GB\b/);
    const storageMatches = upper.match(/\b(\d+)\s*(?:GB|TB)\b/g);
    const ram = ramMatch ? `${ramMatch[1]}GB` : "";
    let storage = "";
    if (storageMatches && storageMatches.length > 1) {
      storage = storageMatches[storageMatches.length - 1].replace(/\s+/g, "").toUpperCase();
    }
    const config = [ram, storage].filter(Boolean).join(" | ");
    return { linha1: base, linha2: config, linha3: corPT };
  }

  // iPhone: "iPhone 17 Pro Max 256GB Preto" → L1: IPHONE 17 PRO MAX, L2: 256GB, L3: PRETO
  const iphoneMatch = upper.match(/^(IPHONE\s+\d+\s*(?:PRO\s*MAX|PRO|PLUS|MINI|AIR)?)/);
  if (iphoneMatch) {
    const base = iphoneMatch[1].trim();
    const storageMatch = upper.match(/\b(\d+)\s*GB\b/);
    const storage = storageMatch ? storageMatch[0].replace(/\s+/g, "").toUpperCase() : "";
    return { linha1: base, linha2: storage, linha3: corPT };
  }

  // iPad: "iPad Pro M5 13 256GB WiFi" → L1: IPAD PRO M5, L2: 13" 256GB | WIFI, L3: COR
  const ipadMatch = upper.match(/^(IPAD\s+(?:PRO|AIR|MINI)?\s*(?:M\d+)?)/);
  if (ipadMatch) {
    const base = ipadMatch[1].trim();
    const telaMatch = upper.match(/\b(1[0-3](?:[.,]\d)?)\s*(?:"|POL)?/);
    const storageMatch = upper.match(/\b(\d+)\s*GB\b/);
    const wifiMatch = upper.match(/\b(WIFI|WI-FI|CELLULAR|5G)\b/i);
    const tela = telaMatch ? `${telaMatch[1]}"` : "";
    const storage = storageMatch ? storageMatch[0].replace(/\s+/g, "").toUpperCase() : "";
    const conn = wifiMatch ? wifiMatch[1].toUpperCase() : "";
    const configParts = [tela, storage, conn].filter(Boolean);
    const config = configParts.join(" | ");
    return { linha1: base, linha2: config, linha3: corPT };
  }

  // Apple Watch: "Apple Watch Series 11 42MM GPS Dourado" → L1: APPLE WATCH S11, L2: 42MM GPS, L3: DOURADO
  const watchMatch = upper.match(/^(APPLE\s+WATCH\s+(?:SERIES\s+\d+|ULTRA\s*\d*|SE\s*\d*))/);
  if (watchMatch) {
    let base = watchMatch[1].trim().replace(/SERIES\s+(\d+)/, "S$1");
    const tamMatch = upper.match(/\b(4[0-9])\s*MM\b/);
    const connMatch = upper.match(/\b(GPS|CELLULAR)\b/i);
    const tam = tamMatch ? `${tamMatch[1]}MM` : "";
    const conn = connMatch ? connMatch[1].toUpperCase() : "";
    const config = [tam, conn].filter(Boolean).join(" ");
    return { linha1: base, linha2: config, linha3: corPT };
  }

  // AirPods: "AirPods Pro 2 USB-C" → L1: AIRPODS PRO 2, L2: USB-C, L3: BRANCO
  const airpodsMatch = upper.match(/^(AIRPODS\s+(?:PRO\s*\d*|MAX|\d))/);
  if (airpodsMatch) {
    const base = airpodsMatch[1].trim();
    const usbMatch = upper.match(/\b(USB-C|LIGHTNING|MagSafe)\b/i);
    const config = usbMatch ? usbMatch[1].toUpperCase() : "";
    return { linha1: base, linha2: config, linha3: corPT || "BRANCO" };
  }

  // Genérico: tudo na linha 1, sem config
  // Tenta separar armazenamento se existir
  const genericStorage = upper.match(/\b(\d+)\s*(?:GB|TB)\b/);
  if (genericStorage) {
    const idx = upper.indexOf(genericStorage[0]);
    const basePart = upper.slice(0, idx).trim();
    const storagePart = genericStorage[0].replace(/\s+/g, "");
    // Remover cor do nome base
    const baseClean = corPT ? basePart.replace(new RegExp(`\\s*${corPT}\\s*$`, "i"), "").trim() : basePart;
    return { linha1: baseClean || upper, linha2: storagePart, linha3: corPT };
  }

  // Fallback: nome inteiro na linha 1
  const cleanName = corPT ? upper.replace(new RegExp(`\\s*${corPT}\\s*$`, "i"), "").trim() : upper;
  return { linha1: cleanName || upper, linha2: "", linha3: corPT };
}

// ── CSS print (mesmo padrão Brother QL-820NWB 62mm x 45mm) ──
const PRINT_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{margin:0;padding:0;width:100%}
  body{font-family:Arial,Helvetica,sans-serif}
  .wrap{text-align:center;padding:5mm 5mm 3mm 5mm;display:flex;flex-direction:column;justify-content:center;height:100%;min-height:45mm}
  .linha1{font-size:11pt;font-weight:bold;line-height:1.2;text-transform:uppercase}
  .linha2{font-size:9pt;color:#333;margin-top:1.5mm;line-height:1.2}
  .linha3{font-size:8pt;color:#333;margin-top:1.5mm;text-transform:uppercase}
  @page{size:62mm 45mm;margin:0}
`;

function gerarHtmlEtiqueta(linha1: string, linha2: string, linha3: string): string {
  return `<div class="wrap">
    <div class="linha1">${linha1}</div>
    ${linha2 ? `<div class="linha2">${linha2}</div>` : ""}
    ${linha3 ? `<div class="linha3">${linha3}</div>` : ""}
  </div>`;
}

export default function ImpressaoProdutosPage() {
  const { password } = useAdmin();
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");

  // Campos editáveis da etiqueta
  const [linha1, setLinha1] = useState("");
  const [linha2, setLinha2] = useState("");
  const [linha3, setLinha3] = useState("");
  const [qtd, setQtd] = useState(1);

  // Fila de impressão
  const [fila, setFila] = useState<EtiquetaFila[]>([]);

  // Fetch estoque
  useEffect(() => {
    if (!password) return;
    fetch("/api/estoque", { headers: { "x-admin-password": password } })
      .then((r) => r.json())
      .then((j) => {
        const items = (j.data || j.estoque || []).filter((p: ProdutoEstoque) => p.status === "EM ESTOQUE" && p.qnt > 0);
        setProdutos(items);
      })
      .catch(() => {});
  }, [password]);

  // Filtrar produtos
  const buscaUpper = busca.toUpperCase();
  const filtrados = produtos.filter((p) => {
    if (catFiltro && p.categoria !== catFiltro) return false;
    if (buscaUpper && !p.produto.toUpperCase().includes(buscaUpper)) return false;
    return true;
  });

  // Selecionar produto → auto-preencher
  function selecionarProduto(p: ProdutoEstoque) {
    const parsed = parseProduto(p.produto, p.cor, p.observacao);
    setLinha1(parsed.linha1);
    setLinha2(parsed.linha2);
    setLinha3(parsed.linha3);
    setBusca(p.produto);
  }

  // Adicionar à fila
  function adicionarFila() {
    if (!linha1.trim()) return;
    setFila([...fila, { id: Date.now().toString(), linha1: linha1.trim(), linha2: linha2.trim(), linha3: linha3.trim(), qtd }]);
    setLinha1(""); setLinha2(""); setLinha3(""); setQtd(1); setBusca("");
  }

  // Remover da fila
  function removerFila(id: string) {
    setFila(fila.filter((f) => f.id !== id));
  }

  // Imprimir uma etiqueta
  function imprimirUma() {
    if (!linha1.trim()) return;
    const win = window.open("", "_blank", "width=300,height=300");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta Produto</title>
      <style>${PRINT_CSS}</style></head><body>
      ${gerarHtmlEtiqueta(linha1, linha2, linha3)}
      <script>window.onload=function(){window.print();window.close();};<\/script></body></html>`);
    win.document.close();
  }

  // Imprimir toda a fila
  function imprimirFila() {
    if (fila.length === 0) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const pages: string[] = [];
    for (const item of fila) {
      for (let i = 0; i < item.qtd; i++) {
        pages.push(`<div class="page">${gerarHtmlEtiqueta(item.linha1, item.linha2, item.linha3)}</div>`);
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

  // Limpar tudo
  function limpar() {
    setLinha1(""); setLinha2(""); setLinha3(""); setQtd(1); setBusca(""); setFila([]);
  }

  const dm = false; // dark mode placeholder
  const inputCls = `w-full px-3 py-2 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} text-sm focus:border-[#E8740E] focus:outline-none`;
  const labelCls = `text-[10px] font-semibold uppercase tracking-wide mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  // Categorias únicas dos produtos
  const categorias = [...new Set(produtos.map((p) => p.categoria))].filter(Boolean).sort();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D1D1F]">🖨️ Impressão Produtos</h1>
        <button onClick={limpar} className="text-xs text-red-500 hover:underline">🗑️ Limpar tudo</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Coluna esquerda: buscar produto + campos ── */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-[#E5E5EA] bg-white space-y-3">
            <p className="text-sm font-bold text-[#1D1D1F]">📦 Selecionar Produto</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelCls}>Categoria</p>
                <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)} className={inputCls}>
                  <option value="">Todas</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>Buscar</p>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome..." className={inputCls} />
              </div>
            </div>

            {busca && filtrados.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-[#E5E5EA] divide-y divide-[#E5E5EA]">
                {filtrados.slice(0, 20).map((p) => (
                  <button key={p.id} onClick={() => selecionarProduto(p)} className="w-full px-3 py-2 text-left hover:bg-[#FFF5EB] transition-colors">
                    <p className="text-sm font-semibold text-[#1D1D1F]">{p.produto}</p>
                    <p className="text-[10px] text-[#86868B]">{p.cor ? corParaPT(p.cor) : "—"} • {p.categoria}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl border border-[#E5E5EA] bg-white space-y-3">
            <p className="text-sm font-bold text-[#1D1D1F]">✏️ Conteúdo da Etiqueta</p>
            <div>
              <p className={labelCls}>Linha 1 — Nome do produto</p>
              <input value={linha1} onChange={(e) => setLinha1(e.target.value.toUpperCase())} placeholder="Ex: MACBOOK AIR M5" className={`${inputCls} font-bold`} />
            </div>
            <div>
              <p className={labelCls}>Linha 2 — Configuração</p>
              <input value={linha2} onChange={(e) => setLinha2(e.target.value)} placeholder="Ex: 15&quot; 16GB | 512GB" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Linha 3 — Cor</p>
              <input value={linha3} onChange={(e) => setLinha3(e.target.value.toUpperCase())} placeholder="Ex: PRETO" className={inputCls} />
            </div>
            <div className="flex items-end gap-3">
              <div className="w-24">
                <p className={labelCls}>Quantidade</p>
                <input type="number" min={1} max={50} value={qtd} onChange={(e) => setQtd(Math.max(1, parseInt(e.target.value) || 1))} className={inputCls} />
              </div>
              <button onClick={adicionarFila} disabled={!linha1.trim()} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                + Adicionar à fila
              </button>
              <button onClick={imprimirUma} disabled={!linha1.trim()} className="py-2 px-4 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 transition-colors">
                🖨️ Imprimir
              </button>
            </div>
          </div>
        </div>

        {/* ── Coluna direita: preview + fila ── */}
        <div className="space-y-4">
          {/* Preview */}
          <div className="p-4 rounded-2xl border border-[#E5E5EA] bg-white">
            <p className="text-sm font-bold text-[#1D1D1F] mb-3">👁️ Preview da Etiqueta</p>
            <div className="mx-auto border border-dashed border-[#D2D2D7] rounded-lg" style={{ width: "62mm", height: "45mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", padding: "3mm 5mm", fontFamily: "Arial, Helvetica, sans-serif" }}>
                <div style={{ fontSize: "11pt", fontWeight: "bold", lineHeight: 1.2 }}>{linha1 || "NOME DO PRODUTO"}</div>
                {(linha2 || !linha1) && <div style={{ fontSize: "9pt", color: "#333", marginTop: "1.5mm", lineHeight: 1.2 }}>{linha2 || "CONFIGURAÇÃO"}</div>}
                {(linha3 || !linha1) && <div style={{ fontSize: "8pt", color: "#333", marginTop: "1.5mm" }}>{linha3 || "COR"}</div>}
              </div>
            </div>
          </div>

          {/* Fila de impressão */}
          <div className="p-4 rounded-2xl border border-[#E5E5EA] bg-white">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-[#1D1D1F]">📋 Fila de Impressão ({fila.length})</p>
              {fila.length > 0 && (
                <button onClick={imprimirFila} className="py-1.5 px-4 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">
                  🖨️ Imprimir Tudo ({fila.reduce((s, f) => s + f.qtd, 0)} etiquetas)
                </button>
              )}
            </div>
            {fila.length === 0 ? (
              <p className="text-xs text-[#86868B] text-center py-4">Nenhuma etiqueta na fila. Adicione produtos acima.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {fila.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F5F7] border border-[#E5E5EA]">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1D1D1F] truncate">{f.linha1}</p>
                      <p className="text-[10px] text-[#86868B] truncate">{[f.linha2, f.linha3].filter(Boolean).join(" • ")}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs font-semibold text-[#E8740E]">×{f.qtd}</span>
                      <button onClick={() => removerFila(f.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Digitação manual rápida */}
          <div className="p-4 rounded-2xl border border-dashed border-[#E5E5EA] bg-[#FAFAFA]">
            <p className="text-xs text-[#86868B] text-center">
              💡 <strong>Dica:</strong> Selecione um produto do estoque para preencher automaticamente,
              ou digite manualmente nos campos à esquerda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
