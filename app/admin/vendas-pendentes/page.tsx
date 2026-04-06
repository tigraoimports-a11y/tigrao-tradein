"use client";
import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface VendaPendente {
  id: string;
  created_at: string;
  data: string;
  cliente: string;
  produto: string;
  cor: string | null;
  vendedor: string | null;
  notas: string | null;
  status_pagamento: string;
  forma: string | null;
  banco: string | null;
  preco_vendido: number | null;
  custo: number | null;
  produto_na_troca: string | null;
  troca_produto: string | null;
  troca_cor: string | null;
  troca_bateria: string | null;
  troca_obs: string | null;
  produto_na_troca2: string | null;
  troca_produto2: string | null;
  serial_no: string | null;
  imei: string | null;
  estoque_id: string | null;
}

const FORMAS = ["PIX", "CARTAO", "DEBITO", "ESPECIE", "DINHEIRO", "FIADO", "LINK"];
const BANCOS = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"];

function fmtData(d: string) {
  if (!d) return "";
  const [y, m, dia] = d.split("-");
  return `${dia}/${m}/${y}`;
}

function fmtBRL(v: number | null) {
  if (!v) return "–";
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

export default function VendasPendentesPage() {
  const { apiHeaders, darkMode, user } = useAdmin();
  const dm = darkMode;

  const isAdmin = user?.role === "admin";
  const podeAcessar = isAdmin || (user?.permissoes?.includes("vendas_pendentes") ?? false);

  const [vendas, setVendas] = useState<VendaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ id: string; tipo: "ok" | "erro"; texto: string } | null>(null);

  const bg = dm ? "bg-[#1C1C1E]" : "bg-[#F5F5F7]";
  const card = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]";
  const txt = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const sub = dm ? "text-[#AEAEB2]" : "text-[#6E6E73]";
  const inp = dm
    ? "bg-[#3A3A3C] border-[#48484A] text-[#F5F5F7] placeholder-[#6E6E73]"
    : "bg-white border-[#C7C7CC] text-[#1D1D1F] placeholder-[#AEAEB2]";
  const inputCls = `w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-orange-200 ${inp}`;
  const labelCls = `block text-xs font-semibold mb-1 ${sub}`;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/vendas?status_pagamento=PENDENTE&limit=200", {
        headers: apiHeaders(),
      });
      if (r.ok) {
        const j = await r.json();
        const pendentes = (j.data || []).filter((v: VendaPendente) => v.status_pagamento === "PENDENTE");
        setVendas(pendentes);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiHeaders]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirEdicao(v: VendaPendente) {
    setExpandedId(v.id);
    setMsg(null);
    setEditForm({
      forma: v.forma || "",
      banco: v.banco || "ITAU",
      preco_vendido: v.preco_vendido ? String(v.preco_vendido) : "",
      custo: v.custo ? String(v.custo) : "",
      produto_na_troca: v.produto_na_troca || "",
      troca_produto: v.troca_produto || "",
      troca_cor: v.troca_cor || "",
      troca_bateria: v.troca_bateria || "",
      troca_obs: v.troca_obs || "",
      produto_na_troca2: v.produto_na_troca2 || "",
      troca_produto2: v.troca_produto2 || "",
      notas: v.notas || "",
    });
  }

  async function salvarPagamento(id: string, finalizar: boolean) {
    setSalvando(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        id,
        forma: editForm.forma || null,
        banco: editForm.banco || null,
        preco_vendido: editForm.preco_vendido ? parseFloat(editForm.preco_vendido.replace(/\./g, "").replace(",", ".")) : null,
        custo: editForm.custo ? parseFloat(editForm.custo.replace(/\./g, "").replace(",", ".")) : null,
        produto_na_troca: editForm.produto_na_troca || null,
        troca_produto: editForm.troca_produto || null,
        troca_cor: editForm.troca_cor || null,
        troca_bateria: editForm.troca_bateria || null,
        troca_obs: editForm.troca_obs || null,
        produto_na_troca2: editForm.produto_na_troca2 || null,
        troca_produto2: editForm.troca_produto2 || null,
        notas: editForm.notas || null,
      };
      if (finalizar) payload.status_pagamento = "AGUARDANDO";

      const r = await fetch("/api/vendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const err = await r.json();
        setMsg({ id, tipo: "erro", texto: err.error || "Erro ao salvar." });
        return;
      }

      setMsg({ id, tipo: "ok", texto: finalizar ? "Venda finalizada e movida para histórico!" : "Dados salvos." });
      if (finalizar) {
        setExpandedId(null);
        await carregar();
      } else {
        await carregar();
      }
    } catch {
      setMsg({ id, tipo: "erro", texto: "Erro de conexão." });
    } finally {
      setSalvando(false);
    }
  }

  if (!podeAcessar) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className={`${card} border rounded-2xl p-8 text-center max-w-sm`}>
          <p className="text-3xl mb-3">🔒</p>
          <p className={`font-bold text-lg ${txt}`}>Acesso restrito</p>
          <p className={`text-sm mt-2 ${sub}`}>Apenas André e Nicolas têm acesso a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} p-4 md:p-6`}>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-2xl font-bold ${txt}`}>Vendas Pendentes</h1>
            <p className={`text-sm mt-1 ${sub}`}>Vendas registradas sem pagamento — complete as informações abaixo.</p>
          </div>
          <button onClick={carregar} className={`text-xs px-3 py-1.5 rounded-lg border ${dm ? "border-[#48484A] text-[#AEAEB2]" : "border-[#C7C7CC] text-[#6E6E73]"}`}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className={`text-sm ${sub}`}>Carregando...</p>
        ) : vendas.length === 0 ? (
          <div className={`${card} border rounded-2xl p-8 text-center`}>
            <p className="text-3xl mb-2">✅</p>
            <p className={`font-bold ${txt}`}>Nenhuma venda pendente</p>
            <p className={`text-sm mt-1 ${sub}`}>Todas as vendas já foram processadas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendas.map(v => (
              <div key={v.id} className={`${card} border rounded-2xl overflow-hidden`}>
                {/* Header do card */}
                <button
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
                  onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${txt}`}>{v.cliente}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium`}>PENDENTE</span>
                    </div>
                    <p className={`text-sm ${sub} mt-0.5 truncate`}>{v.produto}{v.cor ? ` — ${v.cor}` : ""}</p>
                    <p className={`text-xs ${sub}`}>{fmtData(v.data)}{v.vendedor ? ` • registrado por ${v.vendedor}` : ""}</p>
                  </div>
                  <span className={`text-lg ${expandedId === v.id ? "rotate-90" : ""} transition-transform`}>›</span>
                </button>

                {/* Painel de edição */}
                {expandedId === v.id && (
                  <div className={`border-t px-4 py-4 space-y-4 ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                    {/* Info do produto */}
                    <div className={`rounded-xl p-3 text-xs space-y-1 ${dm ? "bg-[#3A3A3C]" : "bg-[#F5F5F7]"}`}>
                      <p className={sub}><strong>Produto:</strong> {v.produto}{v.cor ? ` — ${v.cor}` : ""}</p>
                      {v.serial_no && <p className={sub}><strong>Serial:</strong> {v.serial_no}</p>}
                      {v.notas && <p className={sub}><strong>Obs (vendedor):</strong> {v.notas}</p>}
                    </div>

                    {msg?.id === v.id && (
                      <p className={`text-sm font-medium px-3 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {msg.texto}
                      </p>
                    )}

                    {/* Pagamento */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${sub}`}>Pagamento</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Forma</label>
                          <select className={inputCls} value={editForm.forma} onChange={e => setEditForm(f => ({ ...f, forma: e.target.value }))}>
                            <option value="">— Selecione —</option>
                            {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Banco</label>
                          <select className={inputCls} value={editForm.banco} onChange={e => setEditForm(f => ({ ...f, banco: e.target.value }))}>
                            {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Valor vendido (R$)</label>
                          <input className={inputCls} value={editForm.preco_vendido} onChange={e => setEditForm(f => ({ ...f, preco_vendido: e.target.value }))} placeholder="0" />
                        </div>
                        <div>
                          <label className={labelCls}>Custo (R$)</label>
                          <input className={inputCls} value={editForm.custo} onChange={e => setEditForm(f => ({ ...f, custo: e.target.value }))} placeholder="0" />
                        </div>
                      </div>
                    </div>

                    {/* Produto na troca */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${sub}`}>Produto na Troca <span className="font-normal">(opcional)</span></p>
                      <div className="space-y-2">
                        <input className={inputCls} value={editForm.produto_na_troca} onChange={e => setEditForm(f => ({ ...f, produto_na_troca: e.target.value }))} placeholder="Valor avaliado (ex: R$ 3.500)" />
                        <div className="grid grid-cols-2 gap-2">
                          <input className={inputCls} value={editForm.troca_produto} onChange={e => setEditForm(f => ({ ...f, troca_produto: e.target.value }))} placeholder="Produto (ex: iPhone 15 Pro)" />
                          <input className={inputCls} value={editForm.troca_cor} onChange={e => setEditForm(f => ({ ...f, troca_cor: e.target.value }))} placeholder="Cor" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input className={inputCls} value={editForm.troca_bateria} onChange={e => setEditForm(f => ({ ...f, troca_bateria: e.target.value }))} placeholder="Bateria %" />
                          <input className={inputCls} value={editForm.troca_obs} onChange={e => setEditForm(f => ({ ...f, troca_obs: e.target.value }))} placeholder="Observação" />
                        </div>
                        {/* 2ª troca */}
                        <input className={inputCls} value={editForm.produto_na_troca2} onChange={e => setEditForm(f => ({ ...f, produto_na_troca2: e.target.value }))} placeholder="2ª troca — valor (opcional)" />
                        {editForm.produto_na_troca2 && (
                          <input className={inputCls} value={editForm.troca_produto2} onChange={e => setEditForm(f => ({ ...f, troca_produto2: e.target.value }))} placeholder="2ª troca — produto" />
                        )}
                      </div>
                    </div>

                    {/* Observação interna */}
                    <div>
                      <label className={labelCls}>Observações internas</label>
                      <textarea className={`${inputCls} resize-none`} rows={2} value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} />
                    </div>

                    {/* Botões */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => salvarPagamento(v.id, false)}
                        disabled={salvando}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition disabled:opacity-40 ${dm ? "border-[#48484A] text-[#F5F5F7]" : "border-[#C7C7CC] text-[#1D1D1F]"}`}
                      >
                        Salvar rascunho
                      </button>
                      <button
                        onClick={() => salvarPagamento(v.id, true)}
                        disabled={salvando || !editForm.forma}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#E8740E] hover:bg-[#D4600A] text-white transition disabled:opacity-40"
                      >
                        {salvando ? "Salvando..." : "Finalizar venda"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
