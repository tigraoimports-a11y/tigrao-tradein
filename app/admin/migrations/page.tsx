"use client";
import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface MigrationItem {
  nome: string;
  sql: string;
  aplicada: boolean;
  aplicada_em: string | null;
  aplicada_por: string | null;
  sucesso: boolean | null;
  erro: string | null;
  orfa?: boolean;
}

export default function MigrationsPage() {
  const { password, apiHeaders } = useAdmin();
  const [items, setItems] = useState<MigrationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "pendentes" | "aplicadas">("todas");

  const headers = useCallback((): Record<string, string> => apiHeaders({ "Content-Type": "application/json" }), [apiHeaders]);

  const fetchList = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/migrations", { headers: headers() });
      const j = await res.json();
      if (!res.ok) {
        setErro(j.error + (j.hint ? `\n\n💡 ${j.hint}` : ""));
        setItems([]);
      } else {
        setItems(j.items || []);
      }
    } catch (e) {
      setErro(String(e));
    }
    setLoading(false);
  }, [password, headers]);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function rodar(nome: string) {
    if (!confirm(`Rodar a migration "${nome}" no banco de produção?\n\nIsso vai executar o SQL do arquivo imediatamente.`)) return;
    setBusy(nome);
    try {
      const res = await fetch("/api/admin/migrations", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ nome, action: "run" }),
      });
      const j = await res.json();
      if (!res.ok) alert("❌ Erro ao rodar:\n\n" + j.error);
      else alert("✅ Migration aplicada com sucesso!");
    } catch (e) {
      alert("❌ Erro: " + String(e));
    }
    setBusy(null);
    fetchList();
  }

  async function marcarComoAplicada(nome: string) {
    if (!confirm(`Marcar "${nome}" como aplicada SEM rodar?\n\nUse isso só quando você já rodou o SQL manualmente no Supabase e quer registrar.`)) return;
    setBusy(nome);
    await fetch("/api/admin/migrations", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ nome, action: "mark" }),
    });
    setBusy(null);
    fetchList();
  }

  async function desmarcar(nome: string) {
    if (!confirm(`Desmarcar "${nome}"?\n\nIsso remove o registro de aplicada mas NÃO desfaz o SQL no banco.`)) return;
    setBusy(nome);
    await fetch("/api/admin/migrations", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ nome, action: "unmark" }),
    });
    setBusy(null);
    fetchList();
  }

  const filtrados = items.filter(i => {
    if (filtro === "pendentes") return !i.aplicada;
    if (filtro === "aplicadas") return i.aplicada;
    return true;
  });

  const totalPendentes = items.filter(i => !i.aplicada).length;
  const totalAplicadas = items.filter(i => i.aplicada).length;

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-1">
      <div>
        <h1 className="text-xl font-bold text-[#1D1D1F]">🗄️ Migrations</h1>
        <p className="text-sm text-[#86868B] mt-1">
          Controle centralizado de migrations SQL. Chega de rodar SQL direto no Supabase — coloca o arquivo em <code className="bg-[#F2F2F7] px-1 rounded">supabase/migrations/</code> e aplica por aqui.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 whitespace-pre-wrap">
          <p className="text-sm font-semibold text-red-800">⚠️ {erro}</p>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[#1D1D1F]">{items.length}</p>
          <p className="text-[11px] text-[#86868B] uppercase tracking-wide">Total</p>
        </div>
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[#E8740E]">{totalPendentes}</p>
          <p className="text-[11px] text-[#86868B] uppercase tracking-wide">Pendentes</p>
        </div>
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{totalAplicadas}</p>
          <p className="text-[11px] text-[#86868B] uppercase tracking-wide">Aplicadas</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {(["todas", "pendentes", "aplicadas"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${filtro === f ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B]"}`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={fetchList}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#D2D2D7] text-[#86868B] hover:text-[#1D1D1F]"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-center text-sm text-[#86868B] py-8">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-sm text-[#86868B] py-8">Nenhuma migration nesta categoria.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(m => {
            const isOpen = expandido === m.nome;
            return (
              <div key={m.nome} className="bg-white border border-[#D2D2D7] rounded-xl overflow-hidden">
                <div className="p-3 flex items-center gap-3">
                  <span className="text-xl">
                    {m.orfa ? "👻" : m.aplicada ? (m.sucesso === false ? "❌" : "✅") : "⏳"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-[#1D1D1F] truncate">{m.nome}</p>
                    <p className="text-[11px] text-[#86868B]">
                      {m.orfa && "Sem arquivo local (baseline/órfã) · "}
                      {m.aplicada
                        ? `Aplicada em ${m.aplicada_em ? new Date(m.aplicada_em).toLocaleString("pt-BR") : "—"} por ${m.aplicada_por || "—"}`
                        : "⚠️ Pendente — ainda não foi rodada"}
                    </p>
                    {m.erro && <p className="text-[11px] text-red-600 mt-0.5">Erro: {m.erro}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {!m.orfa && (
                      <button
                        onClick={() => setExpandido(isOpen ? null : m.nome)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F2F2F7] text-[#1D1D1F] hover:bg-[#E5E5EA]"
                      >
                        {isOpen ? "Fechar" : "Ver SQL"}
                      </button>
                    )}
                    {!m.aplicada && !m.orfa && (
                      <>
                        <button
                          onClick={() => rodar(m.nome)}
                          disabled={busy === m.nome}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#E8740E] text-white hover:bg-[#D4640A] disabled:opacity-50"
                        >
                          {busy === m.nome ? "..." : "▶ Rodar"}
                        </button>
                        <button
                          onClick={() => marcarComoAplicada(m.nome)}
                          disabled={busy === m.nome}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-[#D2D2D7] text-[#86868B] hover:text-[#1D1D1F]"
                          title="Marcar como já aplicada (sem rodar)"
                        >
                          ✓ Marcar
                        </button>
                      </>
                    )}
                    {m.aplicada && (
                      <button
                        onClick={() => desmarcar(m.nome)}
                        disabled={busy === m.nome}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-red-200 text-red-500 hover:bg-red-50"
                        title="Desmarcar (não desfaz o SQL)"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && m.sql && (
                  <pre className="bg-[#1D1D1F] text-green-400 text-[11px] p-3 overflow-x-auto max-h-80 border-t border-[#D2D2D7]">
                    {m.sql}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[#FFF8F2] border border-[#FFD4A8] rounded-xl p-4 mt-6">
        <p className="text-xs font-bold text-[#1D1D1F] mb-1">📌 Como usar</p>
        <ol className="text-xs text-[#86868B] space-y-0.5 list-decimal pl-4">
          <li>Cria o arquivo em <code className="bg-white px-1 rounded">supabase/migrations/AAAAMMDD_descricao.sql</code></li>
          <li>Commita na sua branch (dev-nicolas ou dev-andre)</li>
          <li>Faz o deploy do preview e abre essa página aqui</li>
          <li>Clica em <strong>▶ Rodar</strong> na migration pendente</li>
          <li>Confere que ficou ✅ aplicada</li>
        </ol>
      </div>
    </div>
  );
}
