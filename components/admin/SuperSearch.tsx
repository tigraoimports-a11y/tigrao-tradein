"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";
import { SkuInfoModal } from "@/components/admin/SkuInfoModal";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SearchResult = Record<string, any>;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const tipoBadgeColors: Record<string, string> = {
  "VENDA": "bg-green-100 text-green-700",
  "UPGRADE": "bg-purple-100 text-purple-700",
  "ATACADO": "bg-blue-100 text-blue-700",
};
const tipoBadgeFn = (tipo: string) => tipoBadgeColors[tipo] || "";

function OperacaoDetail({ op, vendas, onClose, dm }: { op: SearchResult; vendas: SearchResult[]; onClose: () => void; dm: boolean }) {
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgSection = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const divider = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";

  const opItems = vendas.filter(v => {
    const dataMatch = v.data === op.data;
    if (op.tipo === "Entrada") {
      return dataMatch && v.is_entrada && (v.fornecedor || "").toUpperCase() === op.contato.toUpperCase();
    } else {
      return dataMatch && !v.is_entrada && (v.cliente || "").toUpperCase() === op.contato.toUpperCase();
    }
  });

  const totalLucro = opItems.reduce((s: number, v: SearchResult) => s + (v.lucro || 0), 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg mx-4 ${bgCard} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${divider}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xl ${op.tipo === "Entrada" ? "text-green-500" : "text-blue-500"}`}>{op.tipo === "Entrada" ? "↓" : "↑"}</span>
            <div>
              <h3 className={`text-sm font-bold ${textPrimary}`}>Detalhes da Operação</h3>
              <p className={`text-xs ${textSecondary}`}>{op.data?.split("-").reverse().join("/")} · {op.tipo}</p>
            </div>
          </div>
          <button onClick={onClose} className={`text-lg ${textSecondary} hover:text-[#E8740E]`}>✕</button>
        </div>

        <div className={`mx-4 mt-4 p-4 rounded-xl border ${bgSection}`}>
          <p className={`text-[10px] uppercase tracking-wider ${textSecondary} mb-1`}>Contato</p>
          <p className={`text-sm font-bold ${textPrimary}`}>{op.contato}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${op.tipo === "Entrada" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{op.tipo}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600">Concluída</span>
          </div>
        </div>

        <div className="mx-4 mt-3">
          <p className={`text-xs font-bold ${textPrimary} mb-2`}>Produtos da Operação · {opItems.length > 0 ? opItems.length : op.total_itens} {(opItems.length || op.total_itens) === 1 ? "item" : "itens"}</p>
          <div className={`rounded-xl border ${bgSection} overflow-hidden`}>
            {opItems.length === 0 ? (
              <p className={`px-4 py-3 text-sm ${textSecondary}`}>Ative &quot;Incluir histórico completo&quot; para ver todos os itens</p>
            ) : opItems.map((item: SearchResult, i: number) => (
              <div key={i} className={`px-4 py-3 ${i > 0 ? `border-t ${divider}` : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${textPrimary} leading-snug`}>{item.produto}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.tipo_venda && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipoBadgeFn(item.tipo_venda)}`}>{item.tipo_venda}</span>}
                      {item.origem && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-gray-100 text-gray-600"}`}>{item.origem}</span>}
                    </div>
                    <div className={`text-[11px] ${textSecondary} mt-1 flex gap-2 flex-wrap`}>
                      {item.serial_no && <span className="font-mono text-purple-500">SN: {item.serial_no}</span>}
                      {item.imei && <span className="font-mono text-blue-500">IMEI: {item.imei}</span>}
                      {item.forma && <span>{item.forma}{item.banco ? ` · ${item.banco}` : ""}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {op.tipo === "Entrada" ? (
                      item.custo ? <p className="text-sm font-bold text-green-600">{fmt(item.custo)}</p> : null
                    ) : (
                      <>
                        {item.custo ? <p className={`text-[10px] ${textSecondary}`}>Custo: {fmt(item.custo)}</p> : null}
                        {item.preco_vendido ? <p className="text-sm font-bold text-[#E8740E]">{fmt(item.preco_vendido)}</p> : null}
                        {item.lucro !== undefined ? <p className={`text-[10px] font-semibold ${item.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{item.lucro >= 0 ? "+" : ""}{fmt(item.lucro)}</p> : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`mx-4 mt-3 mb-4 p-4 rounded-xl border ${bgSection}`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs font-bold ${textPrimary}`}>{op.tipo === "Entrada" ? "Custo Total (Trade-in)" : "Valor Total"}</p>
            <p className={`text-base font-bold ${op.tipo === "Entrada" ? "text-green-600" : "text-[#E8740E]"}`}>{fmt(op.valor_total)}</p>
          </div>
          {op.tipo === "Saída" && opItems.length > 0 && (() => {
            const totalCusto = opItems.reduce((s: number, v: SearchResult) => s + (v.custo || 0), 0);
            return totalCusto > 0 ? (
              <div className={`mt-2 pt-2 border-t ${divider} flex justify-between`}>
                <p className={`text-xs ${textSecondary}`}>Lucro total</p>
                <p className={`text-xs font-bold ${totalLucro >= 0 ? "text-green-600" : "text-red-500"}`}>{totalLucro >= 0 ? "+" : ""}{fmt(totalLucro)}</p>
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
}

function ContatoDetail({ contato, vendas, onClose, dm }: { contato: SearchResult; vendas: SearchResult[]; onClose: () => void; dm: boolean }) {
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgSection = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const divider = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";

  const compras = vendas.filter(v => !v.is_entrada && (v.cliente || "").toUpperCase() === contato.nome.toUpperCase());
  const tradeins = vendas.filter(v => v.is_entrada && (v.fornecedor || "").toUpperCase() === contato.nome.toUpperCase());
  const totalGasto = compras.reduce((s: number, v: SearchResult) => s + (v.preco_vendido || 0), 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg mx-4 ${bgCard} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${divider}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <h3 className={`text-sm font-bold ${textPrimary}`}>{contato.nome}</h3>
          </div>
          <button onClick={onClose} className={`text-lg ${textSecondary} hover:text-[#E8740E]`}>✕</button>
        </div>

        <div className={`mx-4 mt-4 p-4 rounded-xl border ${bgSection} grid grid-cols-2 gap-3`}>
          <div>
            <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>CPF</p>
            <p className={`text-sm ${textPrimary}`}>{contato.cpf || "—"}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Email</p>
            <p className={`text-sm ${textPrimary} truncate`}>{contato.email || "—"}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Total de compras</p>
            <p className={`text-sm font-bold ${textPrimary}`}>{contato.total_compras}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Total gasto</p>
            <p className="text-sm font-bold text-[#E8740E]">{totalGasto > 0 ? fmt(totalGasto) : "—"}</p>
          </div>
        </div>

        {compras.length > 0 && (
          <div className="mx-4 mt-3">
            <p className={`text-xs font-bold ${textPrimary} mb-2`}>Compras ({compras.length})</p>
            <div className={`rounded-xl border ${bgSection} overflow-hidden`}>
              {compras.map((v: SearchResult, i: number) => (
                <div key={i} className={`px-4 py-3 ${i > 0 ? `border-t ${divider}` : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${textPrimary} leading-snug`}>{v.produto}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {v.tipo_venda && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipoBadgeFn(v.tipo_venda)}`}>{v.tipo_venda}</span>}
                        <span className={`text-[11px] ${textSecondary}`}>{v.data?.split("-").reverse().join("/")}</span>
                        {v.serial_no && <span className="font-mono text-[11px] text-purple-500">SN: {v.serial_no}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {v.preco_vendido ? <p className="text-sm font-bold text-[#E8740E]">{fmt(v.preco_vendido)}</p> : null}
                      {v.lucro !== undefined ? <p className={`text-[10px] font-semibold ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{v.lucro >= 0 ? "+" : ""}{fmt(v.lucro)}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tradeins.length > 0 && (
          <div className="mx-4 mt-3 mb-4">
            <p className={`text-xs font-bold ${textPrimary} mb-2`}>Trade-ins entregues ({tradeins.length})</p>
            <div className={`rounded-xl border ${bgSection} overflow-hidden`}>
              {tradeins.map((v: SearchResult, i: number) => (
                <div key={i} className={`px-4 py-3 ${i > 0 ? `border-t ${divider}` : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${textPrimary} leading-snug`}>{v.produto}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">TRADE-IN</span>
                        <span className={`text-[11px] ${textSecondary}`}>{v.data?.split("-").reverse().join("/")}</span>
                        {v.serial_no && <span className="font-mono text-[11px] text-purple-500">SN: {v.serial_no}</span>}
                        {v.cliente && <span className={`text-[11px] ${textSecondary}`}>→ {v.cliente}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {v.custo ? <p className="text-sm font-bold text-green-600">{fmt(v.custo)}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {compras.length === 0 && tradeins.length === 0 && (
          <p className={`mx-4 mt-3 mb-4 text-sm ${textSecondary}`}>Ative &quot;Incluir histórico completo&quot; para ver o histórico</p>
        )}
        {(compras.length > 0 || tradeins.length > 0) && <div className="h-4" />}
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onSave, dm }: { item: SearchResult; onClose: () => void; onSave: (id: string, fields: Record<string, any>) => void; dm: boolean }) {
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgSection = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#3A3A3C] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;

  const isEstoque = item.tipo === "estoque";
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    imei: item.imei || "",
    serial_no: item.serial_no || "",
    observacao: item.observacao || "",
    cor: item.cor || "",
    fornecedor: item.fornecedor || "",
    custo_unitario: item.custo ? String(item.custo) : "",
  });

  // Parse tags estruturadas da observacao (seminovos)
  const obs: string = item.observacao || "";
  const gradeMatch = obs.match(/\[GRADE_(A\+|AB|A|B)\]/);
  const ciclosMatch = obs.match(/\[CICLOS:(\d+)\]/);
  const hasCaixa = /\[COM_CAIXA\]/.test(obs);
  const hasCabo = /\[COM_CABO\]/.test(obs);
  const hasFonte = /\[COM_FONTE\]/.test(obs);
  const hasPulseira = /\[COM_PULSEIRA\]/.test(obs);
  const pulseiraTamMatch = obs.match(/\[PULSEIRA_TAM:([^\]]+)\]/);
  const bandModelMatch = obs.match(/\[BAND:([^\]]+)\]/);
  const watchTamanhoMatch = (item.produto || "").match(/\b(38|40|41|42|44|45|46|49)\s*MM\b/i);
  const obsLimpa = obs.replace(/\[(NAO_ATIVADO|SEMINOVO|COM_CAIXA|COM_CABO|COM_FONTE|COM_PULSEIRA|EX_PENDENCIA|GRADE_(?:A\+|AB|A|B)|CICLOS:\d+)\]/g, "").trim();
  const isSeminovo = item.tipo_produto === "SEMINOVO" || !!gradeMatch || !!ciclosMatch || hasCaixa || hasCabo || hasFonte || hasPulseira;
  // Campos visíveis por categoria (conforme spec de seminovos)
  const catUpper = String(item.categoria || "").toUpperCase();
  const isIphone = catUpper.includes("IPHONE");
  const isIpad = catUpper.includes("IPAD");
  const isMac = catUpper.includes("MAC");
  const isWatch = catUpper.includes("WATCH");
  // Origem: apenas iPhone
  const showOrigem = isSeminovo && isIphone && !!item.origem;
  const showCiclos = isMac && !!ciclosMatch; // Ciclos: apenas MacBook (opcional)
  const showFonte = (isIpad || isMac) && hasFonte;
  const showCabo = !isWatch && hasCabo;
  const showPulseira = isWatch && hasPulseira;
  const showCaixa = hasCaixa;
  const showWatchTamanho = isWatch && !!watchTamanhoMatch;
  const showPulseiraTam = isWatch && !!pulseiraTamMatch;
  const showBandModel = isWatch && !!bandModelMatch;
  const hasSpecs = isSeminovo || !!item.origem || !!item.garantia || !!gradeMatch || showWatchTamanho || showPulseiraTam || showBandModel;

  const statusColor = (s: string) => {
    if (s === "EM ESTOQUE") return "text-green-600";
    if (s === "A CAMINHO") return "text-yellow-600";
    if (s === "PENDENTE") return "text-orange-600";
    if (s === "VENDIDO" || s === "FINALIZADO") return "text-blue-600";
    return textSecondary;
  };

  const handleSave = () => {
    const updates: Record<string, any> = {};
    if (editFields.imei !== (item.imei || "")) updates.imei = editFields.imei || null;
    if (editFields.serial_no !== (item.serial_no || "")) updates.serial_no = editFields.serial_no || null;
    if (editFields.observacao !== (item.observacao || "")) updates.observacao = editFields.observacao || null;
    if (editFields.cor !== (item.cor || "")) updates.cor = editFields.cor || null;
    if (editFields.fornecedor !== (item.fornecedor || "")) updates.fornecedor = editFields.fornecedor || null;
    if (editFields.custo_unitario !== (item.custo ? String(item.custo) : "")) updates.custo_unitario = parseFloat(editFields.custo_unitario) || 0;
    if (Object.keys(updates).length > 0) onSave(item.id, updates);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg mx-4 ${bgCard} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8ED]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isEstoque ? "📦" : "💰"}</span>
            <h3 className={`text-sm font-bold ${textPrimary}`}>Detalhes do Item</h3>
          </div>
          <div className="flex items-center gap-2">
            {isEstoque && (item.serial_no || item.imei) && !editing && (
              <button
                onClick={() => {
                  const codigo = item.serial_no || item.imei || "";
                  if (!codigo) return;
                  const win = window.open("", "_blank", "width=300,height=300");
                  if (!win) return;
                  const produtoNome = item.produto || "";
                  const cor = item.cor ? corParaPT(item.cor) : "";
                  const serial = item.serial_no || "";
                  const imei = item.imei || "";
                  const sku = item.sku || "";
                  // QR payload: JSON com sku + codigo identificador individual
                  // (serial ou imei). Scanner do estoque le os dois — identifica
                  // exatamente qual produto (SKU) E qual unidade (serial) em
                  // uma unica leitura.
                  const qrPayload = sku
                    ? JSON.stringify({ sku, c: codigo })
                    : codigo;
                  win.document.write(`<!DOCTYPE html><html><head>
<title>Etiqueta ${codigo}</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0;width:100%}
body{font-family:Arial,Helvetica,sans-serif}
.wrap{text-align:center;padding:3mm 5mm 2mm 5mm}
.produto{font-size:11pt;font-weight:bold;line-height:1.2}
.cor{font-size:8pt;color:#333;margin-top:1mm}
.extra{font-size:6pt;color:#444;margin-top:1mm}
.sku{font-size:6.5pt;color:#E8740E;font-weight:bold;margin-top:1mm;word-break:break-all;line-height:1.1}
.qr{margin:2mm auto 1mm;display:flex;justify-content:center}
.cod{font-size:7pt;color:#333;font-weight:bold;margin-top:1mm;margin-bottom:2mm}
@page{size:62mm 45mm;margin:0}
</style></head><body>
<div class="wrap">
<div class="produto">${produtoNome}</div>
${cor ? `<div class="cor">${cor}</div>` : ""}
${serial ? `<div class="extra">SN: ${serial}</div>` : ""}
${imei ? `<div class="extra">IMEI: ${imei}</div>` : ""}
${sku ? `<div class="sku">SKU: ${sku}</div>` : ""}
<div class="qr"><canvas id="qr"></canvas></div>
<div class="cod">${codigo}</div>
</div>
<script>
var qr = qrcode(0, 'M');
qr.addData(${JSON.stringify(qrPayload)});
qr.make();
var canvas = document.getElementById('qr');
var size = 150;
canvas.width = size; canvas.height = size;
canvas.style.width = '10mm'; canvas.style.height = '10mm';
var ctx = canvas.getContext('2d');
var cells = qr.getModuleCount();
var cellSize = size / cells;
ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
ctx.fillStyle = '#000';
for(var r=0;r<cells;r++) for(var c=0;c<cells;c++)
  if(qr.isDark(r,c)) ctx.fillRect(c*cellSize,r*cellSize,cellSize+0.5,cellSize+0.5);
window.onload=function(){window.print();window.close();};
<\/script></body></html>`);
                  win.document.close();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0066CC] text-white hover:bg-[#0055AA] transition-colors"
              >
                🏷️ Etiqueta
              </button>
            )}
            {isEstoque && item.status !== "VENDIDO" && (
              <button
                onClick={() => setEditing(!editing)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${editing ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#3A3A3C] text-[#F5A623]" : "bg-[#FFF3E0] text-[#E8740E]"}`}`}
              >
                {editing ? "Editando..." : "Editar"}
              </button>
            )}
            <button onClick={onClose} className={`text-lg ${textSecondary} hover:text-[#E8740E]`}>✕</button>
          </div>
        </div>

        {/* Produto Info */}
        <div className={`mx-4 mt-4 p-4 rounded-xl border ${bgSection}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Produto</p>
              <p className={`text-[15px] font-bold ${textPrimary}`}>{item.produto}</p>
            </div>
            <div className="text-right">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Status</p>
              <p className={`text-sm font-bold ${statusColor(item.status)}`}>{item.status}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {item.serial_no && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Numero de Serie</p>
                {editing ? <input value={editFields.serial_no} onChange={(e) => setEditFields(f => ({ ...f, serial_no: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm font-mono ${textPrimary}`}>{item.serial_no}</p>}
              </div>
            )}
            {(item.imei || editing) && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>IMEI</p>
                {editing ? <input value={editFields.imei} onChange={(e) => setEditFields(f => ({ ...f, imei: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm font-mono ${textPrimary}`}>{item.imei || "—"}</p>}
              </div>
            )}
            {item.cor && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Cor</p>
                {editing ? <input value={editFields.cor} onChange={(e) => setEditFields(f => ({ ...f, cor: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm ${textPrimary}`}>{corParaPT(item.cor)}</p>}
              </div>
            )}
            {item.categoria && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Categoria</p>
                <p className={`text-sm ${textPrimary}`}>{item.categoria}</p>
              </div>
            )}
            {item.tipo_produto && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Condicao</p>
                <p className={`text-sm ${textPrimary}`}>{item.tipo_produto === "NOVO" ? "Lacrado" : item.tipo_produto === "SEMINOVO" ? "Usado" : item.tipo_produto}</p>
              </div>
            )}
            {item.bateria && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Bateria</p>
                <p className={`text-sm ${textPrimary}`}>{item.bateria}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Informações Financeiras */}
        <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
          <p className={`text-xs font-bold ${textPrimary} mb-3`}>Informacoes Financeiras</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Preco de Compra</p>
              {editing ? <input type="number" value={editFields.custo_unitario} onChange={(e) => setEditFields(f => ({ ...f, custo_unitario: e.target.value }))} className={inputCls} />
                : <p className={`text-sm font-bold ${textPrimary}`}>{item.custo ? fmt(item.custo) : "—"}</p>}
            </div>
            {item.preco_vendido !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Preco de Venda</p>
                <p className="text-sm font-bold text-[#E8740E]">{fmt(item.preco_vendido)}</p>
              </div>
            )}
            {item.lucro !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Lucro</p>
                <p className={`text-sm font-bold ${item.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(item.lucro)}</p>
              </div>
            )}
            {item.margem !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Margem</p>
                <p className={`text-sm font-bold ${item.margem >= 0 ? "text-green-600" : "text-red-500"}`}>{item.margem.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Origem por Troca */}
        {item.troca_info && (
          <div className={`mx-4 mt-3 p-4 rounded-xl border ${dm ? "bg-[#3A2A1C] border-[#E8740E]/40" : "bg-[#FFF3E8] border-[#E8740E]/40"}`}>
            <p className={`text-xs font-bold ${textPrimary} mb-2 flex items-center gap-2`}>
              <span>🔄</span> Veio de uma Troca
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Operação</p>
                <p className={`text-sm font-mono ${textPrimary}`}>{item.troca_info.codigo}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Motivo</p>
                <p className={`text-sm ${textPrimary}`}>{item.troca_info.motivo}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data</p>
                <p className={`text-sm ${textPrimary}`}>{(() => { const [y,m,d] = (item.troca_info.data || "").split("-"); return y ? `${d}/${m}/${y}` : "—"; })()}</p>
              </div>
              {item.troca_info.fornecedor && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Contato</p>
                  <p className={`text-sm ${textPrimary}`}>{item.troca_info.fornecedor}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Produto que saiu</p>
                <p className={`text-sm ${textPrimary}`}>{item.troca_info.produto_saida_nome}{item.troca_info.produto_saida_cor ? ` · ${corParaPT(item.troca_info.produto_saida_cor)}` : ""}</p>
                {(item.troca_info.produto_saida_serial || item.troca_info.produto_saida_imei) && (
                  <p className={`text-xs font-mono ${textSecondary}`}>{item.troca_info.produto_saida_serial ? `SN ${item.troca_info.produto_saida_serial}` : ""}{item.troca_info.produto_saida_imei ? `  ·  IMEI ${item.troca_info.produto_saida_imei}` : ""}</p>
                )}
              </div>
              {item.troca_info.observacao && (
                <div className="col-span-2">
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Observação</p>
                  <p className={`text-sm ${textPrimary}`}>{item.troca_info.observacao}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Especificações (seminovos) */}
        {hasSpecs && (
          <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
            <p className={`text-xs font-bold ${textPrimary} mb-3`}>Especificações</p>
            <div className="grid grid-cols-2 gap-3">
              {gradeMatch && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Grade</p>
                  <p className={`text-sm font-bold ${textPrimary}`}>{gradeMatch[1]}</p>
                </div>
              )}
              {showOrigem && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Origem</p>
                  <p className={`text-sm ${textPrimary}`}>{item.origem}</p>
                </div>
              )}
              {showCiclos && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Ciclos</p>
                  <p className={`text-sm ${textPrimary}`}>{ciclosMatch![1]}</p>
                </div>
              )}
              {item.garantia && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Garantia</p>
                  <p className={`text-sm ${textPrimary}`}>{item.garantia}</p>
                </div>
              )}
              {showWatchTamanho && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Tamanho</p>
                  <p className={`text-sm ${textPrimary}`}>⌚ {watchTamanhoMatch![0].toUpperCase()}</p>
                </div>
              )}
              {showPulseiraTam && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Tamanho Pulseira</p>
                  <p className={`text-sm ${textPrimary}`}>{pulseiraTamMatch![1]}</p>
                </div>
              )}
              {showBandModel && (
                <div className="col-span-2">
                  <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Modelo Pulseira</p>
                  <p className={`text-sm ${textPrimary}`}>{bandModelMatch![1]}</p>
                </div>
              )}
            </div>
            {(showCaixa || showCabo || showFonte || showPulseira) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {showCaixa && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">📦 Com Caixa</span>}
                {showCabo && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">🔌 Com Cabo</span>}
                {showFonte && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">🔋 Com Carregador</span>}
                {showPulseira && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">⌚ Com Pulseira</span>}
              </div>
            )}
          </div>
        )}

        {/* Datas e Fornecedor */}
        <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
          <div className="grid grid-cols-2 gap-3">
            {item.data_compra && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data da Compra</p>
                <p className={`text-sm ${textPrimary}`}>{item.data_compra}</p>
              </div>
            )}
            {item.data_entrada && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data de Entrada</p>
                <p className={`text-sm ${textPrimary}`}>{item.data_entrada}</p>
              </div>
            )}
            {item.data && !item.data_entrada && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data</p>
                <p className={`text-sm ${textPrimary}`}>{item.data}</p>
              </div>
            )}
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Fornecedor</p>
              {editing ? <input value={editFields.fornecedor} onChange={(e) => setEditFields(f => ({ ...f, fornecedor: e.target.value }))} className={inputCls} />
                : <p className={`text-sm ${textPrimary}`}>{item.fornecedor || "Nao informado"}</p>}
            </div>
            {item.cliente && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Cliente</p>
                <p className={`text-sm ${textPrimary}`}>{item.cliente}</p>
              </div>
            )}
            {item.forma && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Forma de Pagamento</p>
                <p className={`text-sm ${textPrimary}`}>{item.forma}{item.banco ? ` (${item.banco})` : ""}{item.parcelas > 1 ? ` ${item.parcelas}x` : ""}</p>
              </div>
            )}
          </div>
          {obsLimpa && !editing && (
            <div className="mt-3">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Observacao</p>
              <p className={`text-sm ${textPrimary}`}>{obsLimpa}</p>
            </div>
          )}
          {editing && (
            <div className="mt-3">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Observacao</p>
              <input value={editFields.observacao} onChange={(e) => setEditFields(f => ({ ...f, observacao: e.target.value }))} className={inputCls} />
            </div>
          )}
        </div>

        {/* Botão "Ver operação" — apenas para vendas (não estoque) */}
        {!isEstoque && item.id && !editing && (
          <div className="mx-4 mt-3 mb-1">
            <button
              onClick={() => {
                const d = item.data || "";
                const [ano, mes, dia] = d.split("-");
                const url = `/admin/vendas?venda_id=${item.id}${ano ? `&ano=${ano}` : ""}${mes ? `&mes=${mes}` : ""}${dia ? `&dia=${dia}` : ""}`;
                onClose();
                window.location.href = url;
              }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${dm ? "bg-[#3A3A3C] text-[#E8740E] hover:bg-[#E8740E] hover:text-white" : "bg-[#FFF3E8] text-[#E8740E] border border-[#E8740E]/30 hover:bg-[#E8740E] hover:text-white"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              Ver operação
            </button>
          </div>
        )}

        {/* Botão imprimir etiqueta — quando tem serial ou imei */}
        {!editing && (item.serial_no || item.imei) && (
          <div className="mx-4 mt-2 mb-1">
            <button
              onClick={() => {
                const codigo = item.serial_no || item.imei || "";
                if (!codigo) return;
                const win = window.open("", "_blank", "width=300,height=300");
                if (!win) return;
                const produtoNome = item.produto || "";
                const cor = item.cor || "";
                const serial = item.serial_no || "";
                const imei = item.imei || "";
                win.document.write(`<!DOCTYPE html><html><head>
<title>Etiqueta ${codigo}</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0;width:100%}
body{font-family:Arial,Helvetica,sans-serif}
.wrap{text-align:center;padding:3mm 5mm 2mm 5mm}
.produto{font-size:11pt;font-weight:bold;line-height:1.2}
.cor{font-size:8pt;color:#333;margin-top:1mm}
.extra{font-size:6pt;color:#444;margin-top:1mm}
.qr{margin:2mm auto 1mm;display:flex;justify-content:center}
.cod{font-size:7pt;color:#333;font-weight:bold;margin-top:1mm;margin-bottom:2mm}
@page{size:62mm 45mm;margin:0}
</style></head><body>
<div class="wrap">
<div class="produto">${produtoNome}</div>
${cor ? `<div class="cor">${cor}</div>` : ""}
${serial ? `<div class="extra">SN: ${serial}</div>` : ""}
${imei ? `<div class="extra">IMEI: ${imei}</div>` : ""}
<div class="qr"><canvas id="qr"></canvas></div>
<div class="cod">${codigo}</div>
</div>
<script>
var qr = qrcode(0, 'M');
qr.addData('${codigo}');
qr.make();
var canvas = document.getElementById('qr');
var size = 150;
canvas.width = size; canvas.height = size;
canvas.style.width = '10mm'; canvas.style.height = '10mm';
var ctx = canvas.getContext('2d');
var cells = qr.getModuleCount();
var cellSize = size / cells;
ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
ctx.fillStyle = '#000';
for(var r=0;r<cells;r++) for(var c=0;c<cells;c++)
  if(qr.isDark(r,c)) ctx.fillRect(c*cellSize,r*cellSize,cellSize+0.5,cellSize+0.5);
window.onload=function(){window.print();window.close();};
<\/script></body></html>`);
                win.document.close();
              }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${dm ? "bg-[#2C2C2E] text-[#F5F5F7] border border-[#3A3A3C] hover:bg-[#3A3A3C]" : "bg-white text-[#1D1D1F] border border-[#D2D2D7] hover:bg-[#F5F5F7]"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              Imprimir Etiqueta
            </button>
          </div>
        )}

        {/* Botão salvar edição */}
        {editing && (
          <div className="mx-4 mt-3 mb-4 flex gap-2">
            <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] transition-colors">
              Salvar Alteracoes
            </button>
            <button onClick={() => setEditing(false)} className={`px-4 py-3 rounded-xl border text-sm font-semibold ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"}`}>
              Cancelar
            </button>
          </div>
        )}

        {!editing && <div className="h-4" />}
      </div>
    </div>
  );
}

interface CategorizedResults {
  operacoes: SearchResult[];
  contatos: SearchResult[];
  estoque: SearchResult[];
  vendas: SearchResult[];
}

export default function SuperSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { password, darkMode: dm } = useAdmin();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CategorizedResults>({ operacoes: [], contatos: [], estoque: [], vendas: [] });
  const [loading, setLoading] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [detailItem, setDetailItem] = useState<SearchResult | null>(null);
  const [selectedOp, setSelectedOp] = useState<SearchResult | null>(null);
  const [selectedContato, setSelectedContato] = useState<SearchResult | null>(null);
  const [skuInfo, setSkuInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasResults = results.operacoes.length + results.contatos.length + results.estoque.length + results.vendas.length > 0;

  // SKU unico compartilhado pelos resultados: quando estoque + vendas convergem
  // no mesmo SKU, mostra um banner de "resumo desse SKU" no topo — 1 clique pra
  // ver o agregador completo em vez de clicar item por item.
  const skuComum = (() => {
    const skus = new Set<string>();
    for (const r of [...results.estoque, ...results.vendas]) {
      if (r.sku) skus.add(r.sku);
    }
    return skus.size === 1 ? [...skus][0] : null;
  })();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults({ operacoes: [], contatos: [], estoque: [], vendas: [] });
      setDetailItem(null);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({ operacoes: [], contatos: [], estoque: [], vendas: [] }); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (includeHistory) params.set("history", "true");
      const res = await fetch(`/api/admin/search?${params}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setResults({
          operacoes: json.operacoes ?? [],
          contatos: json.contatos ?? [],
          estoque: json.estoque ?? [],
          vendas: json.vendas ?? [],
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, includeHistory]);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.trim()) search(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detailItem) setDetailItem(null);
        else if (open) onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, detailItem]);

  const handleSave = async (id: string, fields: Record<string, any>) => {
    try {
      const res = await fetch("/api/estoque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id, ...fields }),
      });
      if (res.ok) {
        // Atualizar resultado na lista
        setResults(prev => {
          if (Array.isArray(prev)) return prev.map(r => r.id === id ? { ...r, ...fields, custo: fields.custo_unitario ?? r.custo } : r) as typeof prev;
          return prev;
        });
        if (detailItem?.id === id) setDetailItem(prev => prev ? { ...prev, ...fields, custo: fields.custo_unitario ?? prev.custo } : null);
      }
    } catch { /* ignore */ }
  };

  if (!open) return null;

  const bgModal = dm ? "bg-[#1C1C1E]" : "bg-white";
  const borderModal = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const bgHover = dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]";

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "EM ESTOQUE": "bg-green-100 text-green-700",
      "A CAMINHO": "bg-yellow-100 text-yellow-700",
      "PENDENTE": "bg-orange-100 text-orange-700",
      "FINALIZADO": "bg-blue-100 text-blue-700",
      "AGUARDANDO": "bg-purple-100 text-purple-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const tipoBadge = tipoBadgeFn;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className={`w-full max-w-2xl ${bgModal} border ${borderModal} rounded-2xl shadow-2xl overflow-hidden`} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className={`flex items-center gap-3 px-5 py-4 border-b ${borderModal}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={textSecondary}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por produto, serie, IMEI, cliente, fornecedor..."
              className={`flex-1 bg-transparent text-[15px] ${textPrimary} focus:outline-none`}
            />
            <button onClick={onClose} className={`text-xs px-2 py-1 rounded border ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#E8E8ED] text-[#86868B]"}`}>ESC</button>
          </div>

          {/* Toggle */}
          <div className={`px-5 py-2 border-b ${borderModal} flex items-center gap-2`}>
            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} className="accent-[#E8740E]" id="hist" />
            <label htmlFor="hist" className={`text-xs ${textSecondary} cursor-pointer`}>Incluir historico completo</label>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className={`py-12 text-center text-sm ${textSecondary}`}>Buscando...</div>
            ) : query.length < 2 ? (
              <div className="py-12 text-center">
                <p className="text-3xl mb-2">🔍</p>
                <p className={`text-sm ${textSecondary}`}>Digite para buscar</p>
              </div>
            ) : !hasResults ? (
              <div className="py-12 text-center">
                <p className={`text-sm ${textSecondary}`}>Nenhum resultado para &quot;{query}&quot;</p>
              </div>
            ) : (
              <div>
                {/* ── BANNER SKU (quando todos os resultados compartilham o mesmo SKU) ── */}
                {skuComum && (
                  <button
                    onClick={() => setSkuInfo(skuComum)}
                    className={`w-full text-left px-5 py-3 border-b ${dm ? "border-[#2C2C2E] bg-[#FFF5EB]/5" : "border-[#F0F0F5] bg-[#FFF5EB]"} hover:bg-[#E8740E]/10 transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📊</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold text-[#E8740E]`}>Resumo completo do SKU</p>
                        <p className={`text-[11px] font-mono ${textSecondary} truncate`}>{skuComum}</p>
                      </div>
                      <span className={`text-xs ${textSecondary}`}>clique para ver tudo →</span>
                    </div>
                  </button>
                )}
                {/* ── OPERAÇÕES ── */}
                {results.operacoes.length > 0 && (
                  <>
                    <div className={`px-5 py-2 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Operacoes ({results.operacoes.length})</span>
                    </div>
                    {results.operacoes.map((op, i) => (
                      <div key={`op-${i}`} className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors border-b ${dm ? "border-[#2C2C2E]" : "border-[#F0F0F5]"}`}
                        onClick={() => setSelectedOp(op)}>
                        <div className="flex items-center gap-3">
                          <span className={`text-lg ${op.tipo === "Entrada" ? "text-green-500" : "text-blue-500"}`}>
                            {op.tipo === "Entrada" ? "↓" : "↑"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${textPrimary}`}>{op.contato}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${op.tipo === "Entrada" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{op.tipo}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600">{op.status}</span>
                            </div>
                            <div className={`text-xs ${textSecondary} mt-0.5`}>
                              {op.data?.split("-").reverse().join("/")} · {op.total_itens} {op.total_itens === 1 ? "item" : "itens"} · <span className="text-[#E8740E]">clique para detalhes</span>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-green-600 shrink-0">{fmt(op.valor_total)}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* ── CONTATOS ── */}
                {results.contatos.length > 0 && (
                  <>
                    <div className={`px-5 py-2 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Contatos ({results.contatos.length})</span>
                    </div>
                    {results.contatos.map((c, i) => (
                      <div key={`ct-${i}`} className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors border-b ${dm ? "border-[#2C2C2E]" : "border-[#F0F0F5]"}`}
                        onClick={() => setSelectedContato(c)}>
                        <div className="flex items-center gap-3">
                          <span className="text-lg">👤</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${textPrimary}`}>{c.nome}</span>
                              {c.origem === "ATACADO" && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">Atacado</span>}
                            </div>
                            <div className={`text-xs ${textSecondary} mt-0.5 flex items-center gap-3`}>
                              {c.cpf && <span>{c.cpf}</span>}
                              {c.email && <span>{c.email}</span>}
                              <span>{c.total_compras} {c.total_compras === 1 ? "compra" : "compras"}</span>
                              <span className="text-[#E8740E]">clique para detalhes</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* ── ESTOQUE ── */}
                {results.estoque.length > 0 && (
                  <>
                    <div className={`px-5 py-2 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Estoque ({results.estoque.length})</span>
                    </div>
                    {results.estoque.map((r) => (
                      <div
                        key={`est-${r.id}`}
                        className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors border-b ${dm ? "border-[#2C2C2E]" : "border-[#F0F0F5]"}`}
                        onClick={() => setDetailItem({ ...r, tipo: "estoque" })}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${textPrimary} truncate`}>{r.produto}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(r.status)}`}>{r.status}</span>
                            </div>
                            <div className={`text-xs ${textSecondary} mt-0.5 flex items-center gap-2 flex-wrap`}>
                              {r.serial_no && <span className="font-mono text-purple-500">SN: {r.serial_no}</span>}
                              {r.imei && <span className="font-mono text-blue-500">IMEI: {r.imei}</span>}
                              {r.fornecedor && <span>Forn: {r.fornecedor}</span>}
                              {r.data_entrada && <span>{r.data_entrada}</span>}
                            </div>
                          </div>
                          {/* Botao SKU (resumo 360°) quando item tem sku e nao e o skuComum do banner */}
                          {r.sku && r.sku !== skuComum && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSkuInfo(r.sku); }}
                              title={`Ver resumo do SKU: ${r.sku}`}
                              className={`text-xs px-2 py-1 rounded border shrink-0 ${dm ? "border-[#3A3A3C] text-[#E8740E] hover:bg-[#3A3A3C]" : "border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB]"}`}
                            >
                              📊
                            </button>
                          )}
                          {r.custo ? <p className={`text-sm font-semibold ${textSecondary} shrink-0`}>{fmt(r.custo)}</p> : null}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* ── VENDAS ── */}
                {results.vendas.length > 0 && (
                  <>
                    <div className={`px-5 py-2 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Vendas ({results.vendas.length})</span>
                    </div>
                    {results.vendas.map((r) => (
                      <div
                        key={`vd-${r.id}`}
                        className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors border-b ${dm ? "border-[#2C2C2E]" : "border-[#F0F0F5]"}`}
                        onClick={() => setDetailItem({ ...r, tipo: "venda" })}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{r.is_entrada ? "📲" : "💰"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${textPrimary} truncate`}>{r.produto}</span>
                              {r.is_entrada
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">TRADE-IN</span>
                                : r.tipo_venda && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipoBadge(r.tipo_venda)}`}>{r.tipo_venda}</span>
                              }
                              {r.origem && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-gray-100 text-gray-600"}`}>{r.origem}</span>}
                            </div>
                            <div className={`text-xs ${textSecondary} mt-0.5 flex items-center gap-2 flex-wrap`}>
                              {r.is_entrada
                                ? <>
                                    <span className="text-green-600 font-medium">De: {r.fornecedor}</span>
                                    {r.cliente && <span>→ {r.cliente}</span>}
                                  </>
                                : r.cliente && <span>{r.cliente}</span>
                              }
                              {r.data && <span>{r.data.split("-").reverse().join("/")}</span>}
                              {r.serial_no && <span className="font-mono text-purple-500">SN: {r.serial_no}</span>}
                            </div>
                          </div>
                          {/* Botao SKU (resumo 360°) */}
                          {r.sku && r.sku !== skuComum && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSkuInfo(r.sku); }}
                              title={`Ver resumo do SKU: ${r.sku}`}
                              className={`text-xs px-2 py-1 rounded border shrink-0 ${dm ? "border-[#3A3A3C] text-[#E8740E] hover:bg-[#3A3A3C]" : "border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB]"}`}
                            >
                              📊
                            </button>
                          )}
                          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                            {r.is_entrada ? (
                              /* Trade-in: mostrar valor recebido (custo) */
                              r.custo ? <p className="text-sm font-bold text-green-600">{fmt(r.custo)}</p> : null
                            ) : (
                              /* Venda normal: custo + preco + lucro */
                              <>
                                {r.custo && (
                                  <p className={`text-[10px] ${textSecondary}`}>Custo: {fmt(r.custo)}</p>
                                )}
                                {r.preco_vendido && (
                                  <p className="text-sm font-bold text-[#E8740E]">{fmt(r.preco_vendido)}</p>
                                )}
                                {r.lucro !== undefined && (
                                  <p className={`text-[10px] font-semibold ${r.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {r.lucro >= 0 ? "+" : ""}{fmt(r.lucro)}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal (estoque) */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onSave={handleSave}
          dm={dm}
        />
      )}

      {/* Operação Detail Modal */}
      {selectedOp && (
        <OperacaoDetail
          op={selectedOp}
          vendas={results.vendas}
          onClose={() => setSelectedOp(null)}
          dm={dm}
        />
      )}

      {/* Contato Detail Modal */}
      {selectedContato && (
        <ContatoDetail
          contato={selectedContato}
          vendas={results.vendas}
          onClose={() => setSelectedContato(null)}
          dm={dm}
        />
      )}

      {/* SKU Info Modal — visao 360° agregada de um SKU canonico */}
      {skuInfo && <SkuInfoModal sku={skuInfo} onClose={() => setSkuInfo(null)} />}
    </>
  );
}
