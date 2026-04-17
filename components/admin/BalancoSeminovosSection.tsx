"use client";
import { useCallback, useEffect, useState } from "react";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface BalancoGrupo {
  categoria: string;
  modeloBase: string;
  qnt: number;
  custoTotal: number;
  custoAtual: number;
  balancoCalculado: number;
  precisaAtualizar: boolean;
  qntItens: number;
}

interface Props {
  password: string;
  userNome: string;
  onMsg: (m: string) => void;
  /** Se true, a secao comeca aberta (sem toggle). Default: false (colapsada). */
  sempreAberta?: boolean;
}

export default function BalancoSeminovosSection({
  password,
  userNome,
  onMsg,
  sempreAberta = false,
}: Props) {
  const [aberto, setAberto] = useState(sempreAberta);
  const [grupos, setGrupos] = useState<BalancoGrupo[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const keyOf = (g: BalancoGrupo) => `${g.categoria}|${g.modeloBase}`;

  const carregar = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recalc-balancos", {
        headers: { "x-admin-password": password },
        cache: "no-store",
      });
      const j = await res.json();
      setGrupos(Array.isArray(j.data) ? j.data : []);
    } catch { /* silent */ }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  const toggleTodos = () => {
    if (selecionados.size === grupos.length) setSelecionados(new Set());
    else setSelecionados(new Set(grupos.map(keyOf)));
  };

  const toggleUm = (g: BalancoGrupo) => {
    const k = keyOf(g);
    const next = new Set(selecionados);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelecionados(next);
  };

  const abrirConfirmacao = () => {
    if (selecionados.size === 0) { alert("Selecione ao menos 1 modelo."); return; }
    setConfirmOpen(true);
  };

  const aplicarBalanco = async () => {
    const modelos = grupos.filter(g => selecionados.has(keyOf(g))).map(g => ({ categoria: g.categoria, modeloBase: g.modeloBase }));
    const total = modelos.length;
    setConfirmOpen(false);
    setAplicando(true);
    try {
      const res = await fetch("/api/admin/recalc-balancos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userNome) },
        body: JSON.stringify({ modelos }),
      });
      const j = await res.json();
      if (!j.ok) { alert("Erro: " + (j.error || "falha")); setAplicando(false); return; }
      onMsg(`✓ Balanço aplicado em ${total} modelo(s). ${j.updated} produto(s) atualizado(s).`);
      setSelecionados(new Set());
      await carregar();
    } catch (e) {
      alert("Erro de conexão: " + String(e));
    }
    setAplicando(false);
  };

  const precisam = grupos.filter(g => g.precisaAtualizar).length;

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl shadow-sm overflow-hidden">
      {!sempreAberta && (
        <button
          onClick={() => setAberto(!aberto)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <div className="text-left">
              <p className="text-sm font-bold text-[#1D1D1F]">Balanço Manual (Preço Médio)</p>
              <p className="text-[11px] text-[#86868B]">
                Selecione modelos de seminovo (agrupados por modelo+armazenamento) e aplique o recálculo de preço médio ponderado
                {aberto && precisam > 0 && <span className="ml-2 text-[#E8740E] font-semibold">· {precisam} modelo(s) com balanço desatualizado</span>}
              </p>
            </div>
          </div>
          <span className="text-[#86868B]">{aberto ? "▲" : "▼"}</span>
        </button>
      )}

      {sempreAberta && (
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#F5F5F7]">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <div>
              <p className="text-sm font-bold text-[#1D1D1F]">Balanço Manual (Preço Médio)</p>
              <p className="text-[11px] text-[#86868B]">
                Agrupado por modelo+armazenamento. Aplica preço médio ponderado nos itens selecionados.
                {precisam > 0 && <span className="ml-2 text-[#E8740E] font-semibold">· {precisam} modelo(s) com balanço desatualizado</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {aberto && (
        <div className="px-5 py-4 border-t border-[#E5E5EA] bg-[#FAFAFA]">
          {loading && <p className="text-xs text-[#86868B] py-4 text-center">Carregando...</p>}
          {!loading && grupos.length === 0 && (
            <p className="text-xs text-[#86868B] py-4 text-center">Nenhum seminovo em estoque encontrado.</p>
          )}
          {!loading && grupos.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <button
                  onClick={toggleTodos}
                  className="text-xs text-[#E8740E] hover:underline font-medium"
                >
                  {selecionados.size === grupos.length ? "Desmarcar todos" : "Selecionar todos"} ({selecionados.size}/{grupos.length})
                </button>
                <button
                  onClick={abrirConfirmacao}
                  disabled={aplicando || selecionados.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {aplicando ? "Aplicando..." : `🔄 Fazer balanço dos selecionados (${selecionados.size})`}
                </button>
              </div>
              <div className="overflow-x-auto bg-white rounded-xl border border-[#E5E5EA]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F5F5F7]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase"></th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase">Modelo + Armazenamento</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Qnt</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Custo Atual</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Novo Balanço</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => {
                      const k = keyOf(g);
                      const sel = selecionados.has(k);
                      const diff = g.balancoCalculado - g.custoAtual;
                      return (
                        <tr
                          key={k}
                          className={`border-t border-[#F5F5F7] hover:bg-[#FAFAFA] cursor-pointer ${sel ? "bg-orange-50" : ""}`}
                          onClick={() => toggleUm(g)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={() => toggleUm(g)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 accent-[#E8740E]"
                            />
                          </td>
                          <td className="px-3 py-2 text-[#1D1D1F] font-medium">{g.modeloBase}</td>
                          <td className="px-3 py-2 text-right text-[#1D1D1F] font-mono">{g.qnt}</td>
                          <td className="px-3 py-2 text-right text-[#86868B] font-mono">{fmt(g.custoAtual)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${g.precisaAtualizar ? "text-[#E8740E]" : "text-[#86868B]"}`}>{fmt(g.balancoCalculado)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${Math.abs(diff) < 0.01 ? "text-[#86868B]" : diff > 0 ? "text-green-600" : "text-red-600"}`}>
                            {Math.abs(diff) < 0.01 ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de confirmacao com preview */}
      {confirmOpen && (
        <ConfirmarBalancoModal
          gruposSelecionados={grupos.filter(g => selecionados.has(keyOf(g)))}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={aplicarBalanco}
          aplicando={aplicando}
        />
      )}
    </div>
  );
}

function ConfirmarBalancoModal({
  gruposSelecionados,
  onCancel,
  onConfirm,
  aplicando,
}: {
  gruposSelecionados: BalancoGrupo[];
  onCancel: () => void;
  onConfirm: () => void;
  aplicando: boolean;
}) {
  const qntTotalProdutos = gruposSelecionados.reduce((s, g) => s + g.qnt, 0);
  const valorTotalAtual = gruposSelecionados.reduce((s, g) => s + g.qnt * g.custoAtual, 0);
  const valorTotalNovo = gruposSelecionados.reduce((s, g) => s + g.custoTotal, 0);
  const impactoValor = valorTotalNovo - valorTotalAtual;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1D1D1F]">🔄 Confirmar Balanço</h2>
          <button onClick={onCancel} className="text-2xl text-[#86868B] hover:text-[#1D1D1F]">×</button>
        </div>

        <p className="text-sm text-[#6E6E73] mb-4">
          Revise os modelos antes de aplicar o balanço. Os valores de <strong>custo_unitario</strong> de cada produto em estoque serão atualizados para o preço médio ponderado.
        </p>

        <div className="bg-gradient-to-br from-[#F5F5F7] to-white border border-[#D2D2D7] rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Modelos selecionados</p>
            <p className="text-xl font-bold text-[#1D1D1F]">{gruposSelecionados.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Total de produtos</p>
            <p className="text-xl font-bold text-[#1D1D1F]">{qntTotalProdutos}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor atual do estoque</p>
            <p className="text-sm font-mono font-semibold text-[#1D1D1F]">{fmt(valorTotalAtual)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor após balanço</p>
            <p className="text-sm font-mono font-semibold text-[#1D1D1F]">{fmt(valorTotalNovo)}</p>
          </div>
          <div className="col-span-full pt-2 border-t border-[#E5E5EA]">
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Impacto total</p>
            <p className={`text-lg font-mono font-bold ${Math.abs(impactoValor) < 1 ? "text-[#86868B]" : impactoValor > 0 ? "text-green-600" : "text-red-600"}`}>
              {impactoValor > 0 ? "+" : ""}{fmt(impactoValor)}
            </p>
          </div>
        </div>

        <div className="border border-[#E5E5EA] rounded-xl overflow-hidden mb-4">
          <div className="bg-[#F5F5F7] px-4 py-2 border-b border-[#E5E5EA]">
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Detalhe por modelo</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E5E5EA]">
                  <th className="px-3 py-2 text-left text-[10px] text-[#86868B]">Modelo</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Qnt</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Atual</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Novo</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Dif</th>
                </tr>
              </thead>
              <tbody>
                {gruposSelecionados.map((g) => {
                  const diff = g.balancoCalculado - g.custoAtual;
                  return (
                    <tr key={`${g.categoria}|${g.modeloBase}`} className="border-b border-[#F5F5F7]">
                      <td className="px-3 py-2 text-[#1D1D1F] font-medium">{g.modeloBase}</td>
                      <td className="px-3 py-2 text-right text-[#1D1D1F] font-mono">{g.qnt}</td>
                      <td className="px-3 py-2 text-right text-[#86868B] font-mono">{fmt(g.custoAtual)}</td>
                      <td className="px-3 py-2 text-right text-[#E8740E] font-mono font-semibold">{fmt(g.balancoCalculado)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${Math.abs(diff) < 0.01 ? "text-[#86868B]" : diff > 0 ? "text-green-600" : "text-red-600"}`}>
                        {Math.abs(diff) < 0.01 ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E5E5EA]">
          <button onClick={onCancel} disabled={aplicando} className="px-4 py-2 rounded-lg text-sm text-[#1D1D1F] hover:bg-[#F5F5F7] font-medium">Cancelar</button>
          <button onClick={onConfirm} disabled={aplicando} className="px-4 py-2 rounded-lg text-sm bg-[#E8740E] text-white font-bold hover:bg-[#D06A0D] disabled:opacity-50">
            {aplicando ? "Aplicando..." : "✅ Confirmar balanço"}
          </button>
        </div>
      </div>
    </div>
  );
}
