"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { mergeVendedores, VENDEDORES_PADRAO as VENDEDORES_BASE } from "@/lib/vendedores";

interface HorarioRow {
  id: string;
  tipo: string;
  dia_semana: string;
  horario: string;
  ativo: boolean;
}

export default function ConfiguracoesPage() {
  const { password } = useAdmin();

  // Contato do formulário de troca
  const [principal, setPrincipal] = useState("5521972461357"); // Bianca default
  const [formLacrados, setFormLacrados] = useState(""); // WhatsApp formulários lacrados
  // WhatsApp por categoria de seminovo. Ex: iPhone Seminovo pro Nicolas,
  // iPad Seminovo pro Rodrigo. Se deixado vazio, cliente cai no WhatsApp
  // Principal. Campo legado whatsapp_formularios_seminovos e gravado como
  // espelho do iPhone Seminovo (mantem backwards-compat com codigo antigo).
  const [formSemiIphone, setFormSemiIphone] = useState("");
  const [formSemiIpad, setFormSemiIpad] = useState("");
  const [formSemiMacbook, setFormSemiMacbook] = useState("");
  const [formSemiWatch, setFormSemiWatch] = useState("");
  const [vendedores, setVendedores] = useState(VENDEDORES_BASE.map(v => ({ ...v })));

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
        if (data.whatsapp_formularios) setFormLacrados(String(data.whatsapp_formularios));
        // iPhone Seminovo: usa valor especifico se tiver, senao cai no campo
        // legado whatsapp_formularios_seminovos (migracao silenciosa pra quem
        // ja configurou antes do UI por categoria existir).
        if (data.whatsapp_seminovo_iphone) {
          setFormSemiIphone(String(data.whatsapp_seminovo_iphone));
        } else if (data.whatsapp_formularios_seminovos) {
          setFormSemiIphone(String(data.whatsapp_formularios_seminovos));
        }
        if (data.whatsapp_seminovo_ipad) setFormSemiIpad(String(data.whatsapp_seminovo_ipad));
        if (data.whatsapp_seminovo_macbook) setFormSemiMacbook(String(data.whatsapp_seminovo_macbook));
        if (data.whatsapp_seminovo_watch) setFormSemiWatch(String(data.whatsapp_seminovo_watch));
        // Merge padrão + banco em lib/vendedores.ts (fonte única).
        setVendedores(mergeVendedores(
          data.whatsapp_vendedores as Record<string, string> | null,
          data.whatsapp_vendedores_nomes as Record<string, string> | null,
          data.whatsapp_vendedores_recebe_links as Record<string, boolean> | null,
          data.whatsapp_vendedores_ativo as Record<string, boolean> | null
        ));
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
      // salvar com keys normalizadas (lowercase sem acento) para compatibilidade com VENDEDOR_WHATSAPP
      const waMap: Record<string, string> = {};
      const waNomes: Record<string, string> = {}; // key normalizada → nome display
      const waRecebe: Record<string, boolean> = {}; // key → recebe_links
      const waAtivo: Record<string, boolean> = {}; // key → ativo
      for (const v of vendedores) {
        if (v.nome.trim()) {
          const key = v.nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          waMap[key] = v.numero;
          waNomes[key] = v.nome.trim();
          waRecebe[key] = !!v.recebe_links;
          waAtivo[key] = v.ativo !== false;
        }
      }
      const res = await fetch("/api/admin/tradein-config", {
        method: "PUT",
        headers: { "x-admin-password": password, "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_principal: principal,
          whatsapp_formularios: formLacrados || principal,
          // Campo legado — espelha iPhone Seminovo pra manter backwards-compat
          // com codigo antigo que le whatsapp_formularios_seminovos (o UI
          // unificado agora e so por categoria).
          whatsapp_formularios_seminovos: formSemiIphone || principal,
          whatsapp_seminovo_iphone: formSemiIphone || "",
          whatsapp_seminovo_ipad: formSemiIpad || "",
          whatsapp_seminovo_macbook: formSemiMacbook || "",
          whatsapp_seminovo_watch: formSemiWatch || "",
          whatsapp_vendedores: waMap,
          whatsapp_vendedores_nomes: waNomes,
          whatsapp_vendedores_recebe_links: waRecebe,
          whatsapp_vendedores_ativo: waAtivo,
        }),
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
            {vendedores.filter(v => v.numero && v.ativo !== false).map(v => (
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

        {/* WhatsApp Troca — Lacrados */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-3">
          <div>
            <p className="font-bold text-[#1D1D1F]">📦 WhatsApp Troca — Lacrados</p>
            <p className="text-xs text-[#86868B] mt-1">
              Número que recebe formulários de troca por aparelhos lacrados (novos). Se vazio, usa o WhatsApp Principal.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {vendedores.filter(v => v.numero && v.ativo !== false).map(v => (
              <button
                key={v.nome}
                type="button"
                onClick={() => setFormLacrados(v.numero)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  formLacrados === v.numero
                    ? "bg-[#E8740E] text-white shadow-sm"
                    : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
                }`}
              >
                {v.nome} {formLacrados === v.numero && "✓"}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#86868B] mb-1">Número lacrados (DDI + DDD + número)</label>
            <input
              value={formLacrados}
              onChange={e => setFormLacrados(e.target.value.replace(/\D/g, ""))}
              placeholder="5521972461357"
              className={inputCls}
              inputMode="numeric"
            />
          </div>

          {formLacrados && (
            <a
              href={`https://wa.me/${formLacrados}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#E8740E] hover:underline"
            >
              🔗 Testar: wa.me/{formLacrados}
            </a>
          )}
        </div>

        {/* WhatsApp Troca — Outros Modelos (antes "Seminovos") */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-4">
          <div>
            <p className="font-bold text-[#1D1D1F]">📱 WhatsApp Troca — Outros Modelos</p>
            <p className="text-xs text-[#86868B] mt-1">
              Roteamento por categoria pra trocas que vao pra um numero diferente do <b>WhatsApp Principal</b>.
              Hoje recebe formularios de seminovos por categoria (iPhone Seminovo, iPad Seminovo, etc).
              Deixe <b>vazio</b> pra cair no Principal (fallback).
            </p>
          </div>

          {([
            { key: "iphone", label: "iPhone Seminovo", icon: "📱", value: formSemiIphone, set: setFormSemiIphone },
            { key: "ipad", label: "iPad Seminovo", icon: "📱", value: formSemiIpad, set: setFormSemiIpad },
            { key: "macbook", label: "MacBook Seminovo", icon: "💻", value: formSemiMacbook, set: setFormSemiMacbook },
            { key: "watch", label: "Apple Watch Seminovo", icon: "⌚", value: formSemiWatch, set: setFormSemiWatch },
          ] as const).map((cat) => (
            <div key={cat.key} className="border-t border-[#F5F5F7] pt-3 first:border-t-0 first:pt-0 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-[#1D1D1F]">{cat.icon} {cat.label}</p>
                {cat.value && (
                  <a
                    href={`https://wa.me/${cat.value}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#E8740E] hover:underline"
                  >
                    🔗 wa.me/{cat.value}
                  </a>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {vendedores.filter(v => v.numero && v.ativo !== false).map(v => (
                  <button
                    key={v.nome}
                    type="button"
                    onClick={() => cat.set(v.numero)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      cat.value === v.numero
                        ? "bg-[#E8740E] text-white shadow-sm"
                        : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
                    }`}
                  >
                    {v.nome} {cat.value === v.numero && "✓"}
                  </button>
                ))}
              </div>
              <input
                value={cat.value}
                onChange={e => cat.set(e.target.value.replace(/\D/g, ""))}
                placeholder="5521... (opcional — vazio = usa padrão)"
                className={inputCls}
                inputMode="numeric"
              />
            </div>
          ))}
        </div>

        {/* Números dos vendedores */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED] space-y-3">
          <div>
            <p className="font-bold text-[#1D1D1F]">👤 Vendedores — Links de Compra</p>
            <p className="text-xs text-[#86868B] mt-1">
              Cada vendedor tem um link próprio (ex: /andre, /bianca). Marque <b>Recebe</b> pra links submetidos caírem no WhatsApp dele; desmarcado, vão pro destino padrão (Bianca). Clique 👁️ pra <b>desativar</b> (some das dropdowns, mas fica salvo pra não quebrar histórico) ou ✕ pra remover de vez.
            </p>
          </div>

          <div className="space-y-2">
            {vendedores.map((v, i) => {
              const ativo = v.ativo !== false;
              return (
              <div key={i} className={`flex items-center gap-2 ${ativo ? "" : "opacity-50"}`}>
                <input
                  value={v.nome}
                  onChange={e => {
                    const upd = [...vendedores];
                    upd[i] = { ...upd[i], nome: e.target.value };
                    setVendedores(upd);
                  }}
                  placeholder="Nome"
                  className="w-24 shrink-0 px-2 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-sm font-semibold text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
                />
                <input
                  inputMode="numeric"
                  value={v.numero}
                  onChange={e => {
                    const upd = [...vendedores];
                    upd[i] = { ...upd[i], numero: e.target.value.replace(/\D/g, "") };
                    setVendedores(upd);
                  }}
                  placeholder="5521999999999"
                  className={inputCls}
                />
                <label
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-[#1D1D1F] cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-[#F5F5F7]"
                  title="Se marcado, links gerados por esse vendedor vão pro WhatsApp dele. Se desmarcado, caem no destino padrão (Bianca)."
                >
                  <input
                    type="checkbox"
                    checked={!!v.recebe_links}
                    onChange={e => {
                      const upd = [...vendedores];
                      upd[i] = { ...upd[i], recebe_links: e.target.checked };
                      setVendedores(upd);
                    }}
                    className="accent-[#E8740E]"
                  />
                  Recebe
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const upd = [...vendedores];
                    upd[i] = { ...upd[i], ativo: !ativo };
                    setVendedores(upd);
                  }}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F5F7] transition-all"
                  title={ativo ? "Desativar (fica oculto das dropdowns, mas não apaga histórico)" : "Reativar"}
                >
                  {ativo ? "👁️" : "🙈"}
                </button>
                <button
                  type="button"
                  onClick={() => setVendedores(vendedores.filter((_, j) => j !== i))}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                  title="Remover de vez (apaga do banco — prefira 👁️ para desativar sem perder histórico)"
                >
                  ✕
                </button>
              </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setVendedores([...vendedores, { nome: "", numero: "", recebe_links: false, ativo: true }])}
            className="w-full py-2 rounded-lg text-sm font-semibold text-[#E8740E] border border-dashed border-[#E8740E] hover:bg-orange-50 transition-all"
          >
            + Adicionar vendedor
          </button>
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
