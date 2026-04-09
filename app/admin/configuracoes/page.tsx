"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface HorarioRow {
  id: string;
  tipo: string;
  dia_semana: string;
  horario: string;
  ativo: boolean;
}

const VENDEDORES_PADRAO = [
  { nome: "André",   numero: "5521967442665" },
  { nome: "Bianca",  numero: "5521972461357" },
  { nome: "Nicole",  numero: "" },
];

export default function ConfiguracoesPage() {
  const { password } = useAdmin();

  // Contato do formulário de troca
  const [principal, setPrincipal] = useState("5521972461357"); // Bianca default
  const [formularios, setFormularios] = useState(""); // WhatsApp formulários (troca, seminovos, links de compra)
  const [vendedores, setVendedores] = useState(VENDEDORES_PADRAO.map(v => ({ ...v })));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Horários configuráveis
  const [horarios, setHorarios] = useState<HorarioRow[]>([]);
  const [novoHorario, setNovoHorario] = useState({ tipo: "entrega", dia_semana: "seg_sex", horario: "" });

  useEffect(() => {
    if (!password) return;
    fetch("/api/admin/tradein-config", { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(({ data }) => {
        if (!data) return;
        if (data.whatsapp_principal) setPrincipal(String(data.whatsapp_principal));
        if (data.whatsapp_formularios) setFormularios(String(data.whatsapp_formularios));
        // whatsapp_vendedores pode ser objeto {nome: numero} ou array
        const raw = data.whatsapp_vendedores;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          // formato {André: "5521...", ...}
          setVendedores(VENDEDORES_PADRAO.map(v => ({
            nome: v.nome,
            numero: (raw as Record<string, string>)[v.nome] ?? v.numero,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [password]);

  // Fetch horários
  const fetchHorarios = useCallback(async () => {
    if (!password) return;
    try {
      const res = await fetch("/api/admin/horarios", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const j = await res.json();
        setHorarios(j.data || []);
      }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { fetchHorarios(); }, [fetchHorarios]);

  async function toggleHorario(id: string, ativo: boolean) {
    await fetch("/api/admin/horarios", {
      method: "PATCH",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ativo }),
    });
    setHorarios(prev => prev.map(h => h.id === id ? { ...h, ativo } : h));
  }

  async function addHorario() {
    if (!novoHorario.horario) return;
    const res = await fetch("/api/admin/horarios", {
      method: "POST",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify(novoHorario),
    });
    if (res.ok) {
      setNovoHorario({ tipo: "entrega", dia_semana: "seg_sex", horario: "" });
      fetchHorarios();
    }
  }

  async function removeHorario(id: string) {
    await fetch(`/api/admin/horarios?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    setHorarios(prev => prev.filter(h => h.id !== id));
  }

  async function salvar() {
    if (!password) return;
    setSaving(true);
    setMsg("");
    try {
      // salvar como {André: "55...", Bianca: "55...", ...}
      const waMap: Record<string, string> = {};
      for (const v of vendedores) {
        if (v.nome) waMap[v.nome] = v.numero;
      }
      const res = await fetch("/api/admin/tradein-config", {
        method: "PUT",
        headers: { "x-admin-password": password, "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_principal: principal, whatsapp_formularios: formularios || principal, whatsapp_vendedores: waMap }),
      });
      const j = await res.json();
      setMsg(j.ok ? "✅ Salvo com sucesso!" : "❌ Erro: " + (j.error || "desconhecido"));
    } catch {
      setMsg("❌ Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] text-sm font-mono";

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <p className="text-[#86868B]">Carregando...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-16">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold text-[#1D1D1F]">⚙️ Configurações</h1>

        {/* Contato do formulário de troca */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-3">
          <div>
            <p className="font-bold text-[#1D1D1F]">📱 Formulário de Troca</p>
            <p className="text-xs text-[#86868B] mt-1">
              Quando um cliente preenche o formulário de troca de iPhone no site, a mensagem vai para este número.
            </p>
          </div>

          {/* Seleção rápida por vendedor */}
          <div className="flex gap-2 flex-wrap">
            {vendedores.filter(v => v.numero).map(v => (
              <button
                key={v.nome}
                type="button"
                onClick={() => setPrincipal(v.numero)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  principal === v.numero
                    ? "bg-[#E8740E] text-white shadow-sm"
                    : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
                }`}
              >
                {v.nome} {principal === v.numero && "✓"}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#86868B] mb-1">Número ativo (DDI + DDD + número)</label>
            <input
              value={principal}
              onChange={e => setPrincipal(e.target.value.replace(/\D/g, ""))}
              placeholder="5521972461357"
              className={inputCls}
              inputMode="numeric"
            />
          </div>

          {principal && (
            <a
              href={`https://wa.me/${principal}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#E8740E] hover:underline"
            >
              🔗 Testar: wa.me/{principal}
            </a>
          )}
        </div>

        {/* WhatsApp Formulários */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-3">
          <div>
            <p className="font-bold text-[#1D1D1F]">📋 WhatsApp Formulários</p>
            <p className="text-xs text-[#86868B] mt-1">
              Número padrão para receber formulários de troca de lacrados, seminovos e links de compra. Se vazio, usa o número do Formulário de Troca.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {vendedores.filter(v => v.numero).map(v => (
              <button
                key={v.nome}
                type="button"
                onClick={() => setFormularios(v.numero)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  formularios === v.numero
                    ? "bg-[#E8740E] text-white shadow-sm"
                    : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
                }`}
              >
                {v.nome} {formularios === v.numero && "✓"}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#86868B] mb-1">Número formulários (DDI + DDD + número)</label>
            <input
              value={formularios}
              onChange={e => setFormularios(e.target.value.replace(/\D/g, ""))}
              placeholder="5521972461357"
              className={inputCls}
              inputMode="numeric"
            />
          </div>

          {formularios && (
            <a
              href={`https://wa.me/${formularios}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#E8740E] hover:underline"
            >
              🔗 Testar: wa.me/{formularios}
            </a>
          )}
        </div>

        {/* Números dos vendedores */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-3">
          <div>
            <p className="font-bold text-[#1D1D1F]">👤 Vendedores — Links de Compra</p>
            <p className="text-xs text-[#86868B] mt-1">
              Cada vendedor tem um link próprio (/andre, /bianca, /nicolas, /nicole). Quando o cliente submete, a mensagem vai pro WhatsApp do vendedor.
              Nicole opera pelo Instagram — deixe vazio para usar o da Bianca.
            </p>
          </div>

          <div className="space-y-2">
            {vendedores.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm font-semibold text-[#1D1D1F]">{v.nome}</span>
                <input
                  inputMode="numeric"
                  value={v.numero}
                  onChange={e => {
                    const upd = [...vendedores];
                    upd[i] = { ...upd[i], numero: e.target.value.replace(/\D/g, "") };
                    setVendedores(upd);
                  }}
                  placeholder={v.nome === "Nicole" ? "vazio → usa Bianca" : "5521999999999"}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Horários de Entrega / Retirada */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-4">
          <div>
            <p className="font-bold text-[#1D1D1F]">🕐 Horários — Link de Compra</p>
            <p className="text-xs text-[#86868B] mt-1">
              Horários disponíveis no link de compra para entrega e retirada. Separados por dia da semana.
            </p>
          </div>

          {(["entrega", "retirada"] as const).map(tipo => (
            <div key={tipo} className="space-y-2">
              <p className="text-sm font-bold text-[#1D1D1F] uppercase">{tipo === "entrega" ? "🚚 Entrega" : "🏬 Retirada no Escritório"}</p>
              {(["seg_sex", "sabado"] as const).map(dia => {
                const label = dia === "seg_sex" ? "Segunda a Sexta" : "Sábado";
                const rows = horarios.filter(h => h.tipo === tipo && h.dia_semana === dia).sort((a, b) => a.horario.localeCompare(b.horario));
                return (
                  <div key={dia} className="ml-2">
                    <p className="text-xs font-semibold text-[#86868B] mb-1">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map(h => (
                        <div key={h.id} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all group ${h.ativo ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-400 line-through"}`}>
                          <button onClick={() => toggleHorario(h.id, !h.ativo)} title={h.ativo ? "Desativar" : "Ativar"}>
                            {h.horario}
                          </button>
                          <button onClick={() => removeHorario(h.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover">✕</button>
                        </div>
                      ))}
                      {rows.length === 0 && <span className="text-xs text-[#B0B0B0]">Nenhum horário</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Adicionar novo horário */}
          <div className="border-t border-[#E8E8ED] pt-3">
            <p className="text-xs font-semibold text-[#86868B] mb-2">Adicionar horário</p>
            <div className="flex gap-2 items-end flex-wrap">
              <select value={novoHorario.tipo} onChange={e => setNovoHorario(p => ({ ...p, tipo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm">
                <option value="entrega">Entrega</option>
                <option value="retirada">Retirada</option>
              </select>
              <select value={novoHorario.dia_semana} onChange={e => setNovoHorario(p => ({ ...p, dia_semana: e.target.value }))} className="px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm">
                <option value="seg_sex">Seg-Sex</option>
                <option value="sabado">Sábado</option>
              </select>
              <input
                type="time"
                value={novoHorario.horario}
                onChange={e => setNovoHorario(p => ({ ...p, horario: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm"
              />
              <button onClick={addHorario} className="px-4 py-2 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623]">
                Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Salvar */}
        <button
          onClick={salvar}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-bold text-sm hover:bg-[#D4680D] disabled:opacity-50 transition-colors"
        >
          {saving ? "Salvando..." : "Salvar Configurações"}
        </button>

        {msg && (
          <p className={`text-center text-sm font-medium ${msg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
