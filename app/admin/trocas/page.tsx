"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";
import ProdutoSpecFields, {
  createEmptyProdutoRow,
  type ProdutoRowState,
} from "@/components/admin/ProdutoSpecFields";
import {
  STRUCTURED_CATS,
  buildProdutoName,
  type ProdutoSpec,
  DEFAULT_SPEC,
} from "@/lib/produto-specs";
import { corParaPT } from "@/lib/cor-pt";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EstoqueItem {
  id: string;
  produto: string;
  categoria: string;
  cor: string | null;
  qnt: number;
  custo_unitario: number;
  serial_no: string | null;
  imei: string | null;
  status: string;
  tipo: string;
  fornecedor: string | null;
  observacao: string | null;
  bateria: string | null;
  origem: string | null;
  garantia: string | null;
}

interface Troca {
  id: string;
  data: string;
  motivo: string;
  fornecedor: string | null;
  observacao: string | null;
  produto_saida_nome: string;
  produto_saida_categoria: string | null;
  produto_saida_cor: string | null;
  produto_saida_serial: string | null;
  produto_saida_imei: string | null;
  produto_saida_custo: number;
  produto_entrada_nome: string;
  produto_entrada_categoria: string | null;
  produto_entrada_cor: string | null;
  produto_entrada_serial: string | null;
  produto_entrada_imei: string | null;
  produto_entrada_custo: number;
  diferenca_valor: number;
  banco: string | null;
  created_at: string;
}

type Banco = "ITAU" | "INFINITE" | "MERCADO_PAGO" | "ESPECIE";
const BANCOS: Banco[] = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"];
const MOTIVOS = [
  { value: "DEFEITO", label: "Defeito" },
  { value: "BLOQUEIO", label: "Bloqueio" },
  { value: "TROCA_FORNECEDOR", label: "Troca com Fornecedor" },
];

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDate = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const TABS = ["nova", "historico"] as const;
type Tab = (typeof TABS)[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TrocasPage() {
  const { password, darkMode: dm, apiHeaders, user } = useAdmin();
  const [tab, setTab] = useTabParam<Tab>("nova", TABS);

  // Shared
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);

  // Nova troca
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<EstoqueItem[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [produtoSaida, setProdutoSaida] = useState<EstoqueItem | null>(null);
  const [motivo, setMotivo] = useState("DEFEITO");
  const [fornecedorTroca, setFornecedorTroca] = useState("");
  const [observacao, setObservacao] = useState("");
  const [produtoEntrada, setProdutoEntrada] = useState<ProdutoRowState>(createEmptyProdutoRow());
  const [difTipo, setDifTipo] = useState<"sem" | "pagamos" | "recebemos">("sem");
  const [difValor, setDifValor] = useState("");
  const [difBanco, setDifBanco] = useState<Banco>("ITAU");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Histórico
  const [trocas, setTrocas] = useState<Troca[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [searchHist, setSearchHist] = useState("");

  // Styles
  const bgCard = dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]";
  const bgSec = dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]";
  const txtP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const txtS = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-[10px] font-semibold uppercase tracking-wider mb-1 block ${txtS}`;

  // ─── Fetch fornecedores ───────────────────────────────────────��──────────
  useEffect(() => {
    if (!password) return;
    (async () => {
      try {
        const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setFornecedores(json.data ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [password]);

  // ─── Busca de produto no estoque ─────────────────────────────────────────
  useEffect(() => {
    if (!busca.trim() || busca.length < 2) { setResultados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch("/api/estoque", { headers: apiHeaders() });
        if (res.ok) {
          const json = await res.json();
          const items: EstoqueItem[] = json.data ?? json ?? [];
          const q = busca.toUpperCase();
          const filtered = items.filter(
            (i: EstoqueItem) =>
              i.status === "EM ESTOQUE" &&
              (i.produto?.toUpperCase().includes(q) ||
                i.serial_no?.toUpperCase().includes(q) ||
                i.imei?.toUpperCase().includes(q) ||
                i.cor?.toUpperCase().includes(q))
          );
          setResultados(filtered.slice(0, 20));
        }
      } catch { /* ignore */ }
      setBuscando(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca, password]);

  // ─── Fetch histórico ─────────────────────────────────────────────────────
  const fetchHistorico = useCallback(async () => {
    setLoadingHist(true);
    try {
      const params = new URLSearchParams();
      if (searchHist) params.set("search", searchHist);
      params.set("limit", "100");
      const res = await fetch(`/api/admin/trocas?${params}`, { headers: apiHeaders() });
      if (res.ok) {
        const json = await res.json();
        setTrocas(json.trocas ?? []);
      }
    } catch { /* ignore */ }
    setLoadingHist(false);
  }, [password, searchHist]);

  useEffect(() => {
    if (tab === "historico") fetchHistorico();
  }, [tab, fetchHistorico]);

  // ─── Selecionar produto de saída ─────────────────────────────────────────
  const selecionarProduto = (item: EstoqueItem) => {
    setProdutoSaida(item);
    setBusca("");
    setResultados([]);
    // Pré-preencher fornecedor se existir
    if (item.fornecedor) setFornecedorTroca(item.fornecedor);
    // Pré-preencher produto entrada com mesma categoria
    const row = createEmptyProdutoRow();
    row.categoria = item.categoria;
    setProdutoEntrada(row);
  };

  // ─── Registrar troca ─────────────────────────────────────────────────────
  const handleRegistrar = async () => {
    if (!produtoSaida) { setMsg({ type: "err", text: "Selecione o produto que vai sair" }); return; }

    // Montar nome do produto de entrada
    const isStructured = STRUCTURED_CATS.includes(produtoEntrada.categoria);
    const nomeProdEntrada = isStructured
      ? buildProdutoName(produtoEntrada.categoria, produtoEntrada.spec, produtoEntrada.cor)
      : produtoEntrada.produto;

    if (!nomeProdEntrada.trim()) {
      setMsg({ type: "err", text: "Preencha os dados do produto novo" });
      return;
    }

    const difNum = difTipo === "sem" ? 0 : difTipo === "pagamos" ? parseFloat(difValor) || 0 : -(parseFloat(difValor) || 0);

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/trocas", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_saida_id: produtoSaida.id,
          motivo,
          fornecedor: fornecedorTroca || null,
          observacao: observacao || null,
          produto_entrada: {
            produto: nomeProdEntrada.toUpperCase(),
            categoria: produtoEntrada.categoria,
            cor: produtoEntrada.cor || null,
            custo_unitario: parseFloat(produtoEntrada.custo_unitario) || 0,
            serial_no: produtoEntrada.serial_no || null,
            imei: produtoEntrada.imei || null,
            tipo: produtoEntrada.condicao === "SEMINOVO" ? "SEMINOVO" : produtoEntrada.condicao === "NAO_ATIVADO" ? "NAO_ATIVADO" : "NOVO",
            observacao: null,
            bateria: null,
            origem: null,
            garantia: null,
            fornecedor: produtoEntrada.fornecedor || fornecedorTroca || null,
          },
          diferenca_valor: difNum,
          banco: difNum !== 0 ? difBanco : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: json.error || "Erro ao registrar troca" });
      } else {
        setMsg({ type: "ok", text: "Troca registrada com sucesso!" });
        // Reset form
        setProdutoSaida(null);
        setMotivo("DEFEITO");
        setFornecedorTroca("");
        setObservacao("");
        setProdutoEntrada(createEmptyProdutoRow());
        setDifTipo("sem");
        setDifValor("");
      }
    } catch {
      setMsg({ type: "err", text: "Erro de conexão" });
    }
    setSaving(false);
  };

  // ─── Desfazer troca ──────────────────────────────────────────────────────
  const handleDesfazer = async (trocaId: string) => {
    if (!confirm("Tem certeza que deseja desfazer esta troca? O produto original será restaurado e o novo será removido.")) return;
    try {
      const res = await fetch("/api/admin/trocas", {
        method: "DELETE",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: trocaId }),
      });
      if (res.ok) {
        fetchHistorico();
      }
    } catch { /* ignore */ }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl font-bold ${txtP}`}>Trocas</h1>
        <p className={`text-sm ${txtS}`}>Registrar trocas de produtos (defeito, bloqueio, fornecedor)</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([["nova", "Nova Troca"], ["historico", "Historico"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === key ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.type === "ok" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
          {msg.text}
        </div>
      )}

      {/* ─── TAB: NOVA TROCA ───────────────────────────────────────────────── */}
      {tab === "nova" && (
        <div className="space-y-6">
          {/* 1. Buscar produto que vai sair */}
          <div className={`p-4 rounded-2xl border ${bgCard}`}>
            <h2 className={`text-base font-bold mb-3 ${txtP}`}>Produto que vai sair</h2>

            {!produtoSaida ? (
              <div className="space-y-3">
                <input
                  placeholder="Buscar por nome, serial ou IMEI..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className={inputCls}
                />
                {buscando && <p className={`text-xs ${txtS}`}>Buscando...</p>}

                {resultados.length > 0 && (
                  <div className={`rounded-xl border overflow-hidden ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                    {resultados.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => selecionarProduto(item)}
                        className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 hover:bg-[#E8740E]/10 transition-colors ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}
                      >
                        <div className={`font-medium ${txtP}`}>{item.produto}</div>
                        <div className={`text-xs ${txtS}`}>
                          {item.cor && <span>{corParaPT(item.cor)} · </span>}
                          {item.serial_no && <span>SN: {item.serial_no} · </span>}
                          {item.imei && <span>IMEI: {item.imei} · </span>}
                          <span>{fmt(item.custo_unitario)}</span>
                          {item.fornecedor && <span> · {item.fornecedor}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-4 rounded-xl ${bgSec}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-semibold text-sm ${txtP}`}>{produtoSaida.produto}</p>
                    <p className={`text-xs ${txtS} mt-1`}>
                      {produtoSaida.cor && <span>{corParaPT(produtoSaida.cor)} · </span>}
                      {produtoSaida.serial_no && <span>SN: {produtoSaida.serial_no} · </span>}
                      {produtoSaida.imei && <span>IMEI: {produtoSaida.imei} · </span>}
                      <span>{fmt(produtoSaida.custo_unitario)}</span>
                      {produtoSaida.fornecedor && <span> · {produtoSaida.fornecedor}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setProdutoSaida(null)}
                    className="text-red-500 text-xs font-medium hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Motivo + Fornecedor + Observação */}
          {produtoSaida && (
            <div className={`p-4 rounded-2xl border ${bgCard}`}>
              <h2 className={`text-base font-bold mb-3 ${txtP}`}>Detalhes da troca</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Motivo</label>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls}>
                    {MOTIVOS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fornecedor / Contato</label>
                  <input
                    value={fornecedorTroca}
                    onChange={(e) => setFornecedorTroca(e.target.value)}
                    list="fornecedores-list"
                    placeholder="Nome do fornecedor"
                    className={inputCls}
                  />
                  <datalist id="fornecedores-list">
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.nome} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>Observacao</label>
                  <input
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Motivo detalhado, notas..."
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Produto novo (entrada) */}
          {produtoSaida && (
            <div className={`p-4 rounded-2xl border ${bgCard}`}>
              <h2 className={`text-base font-bold mb-3 ${txtP}`}>Produto novo (entrada)</h2>
              <ProdutoSpecFields
                row={produtoEntrada}
                onChange={setProdutoEntrada}
                onRemove={() => setProdutoEntrada(createEmptyProdutoRow())}
                fornecedores={fornecedores}
                inputCls={inputCls}
                labelCls={labelCls}
                darkMode={dm}
                index={0}
              />
            </div>
          )}

          {/* 4. Diferença de valor */}
          {produtoSaida && (
            <div className={`p-4 rounded-2xl border ${bgCard}`}>
              <h2 className={`text-base font-bold mb-3 ${txtP}`}>Diferenca de valor</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {([["sem", "Sem diferenca"], ["pagamos", "Pagamos a diferenca"], ["recebemos", "Recebemos a diferenca"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDifTipo(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${difTipo === key ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#86868B]"}`}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {difTipo !== "sem" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Valor (R$)</label>
                    <input
                      type="number"
                      value={difValor}
                      onChange={(e) => setDifValor(e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Banco</label>
                    <select value={difBanco} onChange={(e) => setDifBanco(e.target.value as Banco)} className={inputCls}>
                      {BANCOS.map((b) => (
                        <option key={b} value={b}>{b === "MERCADO_PAGO" ? "Mercado Pago" : b === "ESPECIE" ? "Especie" : b}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Botão registrar */}
          {produtoSaida && (
            <button
              onClick={handleRegistrar}
              disabled={saving}
              className="w-full py-4 rounded-2xl bg-[#E8740E] text-white font-bold text-base hover:bg-[#D4680D] transition-colors disabled:opacity-50"
            >
              {saving ? "Registrando..." : "Registrar Troca"}
            </button>
          )}
        </div>
      )}

      {/* ─── TAB: HISTÓRICO ────────────────────────────────────────────────── */}
      {tab === "historico" && (
        <div className="space-y-4">
          <input
            placeholder="Buscar por produto, serial, fornecedor..."
            value={searchHist}
            onChange={(e) => setSearchHist(e.target.value)}
            className={`${inputCls} max-w-md`}
          />

          {loadingHist ? (
            <p className={`text-sm ${txtS}`}>Carregando...</p>
          ) : trocas.length === 0 ? (
            <p className={`text-sm ${txtS}`}>Nenhuma troca registrada</p>
          ) : (
            <div className="space-y-3">
              {trocas.map((t) => (
                <div key={t.id} className={`p-4 rounded-2xl border ${bgCard}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-medium ${txtS}`}>{fmtDate(t.data)}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                          t.motivo === "DEFEITO" ? "bg-red-500/10 text-red-500" :
                          t.motivo === "BLOQUEIO" ? "bg-orange-500/10 text-orange-500" :
                          "bg-blue-500/10 text-blue-500"
                        }`}>
                          {MOTIVOS.find((m) => m.value === t.motivo)?.label || t.motivo}
                        </span>
                        {t.fornecedor && (
                          <span className={`text-xs ${txtS}`}>{t.fornecedor}</span>
                        )}
                      </div>

                      {/* Saída → Entrada */}
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-red-500 text-xs font-medium">SAIU</span>
                            <span className={`text-sm ${txtP}`}>{t.produto_saida_nome}</span>
                            {t.produto_saida_cor && <span className={`text-xs ${txtS}`}>{corParaPT(t.produto_saida_cor)}</span>}
                            <span className={`text-xs ${txtS}`}>{fmt(t.produto_saida_custo)}</span>
                          </div>
                          {(t.produto_saida_serial || t.produto_saida_imei) && (
                            <div className="flex items-center gap-3 mt-0.5 ml-10">
                              {t.produto_saida_serial && <span className="text-[11px] font-mono text-purple-500"><span className={`text-[9px] font-sans font-bold ${txtS} mr-1`}>SN</span>{t.produto_saida_serial}</span>}
                              {t.produto_saida_imei && <span className="text-[11px] font-mono text-[#0071E3]"><span className={`text-[9px] font-sans font-bold ${txtS} mr-1`}>IMEI</span>{t.produto_saida_imei}</span>}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-green-500 text-xs font-medium">ENTROU</span>
                            <span className={`text-sm ${txtP}`}>{t.produto_entrada_nome}</span>
                            {t.produto_entrada_cor && <span className={`text-xs ${txtS}`}>{corParaPT(t.produto_entrada_cor)}</span>}
                            <span className={`text-xs ${txtS}`}>{fmt(t.produto_entrada_custo)}</span>
                          </div>
                          {(t.produto_entrada_serial || t.produto_entrada_imei) && (
                            <div className="flex items-center gap-3 mt-0.5 ml-14">
                              {t.produto_entrada_serial && <span className="text-[11px] font-mono text-purple-500"><span className={`text-[9px] font-sans font-bold ${txtS} mr-1`}>SN</span>{t.produto_entrada_serial}</span>}
                              {t.produto_entrada_imei && <span className="text-[11px] font-mono text-[#0071E3]"><span className={`text-[9px] font-sans font-bold ${txtS} mr-1`}>IMEI</span>{t.produto_entrada_imei}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Diferença */}
                      {t.diferenca_valor !== 0 && (
                        <p className={`text-xs mt-1 ${Number(t.diferenca_valor) > 0 ? "text-red-400" : "text-green-400"}`}>
                          {Number(t.diferenca_valor) > 0 ? `Pagamos ${fmt(Number(t.diferenca_valor))}` : `Recebemos ${fmt(Math.abs(Number(t.diferenca_valor)))}`}
                          {t.banco && ` via ${t.banco}`}
                        </p>
                      )}

                      {t.observacao && <p className={`text-xs mt-1 italic ${txtS}`}>{t.observacao}</p>}
                    </div>

                    <button
                      onClick={() => handleDesfazer(t.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors`}
                    >
                      Desfazer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
