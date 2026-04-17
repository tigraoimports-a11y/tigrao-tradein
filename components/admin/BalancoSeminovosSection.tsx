"use client";
import { useCallback, useEffect, useState } from "react";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface Unidade {
  id: string;
  produto: string;
  cor: string | null;
  qnt: number;
  custo_compra: number;
  custo_unitario: number;
  serial_no: string | null;
  imei: string | null;
  observacao: string | null;
  fornecedor: string | null;
}

interface BalancoGrupo {
  categoria: string;
  modeloBase: string;
  qnt: number;
  custoTotal: number;
  custoAtual: number;
  balancoCalculado: number;
  precisaAtualizar: boolean;
  unidades: Unidade[];
}

interface Props {
  password: string;
  userNome: string;
  onMsg: (m: string) => void;
}

// Extrai a grade (A+, A, AB, B) da observacao se presente
function extractGrade(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/\[GRADE_([AB+]+)\]/);
  return m ? m[1] : null;
}

export default function BalancoSeminovosSection({
  password,
  userNome,
  onMsg,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [grupos, setGrupos] = useState<BalancoGrupo[]>([]);
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  const [idsSelecionados, setIdsSelecionados] = useState<Set<string>>(new Set());
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

  const toggleGrupoExpandido = (k: string) => {
    const next = new Set(gruposExpandidos);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setGruposExpandidos(next);
  };

  const toggleUnidade = (id: string) => {
    const next = new Set(idsSelecionados);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIdsSelecionados(next);
  };

  const toggleGrupoInteiro = (g: BalancoGrupo) => {
    const next = new Set(idsSelecionados);
    const todasMarcadas = g.unidades.every(u => next.has(u.id));
    if (todasMarcadas) {
      g.unidades.forEach(u => next.delete(u.id));
    } else {
      g.unidades.forEach(u => next.add(u.id));
    }
    setIdsSelecionados(next);
  };

  // Calcula preview do novo custo medio das unidades selecionadas
  const unidadesSelecionadas = grupos.flatMap(g => g.unidades).filter(u => idsSelecionados.has(u.id));
  const totalQntSel = unidadesSelecionadas.reduce((s, u) => s + u.qnt, 0);
  const totalCustoSel = unidadesSelecionadas.reduce((s, u) => s + u.qnt * u.custo_compra, 0);
  const novoCustoMedio = totalQntSel > 0 ? Math.round((totalCustoSel / totalQntSel) * 100) / 100 : 0;

  const abrirConfirmacao = () => {
    if (idsSelecionados.size === 0) { alert("Selecione ao menos 1 unidade."); return; }
    if (idsSelecionados.size === 1) {
      alert("Selecione pelo menos 2 unidades pra calcular uma média. Pra editar 1 unidade só, use o Editar do produto.");
      return;
    }
    setConfirmOpen(true);
  };

  const aplicarBalanco = async () => {
    setConfirmOpen(false);
    setAplicando(true);
    try {
      const res = await fetch("/api/admin/recalc-balancos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userNome) },
        body: JSON.stringify({ ids: [...idsSelecionados] }),
      });
      const j = await res.json();
      if (!j.ok) { alert("Erro: " + (j.error || "falha")); setAplicando(false); return; }
      onMsg(`✓ Balanço aplicado em ${j.updated} unidade(s). Novo custo: ${fmt(j.novoCusto || novoCustoMedio)}.`);
      setIdsSelecionados(new Set());
      await carregar();
    } catch (e) {
      alert("Erro de conexão: " + String(e));
    }
    setAplicando(false);
  };

  const precisam = grupos.filter(g => g.precisaAtualizar).length;

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <div className="text-left">
            <p className="text-sm font-bold text-[#1D1D1F]">Balanço Manual (Preço Médio)</p>
            <p className="text-[11px] text-[#86868B]">
              Selecione as unidades específicas (por número de série) e aplique o recálculo de preço médio ponderado. Pula avariadas.
              {aberto && precisam > 0 && <span className="ml-2 text-[#E8740E] font-semibold">· {precisam} modelo(s) com balanço desatualizado</span>}
            </p>
          </div>
        </div>
        <span className="text-[#86868B]">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <div className="px-5 py-4 border-t border-[#E5E5EA] bg-[#FAFAFA]">
          {loading && <p className="text-xs text-[#86868B] py-4 text-center">Carregando...</p>}
          {!loading && grupos.length === 0 && (
            <p className="text-xs text-[#86868B] py-4 text-center">Nenhum seminovo em estoque encontrado.</p>
          )}
          {!loading && grupos.length > 0 && (
            <>
              {/* Barra topo com resumo e botao aplicar */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2 bg-white rounded-xl border border-[#E5E5EA] p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-[#86868B]">Selecionadas:</span>
                  <span className="text-sm font-bold text-[#1D1D1F]">{idsSelecionados.size} unidade(s)</span>
                  {totalQntSel > 0 && (
                    <>
                      <span className="text-xs text-[#86868B]">· Novo custo médio:</span>
                      <span className="text-sm font-bold text-[#E8740E] font-mono">{fmt(novoCustoMedio)}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={abrirConfirmacao}
                  disabled={aplicando || idsSelecionados.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {aplicando ? "Aplicando..." : `🔄 Aplicar balanço (${idsSelecionados.size})`}
                </button>
              </div>

              {/* Grupos expansiveis */}
              <div className="space-y-2">
                {grupos.map((g) => {
                  const k = keyOf(g);
                  const expandido = gruposExpandidos.has(k);
                  const marcadasNoGrupo = g.unidades.filter(u => idsSelecionados.has(u.id)).length;
                  const todasMarcadas = g.unidades.length > 0 && marcadasNoGrupo === g.unidades.length;
                  const algumaMarcada = marcadasNoGrupo > 0 && !todasMarcadas;
                  return (
                    <div key={k} className="bg-white rounded-xl border border-[#E5E5EA] overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2 hover:bg-[#FAFAFA]">
                        <input
                          type="checkbox"
                          checked={todasMarcadas}
                          ref={(el) => { if (el) el.indeterminate = algumaMarcada; }}
                          onChange={() => toggleGrupoInteiro(g)}
                          className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                          title="Selecionar todas unidades deste modelo"
                        />
                        <button
                          onClick={() => toggleGrupoExpandido(k)}
                          className="flex-1 flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#86868B]">{expandido ? "▼" : "▶"}</span>
                            <span className="text-sm font-semibold text-[#1D1D1F]">{g.modeloBase}</span>
                            <span className="text-[10px] text-[#86868B]">· {g.qnt} unidade(s)</span>
                            {marcadasNoGrupo > 0 && (
                              <span className="text-[10px] bg-orange-100 text-[#E8740E] px-2 py-0.5 rounded-full font-semibold">
                                {marcadasNoGrupo} selecionada(s)
                              </span>
                            )}
                            {g.precisaAtualizar && (
                              <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                                ⚠ balanço desatualizado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-[#86868B]">Atual: <span className="font-mono text-[#1D1D1F]">{fmt(g.custoAtual)}</span></span>
                            <span className="text-[#86868B]">Sugerido: <span className={`font-mono ${g.precisaAtualizar ? "text-[#E8740E]" : "text-[#86868B]"}`}>{fmt(g.balancoCalculado)}</span></span>
                          </div>
                        </button>
                      </div>
                      {expandido && (
                        <div className="border-t border-[#E5E5EA] bg-[#FAFAFA]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[#E5E5EA]">
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase w-[50px]"></th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase">Serial / IMEI</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase">Cor</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase">Grade</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Qnt</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Custo Compra</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Custo Atual</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.unidades.map((u) => {
                                const selecionada = idsSelecionados.has(u.id);
                                const grade = extractGrade(u.observacao);
                                return (
                                  <tr
                                    key={u.id}
                                    className={`border-b border-[#F5F5F7] hover:bg-white cursor-pointer ${selecionada ? "bg-orange-50" : ""}`}
                                    onClick={() => toggleUnidade(u.id)}
                                  >
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selecionada}
                                        onChange={() => toggleUnidade(u.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-4 h-4 accent-[#E8740E]"
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] text-[#1D1D1F]">
                                      {u.serial_no || u.imei || <span className="text-[#86868B]">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-[#6E6E73]">{u.cor || "—"}</td>
                                    <td className="px-3 py-2">
                                      {grade ? (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                          grade === "A+" ? "bg-green-100 text-green-700" :
                                          grade === "A" ? "bg-blue-100 text-blue-700" :
                                          grade === "AB" ? "bg-yellow-100 text-yellow-700" :
                                          "bg-red-100 text-red-700"
                                        }`}>{grade}</span>
                                      ) : <span className="text-[#86868B]">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-[#1D1D1F]">{u.qnt}</td>
                                    <td className="px-3 py-2 text-right font-mono text-[#1D1D1F]">{fmt(u.custo_compra)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-[#86868B]">{fmt(u.custo_unitario)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {confirmOpen && (
        <ConfirmarBalancoModal
          unidades={unidadesSelecionadas}
          novoCustoMedio={novoCustoMedio}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={aplicarBalanco}
          aplicando={aplicando}
        />
      )}
    </div>
  );
}

function ConfirmarBalancoModal({
  unidades,
  novoCustoMedio,
  onCancel,
  onConfirm,
  aplicando,
}: {
  unidades: Unidade[];
  novoCustoMedio: number;
  onCancel: () => void;
  onConfirm: () => void;
  aplicando: boolean;
}) {
  const totalQnt = unidades.reduce((s, u) => s + u.qnt, 0);
  const valorAtualTotal = unidades.reduce((s, u) => s + u.qnt * u.custo_unitario, 0);
  const valorNovoTotal = totalQnt * novoCustoMedio;
  const impacto = valorNovoTotal - valorAtualTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1D1D1F]">🔄 Confirmar Balanço</h2>
          <button onClick={onCancel} className="text-2xl text-[#86868B] hover:text-[#1D1D1F]">×</button>
        </div>

        <p className="text-sm text-[#6E6E73] mb-4">
          Todas as <strong>{unidades.length} unidades selecionadas</strong> vão ficar com o mesmo <strong>custo_unitario = {fmt(novoCustoMedio)}</strong> (preço médio ponderado).
        </p>

        <div className="bg-gradient-to-br from-[#F5F5F7] to-white border border-[#D2D2D7] rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Unidades</p>
            <p className="text-xl font-bold text-[#1D1D1F]">{unidades.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Novo custo médio</p>
            <p className="text-xl font-bold text-[#E8740E] font-mono">{fmt(novoCustoMedio)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor atual</p>
            <p className="text-sm font-mono text-[#1D1D1F]">{fmt(valorAtualTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor após balanço</p>
            <p className="text-sm font-mono text-[#1D1D1F]">{fmt(valorNovoTotal)}</p>
          </div>
          <div className="col-span-full pt-2 border-t border-[#E5E5EA]">
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Impacto</p>
            <p className={`text-lg font-mono font-bold ${Math.abs(impacto) < 1 ? "text-[#86868B]" : impacto > 0 ? "text-green-600" : "text-red-600"}`}>
              {impacto > 0 ? "+" : ""}{fmt(impacto)}
            </p>
          </div>
        </div>

        <div className="border border-[#E5E5EA] rounded-xl overflow-hidden mb-4">
          <div className="bg-[#F5F5F7] px-4 py-2 border-b border-[#E5E5EA]">
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Unidades</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E5E5EA]">
                  <th className="px-3 py-2 text-left text-[10px] text-[#86868B]">Produto</th>
                  <th className="px-3 py-2 text-left text-[10px] text-[#86868B]">Serial</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Atual</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Novo</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => {
                  const diff = novoCustoMedio - u.custo_unitario;
                  return (
                    <tr key={u.id} className="border-b border-[#F5F5F7]">
                      <td className="px-3 py-2 text-[#1D1D1F]">{u.produto} {u.cor ? `(${u.cor})` : ""}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-[#6E6E73]">{u.serial_no || u.imei || "—"}</td>
                      <td className="px-3 py-2 text-right text-[#86868B] font-mono">{fmt(u.custo_unitario)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${Math.abs(diff) < 1 ? "text-[#86868B]" : diff > 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(novoCustoMedio)}
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
