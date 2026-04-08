"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { corParaPT } from "@/lib/cor-pt";
import { useAdmin } from "@/components/admin/AdminShell";

interface Operacao {
  codigo: string;
  data: string;
  tipo: "Entrada" | "Saída" | "Troca";
  contato: string;
  itens: OperacaoItem[];
  total_itens: number;
  valor_total: number;
  status: string;
  created_at: string;
}

interface OperacaoItem {
  id: string;
  produto: string;
  serial_no: string | null;
  imei: string | null;
  preco: number;
  custo: number;
  tipo_venda: string | null;
  cor: string | null;
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDate = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function OperacoesPage() {
  const { password, darkMode: dm, apiHeaders } = useAdmin();
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOp, setDetailOp] = useState<Operacao | null>(null);
  const [filterTipo, setFilterTipo] = useState<"todos" | "entrada" | "saida" | "troca">("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchOperacoes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTipo !== "todos") params.set("tipo", filterTipo);
      if (search) params.set("search", search);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(`/api/admin/operacoes?${params}`, { headers: apiHeaders() });
      if (res.ok) {
        const json = await res.json();
        setOperacoes(json.operacoes ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, filterTipo, search, page, apiHeaders]);

  useEffect(() => { fetchOperacoes(); }, [fetchOperacoes]);
  useAutoRefetch(fetchOperacoes);

  const bgCard = dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]";
  const bgSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const txtP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const txtS = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl font-bold ${txtP}`}>Operacoes</h1>
        <p className={`text-sm ${txtS}`}>Historico de entradas e saidas de produtos</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {(["todos", "entrada", "saida", "troca"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setFilterTipo(t); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${filterTipo === t ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}
            >
              {t === "todos" ? "Todas" : t === "entrada" ? "↓ Entradas" : t === "saida" ? "↑ Saídas" : "↔ Trocas"}
            </button>
          ))}
        </div>
        <input
          placeholder="Buscar por contato, produto..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className={`${inputCls} max-w-xs`}
        />
      </div>

      {/* Lista */}
      <div className={`border rounded-2xl overflow-hidden shadow-sm ${bgCard}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                {["Codigo", "Data", "Tipo", "Contato", "Total Itens", "Valor Total", "Status", ""].map((h) => (
                  <th key={h} className={`px-4 py-3 text-left font-medium text-xs uppercase tracking-wider whitespace-nowrap ${txtS}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className={`px-4 py-12 text-center ${txtS}`}>Carregando...</td></tr>
              ) : operacoes.length === 0 ? (
                <tr><td colSpan={8} className={`px-4 py-12 text-center ${txtS}`}>Nenhuma operacao encontrada</td></tr>
              ) : operacoes.map((op) => (
                <tr
                  key={op.codigo}
                  onClick={() => setDetailOp(op)}
                  className={`border-b cursor-pointer transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#FAFAFA]"}`}
                >
                  <td className={`px-4 py-3 font-mono text-xs ${txtP}`}>{op.codigo}</td>
                  <td className={`px-4 py-3 ${txtS}`}>{fmtDate(op.data)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${op.tipo === "Entrada" ? "bg-green-100 text-green-700" : op.tipo === "Troca" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                      {op.tipo === "Entrada" ? "↓" : op.tipo === "Troca" ? "↔" : "↑"} {op.tipo}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-medium ${txtP}`}>{op.contato}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${txtS}`}>{op.total_itens} {op.total_itens === 1 ? "item" : "itens"}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-green-600">{fmt(op.valor_total)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">{op.status}</span>
                  </td>
                  <td className={`px-4 py-3 ${txtS}`}>
                    <span className="text-xs">›</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {!loading && operacoes.length > 0 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className={`px-4 py-2 rounded-xl text-sm font-semibold ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} disabled:opacity-30`}>← Anterior</button>
          <span className={`px-4 py-2 text-sm ${txtS}`}>Página {page + 1}</span>
          <button onClick={() => setPage(page + 1)} disabled={operacoes.length < PAGE_SIZE} className={`px-4 py-2 rounded-xl text-sm font-semibold ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} disabled:opacity-30`}>Próxima →</button>
        </div>
      )}

      {/* Modal Detalhes da Operação */}
      {detailOp && (() => {
        const op = detailOp;
        const custoTotal = op.itens.reduce((s: number, i: OperacaoItem) => s + (i.custo || 0), 0);
        const lucroTotal = op.valor_total - custoTotal;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:bg-white print:items-start" onClick={() => setDetailOp(null)} onKeyDown={(e) => { if (e.key === "Escape") setDetailOp(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className={`w-full max-w-2xl mx-4 ${dm ? "bg-[#1C1C1E]" : "bg-white"} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto print:max-h-none print:shadow-none print:rounded-none`} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                <div>
                  <p className={`text-[10px] ${txtS}`}>{op.codigo}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${op.tipo === "Entrada" ? "bg-green-100 text-green-700" : op.tipo === "Troca" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                      {op.tipo === "Entrada" ? "↓" : op.tipo === "Troca" ? "↔" : "↑"} {op.tipo}
                    </span>
                    <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">{op.status}</span>
                    <span className={`text-sm font-semibold ${txtP}`}>{fmtDate(op.data)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <button onClick={() => window.print()} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${txtS} hover:text-[#E8740E]`} title="Imprimir">🖨️</button>
                  <button onClick={() => setDetailOp(null)} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${txtS} hover:text-[#E8740E] text-lg`}>✕</button>
                </div>
              </div>

              {/* Contato */}
              <div className={`mx-5 mt-4 p-4 rounded-xl border ${bgSec}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Contato</p>
                    <p className={`text-sm font-bold ${txtP}`}>{op.contato}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Tipo de Entrega</p>
                    <p className={`text-sm ${txtP}`}>{op.tipo === "Entrada" ? "Compra Fornecedor" : "Retirada"}</p>
                  </div>
                </div>
              </div>

              {/* Produtos da Operação */}
              <div className={`mx-5 mt-3 p-4 rounded-xl border ${bgSec}`}>
                <p className={`text-xs font-bold ${txtP} mb-3`}>Produtos da Operacao ({op.itens.length} {op.itens.length === 1 ? "item" : "itens"})</p>
                <div className="space-y-3">
                  {op.itens.map((item) => (
                    <div key={item.id} className={`px-4 py-3 rounded-lg border-l-4 ${dm ? "bg-[#1C1C1E] border-l-[#E8740E]" : "bg-white border-l-[#E8740E]"}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${txtP}`}>{item.produto}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {item.tipo_venda && <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.tipo_venda === "NOVO" || item.tipo_venda === "VENDA" ? "bg-green-100 text-green-700" : item.tipo_venda === "UPGRADE" ? "bg-purple-100 text-purple-700" : item.tipo_venda === "ATACADO" ? "bg-blue-100 text-blue-700" : item.tipo_venda === "SEMINOVO" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}`}>{item.tipo_venda}</span>}
                            {item.cor && <span className={`text-[11px] ${txtS}`}>{corParaPT(item.cor)}</span>}
                          </div>
                          {(item.serial_no || item.imei) && (
                            <div className={`flex items-center gap-4 mt-2 px-3 py-2 rounded-lg ${dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]"}`}>
                              {item.serial_no && (
                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.serial_no || ""); }} className="flex items-center gap-1 text-[11px] font-mono text-purple-500 hover:text-purple-700" title="Copiar serial">
                                  <span className={`text-[9px] font-sans font-bold ${txtS}`}>SN</span> {item.serial_no}
                                </button>
                              )}
                              {item.imei && (
                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.imei || ""); }} className="flex items-center gap-1 text-[11px] font-mono text-[#0071E3] hover:text-blue-700" title="Copiar IMEI">
                                  <span className={`text-[9px] font-sans font-bold ${txtS}`}>IMEI</span> {item.imei}
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const codigo = item.serial_no || item.imei || "";
                                  if (!codigo) return;
                                  const win = window.open("", "_blank", "width=300,height=300");
                                  if (!win) return;
                                  const produtoNome = item.produto || "";
                                  const cor = item.cor ? corParaPT(item.cor) : "";
                                  const serial = item.serial_no || "";
                                  const imei = item.imei || "";
                                  win.document.write(`<!DOCTYPE html><html><head>
<title>Etiqueta ${codigo}</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{margin:0;padding:0;width:100%}body{font-family:Arial,Helvetica,sans-serif}.wrap{text-align:center;padding:3mm 5mm 2mm 5mm}.produto{font-size:11pt;font-weight:bold;line-height:1.2}.cor{font-size:8pt;color:#333;margin-top:1mm}.extra{font-size:6pt;color:#444;margin-top:1mm}.qr{margin:2mm auto 1mm;display:flex;justify-content:center}.cod{font-size:7pt;color:#333;font-weight:bold;margin-top:1mm;margin-bottom:2mm}@page{size:62mm 45mm;margin:0}</style></head><body>
<div class="wrap"><div class="produto">${produtoNome}</div>${cor ? `<div class="cor">${cor}</div>` : ""}${serial ? `<div class="extra">SN: ${serial}</div>` : ""}${imei ? `<div class="extra">IMEI: ${imei}</div>` : ""}<div class="qr"><canvas id="qr"></canvas></div><div class="cod">${codigo}</div></div>
<script>var qr=qrcode(0,'M');qr.addData('${codigo}');qr.make();var canvas=document.getElementById('qr');var size=150;canvas.width=size;canvas.height=size;canvas.style.width='10mm';canvas.style.height='10mm';var ctx=canvas.getContext('2d');var cells=qr.getModuleCount();var cellSize=size/cells;ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000';for(var r=0;r<cells;r++)for(var c=0;c<cells;c++)if(qr.isDark(r,c))ctx.fillRect(c*cellSize,r*cellSize,cellSize+0.5,cellSize+0.5);window.onload=function(){window.print();window.close();};<\/script></body></html>`);
                                  win.document.close();
                                }}
                                className={`ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20"}`}
                                title="Imprimir etiqueta"
                              >
                                🏷️ Etiqueta
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-bold text-green-600 shrink-0 ml-3">{fmt(item.preco)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumo Financeiro */}
              <div className={`mx-5 mt-3 p-4 rounded-xl border ${bgSec}`}>
                <p className={`text-xs font-bold ${txtP} mb-3`}>Resumo Financeiro</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Total Itens</p>
                    <p className={`text-[14px] font-bold ${txtP} mt-0.5`}>{op.total_itens}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Valor Total</p>
                    <p className="text-[14px] font-bold text-green-600 mt-0.5">{fmt(op.valor_total)}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Data</p>
                    <p className={`text-[13px] ${txtP} mt-0.5`}>{fmtDate(op.data)}</p>
                  </div>
                  {op.tipo === "Saída" && custoTotal > 0 && (
                    <>
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Custo Total</p>
                        <p className={`text-[13px] ${txtP} mt-0.5`}>{fmt(custoTotal)}</p>
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Lucro</p>
                        <p className={`text-[13px] font-bold mt-0.5 ${lucroTotal >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(lucroTotal)}</p>
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${txtS}`}>Margem</p>
                        <p className={`text-[13px] font-bold mt-0.5 ${lucroTotal >= 0 ? "text-green-600" : "text-red-500"}`}>{op.valor_total > 0 ? (lucroTotal / op.valor_total * 100).toFixed(1) : "0"}%</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mx-5 mt-4 mb-5 print:hidden">
                <button onClick={() => setDetailOp(null)} className={`w-full py-3 rounded-xl text-sm font-semibold ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"} transition-colors`}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
