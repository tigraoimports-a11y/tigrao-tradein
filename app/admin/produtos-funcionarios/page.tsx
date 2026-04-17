"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { hojeBR } from "@/lib/date-utils";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

type TipoAcordo = "CEDIDO" | "PARCIAL" | "TOTAL" | "SUBSIDIADO" | "OUTRO";
type Status = "EM_USO" | "CEDIDO" | "ACORDO_ATIVO" | "PENDENTE_PAGAMENTO" | "QUITADO" | "DEVOLVIDO" | "DESLIGADO_PENDENTE";

const TIPO_ACORDO_LABELS: Record<TipoAcordo, string> = {
  CEDIDO: "Cedido (empresa paga 100%)",
  PARCIAL: "Pagamento parcial",
  TOTAL: "Pagamento total",
  SUBSIDIADO: "Subsidiado pela empresa",
  OUTRO: "Outro (ver observação)",
};

const STATUS_LABELS: Record<Status, string> = {
  EM_USO: "Em uso",
  CEDIDO: "Cedido",
  ACORDO_ATIVO: "Acordo ativo",
  PENDENTE_PAGAMENTO: "Pendente pagamento",
  QUITADO: "Quitado",
  DEVOLVIDO: "Devolvido",
  DESLIGADO_PENDENTE: "Desligado (pendente)",
};

const STATUS_COLORS: Record<Status, string> = {
  EM_USO: "bg-blue-100 text-blue-700",
  CEDIDO: "bg-green-100 text-green-700",
  ACORDO_ATIVO: "bg-amber-100 text-amber-700",
  PENDENTE_PAGAMENTO: "bg-orange-100 text-orange-700",
  QUITADO: "bg-emerald-100 text-emerald-700",
  DEVOLVIDO: "bg-gray-100 text-gray-600",
  DESLIGADO_PENDENTE: "bg-red-100 text-red-700",
};

interface Pagamento {
  id: string;
  data: string;
  valor: number;
  forma: string;
  conta: string | null;
  parcelas: number;
  valor_liquido: number | null;
  observacao: string | null;
}

interface Vinculo {
  id: string;
  estoque_id: string | null;
  funcionario: string;
  produto: string;
  categoria: string | null;
  cor: string | null;
  serial_no: string | null;
  imei: string | null;
  tipo_acordo: TipoAcordo;
  percentual_funcionario: number;
  valor_total: number;
  valor_empresa: number;
  valor_funcionario: number;
  valor_pago: number;
  observacao: string;
  status: Status;
  data_saida: string;
  data_devolucao: string | null;
  created_at: string;
  pagamentos: Pagamento[];
}

interface EstoqueItem {
  id: string;
  produto: string;
  categoria: string;
  cor: string | null;
  tipo: string;
  qnt: number;
  status: string;
  custo_compra: number | null;
  custo_unitario: number;
  serial_no: string | null;
  imei: string | null;
}

export default function ProdutosFuncionariosPage() {
  const { user, password } = useAdmin();
  const userName = user?.nome || "sistema";

  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [filtroFunc, setFiltroFunc] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | Status>("TODOS");
  const [modalVincular, setModalVincular] = useState<"estoque" | "manual" | null>(null);
  const [modalPagamento, setModalPagamento] = useState<Vinculo | null>(null);

  const fetchVinculos = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/produtos-funcionarios", {
        headers: { "x-admin-password": password },
      });
      const j = await res.json();
      if (j.data) setVinculos(j.data);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { fetchVinculos(); }, [fetchVinculos]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const filtrados = useMemo(() => {
    let list = vinculos;
    if (filtroFunc.trim()) {
      const q = filtroFunc.toLowerCase();
      list = list.filter(v => v.funcionario.toLowerCase().includes(q));
    }
    if (filtroStatus !== "TODOS") {
      list = list.filter(v => v.status === filtroStatus);
    }
    return list;
  }, [vinculos, filtroFunc, filtroStatus]);

  // Agrupa por funcionario
  const porFuncionario = useMemo(() => {
    const map = new Map<string, Vinculo[]>();
    for (const v of filtrados) {
      const arr = map.get(v.funcionario) || [];
      arr.push(v);
      map.set(v.funcionario, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  // Totais
  const totais = useMemo(() => {
    let totalCedido = 0, totalEmAberto = 0, totalQuitado = 0, totalDesligado = 0;
    for (const v of vinculos) {
      if (v.status === "DEVOLVIDO") continue;
      const aberto = Math.max(0, Number(v.valor_funcionario || 0) - Number(v.valor_pago || 0));
      if (v.status === "CEDIDO") totalCedido += Number(v.valor_total || 0);
      if (v.status === "DESLIGADO_PENDENTE") totalDesligado += aberto;
      if (v.status === "QUITADO") totalQuitado += Number(v.valor_funcionario || 0);
      if (["ACORDO_ATIVO", "PENDENTE_PAGAMENTO"].includes(v.status)) totalEmAberto += aberto;
    }
    return { totalCedido, totalEmAberto, totalQuitado, totalDesligado };
  }, [vinculos]);

  const toggleExpandir = (id: string) => {
    setExpandido(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDevolver = async (v: Vinculo) => {
    const saldo = Math.max(0, Number(v.valor_funcionario || 0) - Number(v.valor_pago || 0));
    const aviso = saldo > 0
      ? `Atenção: ${v.funcionario} ainda deve R$ ${saldo.toLocaleString("pt-BR")} desse acordo.\n\nAo devolver, o produto volta pro estoque MAS o débito continua em aberto (status DESLIGADO_PENDENTE).\n\nConfirmar devolução?`
      : `Devolver "${v.produto}" de ${v.funcionario} ao estoque?`;
    if (!confirm(aviso)) return;
    const res = await fetch("/api/admin/produtos-funcionarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({ id: v.id, devolver: true }),
    });
    const j = await res.json();
    if (j.ok) {
      const msgFinal = j.saldoPendente > 0
        ? `✅ Produto devolvido. Débito de R$ ${Number(j.saldoPendente).toLocaleString("pt-BR")} em aberto com ${v.funcionario}.`
        : "✅ Produto devolvido ao estoque";
      setMsg(msgFinal);
      fetchVinculos();
    } else setMsg("❌ " + (j.error || "erro"));
  };

  const handleMarcarDesligado = async (v: Vinculo) => {
    if (!confirm(`Marcar ${v.funcionario} como desligado com pendência?`)) return;
    const res = await fetch("/api/admin/produtos-funcionarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({ id: v.id, status: "DESLIGADO_PENDENTE" }),
    });
    const j = await res.json();
    if (j.ok) { setMsg("✅ Atualizado"); fetchVinculos(); }
    else setMsg("❌ " + (j.error || "erro"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">👥 Produtos com Funcionários</h1>
          <p className="text-sm text-[#86868B] mt-1">Controle de produtos vinculados a colaboradores, acordos e pagamentos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalVincular("estoque")} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D]">
            + Vincular do Estoque
          </button>
          <button onClick={() => setModalVincular("manual")} className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-sm font-semibold hover:border-[#E8740E]">
            + Cadastro Manual
          </button>
        </div>
      </div>

      {msg && <div className="px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {/* Cards de totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
          <p className="text-xs text-green-700 font-semibold uppercase">Cedidos</p>
          <p className="text-xl font-bold text-green-800 mt-1">{fmt(totais.totalCedido)}</p>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
          <p className="text-xs text-amber-700 font-semibold uppercase">Em aberto</p>
          <p className="text-xl font-bold text-amber-800 mt-1">{fmt(totais.totalEmAberto)}</p>
        </div>
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <p className="text-xs text-emerald-700 font-semibold uppercase">Quitados</p>
          <p className="text-xl font-bold text-emerald-800 mt-1">{fmt(totais.totalQuitado)}</p>
        </div>
        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
          <p className="text-xs text-red-700 font-semibold uppercase">Desligados c/ pendência</p>
          <p className="text-xl font-bold text-red-800 mt-1">{fmt(totais.totalDesligado)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={filtroFunc}
          onChange={e => setFiltroFunc(e.target.value)}
          placeholder="Buscar por funcionário..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none"
        />
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}
          className="px-3 py-2 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none"
        >
          <option value="TODOS">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Lista por funcionário */}
      {loading ? (
        <div className="p-8 text-center text-[#86868B]">Carregando...</div>
      ) : porFuncionario.length === 0 ? (
        <div className="p-8 text-center text-[#86868B] bg-[#F9F9FB] rounded-xl border border-[#E8E8ED]">
          Nenhum produto vinculado. Clique em <strong>+ Vincular do Estoque</strong> pra começar.
        </div>
      ) : (
        <div className="space-y-3">
          {porFuncionario.map(([funcionario, items]) => {
            const pendente = items.reduce((s, v) => v.status !== "DEVOLVIDO" && v.status !== "QUITADO" && v.status !== "CEDIDO" ? s + Math.max(0, Number(v.valor_funcionario || 0) - Number(v.valor_pago || 0)) : s, 0);
            return (
              <div key={funcionario} className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden">
                <div className="px-5 py-3 bg-[#F9F9FB] border-b border-[#E8E8ED] flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#1D1D1F]">{funcionario}</h2>
                    <p className="text-xs text-[#86868B]">{items.length} produto(s)</p>
                  </div>
                  {pendente > 0 && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-amber-700 font-semibold">Pendente</p>
                      <p className="text-lg font-bold text-amber-800">{fmt(pendente)}</p>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-[#F0F0F5]">
                  {items.map(v => {
                    const saldo = Math.max(0, Number(v.valor_funcionario || 0) - Number(v.valor_pago || 0));
                    const exp = expandido.has(v.id);
                    return (
                      <div key={v.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => toggleExpandir(v.id)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-[#1D1D1F] truncate">{v.produto}</p>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[v.status]}`}>{STATUS_LABELS[v.status]}</span>
                            </div>
                            <p className="text-xs text-[#86868B] mt-0.5">
                              {v.cor ? `${v.cor} • ` : ""}
                              {v.serial_no ? `SN: ${v.serial_no}` : v.imei ? `IMEI: ${v.imei}` : "sem serial"}
                              {" • Saída: "}{v.data_saida}
                            </p>
                            <p className="text-xs text-[#6E6E73] mt-1">
                              <span className="font-semibold">{TIPO_ACORDO_LABELS[v.tipo_acordo]}</span>
                              {v.valor_total > 0 && (
                                <> • Total: <span className="font-mono">{fmt(v.valor_total)}</span></>
                              )}
                              {v.valor_funcionario > 0 && (
                                <> • Func: <span className="font-mono text-amber-700">{fmt(v.valor_funcionario)}</span></>
                              )}
                              {v.valor_pago > 0 && (
                                <> • Pago: <span className="font-mono text-green-700">{fmt(v.valor_pago)}</span></>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {saldo > 0 && (
                              <p className="text-sm font-bold text-amber-700">{fmt(saldo)}</p>
                            )}
                            <p className="text-[10px] text-[#86868B] mt-0.5">{exp ? "▲ recolher" : "▼ detalhes"}</p>
                          </div>
                        </div>

                        {exp && (
                          <div className="mt-3 pt-3 border-t border-[#F0F0F5] space-y-3">
                            <div>
                              <p className="text-[10px] uppercase text-[#86868B] font-semibold mb-1">Observação</p>
                              <p className="text-sm text-[#1D1D1F] bg-[#F9F9FB] p-3 rounded-lg">{v.observacao}</p>
                            </div>

                            {v.pagamentos.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase text-[#86868B] font-semibold mb-1">Pagamentos ({v.pagamentos.length})</p>
                                <div className="space-y-1">
                                  {v.pagamentos.map(p => (
                                    <div key={p.id} className="flex items-center justify-between text-xs bg-[#F9F9FB] px-3 py-2 rounded-lg">
                                      <span>
                                        {p.data} • {p.forma}{p.conta ? ` (${p.conta})` : ""}
                                        {p.parcelas > 1 ? ` • ${p.parcelas}x` : ""}
                                      </span>
                                      <span className="font-mono font-bold text-green-700">{fmt(p.valor)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                              {v.status !== "DEVOLVIDO" && v.valor_funcionario > 0 && saldo > 0 && (
                                <button
                                  onClick={() => setModalPagamento(v)}
                                  className="px-3 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#D06A0D]"
                                >
                                  💰 Registrar Pagamento
                                </button>
                              )}
                              {v.status !== "DEVOLVIDO" && (
                                <>
                                  <button onClick={() => handleDevolver(v)} className="px-3 py-1.5 rounded-lg bg-white border border-[#D2D2D7] text-xs font-semibold hover:border-[#E8740E]">
                                    ↩ Devolver ao estoque
                                  </button>
                                  {v.status !== "DESLIGADO_PENDENTE" && saldo > 0 && (
                                    <button onClick={() => handleMarcarDesligado(v)} className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100">
                                      ⚠ Marcar desligado (pendência)
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalVincular && (
        <ModalVincular
          tipo={modalVincular}
          password={password}
          userName={userName}
          onClose={() => setModalVincular(null)}
          onSaved={() => { setModalVincular(null); fetchVinculos(); setMsg("✅ Produto vinculado ao funcionário"); }}
        />
      )}

      {modalPagamento && (
        <ModalPagamento
          vinculo={modalPagamento}
          password={password}
          userName={userName}
          onClose={() => setModalPagamento(null)}
          onSaved={() => { setModalPagamento(null); fetchVinculos(); setMsg("✅ Pagamento registrado"); }}
        />
      )}
    </div>
  );
}

/* =================== Modal Vincular =================== */

function ModalVincular({ tipo, password, userName, onClose, onSaved }: {
  tipo: "estoque" | "manual";
  password: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [estoqueItems, setEstoqueItems] = useState<EstoqueItem[]>([]);
  const [busca, setBusca] = useState("");
  const [estoqueSel, setEstoqueSel] = useState<EstoqueItem | null>(null);
  // Manual
  const [produto, setProduto] = useState("");
  const [categoria, setCategoria] = useState("IPHONES");
  const [cor, setCor] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [valorTotalManual, setValorTotalManual] = useState("");
  // Shared
  const [funcionario, setFuncionario] = useState("");
  const [tipoAcordo, setTipoAcordo] = useState<TipoAcordo>("PARCIAL");
  const [percentual, setPercentual] = useState(50);
  const [observacao, setObservacao] = useState("");
  const [dataSaida, setDataSaida] = useState(hojeBR());
  // Pagamento inicial
  const [registrarPagamento, setRegistrarPagamento] = useState(false);
  const [pagForma, setPagForma] = useState("PIX");
  const [pagConta, setPagConta] = useState("ITAU");
  const [pagParcelas, setPagParcelas] = useState(1);
  const [pagValor, setPagValor] = useState("");
  const [pagObs, setPagObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (tipo !== "estoque") return;
    (async () => {
      // Busca todos sem filtro (URL com espaco pode falhar em alguns browsers), depois filtra client-side.
      const res = await fetch("/api/estoque", {
        headers: { "x-admin-password": password },
      });
      const j = await res.json();
      if (j.data) {
        setEstoqueItems((j.data as EstoqueItem[]).filter(i => i.status === "EM ESTOQUE" && Number(i.qnt) > 0));
      }
    })();
  }, [tipo, password]);

  const filtered = useMemo(() => {
    if (!busca.trim()) return estoqueItems.slice(0, 50);
    const q = busca.toLowerCase();
    return estoqueItems.filter(i =>
      i.produto.toLowerCase().includes(q) ||
      (i.serial_no || "").toLowerCase().includes(q) ||
      (i.imei || "").toLowerCase().includes(q) ||
      (i.cor || "").toLowerCase().includes(q)
    ).slice(0, 50);
  }, [estoqueItems, busca]);

  const valorBase = tipo === "estoque"
    ? Number(estoqueSel?.custo_compra ?? estoqueSel?.custo_unitario ?? 0)
    : Number(valorTotalManual.replace(/\D/g, "")) || 0;

  const valorFunc = useMemo(() => {
    if (tipoAcordo === "CEDIDO") return 0;
    if (tipoAcordo === "TOTAL") return valorBase;
    if (tipoAcordo === "PARCIAL" || tipoAcordo === "SUBSIDIADO") return Math.round(valorBase * percentual) / 100;
    return 0;
  }, [valorBase, percentual, tipoAcordo]);
  const valorEmpr = Math.max(0, valorBase - valorFunc);

  const handleSalvar = async () => {
    setErr("");
    if (!funcionario.trim()) { setErr("Informe o funcionário"); return; }
    if (!observacao.trim()) { setErr("Observação obrigatória"); return; }
    if (tipo === "estoque" && !estoqueSel) { setErr("Selecione um item do estoque"); return; }
    if (tipo === "manual" && !produto.trim()) { setErr("Informe o produto"); return; }

    setSaving(true);
    try {
      const body = tipo === "estoque" ? {
        estoque_id: estoqueSel!.id,
        funcionario, tipo_acordo: tipoAcordo, percentual_funcionario: percentual,
        observacao, data_saida: dataSaida,
      } : {
        manual: true,
        produto, categoria, cor: cor || null, serial_no: serial || null, imei: imei || null,
        valor_total_manual: valorBase,
        funcionario, tipo_acordo: tipoAcordo, percentual_funcionario: percentual,
        observacao, data_saida: dataSaida,
      };
      const res = await fetch("/api/admin/produtos-funcionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || "Erro ao salvar"); return; }

      // Se marcou registrar pagamento inicial, posta pagamento
      const valorPagNum = Number((pagValor || "").replace(/\D/g, ""));
      if (registrarPagamento && valorPagNum > 0 && j.data?.id) {
        const resPag = await fetch("/api/admin/produtos-funcionarios/pagamento", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
          body: JSON.stringify({
            produto_funcionario_id: j.data.id,
            data: dataSaida,
            valor: valorPagNum,
            forma: pagForma,
            conta: (pagForma === "PIX" || pagForma === "CARTAO") ? pagConta : null,
            parcelas: pagParcelas,
            observacao: pagObs || null,
          }),
        });
        const jPag = await resPag.json();
        if (!jPag.ok) {
          setErr(`Vínculo criado, mas falhou o pagamento: ${jPag.error || "erro"}`);
          // Ainda assim chama onSaved pra refetch
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const precisaPercentual = tipoAcordo === "PARCIAL" || tipoAcordo === "SUBSIDIADO";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E8E8ED] flex items-center justify-between">
          <h3 className="font-bold text-[#1D1D1F]">
            {tipo === "estoque" ? "Vincular Produto do Estoque" : "Cadastro Manual"}
          </h3>
          <button onClick={() => !saving && onClose()} className="text-[#86868B] hover:text-[#1D1D1F] text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {tipo === "estoque" ? (
            <>
<<<<<<< Updated upstream
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Buscar produto *</label>
                <input
                  type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Nome, serial ou cor"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none"
                />
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#E8E8ED] bg-[#F9F9FB]">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-[#86868B] p-3">Nenhum item encontrado</p>
                  ) : filtered.map(item => (
                    <div
                      key={item.id}
                      onClick={() => setEstoqueSel(item)}
                      className={`px-3 py-2 text-sm border-b border-[#F0F0F5] cursor-pointer hover:bg-white ${estoqueSel?.id === item.id ? "bg-orange-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{item.produto}</span>
                        <span className="text-xs font-mono text-[#E8740E]">{fmt(Number(item.custo_compra ?? item.custo_unitario ?? 0))}</span>
                      </div>
                      <p className="text-xs text-[#86868B]">
                        {item.cor || "—"}
                        {item.serial_no ? ` • SN: ${item.serial_no}` : ""}
                        {item.imei ? ` • IMEI: ${item.imei}` : ""}
=======
              {estoqueSel ? (
                <div className="p-3 rounded-xl bg-green-50 border-2 border-green-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase font-bold text-green-700">✓ Produto selecionado</p>
                      <p className="font-bold text-[#1D1D1F] mt-1">{estoqueSel.produto}</p>
                      <p className="text-xs text-[#86868B] mt-0.5">
                        {estoqueSel.cor || "—"}
                        {estoqueSel.serial_no ? ` • SN: ${estoqueSel.serial_no}` : ""}
                        {estoqueSel.imei ? ` • IMEI: ${estoqueSel.imei}` : ""}
                      </p>
                      <p className="text-sm font-mono font-bold text-[#E8740E] mt-1">
                        Custo: {fmt(Number(estoqueSel.custo_compra ?? estoqueSel.custo_unitario ?? 0))}
>>>>>>> Stashed changes
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEstoqueSel(null)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-[#D2D2D7] hover:border-[#E8740E] whitespace-nowrap"
                    >
                      Trocar
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] uppercase text-[#86868B] font-semibold">Buscar produto *</label>
                  <input
                    type="text" value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Nome, serial, IMEI ou cor"
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none"
                    autoFocus
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#E8E8ED] bg-[#F9F9FB]">
                    {filtered.length === 0 ? (
                      <p className="text-xs text-[#86868B] p-3">Nenhum item encontrado</p>
                    ) : filtered.map(item => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => { setEstoqueSel(item); setBusca(""); }}
                        className="w-full text-left px-3 py-2 text-sm border-b border-[#F0F0F5] hover:bg-[#E8740E]/10 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{item.produto}</span>
                          <span className="text-xs font-mono text-[#E8740E]">{fmt(Number(item.custo_compra ?? item.custo_unitario ?? 0))}</span>
                        </div>
                        <p className="text-xs text-[#86868B]">
                          {item.cor || "—"}
                          {item.serial_no ? ` • SN: ${item.serial_no}` : ""}
                          {item.imei ? ` • IMEI: ${item.imei}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Produto *</label>
                <input type="text" value={produto} onChange={e => setProduto(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" placeholder="Ex: iPhone 14 Pro Max 256GB" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Categoria</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]">
                  <option>IPHONES</option><option>IPADS</option><option>MACBOOK</option><option>MAC_MINI</option>
                  <option>APPLE_WATCH</option><option>AIRPODS</option><option>ACESSORIOS</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Cor</label>
                <input type="text" value={cor} onChange={e => setCor(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Serial</label>
                <input type="text" value={serial} onChange={e => setSerial(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">IMEI</label>
                <input type="text" value={imei} onChange={e => setImei(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Valor base do produto (R$)</label>
                <input type="text" inputMode="numeric" value={valorTotalManual} onChange={e => setValorTotalManual(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" placeholder="Ex: 8000" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Funcionário *</label>
              <input type="text" value={funcionario} onChange={e => setFuncionario(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" placeholder="Ex: Bianca" />
            </div>
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Data de saída</label>
              <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase text-[#86868B] font-semibold">Tipo de acordo *</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(Object.keys(TIPO_ACORDO_LABELS) as TipoAcordo[]).map(t => (
                <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${tipoAcordo === t ? "border-[#E8740E] bg-orange-50" : "border-[#D2D2D7]"}`}>
                  <input type="radio" checked={tipoAcordo === t} onChange={() => setTipoAcordo(t)} className="accent-[#E8740E]" />
                  <span>{TIPO_ACORDO_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </div>

          {precisaPercentual && (
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] uppercase text-orange-800 font-bold">Funcionário paga</label>
                <span className="text-lg font-bold text-orange-700">{percentual}%</span>
              </div>
              <input
                type="range" min={10} max={100} step={5}
                value={percentual} onChange={e => setPercentual(Number(e.target.value))}
                className="w-full accent-[#E8740E]"
              />
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white p-2 rounded-lg text-center">
                  <p className="text-[10px] text-[#86868B] uppercase">Total</p>
                  <p className="font-bold font-mono">{fmt(valorBase)}</p>
                </div>
                <div className="bg-green-50 p-2 rounded-lg text-center">
                  <p className="text-[10px] text-green-700 uppercase">Empresa</p>
                  <p className="font-bold font-mono text-green-800">{fmt(valorEmpr)}</p>
                </div>
                <div className="bg-amber-50 p-2 rounded-lg text-center">
                  <p className="text-[10px] text-amber-700 uppercase">Funcionário</p>
                  <p className="font-bold font-mono text-amber-800">{fmt(valorFunc)}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase text-[#86868B] font-semibold">
              Observação do acordo * <span className="text-red-500">(obrigatória)</span>
            </label>
            <textarea
              value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: Empresa arcou com 50%. Funcionária paga 50% via desconto em folha. Em caso de desligamento, deverá quitar o saldo restante."
              rows={3}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none"
            />
          </div>

          {/* Pagamento inicial — so aparece quando ha valor a ser pago pelo funcionario */}
          {valorFunc > 0 && (
            <div className="pt-3 border-t border-[#E8E8ED]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={registrarPagamento} onChange={e => {
                  setRegistrarPagamento(e.target.checked);
                  if (e.target.checked && !pagValor) setPagValor(String(Math.round(valorFunc)));
                }} className="w-4 h-4 accent-[#E8740E]" />
                <span className="text-sm font-semibold text-[#1D1D1F]">💰 Registrar pagamento inicial?</span>
              </label>
              <p className="text-[11px] text-[#86868B] mt-1 ml-6">Marque se o funcionário ja pagou algo no ato. Saldo restante fica pendente.</p>

              {registrarPagamento && (
                <div className="mt-3 p-3 bg-[#F9F9FB] rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-[#86868B] font-semibold">Forma</label>
                      <select value={pagForma} onChange={e => setPagForma(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]">
                        <option value="PIX">Pix</option>
                        <option value="CARTAO">Cartão (máquina)</option>
                        <option value="LINK">Link Mercado Pago</option>
                        <option value="DINHEIRO">Dinheiro</option>
                        <option value="DESCONTO_FOLHA">Desconto em folha</option>
                        <option value="OUTRO">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-[#86868B] font-semibold">Valor (R$)</label>
                      <input type="text" inputMode="numeric" value={pagValor} onChange={e => setPagValor(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" placeholder={`Ate ${fmt(valorFunc)}`} />
                    </div>
                  </div>

                  {(pagForma === "PIX" || pagForma === "CARTAO") && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-[#86868B] font-semibold">{pagForma === "PIX" ? "Conta Pix" : "Maquina"}</label>
                        <select value={pagConta} onChange={e => setPagConta(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]">
                          <option value="ITAU">Itaú</option>
                          <option value="INFINITEPAY">InfinitePay</option>
                          <option value="MERCADOPAGO">Mercado Pago</option>
                        </select>
                      </div>
                      {pagForma === "CARTAO" && (
                        <div>
                          <label className="text-[10px] uppercase text-[#86868B] font-semibold">Parcelas</label>
                          <input type="number" min={1} max={24} value={pagParcelas} onChange={e => setPagParcelas(Number(e.target.value))} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
                        </div>
                      )}
                    </div>
                  )}

                  {pagForma === "LINK" && (
                    <div>
                      <label className="text-[10px] uppercase text-[#86868B] font-semibold">Parcelas do Link</label>
                      <input type="number" min={1} max={24} value={pagParcelas} onChange={e => setPagParcelas(Number(e.target.value))} className="mt-1 w-32 px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] uppercase text-[#86868B] font-semibold">Observação do pagamento (opcional)</label>
                    <input type="text" value={pagObs} onChange={e => setPagObs(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-3 border-t border-[#E8E8ED] bg-[#F9F9FB] flex gap-2 justify-end">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-4 py-2 rounded-lg bg-white border border-[#D2D2D7] text-sm font-semibold">Cancelar</button>
          <button onClick={handleSalvar} disabled={saving} className="px-5 py-2 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] disabled:opacity-50">
            {saving ? "Salvando..." : "Confirmar Vínculo"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== Modal Pagamento =================== */

function ModalPagamento({ vinculo, password, userName, onClose, onSaved }: {
  vinculo: Vinculo;
  password: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saldo = Math.max(0, Number(vinculo.valor_funcionario || 0) - Number(vinculo.valor_pago || 0));
  const [data, setData] = useState(hojeBR());
  const [valor, setValor] = useState(String(Math.round(saldo)));
  const [forma, setForma] = useState("PIX");
  const [conta, setConta] = useState("ITAU");
  const [parcelas, setParcelas] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSalvar = async () => {
    setErr("");
    const v = Number(valor.replace(/\D/g, ""));
    if (v <= 0) { setErr("Valor inválido"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/produtos-funcionarios/pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({
          produto_funcionario_id: vinculo.id,
          data, valor: v, forma,
          conta: forma === "PIX" || forma === "CARTAO" ? conta : null,
          parcelas,
          observacao: observacao || null,
        }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || "Erro ao salvar"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E8E8ED] flex items-center justify-between">
          <h3 className="font-bold text-[#1D1D1F]">💰 Registrar Pagamento</h3>
          <button onClick={() => !saving && onClose()} className="text-[#86868B] hover:text-[#1D1D1F] text-lg">✕</button>
        </div>

        <div className="p-5 space-y-3">
          <div className="bg-[#F9F9FB] p-3 rounded-lg text-sm">
            <p className="font-semibold">{vinculo.funcionario} — {vinculo.produto}</p>
            <p className="text-xs text-[#86868B] mt-1">
              Total func: {fmt(vinculo.valor_funcionario)} • Pago: {fmt(vinculo.valor_pago)} •
              <span className="text-amber-700 font-semibold"> Saldo: {fmt(saldo)}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
            </div>
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Valor (R$)</label>
              <input type="text" inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Forma</label>
              <select value={forma} onChange={e => setForma(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]">
                <option value="PIX">Pix</option>
                <option value="CARTAO">Cartão</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="DESCONTO_FOLHA">Desconto em folha</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            {(forma === "PIX" || forma === "CARTAO") && (
              <div>
                <label className="text-[11px] uppercase text-[#86868B] font-semibold">Conta</label>
                <select value={conta} onChange={e => setConta(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]">
                  <option value="ITAU">Itaú</option>
                  <option value="INFINITEPAY">InfinitePay</option>
                  <option value="MERCADOPAGO">Mercado Pago</option>
                </select>
              </div>
            )}
          </div>

          {forma === "CARTAO" && (
            <div>
              <label className="text-[11px] uppercase text-[#86868B] font-semibold">Parcelas</label>
              <input type="number" min={1} max={24} value={parcelas} onChange={e => setParcelas(Number(e.target.value))} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase text-[#86868B] font-semibold">Observação</label>
            <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#D2D2D7]" />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-3 border-t border-[#E8E8ED] bg-[#F9F9FB] flex gap-2 justify-end">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-4 py-2 rounded-lg bg-white border border-[#D2D2D7] text-sm font-semibold">Cancelar</button>
          <button onClick={handleSalvar} disabled={saving} className="px-5 py-2 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] disabled:opacity-50">
            {saving ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
