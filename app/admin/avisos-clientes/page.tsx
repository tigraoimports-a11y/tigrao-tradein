"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { SkuFilterBanner, useSkuFilter } from "@/components/admin/SkuFilterBanner";

interface EstoqueMatch {
  id: string;
  produto: string;
  cor: string | null;
  qnt: number;
}

interface Aviso {
  id: string;
  nome: string;
  whatsapp: string | null;
  instagram: string | null;
  produto_desejado: string;
  observacao: string | null;
  status: "AGUARDANDO" | "NOTIFICADO" | "CANCELADO";
  notificado_em: string | null;
  created_at: string;
  disponivel_qnt?: number;
  estoque_matches?: EstoqueMatch[];
  sku?: string | null;
}

const STATUS_LABELS: Record<Aviso["status"], string> = {
  AGUARDANDO: "⏳ Aguardando",
  NOTIFICADO: "✅ Notificado",
  CANCELADO: "❌ Cancelado",
};

function buildMensagemChegou(aviso: Aviso): string {
  const linhas = [
    `Oi ${aviso.nome.split(" ")[0]}! 👋`,
    ``,
    `Aqui é da TigrãoImports — o produto que você estava esperando chegou:`,
    ``,
    `🍎 *${aviso.produto_desejado}*`,
  ];
  if (aviso.estoque_matches && aviso.estoque_matches.length > 0) {
    linhas.push(``, `Disponível agora:`);
    for (const m of aviso.estoque_matches) {
      linhas.push(`• ${m.produto}${m.cor ? ` — ${m.cor}` : ""} (${m.qnt} em estoque)`);
    }
  }
  linhas.push(
    ``,
    `Quer fechar? É só responder aqui que te passo todos os detalhes 😉`,
  );
  return linhas.join("\n");
}

export default function AvisosClientesPage() {
  const { password, apiHeaders, darkMode: dm } = useAdmin();
  const skuFilter = useSkuFilter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODOS" | "DISPONIVEL" | Aviso["status"]>("DISPONIVEL");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", whatsapp: "", instagram: "", produto_desejado: "", observacao: "" });

  const fetchAvisos = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/avisos-clientes`, { headers: apiHeaders() });
      if (res.ok) {
        const j = await res.json();
        setAvisos(j.data || []);
      }
    } finally { setLoading(false); }
  }, [password, apiHeaders]);

  useEffect(() => { fetchAvisos(); }, [fetchAvisos]);

  const resetForm = () => { setForm({ nome: "", whatsapp: "", instagram: "", produto_desejado: "", observacao: "" }); setEditing(null); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.produto_desejado.trim()) {
      setMsg("Preencha nome e produto desejado"); return;
    }
    setSaving(true); setMsg("");
    try {
      const method = editing ? "PATCH" : "POST";
      const body = editing ? { id: editing, ...form } : form;
      const res = await fetch("/api/admin/avisos-clientes", {
        method,
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg("Erro: " + (j.error || "falha ao salvar")); return; }
      setMsg(editing ? "Aviso atualizado!" : "Aviso criado!");
      resetForm();
      fetchAvisos();
    } finally { setSaving(false); }
  };

  const changeStatus = async (id: string, status: Aviso["status"]) => {
    await fetch("/api/admin/avisos-clientes", {
      method: "PATCH",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, status }),
    });
    fetchAvisos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este aviso?")) return;
    await fetch(`/api/admin/avisos-clientes?id=${id}`, { method: "DELETE", headers: apiHeaders() });
    fetchAvisos();
  };

  const startEdit = (a: Aviso) => {
    setEditing(a.id);
    setForm({
      nome: a.nome,
      whatsapp: a.whatsapp || "",
      instagram: a.instagram || "",
      produto_desejado: a.produto_desejado,
      observacao: a.observacao || "",
    });
  };

  // Filtro por SKU via URL (?sku=X) — aplica ANTES dos filtros de status
  const avisosFiltradosSku = skuFilter
    ? avisos.filter((a) => (a.sku || "").toUpperCase() === skuFilter)
    : avisos;
  const disponivelAgora = avisosFiltradosSku.filter(a => a.status === "AGUARDANDO" && (a.disponivel_qnt || 0) > 0);
  let filtrados: Aviso[];
  if (filtro === "TODOS") filtrados = avisosFiltradosSku;
  else if (filtro === "DISPONIVEL") filtrados = disponivelAgora;
  else filtrados = avisosFiltradosSku.filter(a => a.status === filtro);
  // Disponíveis primeiro (mesmo dentro de cada filtro), depois por data
  filtrados = [...filtrados].sort((a, b) => {
    const aHas = (a.disponivel_qnt || 0) > 0 && a.status === "AGUARDANDO" ? 1 : 0;
    const bHas = (b.disponivel_qnt || 0) > 0 && b.status === "AGUARDANDO" ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const contagem = {
    TODOS: avisos.length,
    DISPONIVEL: disponivelAgora.length,
    AGUARDANDO: avisos.filter(a => a.status === "AGUARDANDO").length,
    NOTIFICADO: avisos.filter(a => a.status === "NOTIFICADO").length,
    CANCELADO: avisos.filter(a => a.status === "CANCELADO").length,
  };

  const inputCls = `w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
  const cardCls = `rounded-2xl p-4 sm:p-6 shadow-sm ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-white border border-[#D2D2D7]"}`;
  const titleCls = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className={`text-lg font-bold ${titleCls}`}>📢 Avisos para Clientes</h1>
        <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Anotações de produtos aguardados — notifique quando chegar</p>
      </div>

      <SkuFilterBanner total={filtrados.length} />

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? (dm ? "bg-red-900/30 text-red-300" : "bg-red-50 text-red-700") : (dm ? "bg-green-900/30 text-green-300" : "bg-green-50 text-green-700")}`}>
          {msg}
        </div>
      )}

      {/* Form */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-sm font-bold ${titleCls}`}>{editing ? "✏️ Editar Aviso" : "➕ Novo Aviso"}</h2>
          {editing && <button onClick={resetForm} className="text-xs text-red-500 hover:underline">Cancelar edição</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Nome *</p>
            <input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do cliente" className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>Produto Desejado *</p>
            <input value={form.produto_desejado} onChange={(e) => setForm(f => ({ ...f, produto_desejado: e.target.value }))} placeholder="Ex: iPhone 17 Pro Max 512GB Preto" className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>WhatsApp</p>
            <input value={form.whatsapp} onChange={(e) => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(21) 99999-9999" className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>Instagram</p>
            <input value={form.instagram} onChange={(e) => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <p className={labelCls}>Observação</p>
            <input value={form.observacao} onChange={(e) => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Detalhes adicionais..." className={inputCls} />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Adicionar Aviso"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["DISPONIVEL", "AGUARDANDO", "NOTIFICADO", "CANCELADO", "TODOS"] as const).map(s => {
          const active = filtro === s;
          const label =
            s === "TODOS" ? "Todos"
            : s === "DISPONIVEL" ? "💚 Disponível agora"
            : STATUS_LABELS[s as Aviso["status"]];
          const isDisponivelTab = s === "DISPONIVEL";
          const baseStyle = active
            ? (isDisponivelTab ? "bg-green-500 text-white" : "bg-[#E8740E] text-white")
            : isDisponivelTab && contagem.DISPONIVEL > 0
              ? (dm ? "bg-green-900/40 text-green-300 hover:bg-green-900/60" : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-300")
              : (dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E5E5EA]");
          return (
            <button key={s} onClick={() => setFiltro(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${baseStyle}`}>
              {label} ({contagem[s]})
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className={`p-8 text-center ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className={`${cardCls} text-center`}>
          <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Nenhum aviso {filtro === "DISPONIVEL" ? "disponível agora" : filtro !== "TODOS" ? STATUS_LABELS[filtro].toLowerCase() : ""}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map(a => {
            const wa = a.whatsapp ? a.whatsapp.replace(/\D/g, "") : "";
            const disponivel = (a.disponivel_qnt || 0) > 0 && a.status === "AGUARDANDO";
            const cardBorder = disponivel
              ? (dm ? "bg-green-900/10 border-green-500/40" : "bg-green-50/50 border-green-400")
              : (dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]");
            const linkWaChegou = wa
              ? `https://wa.me/55${wa}?text=${encodeURIComponent(buildMensagemChegou(a))}`
              : null;
            return (
              <div key={a.id} className={`rounded-2xl p-4 sm:p-6 shadow-sm border space-y-2 ${cardBorder}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-bold ${titleCls}`}>{a.nome}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${a.status === "AGUARDANDO" ? (dm ? "bg-yellow-900/40 text-yellow-300" : "bg-yellow-100 text-yellow-700") : a.status === "NOTIFICADO" ? (dm ? "bg-green-900/40 text-green-300" : "bg-green-100 text-green-700") : (dm ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700")}`}>
                    {STATUS_LABELS[a.status]}
                  </span>
                </div>
                {disponivel && (
                  <div className={`rounded-lg px-3 py-2 ${dm ? "bg-green-900/30 border border-green-500/40" : "bg-green-100 border border-green-300"}`}>
                    <p className={`text-xs font-bold ${dm ? "text-green-300" : "text-green-700"}`}>
                      💚 DISPONÍVEL AGORA — {a.disponivel_qnt} em estoque
                    </p>
                    {a.estoque_matches && a.estoque_matches.length > 0 && (
                      <ul className={`text-[11px] mt-1 ${dm ? "text-green-300/80" : "text-green-700/90"}`}>
                        {a.estoque_matches.map(m => (
                          <li key={m.id}>• {m.produto}{m.cor ? ` — ${m.cor}` : ""} ({m.qnt})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className={`text-sm font-semibold ${dm ? "text-[#E8740E]" : "text-[#E8740E]"}`}>🍎 {a.produto_desejado}</p>
                {(a.whatsapp || a.instagram) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {a.whatsapp && <a href={`https://wa.me/55${wa}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">📱 {a.whatsapp}</a>}
                    {a.instagram && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>📷 {a.instagram}</span>}
                  </div>
                )}
                {a.observacao && <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{a.observacao}</p>}
                <p className={`text-[10px] ${dm ? "text-[#636366]" : "text-[#B0B0B0]"}`}>
                  Criado em {new Date(a.created_at).toLocaleDateString("pt-BR")}
                  {a.notificado_em && <> · Notificado em {new Date(a.notificado_em).toLocaleDateString("pt-BR")}</>}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#3A3A3C]">
                  {disponivel && linkWaChegou && (
                    <a href={linkWaChegou} target="_blank" rel="noopener noreferrer"
                       className="px-2 py-1 rounded text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700">
                      💬 Avisar pelo WhatsApp
                    </a>
                  )}
                  {a.status !== "NOTIFICADO" && (
                    <button onClick={() => changeStatus(a.id, "NOTIFICADO")} className="px-2 py-1 rounded text-[11px] font-semibold bg-green-500 text-white hover:bg-green-600">✅ Notificado</button>
                  )}
                  {a.status !== "AGUARDANDO" && (
                    <button onClick={() => changeStatus(a.id, "AGUARDANDO")} className="px-2 py-1 rounded text-[11px] font-semibold bg-yellow-500 text-white hover:bg-yellow-600">⏳ Reabrir</button>
                  )}
                  {a.status !== "CANCELADO" && (
                    <button onClick={() => changeStatus(a.id, "CANCELADO")} className="px-2 py-1 rounded text-[11px] font-semibold bg-gray-400 text-white hover:bg-gray-500">❌ Cancelar</button>
                  )}
                  <button onClick={() => startEdit(a)} className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-500 text-white hover:bg-blue-600">✏️ Editar</button>
                  <button onClick={() => handleDelete(a.id)} className="px-2 py-1 rounded text-[11px] font-semibold text-red-500 border border-red-300 hover:bg-red-50">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
