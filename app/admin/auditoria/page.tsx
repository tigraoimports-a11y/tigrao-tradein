"use client";

import { useState, useCallback, useEffect } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

// ---------- Helpers ----------

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const LABEL_CATEGORIAS: Record<string, string> = {
  ALIMENTACAO: "Alimentacao",
  ANUNCIOS: "Anuncios",
  CORREIOS: "Correios",
  "DEPOSITO ESPECIE": "Deposito Especie",
  DOACOES: "Doacoes",
  EQUIPAMENTOS: "Equipamentos",
  ESTORNO: "Estorno",
  FORNECEDOR: "Fornecedores",
  "GASTOS LOJA": "Gastos Loja",
  IMPOSTOS: "Impostos",
  MARKETING: "Marketing",
  SALARIO: "Salarios",
  SISTEMAS: "Sistemas",
  TRANSPORTE: "Transporte",
  TROCA: "Trocas",
  OUTROS: "Outros",
  REEMBOLSO: "Reembolso",
};

const LABEL_ESTOQUE: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  MAC_STUDIO: "Mac Studio",
  IMAC: "iMac",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  SEMINOVOS: "Seminovos",
  OUTROS: "Outros",
};

const MESES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ---------- Types ----------

interface AuditoriaData {
  mes: string;
  patrimonio: {
    patrimonio_base: number;
    estoque_base: number;
    saldos_base: number;
    distribuicao_lucro: number;
    observacao: string | null;
  } | null;
  vendas: { total: number; faturamento: number; custo: number; lucro: number };
  gastos: {
    total: number;
    operacionais: number;
    fornecedor: number;
    por_categoria: Array<{ categoria: string; total: number }>;
  };
  reajustes: number;
  calculo: {
    patrimonio_esperado: number;
    patrimonio_atual: number;
    diferenca: number;
  };
  saldo_atual: {
    itau: number;
    infinite: number;
    mercado_pago: number;
    especie: number;
    total: number;
  };
  estoque: {
    valor_atual: number;
    qtd_atual: number;
    por_categoria: Array<{ categoria: string; qtd: number; valor: number }>;
    estoque_base: number;
    gastos_fornecedor: number;
    custo_vendas: number;
    estoque_esperado: number;
    diferenca_estoque: number;
  };
  recebiveis_pendentes: number;
  dias: Array<{
    data: string;
    vendas_faturamento: number;
    vendas_custo: number;
    vendas_lucro: number;
    vendas_qtd: number;
    gastos: number;
    saldo_itau_base: number;
    saldo_inf_base: number;
    saldo_mp_base: number;
    saldo_esp_base: number;
    saldo_itau: number;
    saldo_inf: number;
    saldo_mp: number;
    saldo_esp: number;
    tem_saldo: boolean;
  }>;
}

// ---------- Page ----------

export default function AuditoriaPage() {
  const { password, user } = useAdmin();
  const headers = {
    "x-admin-password": password,
    "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
  };

  const agora = new Date();
  const [mesAtual, setMesAtual] = useState(agora.toISOString().slice(0, 7));
  const [data, setData] = useState<AuditoriaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"patrimonio" | "diario" | "estoque">("patrimonio");

  const [mesAno, mesNum] = mesAtual.split("-").map(Number);
  const nomeMes = `${MESES[(mesNum || 1) - 1]} ${mesAno}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/auditoria?mes=${mesAtual}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesAtual, password]);

  useEffect(() => {
    if (password) fetchData();
  }, [fetchData, password]);

  // Navegar meses
  const irMes = (delta: number) => {
    const d = new Date(mesAno, (mesNum || 1) - 1 + delta, 1);
    setMesAtual(d.toISOString().slice(0, 7));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">Auditoria Financeira</h1>
          <p className="text-xs text-[#86868B]">
            Balanco patrimonial, conferencia diaria e estoque
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => irMes(-1)}
            className="px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm hover:bg-gray-50"
          >
            ←
          </button>
          <span className="px-4 py-2 rounded-lg bg-[#1D1D1F] text-white text-sm font-semibold min-w-[160px] text-center">
            {nomeMes}
          </span>
          <button
            onClick={() => irMes(1)}
            className="px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm hover:bg-gray-50"
          >
            →
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F5F5F7] p-1 rounded-xl w-fit">
        {(
          [
            ["patrimonio", "Balanco Patrimonial"],
            ["diario", "Conferencia Diaria"],
            ["estoque", "Estoque"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === key
                ? "bg-white text-[#1D1D1F] shadow-sm"
                : "text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8740E]" />
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-[#86868B] py-10 text-center">
          Nenhum dado encontrado para {nomeMes}.
        </p>
      )}

      {!loading && data && tab === "patrimonio" && (
        <TabPatrimonio data={data} nomeMes={nomeMes} />
      )}
      {!loading && data && tab === "diario" && <TabDiario data={data} />}
      {!loading && data && tab === "estoque" && <TabEstoque data={data} />}
    </div>
  );
}

// ====================================================================
// TAB: Balanco Patrimonial
// ====================================================================

function TabPatrimonio({ data, nomeMes }: { data: AuditoriaData; nomeMes: string }) {
  const pat = data.patrimonio;
  const calc = data.calculo;
  const difAbs = Math.abs(calc.diferenca);
  const difOk = difAbs < 100; // tolerancia de R$100
  const difColor = difOk ? "text-green-600" : calc.diferenca < 0 ? "text-red-600" : "text-amber-600";

  return (
    <div className="space-y-5">
      {/* Alert se nao tem patrimonio base */}
      {!pat && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-medium">
            Patrimonio base nao registrado para {nomeMes}.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Va em Dashboard &gt; Patrimonio e registre o valor base do inicio do mes para que o
            calculo fique correto.
          </p>
        </div>
      )}

      {/* Card principal: Balanco */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Balanco Patrimonial — {nomeMes}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Patrimonio Base */}
          <div className="space-y-1.5">
            <LinhaBalanco
              label="Patrimonio Base (inicio do mes)"
              valor={pat?.patrimonio_base || 0}
              destaque
              icon="🏦"
            />
            <div className="pl-6 space-y-1 text-[#86868B]">
              <LinhaBalanco label="Saldos em Conta" valor={pat?.saldos_base || 0} sub />
              <LinhaBalanco label="Valor em Estoque" valor={pat?.estoque_base || 0} sub />
              <LinhaBalanco
                label="Recebiveis"
                valor={
                  (pat?.patrimonio_base || 0) -
                  (pat?.saldos_base || 0) -
                  (pat?.estoque_base || 0)
                }
                sub
              />
            </div>
          </div>

          <Divisor />

          {/* Receitas */}
          <div className="space-y-1.5">
            <LinhaBalanco
              label={`(+) Faturamento Bruto (${data.vendas.total} vendas)`}
              valor={data.vendas.faturamento}
              cor="text-green-700"
              icon="💰"
            />
            <LinhaBalanco
              label="(-) Custo Mercadoria Vendida"
              valor={-data.vendas.custo}
              cor="text-red-600"
              icon="📦"
            />
            <LinhaBalanco
              label="(=) Lucro Bruto"
              valor={data.vendas.lucro}
              destaque
              cor="text-green-700"
              icon="📈"
            />
          </div>

          <Divisor />

          {/* Gastos operacionais */}
          <div className="space-y-1.5">
            <LinhaBalanco
              label="(-) Gastos Operacionais"
              valor={-data.gastos.operacionais}
              cor="text-red-600"
              icon="📤"
            />
            <div className="pl-6 space-y-1">
              {data.gastos.por_categoria
                .filter((g) => g.categoria !== "FORNECEDOR")
                .map((g) => (
                  <LinhaBalanco
                    key={g.categoria}
                    label={LABEL_CATEGORIAS[g.categoria] || g.categoria}
                    valor={-g.total}
                    sub
                    cor="text-red-500"
                  />
                ))}
            </div>
          </div>

          {data.gastos.fornecedor > 0 && (
            <>
              <Divisor />
              <LinhaBalanco
                label="Compras de Fornecedor (nao afeta patrimonio)"
                valor={data.gastos.fornecedor}
                sub
                cor="text-[#86868B]"
                icon="🔄"
              />
              <p className="text-[10px] text-[#86868B] pl-6">
                Converte dinheiro em estoque — nao reduz o patrimonio.
              </p>
            </>
          )}

          {(data.patrimonio?.distribuicao_lucro || 0) > 0 && (
            <>
              <Divisor />
              <LinhaBalanco
                label="(-) Distribuicao de Lucro"
                valor={-data.patrimonio!.distribuicao_lucro}
                cor="text-red-600"
                icon="💸"
              />
            </>
          )}

          {data.reajustes !== 0 && (
            <>
              <Divisor />
              <LinhaBalanco
                label={`(${data.reajustes > 0 ? "+" : "-"}) Reajustes`}
                valor={data.reajustes}
                cor={data.reajustes > 0 ? "text-green-600" : "text-red-600"}
                icon="⚖️"
              />
            </>
          )}

          <Divisor thick />

          {/* Resultado */}
          <LinhaBalanco
            label="Patrimonio Esperado"
            valor={calc.patrimonio_esperado}
            destaque
            icon="🎯"
          />
        </div>
      </div>

      {/* Card: Patrimonio Atual */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Patrimonio Atual
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <LinhaBalanco
            label="Saldos em Conta"
            valor={data.saldo_atual.total}
            icon="🏦"
          />
          <div className="pl-6 space-y-1">
            <LinhaBalanco label="Itau" valor={data.saldo_atual.itau} sub />
            <LinhaBalanco label="Infinite" valor={data.saldo_atual.infinite} sub />
            <LinhaBalanco label="Mercado Pago" valor={data.saldo_atual.mercado_pago} sub />
            <LinhaBalanco label="Especie" valor={data.saldo_atual.especie} sub />
          </div>

          <Divisor />

          <LinhaBalanco
            label={`Estoque (${data.estoque.qtd_atual} itens)`}
            valor={data.estoque.valor_atual}
            icon="📦"
          />
          <LinhaBalanco
            label="Recebiveis Pendentes"
            valor={data.recebiveis_pendentes}
            icon="💳"
          />

          <Divisor thick />

          <LinhaBalanco
            label="Patrimonio Atual Total"
            valor={calc.patrimonio_atual}
            destaque
            icon="📊"
          />
        </div>
      </div>

      {/* Card: Resultado da Auditoria */}
      <div
        className={`rounded-2xl border-2 shadow-sm overflow-hidden ${
          difOk
            ? "border-green-400 bg-green-50"
            : calc.diferenca < 0
            ? "border-red-400 bg-red-50"
            : "border-amber-400 bg-amber-50"
        }`}
      >
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-[#1D1D1F]">
                Resultado da Auditoria
              </h3>
              <p className="text-xs text-[#86868B] mt-0.5">
                Esperado vs Atual
              </p>
            </div>
            {difOk ? (
              <span className="px-4 py-1.5 rounded-full bg-green-200 text-green-800 text-xs font-bold">
                TUDO OK
              </span>
            ) : (
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                  calc.diferenca < 0
                    ? "bg-red-200 text-red-800"
                    : "bg-amber-200 text-amber-800"
                }`}
              >
                DIVERGENCIA
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-[10px] text-[#86868B] uppercase font-semibold">Esperado</p>
              <p className="text-lg font-bold text-[#1D1D1F] mt-1">
                {money(calc.patrimonio_esperado)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#86868B] uppercase font-semibold">Atual</p>
              <p className="text-lg font-bold text-[#1D1D1F] mt-1">
                {money(calc.patrimonio_atual)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#86868B] uppercase font-semibold">Diferenca</p>
              <p className={`text-lg font-bold mt-1 ${difColor}`}>
                {calc.diferenca > 0 ? "+" : ""}
                {money(calc.diferenca)}
              </p>
            </div>
          </div>

          {!difOk && (
            <p className="text-xs mt-3 text-[#86868B]">
              {calc.diferenca < 0
                ? "Patrimonio atual esta abaixo do esperado. Verifique se ha dinheiro ou produto faltando."
                : "Patrimonio atual esta acima do esperado. Pode indicar receita nao registrada ou ajuste pendente."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// TAB: Conferencia Diaria
// ====================================================================

function TabDiario({ data }: { data: AuditoriaData }) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  const diasReversed = [...data.dias].reverse();

  return (
    <div className="space-y-4">
      {/* Resumo do mes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard label="Faturamento" valor={money(data.vendas.faturamento)} icon="💰" />
        <MiniCard label="Lucro Bruto" valor={money(data.vendas.lucro)} icon="📈" />
        <MiniCard label="Total Gastos" valor={money(data.gastos.total)} icon="📤" cor="text-red-600" />
        <MiniCard
          label="Saldo Contas"
          valor={money(data.saldo_atual.total)}
          icon="🏦"
        />
      </div>

      {/* Tabela diaria */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Recebimentos e Gastos por Dia
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E5EA] bg-[#F5F5F7]">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#86868B] uppercase">
                  Data
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Vendas
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Faturamento
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Lucro
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Gastos
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Saldo Total
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-bold text-[#86868B] uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {diasReversed.map((dia) => {
                const saldoTotal =
                  dia.saldo_itau + dia.saldo_inf + dia.saldo_mp + dia.saldo_esp;
                const isHoje = dia.data === hoje;
                const isExpanded = expandido === dia.data;
                const diaSemana = new Date(dia.data + "T12:00:00").toLocaleDateString(
                  "pt-BR",
                  { weekday: "short" }
                );

                return (
                  <tr key={dia.data} className="group">
                    <td colSpan={7} className="p-0">
                      {/* Linha principal */}
                      <button
                        onClick={() => setExpandido(isExpanded ? null : dia.data)}
                        className={`w-full flex items-center text-left hover:bg-[#F5F5F7] transition-colors ${
                          isHoje ? "bg-orange-50" : ""
                        } ${isExpanded ? "bg-[#F5F5F7]" : ""}`}
                      >
                        <span className="px-4 py-3 flex-1 min-w-[130px]">
                          <span className="font-medium text-[#1D1D1F]">
                            {new Date(dia.data + "T12:00:00").toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                          <span className="ml-1.5 text-[10px] text-[#86868B] uppercase">
                            {diaSemana}
                          </span>
                          {isHoje && (
                            <span className="ml-2 text-[9px] bg-[#E8740E] text-white px-1.5 py-0.5 rounded-full font-bold">
                              HOJE
                            </span>
                          )}
                        </span>
                        <span className="px-4 py-3 w-[80px] text-right font-medium text-[#1D1D1F]">
                          {dia.vendas_qtd || "—"}
                        </span>
                        <span className="px-4 py-3 w-[120px] text-right font-mono text-[#1D1D1F]">
                          {dia.vendas_faturamento > 0 ? money(dia.vendas_faturamento) : "—"}
                        </span>
                        <span className="px-4 py-3 w-[110px] text-right font-mono text-green-700">
                          {dia.vendas_lucro > 0 ? money(dia.vendas_lucro) : "—"}
                        </span>
                        <span className="px-4 py-3 w-[110px] text-right font-mono text-red-600">
                          {dia.gastos > 0 ? money(dia.gastos) : "—"}
                        </span>
                        <span className="px-4 py-3 w-[130px] text-right font-mono font-semibold text-[#1D1D1F]">
                          {dia.tem_saldo ? money(saldoTotal) : "—"}
                        </span>
                        <span className="px-4 py-3 w-[80px] text-center">
                          {dia.tem_saldo ? (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                              OK
                            </span>
                          ) : (
                            <span className="text-[10px] bg-gray-100 text-[#86868B] px-2 py-1 rounded-full font-bold">
                              —
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Detalhes expandidos */}
                      {isExpanded && dia.tem_saldo && (
                        <div className="px-6 pb-4 pt-2 bg-[#F5F5F7] border-t border-[#E5E5EA]">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <BancoMiniCard
                              label="Itau"
                              icon="🏦"
                              abertura={dia.saldo_itau_base}
                              fechamento={dia.saldo_itau}
                            />
                            <BancoMiniCard
                              label="Infinite"
                              icon="💳"
                              abertura={dia.saldo_inf_base}
                              fechamento={dia.saldo_inf}
                            />
                            <BancoMiniCard
                              label="Mercado Pago"
                              icon="💚"
                              abertura={dia.saldo_mp_base}
                              fechamento={dia.saldo_mp}
                            />
                            <BancoMiniCard
                              label="Especie"
                              icon="💵"
                              abertura={dia.saldo_esp_base}
                              fechamento={dia.saldo_esp}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totalizador */}
        <div className="px-5 py-4 border-t-2 border-[#1D1D1F] bg-[#FAFAFA]">
          <div className="flex items-center text-sm font-bold">
            <span className="flex-1 text-[#1D1D1F]">TOTAL DO MES</span>
            <span className="w-[80px] text-right text-[#1D1D1F]">{data.vendas.total}</span>
            <span className="w-[120px] text-right font-mono text-[#1D1D1F]">
              {money(data.vendas.faturamento)}
            </span>
            <span className="w-[110px] text-right font-mono text-green-700">
              {money(data.vendas.lucro)}
            </span>
            <span className="w-[110px] text-right font-mono text-red-600">
              {money(data.gastos.total)}
            </span>
            <span className="w-[130px] text-right font-mono text-[#1D1D1F]">
              {money(data.saldo_atual.total)}
            </span>
            <span className="w-[80px]" />
          </div>
        </div>
      </div>

      {/* Gastos por categoria */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Gastos por Categoria
          </h2>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {data.gastos.por_categoria.map((g) => {
              const perc = data.gastos.total > 0 ? (g.total / data.gastos.total) * 100 : 0;
              return (
                <div key={g.categoria} className="flex items-center gap-3">
                  <span className="text-sm w-[140px] text-[#1D1D1F] truncate">
                    {LABEL_CATEGORIAS[g.categoria] || g.categoria}
                  </span>
                  <div className="flex-1 bg-[#F5F5F7] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-[#E8740E] rounded-full transition-all"
                      style={{ width: `${Math.max(perc, 1)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-semibold text-[#1D1D1F] w-[110px] text-right">
                    {money(g.total)}
                  </span>
                  <span className="text-[10px] text-[#86868B] w-[45px] text-right">
                    {pct(perc)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E5E5EA]">
            <span className="text-sm font-bold text-[#1D1D1F]">Total</span>
            <span className="text-sm font-bold font-mono text-[#1D1D1F]">
              {money(data.gastos.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// TAB: Estoque
// ====================================================================

function TabEstoque({ data }: { data: AuditoriaData }) {
  const est = data.estoque;
  const difOk = Math.abs(est.diferenca_estoque) < 500;
  const difColor = difOk
    ? "text-green-600"
    : est.diferenca_estoque < 0
    ? "text-red-600"
    : "text-amber-600";

  return (
    <div className="space-y-5">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard label="Itens em Estoque" valor={String(est.qtd_atual)} icon="📦" />
        <MiniCard label="Valor Estoque (custo)" valor={money(est.valor_atual)} icon="💰" />
        <MiniCard
          label="Compras Fornecedor"
          valor={money(est.gastos_fornecedor)}
          icon="🛒"
        />
        <MiniCard
          label="Custo Vendas"
          valor={money(est.custo_vendas)}
          icon="📤"
          cor="text-red-600"
        />
      </div>

      {/* Balanco do estoque */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Balanco do Estoque
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <LinhaBalanco
            label="Estoque Base (inicio do mes)"
            valor={est.estoque_base}
            destaque
            icon="📦"
          />
          <LinhaBalanco
            label="(+) Compras de Fornecedor"
            valor={est.gastos_fornecedor}
            cor="text-green-700"
            icon="🛒"
          />
          <LinhaBalanco
            label="(-) Custo Mercadoria Vendida"
            valor={-est.custo_vendas}
            cor="text-red-600"
            icon="📤"
          />

          <Divisor thick />

          <LinhaBalanco
            label="Estoque Esperado (valor)"
            valor={est.estoque_esperado}
            destaque
            icon="🎯"
          />
          <LinhaBalanco
            label="Estoque Atual (valor)"
            valor={est.valor_atual}
            destaque
            icon="📊"
          />
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-[#1D1D1F]">Diferenca</span>
            <span className={`text-sm font-bold font-mono ${difColor}`}>
              {est.diferenca_estoque > 0 ? "+" : ""}
              {money(est.diferenca_estoque)}
              {difOk && " ✓"}
            </span>
          </div>
        </div>
      </div>

      {/* Estoque por categoria */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5EA] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-wide">
            Estoque por Categoria
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E5EA] bg-[#F5F5F7]">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#86868B] uppercase">
                  Categoria
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Qtd
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  Valor (custo)
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#86868B] uppercase">
                  % do Total
                </th>
              </tr>
            </thead>
            <tbody>
              {est.por_categoria.map((cat) => {
                const perc =
                  est.valor_atual > 0 ? (cat.valor / est.valor_atual) * 100 : 0;
                return (
                  <tr key={cat.categoria} className="border-b border-[#E5E5EA]">
                    <td className="px-4 py-3 font-medium text-[#1D1D1F]">
                      {LABEL_ESTOQUE[cat.categoria] || cat.categoria}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{cat.qtd}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {money(cat.valor)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#86868B]">{pct(perc)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1D1D1F] bg-[#FAFAFA]">
                <td className="px-4 py-3 font-bold text-[#1D1D1F]">Total</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{est.qtd_atual}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  {money(est.valor_atual)}
                </td>
                <td className="px-4 py-3 text-right font-bold">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// Componentes compartilhados
// ====================================================================

function LinhaBalanco({
  label,
  valor,
  destaque,
  sub,
  cor,
  icon,
}: {
  label: string;
  valor: number;
  destaque?: boolean;
  sub?: boolean;
  cor?: string;
  icon?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${sub ? "text-xs" : "text-sm"} ${
          destaque ? "font-bold text-[#1D1D1F]" : sub ? "text-[#86868B]" : "text-[#1D1D1F]"
        }`}
      >
        {icon && <span className="mr-1.5">{icon}</span>}
        {label}
      </span>
      <span
        className={`${sub ? "text-xs" : "text-sm"} font-mono ${
          destaque ? "font-bold" : "font-semibold"
        } ${cor || "text-[#1D1D1F]"}`}
      >
        {money(valor)}
      </span>
    </div>
  );
}

function Divisor({ thick }: { thick?: boolean }) {
  return (
    <div
      className={`${thick ? "border-t-2 border-[#1D1D1F]" : "border-t border-[#E5E5EA]"} my-2`}
    />
  );
}

function MiniCard({
  label,
  valor,
  icon,
  cor,
}: {
  label: string;
  valor: string;
  icon: string;
  cor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#D2D2D7] p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <span>{icon}</span>
        <span className="text-[10px] text-[#86868B] uppercase font-semibold">{label}</span>
      </div>
      <p className={`text-base font-bold font-mono ${cor || "text-[#1D1D1F]"}`}>{valor}</p>
    </div>
  );
}

function BancoMiniCard({
  label,
  icon,
  abertura,
  fechamento,
}: {
  label: string;
  icon: string;
  abertura: number;
  fechamento: number;
}) {
  const dif = fechamento - abertura;
  return (
    <div className="bg-white rounded-xl border border-[#D2D2D7] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span>{icon}</span>
        <span className="text-xs font-semibold text-[#1D1D1F]">{label}</span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-[#86868B]">Abertura:</span>
          <span className="font-mono">{money(abertura)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#86868B]">Fechamento:</span>
          <span className="font-mono font-semibold">{money(fechamento)}</span>
        </div>
        <div className="flex justify-between border-t border-[#E5E5EA] pt-1">
          <span className="text-[#86868B]">Variacao:</span>
          <span
            className={`font-mono font-semibold ${
              dif > 0 ? "text-green-600" : dif < 0 ? "text-red-600" : "text-[#86868B]"
            }`}
          >
            {dif > 0 ? "+" : ""}
            {money(dif)}
          </span>
        </div>
      </div>
    </div>
  );
}
