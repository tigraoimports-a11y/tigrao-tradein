"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface EtiquetaFila {
  id: string;
  linha1: string;
  linha2: string;
  linha3: string;
  qtd: number;
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
  useAdmin(); // auth guard

  // Campos editáveis da etiqueta
  const [linha1, setLinha1] = useState("");
  const [linha2, setLinha2] = useState("");
  const [linha3, setLinha3] = useState("");
  const [qtd, setQtd] = useState(1);

  // Fila de impressão
  const [fila, setFila] = useState<EtiquetaFila[]>([]);

  function adicionarFila() {
    if (!linha1.trim()) return;
    setFila([...fila, { id: Date.now().toString(), linha1: linha1.trim(), linha2: linha2.trim(), linha3: linha3.trim(), qtd }]);
    setLinha1(""); setLinha2(""); setLinha3(""); setQtd(1);
  }

  function removerFila(id: string) {
    setFila(fila.filter((f) => f.id !== id));
  }

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

  const inputCls = "w-full px-3 py-2.5 rounded-lg border bg-white border-[#D2D2D7] text-[#1D1D1F] text-sm focus:border-[#E8740E] focus:outline-none";
  const labelCls = "text-[10px] font-semibold uppercase tracking-wide mb-1 text-[#86868B]";
  const totalEtiquetas = fila.reduce((s, f) => s + f.qtd, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D1D1F]">🖨️ Impressão Produtos</h1>
        {fila.length > 0 && (
          <button onClick={() => setFila([])} className="text-xs text-red-500 hover:underline">🗑️ Limpar fila</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Coluna esquerda: campos + ações ── */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-[#E5E5EA] bg-white space-y-4">
            <p className="text-sm font-bold text-[#1D1D1F]">✏️ Conteúdo da Etiqueta</p>
            <div>
              <p className={labelCls}>Linha 1 — Nome do produto</p>
              <input value={linha1} onChange={(e) => setLinha1(e.target.value.toUpperCase())} placeholder="Ex: MACBOOK AIR M5" className={`${inputCls} font-bold`} autoFocus />
            </div>
            <div>
              <p className={labelCls}>Linha 2 — Configuração</p>
              <input value={linha2} onChange={(e) => setLinha2(e.target.value)} placeholder='Ex: 15" 16GB | 512GB' className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Linha 3 — Cor</p>
              <input value={linha3} onChange={(e) => setLinha3(e.target.value.toUpperCase())} placeholder="Ex: PRETO" className={inputCls} />
            </div>
            <div className="flex items-end gap-3 pt-1">
              <div className="w-20">
                <p className={labelCls}>Qtd</p>
                <input type="number" min={1} max={50} value={qtd} onChange={(e) => setQtd(Math.max(1, parseInt(e.target.value) || 1))} className={`${inputCls} text-center`} />
              </div>
              <button onClick={adicionarFila} disabled={!linha1.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                + Adicionar à fila
              </button>
              <button onClick={imprimirUma} disabled={!linha1.trim()} className="py-2.5 px-4 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 transition-colors">
                🖨️ Imprimir
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-[#D2D2D7] bg-[#FAFAFA]">
            <p className="text-[11px] text-[#86868B] leading-relaxed">
              💡 Digite livremente o que quiser em cada linha. Use <strong>"+ Adicionar à fila"</strong> para montar um lote e imprimir tudo de uma vez, ou <strong>"🖨️ Imprimir"</strong> para imprimir direto.
            </p>
          </div>
        </div>

        {/* ── Coluna direita: preview + fila ── */}
        <div className="space-y-4">
          {/* Preview */}
          <div className="p-5 rounded-2xl border border-[#E5E5EA] bg-white">
            <p className="text-sm font-bold text-[#1D1D1F] mb-3">👁️ Preview</p>
            <div className="mx-auto border-2 border-dashed border-[#D2D2D7] rounded-lg" style={{ width: "62mm", height: "45mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", padding: "3mm 5mm", fontFamily: "Arial, Helvetica, sans-serif" }}>
                <div style={{ fontSize: "11pt", fontWeight: "bold", lineHeight: 1.2, textTransform: "uppercase" as const, color: linha1 ? "#1D1D1F" : "#CCC" }}>{linha1 || "NOME DO PRODUTO"}</div>
                {(linha2 || !linha1) && <div style={{ fontSize: "9pt", color: linha2 ? "#333" : "#CCC", marginTop: "1.5mm", lineHeight: 1.2 }}>{linha2 || "CONFIGURAÇÃO"}</div>}
                {(linha3 || !linha1) && <div style={{ fontSize: "8pt", color: linha3 ? "#333" : "#CCC", marginTop: "1.5mm", textTransform: "uppercase" as const }}>{linha3 || "COR"}</div>}
              </div>
            </div>
          </div>

          {/* Fila de impressão */}
          <div className="p-5 rounded-2xl border border-[#E5E5EA] bg-white">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-[#1D1D1F]">📋 Fila de Impressão</p>
              {fila.length > 0 && (
                <button onClick={imprimirFila} className="py-1.5 px-4 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">
                  🖨️ Imprimir Tudo ({totalEtiquetas} {totalEtiquetas === 1 ? "etiqueta" : "etiquetas"})
                </button>
              )}
            </div>
            {fila.length === 0 ? (
              <p className="text-xs text-[#86868B] text-center py-6">Nenhuma etiqueta na fila.</p>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {fila.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#F5F5F7] border border-[#E5E5EA]">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1D1D1F] truncate">{f.linha1}</p>
                      {(f.linha2 || f.linha3) && <p className="text-[10px] text-[#86868B] truncate">{[f.linha2, f.linha3].filter(Boolean).join(" • ")}</p>}
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
