"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface Variacao { id: string; nome: string; preco: number; produto_nome: string; }
interface Agendamento { id: string; variacao_id: string; variacao_nome: string; produto_nome: string; preco_atual: number; preco_novo: number; data_ativacao: string; aplicado: boolean; }

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

export default function AgendamentoPrecosPage() {
  const { password, user } = useAdmin();
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selVariacao, setSelVariacao] = useState("");
  const [precoNovo, setPrecoNovo] = useState("");
  const [dataAtivacao, setDataAtivacao] = useState("");
  const [msg, setMsg] = useState("");

  const headers = useCallback(() => ({ "x-admin-password": password, "Content-Type": "application/json" }), [password]);

  useEffect(() => {
    async function load() {
      try {
        // Buscar variações da loja
        const res = await fetch("/api/admin/mostruario", { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
        const data = await res.json();
        const vars: Variacao[] = [];
        for (const prod of data.produtos || []) {
          for (const v of prod.variacoes || []) {
            vars.push({ id: v.id, nome: v.nome, preco: v.preco, produto_nome: prod.nome });
          }
        }
        setVariacoes(vars);

        // Buscar agendamentos salvos (localStorage por enquanto)
        const saved = localStorage.getItem("tigrao_agendamentos");
        if (saved) setAgendamentos(JSON.parse(saved));
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, [password]);

  function addAgendamento() {
    if (!selVariacao || !precoNovo || !dataAtivacao) return;
    const v = variacoes.find(x => x.id === selVariacao);
    if (!v) return;
    const novo: Agendamento = {
      id: Date.now().toString(), variacao_id: v.id, variacao_nome: v.nome,
      produto_nome: v.produto_nome, preco_atual: v.preco,
      preco_novo: parseFloat(precoNovo.replace(/\./g, "").replace(",", ".")) || 0,
      data_ativacao: dataAtivacao, aplicado: false,
    };
    const updated = [...agendamentos, novo];
    setAgendamentos(updated);
    localStorage.setItem("tigrao_agendamentos", JSON.stringify(updated));
    setSelVariacao(""); setPrecoNovo(""); setDataAtivacao("");
    setMsg("Agendamento criado!");
    setTimeout(() => setMsg(""), 3000);
  }

  async function aplicarAgendamento(ag: Agendamento) {
    try {
      await fetch("/api/admin/mostruario", {
        method: "PATCH", headers: headers(),
        body: JSON.stringify({ action: "update_variacao", id: ag.variacao_id, preco: ag.preco_novo }),
      });
      const updated = agendamentos.map(a => a.id === ag.id ? { ...a, aplicado: true } : a);
      setAgendamentos(updated);
      localStorage.setItem("tigrao_agendamentos", JSON.stringify(updated));
      setMsg(`Preco de ${ag.variacao_nome} atualizado para ${fmt(ag.preco_novo)}`);
      setTimeout(() => setMsg(""), 3000);
    } catch { setMsg("Erro ao aplicar"); }
  }

  function removerAgendamento(id: string) {
    const updated = agendamentos.filter(a => a.id !== id);
    setAgendamentos(updated);
    localStorage.setItem("tigrao_agendamentos", JSON.stringify(updated));
  }

  // Verificar agendamentos que precisam ser ativados
  const hoje = new Date().toISOString().split("T")[0];
  const pendentes = agendamentos.filter(a => !a.aplicado && a.data_ativacao <= hoje);
  const futuros = agendamentos.filter(a => !a.aplicado && a.data_ativacao > hoje);
  const aplicados = agendamentos.filter(a => a.aplicado);

  if (loading) return <div className="text-center py-8 text-gray-400">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F]">Agendamento de Precos</h1>
        <p className="text-xs text-[#86868B]">Programe mudancas de preco para datas futuras (ex: Black Friday)</p>
      </div>

      {msg && <div className="px-4 py-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium">{msg}</div>}

      {/* Alertas de agendamentos prontos */}
      {pendentes.length > 0 && (
        <div className="bg-[#E8740E]/10 border border-[#E8740E]/30 rounded-2xl p-4">
          <p className="text-sm font-bold text-[#E8740E] mb-2">⚡ {pendentes.length} agendamento(s) prontos para ativar!</p>
          {pendentes.map(ag => (
            <div key={ag.id} className="flex items-center justify-between bg-white rounded-xl p-3 mb-2">
              <div>
                <p className="text-sm font-semibold">{ag.produto_nome} — {ag.variacao_nome}</p>
                <p className="text-xs text-[#86868B]">{fmt(ag.preco_atual)} → <span className="text-[#E8740E] font-bold">{fmt(ag.preco_novo)}</span></p>
              </div>
              <button onClick={() => aplicarAgendamento(ag)} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-bold">Aplicar Agora</button>
            </div>
          ))}
        </div>
      )}

      {/* Formulário */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#86868B] uppercase mb-4">Novo Agendamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Produto / Variacao</label>
            <select value={selVariacao} onChange={(e) => setSelVariacao(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm">
              <option value="">Selecione...</option>
              {variacoes.map(v => <option key={v.id} value={v.id}>{v.produto_nome} — {v.nome} ({fmt(v.preco)})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Novo Preco (R$)</label>
            <input value={precoNovo} onChange={(e) => setPrecoNovo(e.target.value)} placeholder="8.997" className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Data de Ativacao</label>
            <input type="date" value={dataAtivacao} onChange={(e) => setDataAtivacao(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={addAgendamento} className="px-5 py-2.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-semibold">+ Agendar</button>
          </div>
        </div>
      </div>

      {/* Futuros */}
      {futuros.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868B] uppercase mb-3">Agendados ({futuros.length})</h2>
          <div className="space-y-2">
            {futuros.map(ag => (
              <div key={ag.id} className="bg-white rounded-xl border border-[#D2D2D7] p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{ag.produto_nome} — {ag.variacao_nome}</p>
                  <p className="text-xs text-[#86868B]">{fmt(ag.preco_atual)} → {fmt(ag.preco_novo)} | Ativa em {new Date(ag.data_ativacao).toLocaleDateString("pt-BR")}</p>
                </div>
                <button onClick={() => removerAgendamento(ag.id)} className="text-xs text-red-500 font-medium">Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aplicados */}
      {aplicados.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868B] uppercase mb-3">Historico ({aplicados.length})</h2>
          <div className="space-y-1">
            {aplicados.slice(0, 10).map(ag => (
              <div key={ag.id} className="text-xs text-[#86868B] flex gap-2">
                <span>✅</span><span>{ag.produto_nome} — {ag.variacao_nome}: {fmt(ag.preco_atual)} → {fmt(ag.preco_novo)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
