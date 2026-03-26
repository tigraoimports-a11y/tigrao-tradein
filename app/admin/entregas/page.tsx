"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface Entrega {
  id: string;
  created_at: string;
  venda_id: string | null;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  data_entrega: string;
  horario: string | null;
  status: "PENDENTE" | "SAIU" | "ENTREGUE" | "CANCELADA";
  entregador: string | null;
  observacao: string | null;
  updated_at: string | null;
  produto: string | null;
  tipo: string | null;
  detalhes_upgrade: string | null;
  forma_pagamento: string | null;
  valor: number | null;
  vendedor: string | null;
  regiao: string | null;
}

type EntregaStatus = Entrega["status"];

const STATUS_CONFIG: Record<EntregaStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  PENDENTE: { label: "Pendente", color: "text-yellow-700", bg: "bg-yellow-100", border: "border-yellow-300", icon: "🟡" },
  SAIU: { label: "Saiu p/ Entrega", color: "text-blue-700", bg: "bg-blue-100", border: "border-blue-300", icon: "🔵" },
  ENTREGUE: { label: "Entregue", color: "text-green-700", bg: "bg-green-100", border: "border-green-300", icon: "🟢" },
  CANCELADA: { label: "Cancelada", color: "text-red-600", bg: "bg-red-100", border: "border-red-300", icon: "🔴" },
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getWeekRange(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 6; i++) { // Mon-Sat
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const from = days[0].toISOString().split("T")[0];
  const to = days[days.length - 1].toISOString().split("T")[0];
  return { days, from, to };
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export default function EntregasPage() {
  const { password, apiHeaders } = useAdmin();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { days, from, to } = getWeekRange(weekOffset);

  const [copied, setCopied] = useState(false);

  const emptyForm = {
    cliente: "",
    telefone: "",
    endereco: "",
    bairro: "",
    data_entrega: new Date().toISOString().split("T")[0],
    horario: "",
    entregador: "",
    observacao: "",
    produto: "",
    produto2: "",
    produto3: "",
    tipo: "",
    detalhes_upgrade: "",
    forma_pagamento: "",
    valor: "",
    parcelas: "",
    maquina: "",
    forma_pagamento_2: "",
    valor_2: "",
    vendedor: "",
    regiao: "",
    local_entrega: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [showProd2, setShowProd2] = useState(false);
  const [showProd3, setShowProd3] = useState(false);
  const [showPagAlt, setShowPagAlt] = useState(false);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const fetchEntregas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/entregas?${params}`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setEntregas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, from, to]);

  useEffect(() => {
    if (password) fetchEntregas();
  }, [password, fetchEntregas]);

  const handleSubmit = async () => {
    if (!form.cliente || !form.data_entrega) {
      setMsg("Preencha cliente e data da entrega");
      return;
    }
    setSaving(true);
    setMsg("");

    const res = await fetch("/api/admin/entregas", {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...form,
        telefone: form.telefone || null,
        endereco: form.endereco || null,
        bairro: form.bairro || null,
        horario: form.horario || null,
        entregador: form.entregador || null,
        observacao: form.observacao || null,
        produto: form.produto || null,
        tipo: form.tipo || null,
        detalhes_upgrade: form.detalhes_upgrade || null,
        forma_pagamento: form.forma_pagamento || null,
        valor: form.valor ? parseFloat(form.valor) : null,
        vendedor: form.vendedor || null,
        regiao: form.regiao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Entrega agendada!");
      setForm({ ...emptyForm, data_entrega: new Date().toISOString().split("T")[0] });
      setShowProd2(false); setShowProd3(false); setShowPagAlt(false);
      setShowForm(false);
      fetchEntregas();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const handleStatusChange = async (entrega: Entrega, newStatus: EntregaStatus) => {
    const res = await fetch("/api/admin/entregas", {
      method: "PATCH",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: entrega.id, status: newStatus }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.map((e) => (e.id === entrega.id ? { ...e, status: newStatus } : e)));
      setSelectedEntrega(null);
    }
  };

  const buildWhatsAppText = () => {
    const produtos = [form.produto, form.produto2, form.produto3].filter(Boolean);
    const produtoText = produtos.length > 1
      ? produtos.map((p, i) => `${i + 1}. ${p}`).join("\n   ")
      : form.produto || "—";

    // Pagamento principal
    let pagText = `${form.forma_pagamento || "—"}`;
    if (form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") {
      if (form.parcelas) pagText += ` ${form.parcelas}x`;
      if (form.maquina) pagText += ` (${form.maquina})`;
    }
    pagText += ` R$${form.valor || "0"}`;

    // Pagamento alternativo
    let pagAlt = "";
    if (form.forma_pagamento_2 && form.valor_2) {
      pagAlt = `\n💵 *Pagamento 2:* ${form.forma_pagamento_2} R$${form.valor_2}`;
    }

    const localEntrega = form.local_entrega ? `\n🏠 *Local:* ${form.local_entrega}` : "";

    const lines = [
      `🛵 *ENTREGA ${form.bairro || "—"}* 🛵`,
      "",
      `⏰ *Horário:* ${form.horario || "—"}`,
      `📍 *Local:* ${form.endereco || "—"}${localEntrega}`,
      `🍎 *Produto:* ${produtoText}`,
      `‼️ *Tipo:* ${form.tipo || "—"}${form.detalhes_upgrade ? ` — ${form.detalhes_upgrade}` : ""}`,
      `💰 *Pagamento:* ${pagText}${pagAlt}`,
      `🧑 *Cliente:* ${form.cliente || "—"}`,
      `📞 *Contato:* ${form.telefone || "—"}`,
      form.observacao ? `📝 *Observação:* ${form.observacao}` : "",
      `💼 *Vendedor:* ${form.vendedor || "—"}`,
    ].filter(Boolean);
    return lines.join("\n");
  };

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = buildWhatsAppText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta entrega?")) return;
    const res = await fetch("/api/admin/entregas", {
      method: "DELETE",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.filter((e) => e.id !== id));
      setSelectedEntrega(null);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-[#1D1D1F]">Agenda de Entregas</h1>
        <button
          onClick={() => { setShowForm(!showForm); setMsg(""); }}
          className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
        >
          {showForm ? "Fechar" : "+ Nova Entrega"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      {/* Formulário Nova Entrega */}
      {showForm && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#1D1D1F]">Agendar Nova Entrega</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Cliente</p>
              <input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nome do cliente" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Telefone</p>
              <input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(21) 99999-9999" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Bairro</p>
              <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Ex: Barra da Tijuca" className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Endereco</p>
              <input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Endereco completo" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Local de Entrega</p>
              <select value={form.local_entrega} onChange={(e) => set("local_entrega", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="RESIDÊNCIA">Residência</option>
                <option value="SHOPPING">Shopping</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Produto</p>
              <input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 17 256GB Lavanda" className={inputCls} />
            </div>
            {showProd2 ? (
              <div className="col-span-2 md:col-span-3">
                <p className={labelCls}>Produto 2</p>
                <input value={form.produto2} onChange={(e) => set("produto2", e.target.value)} placeholder="Segundo produto..." className={inputCls} />
              </div>
            ) : (
              <div className="col-span-2 md:col-span-3">
                <button onClick={() => setShowProd2(true)} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto 2</button>
              </div>
            )}
            {showProd2 && (showProd3 ? (
              <div className="col-span-2 md:col-span-3">
                <p className={labelCls}>Produto 3</p>
                <input value={form.produto3} onChange={(e) => set("produto3", e.target.value)} placeholder="Terceiro produto..." className={inputCls} />
              </div>
            ) : (
              <div className="col-span-2 md:col-span-3">
                <button onClick={() => setShowProd3(true)} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto 3</button>
              </div>
            ))}
            <div>
              <p className={labelCls}>Tipo</p>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="VENDA NORMAL">Venda Normal</option>
                <option value="UPGRADE">Upgrade</option>
              </select>
            </div>
            {form.tipo === "UPGRADE" && (
              <div className="col-span-2 md:col-span-3">
                <p className={labelCls}>Detalhes do upgrade/troca</p>
                <input value={form.detalhes_upgrade} onChange={(e) => set("detalhes_upgrade", e.target.value)} placeholder="Descricao do aparelho usado" className={inputCls} />
              </div>
            )}
            <div>
              <p className={labelCls}>Forma de Pagamento</p>
              <select value={form.forma_pagamento} onChange={(e) => set("forma_pagamento", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="Pix">Pix</option>
                <option value="Cartao Credito">Cartão Crédito</option>
                <option value="Cartao Debito">Cartão Débito</option>
                <option value="Especie">Espécie</option>
                <option value="Link de Pagamento">Link de Pagamento</option>
                <option value="Transferencia">Transferência</option>
                <option value="Definir depois">Definir depois</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Valor (R$)</p>
              <input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} placeholder="0" className={inputCls} />
            </div>
            {(form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") && (<>
              <div>
                <p className={labelCls}>Parcelas</p>
                <select value={form.parcelas} onChange={(e) => set("parcelas", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {[1,2,3,4,5,6,7,8,9,10,11,12,18,21].map(n => <option key={n} value={String(n)}>{n}x</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>Máquina</p>
                <select value={form.maquina} onChange={(e) => set("maquina", e.target.value)} className={inputCls}>
                  <option value="">-- Selecionar --</option>
                  <option value="ITAU">Itaú</option>
                  <option value="INFINITE">Infinite</option>
                </select>
              </div>
            </>)}
            {/* Pagamento alternativo */}
            {showPagAlt ? (
              <div className="col-span-2 md:col-span-3 border-t border-[#E5E5EA] pt-3 mt-1">
                <p className="text-xs font-semibold text-[#86868B] mb-2">Pagamento alternativo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <select value={form.forma_pagamento_2} onChange={(e) => set("forma_pagamento_2", e.target.value)} className={inputCls}>
                      <option value="">— 2ª forma —</option>
                      <option value="Pix">Pix</option>
                      <option value="Cartao Credito">Cartão Crédito</option>
                      <option value="Especie">Espécie</option>
                      <option value="Link de Pagamento">Link</option>
                      <option value="Transferencia">Transferência</option>
                    </select>
                  </div>
                  <div>
                    <input type="number" value={form.valor_2} onChange={(e) => set("valor_2", e.target.value)} placeholder="Valor R$" className={inputCls} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="col-span-2 md:col-span-3">
                <button onClick={() => setShowPagAlt(true)} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar pagamento alternativo</button>
              </div>
            )}
            <div>
              <p className={labelCls}>Vendedor</p>
              <select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="Andre">Andre</option>
                <option value="Bianca">Bianca</option>
                <option value="Nicolas">Nicolas</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Data da Entrega</p>
              <input type="date" value={form.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Horario</p>
              <select value={form.horario} onChange={(e) => set("horario", e.target.value)} className={inputCls}>
                <option value="">-- Definir --</option>
                <option value="MANHA">Manha (ate 12h)</option>
                <option value="TARDE">Tarde (12h-18h)</option>
                <option value="NOITE">Noite (apos 18h)</option>
                <option value="09:00">09:00</option>
                <option value="10:00">10:00</option>
                <option value="11:00">11:00</option>
                <option value="12:00">12:00</option>
                <option value="13:00">13:00</option>
                <option value="14:00">14:00</option>
                <option value="15:00">15:00</option>
                <option value="16:00">16:00</option>
                <option value="17:00">17:00</option>
                <option value="18:00">18:00</option>
                <option value="19:00">19:00</option>
                <option value="20:00">20:00</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Entregador</p>
              <input value={form.entregador} onChange={(e) => set("entregador", e.target.value)} placeholder="Nome (opcional)" className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Observacao</p>
              <input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Detalhes, instrucoes..." className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyWhatsApp}
              className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors text-sm"
            >
              {copied ? "Copiado!" : "📋 Copiar para WhatsApp"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Agendar Entrega"}
            </button>
          </div>
        </div>
      )}

      {/* Navegacao de semana */}
      <div className="flex items-center justify-between bg-white border border-[#D2D2D7] rounded-xl px-4 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          ← Anterior
        </button>
        <div className="text-center">
          <button
            onClick={() => setWeekOffset(0)}
            className={`text-sm font-bold transition-colors ${weekOffset === 0 ? "text-[#E8740E]" : "text-[#1D1D1F] hover:text-[#E8740E] cursor-pointer"}`}
          >
            {weekOffset === 0 ? "Semana Atual" : `Semana ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
          </button>
          <p className="text-[10px] text-[#86868B]">
            {formatDateBR(from)} a {formatDateBR(to)}
          </p>
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          Proxima →
        </button>
      </div>

      {/* Calendario semanal */}
      {loading ? (
        <div className="p-8 text-center text-[#86868B]">Carregando...</div>
      ) : (
        <>
          {/* Desktop: grid de 6 colunas */}
          <div className="hidden md:grid grid-cols-6 gap-2">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr);
              // Sort by horario
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden min-h-[200px] ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  {/* Day header */}
                  <div className={`px-3 py-2 text-center border-b ${isToday ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-[#F5F5F7] border-[#D2D2D7]"}`}>
                    <p className="text-[10px] font-bold uppercase">{DIAS_SEMANA[idx]}</p>
                    <p className="text-sm font-bold">{day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</p>
                  </div>

                  {/* Entregas */}
                  <div className="p-1.5 space-y-1.5">
                    {dayEntregas.length === 0 && (
                      <p className="text-[10px] text-[#B0B0B0] text-center py-4">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntrega(e)}
                          className={`w-full text-left p-2 rounded-lg border transition-all hover:shadow-sm ${sc.border} ${sc.bg}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px]">{sc.icon}</span>
                            {e.horario && <span className="text-[10px] font-bold text-[#1D1D1F]">{e.horario}</span>}
                          </div>
                          <p className="text-xs font-semibold text-[#1D1D1F] truncate">{e.cliente}</p>
                          {e.bairro && <p className="text-[10px] text-[#86868B] truncate">{e.bairro}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: lista vertical por dia */}
          <div className="md:hidden space-y-3">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr);
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              if (dayEntregas.length === 0 && !isToday) return null;

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  <div className={`px-4 py-2 flex items-center justify-between ${isToday ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7]"}`}>
                    <span className="text-sm font-bold">{DIAS_SEMANA[idx]} {day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</span>
                    <span className={`text-xs ${isToday ? "text-white/80" : "text-[#86868B]"}`}>{dayEntregas.length} entrega{dayEntregas.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="p-2 space-y-2">
                    {dayEntregas.length === 0 && (
                      <p className="text-xs text-[#B0B0B0] text-center py-3">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntrega(e)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${sc.border} ${sc.bg}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span>{sc.icon}</span>
                              <span className="text-sm font-semibold text-[#1D1D1F]">{e.cliente}</span>
                            </div>
                            {e.horario && <span className="text-xs font-bold text-[#1D1D1F]">{e.horario}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#86868B]">
                            {e.bairro && <span>{e.bairro}</span>}
                            {e.entregador && <span>- {e.entregador}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Resumo da semana */}
      {!loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
              const count = entregas.filter((e) => e.status === status).length;
              const sc = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-2">
                  <span>{sc.icon}</span>
                  <span className={`text-sm font-semibold ${sc.color}`}>{count} {sc.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1D1D1F]">Total: {entregas.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhes da entrega */}
      {selectedEntrega && (() => {
        const e = selectedEntrega;
        const sc = STATUS_CONFIG[e.status];
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntrega(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(ev) => ev.stopPropagation()}>
              {/* Header */}
              <div className={`px-5 py-4 rounded-t-2xl ${sc.bg} border-b ${sc.border}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{sc.icon}</span>
                    <div>
                      <h3 className="text-base font-bold text-[#1D1D1F]">{e.cliente}</h3>
                      <p className="text-xs text-[#86868B]">{formatDateBR(e.data_entrega)} {e.horario ? `- ${e.horario}` : ""}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedEntrega(null)} className="text-[#86868B] hover:text-[#1D1D1F] text-lg">X</button>
                </div>
              </div>

              {/* Detalhes */}
              <div className="px-5 py-4 space-y-3">
                {e.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#86868B]">Tel:</span>
                    <a href={`tel:${e.telefone}`} className="text-blue-600 font-medium">{e.telefone}</a>
                  </div>
                )}
                {e.endereco && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Endereco: </span>
                    <span className="text-[#1D1D1F]">{e.endereco}</span>
                  </div>
                )}
                {e.bairro && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Bairro: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.bairro}</span>
                  </div>
                )}
                {e.entregador && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Entregador: </span>
                    <span className="text-[#1D1D1F]">{e.entregador}</span>
                  </div>
                )}
                {e.produto && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Produto: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.produto}</span>
                  </div>
                )}
                {e.tipo && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Tipo: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.tipo}</span>
                    {e.detalhes_upgrade && <span className="text-[#86868B]"> — {e.detalhes_upgrade}</span>}
                  </div>
                )}
                {e.forma_pagamento && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Pagamento: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.forma_pagamento}</span>
                    {e.valor != null && <span className="text-[#1D1D1F]"> R${e.valor}</span>}
                  </div>
                )}
                {e.vendedor && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Vendedor: </span>
                    <span className="text-[#1D1D1F]">{e.vendedor}</span>
                  </div>
                )}
                {e.observacao && (
                  <div className="text-sm p-3 bg-[#F5F5F7] rounded-lg">
                    <span className="text-[#86868B]">Obs: </span>
                    <span className="text-[#1D1D1F]">{e.observacao}</span>
                  </div>
                )}

                {/* Status badge */}
                <div className="pt-2">
                  <p className="text-xs font-bold text-[#86868B] uppercase mb-2">Alterar Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
                      const c = STATUS_CONFIG[status];
                      const isActive = e.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(e, status)}
                          disabled={isActive}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isActive
                              ? `${c.bg} ${c.color} border-2 ${c.border} opacity-100`
                              : `bg-white border border-[#D2D2D7] text-[#86868B] hover:${c.bg} hover:${c.color} hover:${c.border}`
                          }`}
                        >
                          {c.icon} {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copiar formulário motoboy */}
                <div className="pt-2 border-t border-[#D2D2D7]">
                  <button
                    onClick={() => {
                      const regiao = e.regiao || e.bairro || "";
                      const msg = [
                        `🛵 *ENTREGA ${regiao.toUpperCase()}* 🛵`,
                        "",
                        `⏰ *HORÁRIO:* ${e.horario || "A combinar"}`,
                        `📍 *LOCAL:* ${e.endereco || "A definir"}${e.bairro ? ` - ${e.bairro}` : ""}`,
                        `🍎 *PRODUTO:* ${e.produto || ""}`,
                        `‼️ *TIPO:* ${e.tipo || "VENDA"}`,
                        `💵 *PAGAMENTO:* ${e.forma_pagamento || ""} R$${Number(e.valor || 0).toLocaleString("pt-BR")}`,
                        `👤 *CLIENTE:* ${e.cliente || ""}`,
                        `📞 *CONTATO:* ${e.telefone || ""}`,
                        e.observacao ? `OBS: ${e.observacao}` : "",
                        "",
                        `💼 Vendedor: ${e.vendedor || ""}`,
                        "________________________________",
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(msg);
                      alert("Formulário copiado! Cole no WhatsApp do motoboy.");
                    }}
                    className="w-full py-2.5 rounded-xl text-center text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors mb-2"
                  >
                    📋 Copiar Formulário Motoboy
                  </button>
                </div>

                {/* Acoes */}
                <div className="flex gap-2">
                  {e.telefone && (
                    <a
                      href={`https://wa.me/55${e.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl text-center text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
