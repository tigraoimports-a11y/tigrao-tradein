"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";
import { proximoDiaUtil } from "@/lib/business-days";
import { getTaxa, calcularLiquido } from "@/lib/taxas";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

interface SaldoRow { data?: string; itau_base: number; inf_base: number; mp_base: number; esp_itau: number; esp_inf: number; esp_mp: number; esp_especie: number; esp_especie_base?: number; manual?: boolean }
interface DashData {
  saldos: SaldoRow | null;
  saldoAnterior: SaldoRow | null;
  vendas: { id: string; data: string; cliente: string; tipo: string; origem: string; produto: string; custo: number; preco_vendido: number; lucro: number; banco: string; forma: string; recebimento: string; entrada_pix: number; banco_pix: string; entrada_especie: number; produto_na_troca: string; status_pagamento: string; valor_comprovante?: number; qnt_parcelas?: number; bandeira?: string }[];
  gastos: { id: string; data: string; tipo: string; categoria: string; descricao: string; valor: number; banco: string; is_dep_esp?: boolean }[];
  estoque: { tipo: string; qnt: number; custo_unitario: number }[];
  pendencias: number;
  aCaminho: { qnt: number; custo_unitario: number }[];
  d1Preview?: { data: string; d1_itau: number; d1_inf: number; d1_mp: number; total: number } | null;
}

export default function DashboardPage() {
  const { password, user } = useAdmin();
  const router = useRouter();

  // Não-admin sem permissão de dashboard → redirecionar pro estoque
  useEffect(() => {
    if (user && user.role !== "admin" && !(user as { permissoes?: string[] }).permissoes?.includes("dashboard")) {
      router.replace("/admin/estoque");
    }
  }, [user, router]);

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [patrimonioBase, setPatrimonioBase] = useState<{ patrimonio_base: number; estoque_base: number; saldos_base: number; distribuicao_lucro: number } | null>(null);
  const [editingPatrimonio, setEditingPatrimonio] = useState(false);
  const [patInput, setPatInput] = useState({ base: "", retirada: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      // Trigger server-side saldo recalculation before fetching data
      await fetch("/api/saldos", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
        body: JSON.stringify({ data: hoje }),
      }).catch(() => {});
      const [saldosRes, saldoPrevRes, vendasRes, gastosRes, estoqueRes, d1Res] = await Promise.all([
        fetch("/api/saldos?latest=true", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch(`/api/saldos?before=${hoje}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch("/api/vendas", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch("/api/gastos", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch("/api/d1-preview", { headers: { "x-admin-password": password } }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [saldos, saldoPrev, vendas, gastos, estoque, d1Preview]: any[] = await Promise.all([
        saldosRes.ok ? saldosRes.json().catch(() => ({})) : {},
        saldoPrevRes.ok ? saldoPrevRes.json().catch(() => ({})) : {},
        vendasRes.ok ? vendasRes.json().catch(() => ({})) : {},
        gastosRes.ok ? gastosRes.json().catch(() => ({})) : {},
        estoqueRes.ok ? estoqueRes.json().catch(() => ({})) : {},
        d1Res.ok ? d1Res.json().catch(() => ({})) : {},
      ]);

      const estoqueArr = Array.isArray(estoque) ? estoque : estoque?.data || [];
      const vendasArr = Array.isArray(vendas) ? vendas : vendas?.data || [];
      const gastosArr = Array.isArray(gastos) ? gastos : gastos?.data || [];

      setData({
        saldos: saldos?.data?.[0] || saldos?.[0] || null,
        saldoAnterior: saldoPrev?.data?.[0] || saldoPrev?.[0] || null,
        vendas: vendasArr,
        gastos: gastosArr,
        estoque: estoqueArr.filter((e: { tipo: string }) => e.tipo !== "PENDENCIA" && e.tipo !== "A_CAMINHO"),
        pendencias: estoqueArr.filter((e: { tipo: string }) => e.tipo === "PENDENCIA").length,
        aCaminho: estoqueArr.filter((e: { tipo: string }) => e.tipo === "A_CAMINHO"),
        d1Preview: d1Preview || null,
      });
      setLastUpdate(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      // Buscar patrimônio do mês
      const mesAtualPat = hoje.slice(0, 7);
      fetch(`/api/patrimonio?mes=${mesAtualPat}`, { headers: { "x-admin-password": password } })
        .then(r => r.json()).then(j => { if (j.data) setPatrimonioBase(j.data); }).catch(() => {});
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) return <div className="p-8 text-center text-[#86868B]">Carregando dashboard...</div>;

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const mesAtual = hoje.slice(0, 7);

  // Vendas do mês
  const vendasMes = data.vendas.filter(v => v.data?.startsWith(mesAtual) && v.status_pagamento !== "CANCELADO");
  const vendasHoje = data.vendas.filter(v => v.data === hoje && v.status_pagamento !== "CANCELADO");

  // Gastos do mês
  const gastosMes = data.gastos.filter(g => g.data?.startsWith(mesAtual));
  const gastosHoje = data.gastos.filter(g => g.data === hoje);

  // Cálculos vendas
  const totalVendidoMes = vendasMes.reduce((s, v) => s + (v.preco_vendido || 0), 0);
  const totalCustoMes = vendasMes.reduce((s, v) => s + (v.custo || 0), 0);
  const lucroMes = vendasMes.reduce((s, v) => s + (v.lucro || 0), 0);
  const vendasHojeTotal = vendasHoje.reduce((s, v) => s + (v.preco_vendido || 0), 0);
  const lucroHoje = vendasHoje.reduce((s, v) => s + (v.lucro || 0), 0);

  // Gastos (excluir FORNECEDOR — compra de estoque não é gasto, vira produto)
  const gastosReais = (arr: typeof gastosMes) => arr.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR" && g.categoria !== "DEPOSITO ESPECIE" && !g.is_dep_esp);
  const saidasMes = gastosReais(gastosMes).reduce((s, g) => s + (g.valor || 0), 0);
  const saidasHoje = gastosReais(gastosHoje).reduce((s, g) => s + (g.valor || 0), 0);
  const entradasMes = gastosMes.filter(g => g.tipo === "ENTRADA").reduce((s, g) => s + (g.valor || 0), 0);
  const comprasFornecedorMes = gastosMes.filter(g => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);

  // Categorias de gastos (sem FORNECEDOR)
  const gastosPorCategoria: Record<string, number> = {};
  gastosReais(gastosMes).forEach(g => {
    gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] || 0) + (g.valor || 0);
  });

  // Tipos de venda
  const upgrades = vendasMes.filter(v => v.tipo === "UPGRADE");
  const somenteVendas = vendasMes.filter(v => v.tipo === "VENDA");
  const atacado = vendasMes.filter(v => v.tipo === "ATACADO");
  const clienteFinal = vendasMes.filter(v => v.tipo !== "ATACADO");

  // Vendas pendentes
  const vendasPendentes = data.vendas.filter(v => v.status_pagamento === "AGUARDANDO");
  const valorPendente = vendasPendentes.reduce((s, v) => s + (v.preco_vendido || 0), 0);

  // Saldos bancários — verificar se a row é de HOJE ou de dia anterior
  const s = data.saldos;
  const prev = data.saldoAnterior;
  const saldoIsToday = s?.data === hoje;
  const isManual = saldoIsToday && s?.manual === true;
  let itauBase = 0;
  let infBase = 0;
  let mpBase = 0;
  let espBase = 0;

  if (saldoIsToday && (s?.itau_base || s?.inf_base || s?.mp_base)) {
    // Row de hoje existe com bases preenchidas — usar direto
    itauBase = s?.itau_base || 0;
    infBase = s?.inf_base || 0;
    mpBase = s?.mp_base || 0;
    espBase = s?.esp_especie_base ?? s?.esp_especie ?? 0;
  } else {
    // Sem row de hoje ou bases zeradas — usar fechamento anterior como base
    const ref = prev || s; // prev é row anterior; se não existe, s é a mais recente
    itauBase = ref?.esp_itau || 0;
    infBase = ref?.esp_inf || 0;
    mpBase = ref?.esp_mp || 0;
    espBase = ref?.esp_especie || 0;
  }

  // Recebido hoje (D+0) — mesma lógica do relatório /noite
  // Calcular PIX real por banco: soma apenas o que efetivamente entra em cada conta
  const pixHojeItau = (() => {
    let total = 0;
    for (const v of vendasHoje) {
      // PIX direto no Itaú (forma=PIX, banco=ITAU)
      if (v.forma === "PIX" && v.banco === "ITAU") {
        total += (v.preco_vendido || 0) - (v.entrada_especie || 0);
      }
      // Entrada PIX mista destinada ao Itaú
      if ((v.entrada_pix || 0) > 0 && (v.banco_pix || "ITAU") === "ITAU") {
        total += v.entrada_pix;
      }
    }
    return total;
  })();
  const pixHojeInf = (() => {
    let total = 0;
    for (const v of vendasHoje) {
      if (v.forma === "PIX" && v.banco === "INFINITE") {
        total += (v.preco_vendido || 0) - (v.entrada_especie || 0);
      }
      if ((v.entrada_pix || 0) > 0 && v.banco_pix === "INFINITE") {
        total += v.entrada_pix;
      }
    }
    return total;
  })();
  const pixHojeMP = (() => {
    let total = 0;
    for (const v of vendasHoje) {
      // Link MP (forma=CARTAO, banco=MERCADO_PAGO) — MP é D+0
      if (v.banco === "MERCADO_PAGO" && (v.forma === "CARTAO" || v.forma === "PIX")) {
        total += (v.preco_vendido || 0) - (v.entrada_pix || 0) - (v.entrada_especie || 0) - Number(v.produto_na_troca || 0);
      }
      if ((v.entrada_pix || 0) > 0 && v.banco_pix === "MERCADO_PAGO") {
        total += v.entrada_pix;
      }
    }
    return total;
  })();

  // Créditos D+1 de dias anteriores que caíram hoje (mesma lógica do /noite)
  const d1Credits = (() => {
    const acc = { ITAU: 0, INFINITE: 0, MERCADO_PAGO: 0 };
    const contados = new Set<string>();
    const seteDias = new Date(hoje + "T12:00:00");
    seteDias.setDate(seteDias.getDate() - 7);
    const seteDiasISO = `${seteDias.getFullYear()}-${String(seteDias.getMonth() + 1).padStart(2, "0")}-${String(seteDias.getDate()).padStart(2, "0")}`;
    const d1Vendas = data.vendas.filter((v: { recebimento: string; data: string }) =>
      v.recebimento === "D+1" && v.data && v.data < hoje && v.data >= seteDiasISO
    );
    for (const v of d1Vendas) {
      const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
      const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
      if (recebISO !== hoje) continue;
      const chave = v.id || `${v.banco}_${v.cliente}_${v.preco_vendido}_${v.data}_${v.produto}`;
      if (contados.has(chave)) continue;
      contados.add(chave);
      const comprovante = Number(v.valor_comprovante || 0);
      const val = comprovante > 0
        ? calcularLiquido(comprovante, getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || ""))
        : Math.max(0, (v.preco_vendido || 0) - (v.entrada_pix || 0) - (v.entrada_especie || 0) - Number(v.produto_na_troca || 0));
      const banco = v.banco as keyof typeof acc;
      if (banco in acc) acc[banco] += val;
    }
    return acc;
  })();
  const d1Itau = d1Credits.ITAU;
  const d1Inf = d1Credits.INFINITE;
  const d1MP = d1Credits.MERCADO_PAGO;

  // Espécie recebido hoje: entrada_especie parcial + vendas 100% em dinheiro/espécie
  const especieHoje = vendasHoje.reduce((s, v) => {
    let esp = v.entrada_especie || 0;
    // Se forma é DINHEIRO ou ESPECIE, o valor total foi pago em espécie
    if ((v.forma === "DINHEIRO" || v.forma === "ESPECIE") && v.preco_vendido > 0) {
      esp += v.preco_vendido;
    }
    return s + esp;
  }, 0);

  // Gastos por banco hoje (todos — incluindo FORNECEDOR — porque SAI da conta)
  // Saídas por banco — inclui TUDO (fornecedor + operacional) pois pagamentos acontecem após base manhã
  const gastosHojeItau = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "ITAU").reduce((s, g) => s + (g.valor || 0), 0);
  const gastosHojeInf = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "INFINITE").reduce((s, g) => s + (g.valor || 0), 0);
  const gastosHojeMP = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "MERCADO_PAGO").reduce((s, g) => s + (g.valor || 0), 0);
  const gastosHojeEsp = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "ESPECIE").reduce((s, g) => s + (g.valor || 0), 0);
  // Depósitos de espécie (saem do caixa espécie, entram no banco)
  const depEspHoje = gastosHoje.filter(g => g.is_dep_esp).reduce((s, g) => s + (g.valor || 0), 0);

  // Saldo = base manhã + entradas do dia - saídas do dia (sempre em tempo real)
  const saldoItau = itauBase + pixHojeItau - gastosHojeItau; // D+1 já incluso na base manhã
  const saldoInf = infBase + pixHojeInf - gastosHojeInf; // D+1 já incluso na base manhã
  const saldoMP = mpBase + pixHojeMP - gastosHojeMP; // MP sempre D+0, sem D+1
  const saldoEsp = espBase + especieHoje - gastosHojeEsp - depEspHoje;
  const saldoTotal = saldoItau + saldoInf + saldoMP + saldoEsp;

  // Estoque — soma TUDO (todos os tipos/categorias)
  const valorEstoque = data.estoque.reduce((s, e) => s + (e.qnt || 0) * (e.custo_unitario || 0), 0);
  const valorACaminho = data.aCaminho.reduce((s, e) => s + (e.qnt || 0) * (e.custo_unitario || 0), 0);
  const capitalProdutos = valorEstoque + valorACaminho;
  const patrimonio = capitalProdutos + saldoTotal; // d1Total adicionado abaixo após calcular

  // Fiado pendente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiadoPendente = data.vendas.filter((v: any) => (v.entrada_fiado || 0) > 0 && !v.fiado_recebido && v.status_pagamento !== "CANCELADO");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalFiado = fiadoPendente.reduce((s: number, v: any) => s + (v.entrada_fiado || 0), 0);

  // Margem média
  const margemMedia = totalVendidoMes > 0 ? ((lucroMes / totalVendidoMes) * 100).toFixed(1) : "0";

  // D+1 previsão próximo dia útil (via API com taxas reais)
  const d1AmanhaItau = data.d1Preview?.d1_itau || 0;
  const d1AmanhaInf = data.d1Preview?.d1_inf || 0;
  const d1Total = d1AmanhaItau + d1AmanhaInf;
  const proxDiaUtil = data.d1Preview?.data || "";
  const patrimonioTotal = patrimonio + d1Total;

  const Card = ({ title, value, color, sub, icon }: { title: string; value: string; color: string; sub?: string; icon?: string }) => (
    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-3 md:p-4 shadow-sm">
      <div className="flex items-center gap-1.5 md:gap-2 mb-1">
        {icon && <span className="text-base md:text-lg">{icon}</span>}
        <span className="text-[11px] md:text-xs text-[#86868B] font-medium leading-tight">{title}</span>
      </div>
      <div className={`text-lg md:text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#86868B] mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">Dashboard Financeiro</h1>
          <p className="text-xs text-[#86868B]">Atualizado em {lastUpdate}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const mes = new Date().toISOString().slice(0, 7);
              window.open(`/admin/relatorio?month=${mes}`, "_blank");
            }}
            className="px-3 py-2 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-sm font-medium hover:bg-[#E8E8ED] transition-colors"
          >
            📄 Relatorio PDF
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] transition-colors disabled:opacity-50"
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* ── Mobile KPI Summary (só aparece em telas pequenas) ── */}
      <div className="md:hidden space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-[#E8740E] to-[#F5A623] rounded-2xl p-4 text-white shadow-lg">
            <p className="text-[11px] font-medium opacity-80">Patrimonio Total</p>
            <p className="text-[22px] font-bold mt-1">{fmt(patrimonioTotal)}</p>
          </div>
          <div className="bg-gradient-to-br from-[#1D1D1F] to-[#3A3A3C] rounded-2xl p-4 text-white shadow-lg">
            <p className="text-[11px] font-medium opacity-80">Saldo em Conta</p>
            <p className="text-[22px] font-bold mt-1">{fmt(saldoTotal)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
            <p className="text-[11px] font-medium text-[#86868B]">Vendas Hoje</p>
            <p className="text-[20px] font-bold text-[#1D1D1F]">{vendasHoje.length}x</p>
            <p className="text-[11px] text-green-600 font-medium">{fmt(vendasHojeTotal)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
            <p className="text-[11px] font-medium text-[#86868B]">Lucro Hoje</p>
            <p className="text-[20px] font-bold text-green-600">{fmt(lucroHoje)}</p>
            <p className="text-[11px] text-[#86868B]">Mes: {fmt(lucroMes)}</p>
          </div>
        </div>
        {/* Bank balances — collapsible accordion */}
        <button
          onClick={() => setBankDetailsOpen(!bankDetailsOpen)}
          className="w-full bg-white rounded-xl border border-[#D2D2D7] p-3 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">Saldos por Banco</span>
            <span className="text-[11px] text-[#86868B]">{bankDetailsOpen ? "▲" : "▼"}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-[9px] text-[#86868B]">Itau</p>
              <p className="text-[12px] font-bold text-blue-700">{fmt(saldoItau)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-[#86868B]">Infinite</p>
              <p className="text-[12px] font-bold text-purple-700">{fmt(saldoInf)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-[#86868B]">MP</p>
              <p className="text-[12px] font-bold text-green-700">{fmt(saldoMP)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-[#86868B]">Especie</p>
              <p className="text-[12px] font-bold text-[#1D1D1F]">{fmt(saldoEsp)}</p>
            </div>
          </div>
          {bankDetailsOpen && (
            <div className="mt-3 pt-3 border-t border-[#E5E5EA] space-y-2.5 text-left" onClick={(e) => e.stopPropagation()}>
              {/* Itau details */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-blue-700 font-semibold">Itau</span>
                <span className="text-[11px] text-[#86868B]">Base: {fmt(itauBase)} | PIX: +{fmt(pixHojeItau)} | Saidas: -{fmt(gastosHojeItau)}</span>
              </div>
              {/* Infinite details */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-purple-700 font-semibold">Infinite</span>
                <span className="text-[11px] text-[#86868B]">Base: {fmt(infBase)} | PIX: +{fmt(pixHojeInf)} | Saidas: -{fmt(gastosHojeInf)}</span>
              </div>
              {/* MP details */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-green-700 font-semibold">MP</span>
                <span className="text-[11px] text-[#86868B]">Base: {fmt(mpBase)} | Link: +{fmt(pixHojeMP)} | Saidas: -{fmt(gastosHojeMP)}</span>
              </div>
              {/* Especie details */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#1D1D1F] font-semibold">Especie</span>
                <span className="text-[11px] text-[#86868B]">Base: {fmt(espBase)} | Receb: +{fmt(especieHoje)} | Saidas: -{fmt(gastosHojeEsp)}</span>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Saldos Bancários — hidden on mobile (shown in mobile KPI above) */}
      <div className="hidden md:block">
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Saldos Bancários</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="🏦" title="Saldo Itaú (atual)" value={fmt(saldoItau)} color="text-blue-700" sub={`Base: ${fmt(itauBase)} | PIX: +${fmt(pixHojeItau)} | Saídas: -${fmt(gastosHojeItau)}`} />
          <Card icon="💳" title="Saldo Infinite (atual)" value={fmt(saldoInf)} color="text-purple-700" sub={`Base: ${fmt(infBase)} | PIX: +${fmt(pixHojeInf)} | Saídas: -${fmt(gastosHojeInf)}`} />
          <Card icon="💚" title="Mercado Pago (atual)" value={fmt(saldoMP)} color="text-green-700" sub={`Base: ${fmt(mpBase)} | Link: +${fmt(pixHojeMP)} | Saídas: -${fmt(gastosHojeMP)}`} />
          <Card icon="💵" title="Dinheiro em Espécie" value={fmt(saldoEsp)} color="text-[#1D1D1F]" sub={`Base: ${fmt(espBase)} | Recebido: +${fmt(especieHoje)} | Saídas: -${fmt(gastosHojeEsp)}`} />
          {totalFiado > 0 && (
            <Card icon="📋" title="Fiado Pendente" value={fmt(totalFiado)} color="text-orange-600" sub={`${fiadoPendente.length} venda${fiadoPendente.length !== 1 ? "s" : ""} a receber`} />
          )}
        </div>
      </div>

      {/* Operacional Hoje */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Hoje — {new Date().toLocaleDateString("pt-BR")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="📤" title={`Saídas Hoje`} value={fmt(saidasHoje)} color="text-red-600" sub={`${gastosHoje.filter(g => g.tipo === "SAIDA").length} operações`} />
          <Card icon="🛒" title="Vendas Hoje" value={fmt(vendasHojeTotal)} color="text-blue-600" sub={`${vendasHoje.length} vendas | Lucro: ${fmt(lucroHoje)}`} />
          <Card icon="✅" title="Recebido Hoje" value={fmt(vendasHojeTotal)} color="text-green-600" sub={`PIX/Dinheiro | Link MP`} />
          <Card icon="📅" title={`Previsão ${proxDiaUtil.split("-").reverse().join("/")}`} value={fmt(d1AmanhaItau + d1AmanhaInf)} color="text-[#1D1D1F]" sub={`Itaú: ${fmt(d1AmanhaItau)} | Infinite: ${fmt(d1AmanhaInf)}`} />
        </div>
      </div>

      {/* Resumo do Mês */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Março 2026</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="💰" title="Faturamento do Mês" value={fmt(totalVendidoMes)} color="text-blue-700" sub={`${vendasMes.length} vendas | Custo: ${fmt(totalCustoMes)}`} />
          <Card icon="📈" title="Lucro Bruto" value={fmt(lucroMes)} color="text-green-700" sub={`Margem média: ${margemMedia}%`} />
          <Card icon="📤" title="Gastos do Mês" value={fmt(saidasMes)} color="text-red-600" sub={`Compras fornecedor: ${fmt(comprasFornecedorMes)} (não contabilizado)`} />
          <Card icon="💎" title="Lucro Líquido" value={fmt(lucroMes - saidasMes)} color={lucroMes - saidasMes >= 0 ? "text-green-700" : "text-red-600"} sub={`Bruto ${fmt(lucroMes)} - Gastos ${fmt(saidasMes)}`} />
        </div>
      </div>

      {/* Projeção do Mês */}
      {(() => {
        const now = new Date();
        const diaAtual = now.getDate();
        const totalDiasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const diasRestantes = totalDiasMes - diaAtual;
        const mediaDiaria = diaAtual > 0 ? lucroMes / diaAtual : 0;
        const projecaoFimMes = lucroMes + (mediaDiaria * diasRestantes);
        const pctProgresso = projecaoFimMes > 0 ? Math.min((lucroMes / projecaoFimMes) * 100, 100) : 0;
        const onTrack = mediaDiaria >= (lucroMes / diaAtual); // always true by definition, but useful if target exists
        const barColor = mediaDiaria > 0 ? "bg-green-500" : "bg-orange-500";

        return (
          <div>
            <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Projecao do Mes</h2>
            <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 md:p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div>
                  <p className="text-[11px] md:text-xs text-[#86868B]">Lucro ate hoje</p>
                  <p className="text-base md:text-lg font-bold text-green-700">{fmt(lucroMes)}</p>
                </div>
                <div>
                  <p className="text-[11px] md:text-xs text-[#86868B]">Media diaria</p>
                  <p className="text-base md:text-lg font-bold text-[#1D1D1F]">{fmt(mediaDiaria)}</p>
                </div>
                <div>
                  <p className="text-[11px] md:text-xs text-[#86868B]">Projecao fim do mes</p>
                  <p className="text-base md:text-lg font-bold text-blue-700">{fmt(projecaoFimMes)}</p>
                </div>
                <div>
                  <p className="text-[11px] md:text-xs text-[#86868B]">Dias restantes</p>
                  <p className="text-base md:text-lg font-bold text-[#1D1D1F]">{diasRestantes}</p>
                </div>
              </div>
              {/* Barra de progresso */}
              <div>
                <div className="flex justify-between text-[10px] text-[#86868B] mb-1">
                  <span>Dia {diaAtual} de {totalDiasMes}</span>
                  <span>{pctProgresso.toFixed(0)}% do projetado</span>
                </div>
                <div className="w-full h-2.5 bg-[#F5F5F7] rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pctProgresso}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tipos de Venda */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Tipos de Venda</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="🔄" title={`Upgrades (${upgrades.length})`} value={`Lucro: ${fmt(upgrades.reduce((s, v) => s + (v.lucro || 0), 0))}`} color="text-orange-600" />
          <Card icon="🏪" title={`Somente Vendas (${somenteVendas.length})`} value={`Lucro: ${fmt(somenteVendas.reduce((s, v) => s + (v.lucro || 0), 0))}`} color="text-blue-600" />
          <Card icon="📦" title={`Atacado (${atacado.length})`} value={`Lucro: ${fmt(atacado.reduce((s, v) => s + (v.lucro || 0), 0))}`} color="text-purple-600" />
          <Card icon="👤" title={`Cliente Final (${clienteFinal.length})`} value={`Lucro: ${fmt(clienteFinal.reduce((s, v) => s + (v.lucro || 0), 0))}`} color="text-green-600" />
        </div>
      </div>

      {/* Estoque + Patrimônio */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Patrimônio</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="📦" title="Capital em Produtos" value={fmt(capitalProdutos)} color="text-blue-700" sub={`Estoque: ${fmt(valorEstoque)} | A caminho: ${fmt(valorACaminho)}`} />
          <Card icon="⏳" title={`Vendas Pendentes (${vendasPendentes.length})`} value={fmt(valorPendente)} color="text-yellow-600" sub={vendasPendentes.slice(0, 3).map(v => v.cliente).join(" | ") || "Nenhuma"} />
          <Card icon="⚠️" title={`Pendências Troca`} value={String(data.pendencias)} color="text-red-600" sub="Aguardando devolução" />
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base md:text-lg">🏦</span>
            <span className="text-sm text-blue-600 font-medium">Saldo Total em Conta</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-blue-800">{fmt(saldoTotal)}</div>
          <div className="text-[11px] md:text-xs text-blue-500 mt-1">
            Itaú: {fmt(saldoItau)} | Inf: {fmt(saldoInf)} | MP: {fmt(saldoMP)} | Esp: {fmt(saldoEsp)}
          </div>
        </div>
        <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base md:text-lg">🏆</span>
            <span className="text-sm text-yellow-700 font-medium">Patrimônio da Empresa</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-yellow-800">{fmt(patrimonioTotal)}</div>
          <div className="text-[11px] md:text-xs text-yellow-600 mt-1">
            Produtos: {fmt(capitalProdutos)} | Contas: {fmt(saldoTotal)} | D+1: {fmt(d1Total)}
          </div>
        </div>
      </div>

      {/* Balanço do Mês */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Balanço do Mês</h2>
        {patrimonioBase ? (
          <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 shadow-sm space-y-3">
            {(() => {
              const pBase = Number(patrimonioBase.patrimonio_base);
              const retirada = Number(patrimonioBase.distribuicao_lucro);
              const lucroLiq = lucroMes - saidasMes;
              const patAtual = patrimonioTotal;
              const crescimento = patAtual - pBase;
              const crescPct = pBase > 0 ? (crescimento / pBase) * 100 : 0;
              return <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[#86868B] text-xs">Patrimônio Início</p>
                    <p className="font-bold text-[#1D1D1F] text-lg">{fmt(pBase)}</p>
                  </div>
                  <div>
                    <p className="text-[#86868B] text-xs">+ Lucro Bruto</p>
                    <p className="font-bold text-green-600">{fmt(lucroMes)}</p>
                  </div>
                  <div>
                    <p className="text-[#86868B] text-xs">- Gastos Operacionais</p>
                    <p className="font-bold text-red-500">{fmt(saidasMes)}</p>
                  </div>
                  <div>
                    <p className="text-[#86868B] text-xs">= Lucro Líquido</p>
                    <p className={`font-bold ${lucroLiq >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(lucroLiq)}</p>
                  </div>
                  <div>
                    <p className="text-[#86868B] text-xs flex items-center gap-1">- Retirada PF {!editingPatrimonio && <button onClick={() => { setEditingPatrimonio(true); setPatInput(p => ({ ...p, retirada: String(retirada || "") })); }} className="text-[10px] text-[#E8740E] underline">editar</button>}</p>
                    {editingPatrimonio ? (
                      <div className="flex gap-1 mt-1">
                        <input type="text" inputMode="numeric" value={patInput.retirada} onChange={e => setPatInput(p => ({ ...p, retirada: e.target.value.replace(/\D/g, "") }))} className="w-24 px-2 py-1 text-sm border rounded-lg" placeholder="0" />
                        <button onClick={async () => {
                          await fetch("/api/patrimonio", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ mes: hoje.slice(0, 7), distribuicao_lucro: Number(patInput.retirada) || 0 }) });
                          setEditingPatrimonio(false);
                          fetchData();
                        }} className="px-2 py-1 bg-[#E8740E] text-white text-xs rounded-lg">OK</button>
                      </div>
                    ) : (
                      <p className="font-bold text-purple-600">{fmt(retirada)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[#86868B] text-xs">= Patrimônio Atual</p>
                    <p className="font-bold text-[#1D1D1F] text-lg">{fmt(patAtual)}</p>
                  </div>
                </div>
                <div className={`rounded-xl p-3 text-center ${crescimento >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <span className={`text-sm font-bold ${crescimento >= 0 ? "text-green-700" : "text-red-600"}`}>
                    Crescimento: {fmt(crescimento)} ({crescPct >= 0 ? "+" : ""}{crescPct.toFixed(1)}%)
                  </span>
                </div>
              </>;
            })()}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-[#D2D2D7] p-5 text-center">
            <p className="text-sm text-[#86868B] mb-3">Nenhum patrimônio base registrado para este mês</p>
            <button onClick={async () => {
              const base = patrimonioTotal;
              await fetch("/api/patrimonio", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ mes: hoje.slice(0, 7), patrimonio_base: base, estoque_base: capitalProdutos, saldos_base: saldoTotal }) });
              fetchData();
            }} className="px-4 py-2 bg-[#E8740E] text-white text-sm font-semibold rounded-xl hover:bg-[#D06A0C] transition-colors">
              Registrar patrimônio base ({fmt(patrimonioTotal)})
            </button>
          </div>
        )}
      </div>

      {/* Top Gastos por Categoria */}
      {Object.keys(gastosPorCategoria).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Gastos por Categoria (Mês)</h2>
          <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
            <div className="space-y-2">
              {Object.entries(gastosPorCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, val]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm text-[#1D1D1F]">{cat}</span>
                    <span className="text-sm font-semibold text-red-600">{fmt(val)}</span>
                  </div>
                ))}
              <div className="border-t border-[#D2D2D7] pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-[#1D1D1F]">TOTAL GASTOS</span>
                <span className="text-sm font-bold text-red-700">{fmt(saidasMes)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico de Vendas — Últimos 14 dias */}
      <VendasChart vendas={data.vendas} />

      {/* Ranking de Produtos */}
      <ProdutosRanking vendas={vendasMes} />

      {/* Curva ABC + Sugestão de Compra */}
      <CurvaABC vendas={data.vendas} estoque={data.estoque} />

      {/* Ranking de Origens */}
      <OrigensRanking password={password} />
    </div>
  );
}

/* ── Gráfico de Vendas (últimos 14 dias) ── */
function VendasChart({ vendas }: { vendas: DashData["vendas"] }) {
  const [periodo, setPeriodo] = useState<"7d" | "14d" | "30d">("14d");
  const dias = periodo === "7d" ? 7 : periodo === "14d" ? 14 : 30;

  const chartData = useMemo(() => {
    const hoje = new Date();
    const result: { dia: string; faturamento: number; lucro: number; qtd: number }[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const diaVendas = vendas.filter(v => v.data === dateStr && v.status_pagamento !== "CANCELADO");
      result.push({
        dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        faturamento: diaVendas.reduce((s, v) => s + (v.preco_vendido || 0), 0),
        lucro: diaVendas.reduce((s, v) => s + (v.lucro || 0), 0),
        qtd: diaVendas.length,
      });
    }
    return result;
  }, [vendas, dias]);

  const maxFat = Math.max(...chartData.map(d => d.faturamento), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider">Evolucao de Vendas</h2>
        <div className="flex gap-1">
          {(["7d", "14d", "30d"] as const).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${periodo === p ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B]"}`}>{p === "7d" ? "7 dias" : p === "14d" ? "14 dias" : "30 dias"}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm overflow-x-auto -mx-1 md:mx-0">
        <div className="flex items-end gap-1 min-w-fit" style={{ height: 160, minWidth: dias > 14 ? `${dias * 32}px` : undefined }}>
          {chartData.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[28px]">
              <span className="text-[9px] text-[#86868B] font-medium">{d.qtd > 0 ? d.qtd : ""}</span>
              <div className="w-full flex flex-col items-center gap-[1px]" style={{ height: 120 }}>
                <div className="w-full rounded-t-sm bg-[#E8740E] transition-all" style={{ height: `${(d.faturamento / maxFat) * 100}%`, minHeight: d.faturamento > 0 ? 4 : 0, opacity: 0.8 }} title={`Fat: ${fmt(d.faturamento)}`} />
                <div className="w-full rounded-b-sm bg-[#2ECC71] transition-all" style={{ height: `${(d.lucro / maxFat) * 100}%`, minHeight: d.lucro > 0 ? 2 : 0, opacity: 0.7 }} title={`Lucro: ${fmt(d.lucro)}`} />
              </div>
              <span className="text-[8px] text-[#86868B] whitespace-nowrap">{dias <= 14 ? d.dia : (i % 3 === 0 ? d.dia : "")}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1 text-[10px] text-[#86868B]"><span className="w-3 h-3 rounded-sm bg-[#E8740E] opacity-80" /> Faturamento</span>
          <span className="flex items-center gap-1 text-[10px] text-[#86868B]"><span className="w-3 h-3 rounded-sm bg-[#2ECC71] opacity-70" /> Lucro</span>
        </div>
      </div>
    </div>
  );
}

/* ── Ranking de Produtos Mais Vendidos ── */
function ProdutosRanking({ vendas }: { vendas: DashData["vendas"] }) {
  const ranking = useMemo(() => {
    const map: Record<string, { produto: string; qtd: number; receita: number; lucro: number }> = {};
    vendas.forEach(v => {
      const key = v.produto || "Outros";
      if (!map[key]) map[key] = { produto: key, qtd: 0, receita: 0, lucro: 0 };
      map[key].qtd++;
      map[key].receita += v.preco_vendido || 0;
      map[key].lucro += v.lucro || 0;
    });
    return Object.values(map).sort((a, b) => b.receita - a.receita).slice(0, 10);
  }, [vendas]);

  if (ranking.length === 0) return null;

  const maxReceita = ranking[0]?.receita || 1;

  return (
    <div>
      <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Top Produtos do Mes</h2>
      <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
        <div className="space-y-2">
          {ranking.map((r, i) => {
            const margem = r.receita > 0 ? ((r.lucro / r.receita) * 100).toFixed(1) : "0";
            return (
              <div key={r.produto} className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#86868B] w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-[#1D1D1F] truncate">{r.produto}</span>
                    <span className="text-sm font-semibold text-[#1D1D1F] shrink-0 ml-2">{fmt(r.receita)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[#F5F5F7] overflow-hidden">
                      <div className="h-full rounded-full bg-[#E8740E]" style={{ width: `${(r.receita / maxReceita) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-[#86868B] shrink-0">{r.qtd}x | {margem}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Curva ABC + Sugestão de Compra ── */
function CurvaABC({ vendas, estoque }: { vendas: DashData["vendas"]; estoque: DashData["estoque"] }) {
  const [showSugestao, setShowSugestao] = useState(false);

  // Últimos 30 dias
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d30Str = d30.toISOString().split("T")[0];
  const vendas30d = vendas.filter(v => v.data >= d30Str && v.status_pagamento !== "CANCELADO");

  // Agrupar por produto
  const prodMap: Record<string, { produto: string; receita: number; qtdVendida: number; custo: number }> = {};
  vendas30d.forEach(v => {
    const key = v.produto || "Outros";
    if (!prodMap[key]) prodMap[key] = { produto: key, receita: 0, qtdVendida: 0, custo: 0 };
    prodMap[key].receita += v.preco_vendido || 0;
    prodMap[key].qtdVendida++;
    prodMap[key].custo += v.custo || 0;
  });

  const sorted = Object.values(prodMap).sort((a, b) => b.receita - a.receita);
  const totalReceita = sorted.reduce((s, p) => s + p.receita, 0);

  // Classificação ABC
  let acum = 0;
  const classified = sorted.map(p => {
    acum += p.receita;
    const pctAcum = totalReceita > 0 ? (acum / totalReceita) * 100 : 0;
    const classe = pctAcum <= 80 ? "A" : pctAcum <= 95 ? "B" : "C";
    return { ...p, pctAcum, classe };
  });

  // Sugestão de compra: produtos classe A com estoque baixo
  const estoqueMap: Record<string, number> = {};
  estoque.forEach(e => { estoqueMap[e.tipo === "NOVO" || e.tipo === "SEMINOVO" ? "ok" : ""] = 0; }); // dummy
  // Build estoque qty map from raw estoque data
  // Note: estoque items have produto field but may not match exactly
  const sugestoes = classified.filter(p => p.classe === "A" || p.classe === "B").map(p => {
    const mediaVendasDia = p.qtdVendida / 30;
    const reporEm = Math.ceil(mediaVendasDia * 7); // sugerir estoque para 7 dias
    return { ...p, mediaVendasDia: mediaVendasDia.toFixed(1), sugestaoRepor: Math.max(reporEm, 1) };
  });

  const classeColor: Record<string, string> = { A: "bg-green-100 text-green-700", B: "bg-yellow-100 text-yellow-700", C: "bg-gray-100 text-gray-500" };
  const classeLabel: Record<string, string> = { A: "80% do faturamento", B: "15% do faturamento", C: "5% do faturamento" };

  if (classified.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider">Curva ABC (ultimos 30 dias)</h2>
        <button onClick={() => setShowSugestao(!showSugestao)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSugestao ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B]"}`}>
          {showSugestao ? "Ver Curva ABC" : "💡 Sugestao de Compra"}
        </button>
      </div>

      {!showSugestao ? (
        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(["A", "B", "C"] as const).map(c => {
              const items = classified.filter(p => p.classe === c);
              const total = items.reduce((s, p) => s + p.receita, 0);
              return (
                <div key={c} className="text-center p-3 rounded-xl bg-[#F5F5F7]">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-1 ${classeColor[c]}`}>Classe {c}</span>
                  <p className="text-lg font-bold text-[#1D1D1F]">{items.length} produtos</p>
                  <p className="text-[10px] text-[#86868B]">{fmt(total)} — {classeLabel[c]}</p>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {classified.slice(0, 20).map((p, i) => (
              <div key={p.produto} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-[#86868B] w-5 text-right font-mono">{i + 1}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${classeColor[p.classe]}`}>{p.classe}</span>
                <span className="flex-1 truncate text-[#1D1D1F]">{p.produto}</span>
                <span className="text-xs text-[#86868B]">{p.qtdVendida}x</span>
                <span className="font-semibold text-[#1D1D1F]">{fmt(p.receita)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
          <p className="text-xs text-[#86868B] mb-3">Baseado nas vendas dos ultimos 30 dias — sugestao de estoque para 7 dias</p>
          <div className="space-y-2">
            {sugestoes.map((s) => (
              <div key={s.produto} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7]">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${classeColor[s.classe]}`}>{s.classe}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1D1D1F] truncate">{s.produto}</p>
                  <p className="text-[10px] text-[#86868B]">{s.mediaVendasDia} vendas/dia | {s.qtdVendida} vendas no mes</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[#E8740E]">Repor {s.sugestaoRepor} un</p>
                  <p className="text-[10px] text-[#86868B]">para 7 dias</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// OrigensRanking — Ranking mensal de origens
// ============================================

const ORIGEM_EMOJI: Record<string, string> = {
  "ANUNCIO": "📣",
  "RECOMPRA": "🔄",
  "INDICACAO": "🤝",
  "ATACADO": "📦",
  "OUTROS": "📋",
};

const ORIGEM_COLORS: Record<string, string> = {
  "ANUNCIO": "#4A90D9",
  "RECOMPRA": "#4CAF50",
  "INDICACAO": "#E8740E",
  "ATACADO": "#9B59B6",
  "OUTROS": "#999999",
};

interface OrigemData {
  origem: string;
  qty: number;
  receita: number;
  lucro: number;
  margem: number;
  ticket: number;
  share: number;
  deltaQty: number;
  deltaReceita: number;
  deltaLucro: number;
}

interface OrigensResponse {
  mes: string;
  mesAnterior: string;
  totalQty: number;
  totalReceita: number;
  totalLucro: number;
  ranking: OrigemData[];
  melhorMargem: { origem: string; margem: number } | null;
  maiorTicket: { origem: string; ticket: number } | null;
}

function OrigensRanking({ password }: { password: string }) {
  const [data, setData] = useState<OrigensResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchOrigens = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/relatorio-origens?mes=${m}`, {
        headers: { "x-admin-password": password, "x-admin-user": "sistema" },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    fetchOrigens(mes);
  }, [mes, fetchOrigens]);

  const MESES_NOME: Record<string, string> = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
    "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
  };

  const mesLabel = mes.split("-")[1];
  const anoLabel = mes.split("-")[0];
  const mesNome = `${MESES_NOME[mesLabel] || mesLabel}/${anoLabel}`;

  // Gerar opções de meses (últimos 6 meses)
  const mesesOptions: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    mesesOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const maxReceita = data?.ranking?.[0]?.receita || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider">
          Ranking de Origens — {mesNome}
        </h2>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-xs text-[#1D1D1F] bg-white focus:outline-none focus:border-[#E8740E]"
        >
          {mesesOptions.map((m) => {
            const [y, mo] = m.split("-");
            return (
              <option key={m} value={m}>
                {MESES_NOME[mo] || mo}/{y}
              </option>
            );
          })}
        </select>
      </div>

      {loading && <p className="text-xs text-[#86868B] text-center py-4">Carregando...</p>}

      {!loading && data && data.ranking.length === 0 && (
        <p className="text-xs text-[#86868B] text-center py-4">Nenhuma venda no periodo selecionado.</p>
      )}

      {!loading && data && data.ranking.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm space-y-4">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#86868B] border-b border-[#D2D2D7]">
                  <th className="text-left py-2 font-semibold">#</th>
                  <th className="text-left py-2 font-semibold">Origem</th>
                  <th className="text-right py-2 font-semibold">Vendas</th>
                  <th className="text-right py-2 font-semibold">Faturamento</th>
                  <th className="text-right py-2 font-semibold">Lucro</th>
                  <th className="text-right py-2 font-semibold">Margem</th>
                  <th className="text-right py-2 font-semibold">Ticket</th>
                  <th className="text-right py-2 font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((item, idx) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const medal = idx < 3 ? medals[idx] : `${idx + 1}`;
                  const emoji = ORIGEM_EMOJI[item.origem] || "📋";
                  const barColor = ORIGEM_COLORS[item.origem] || "#999";

                  return (
                    <tr key={item.origem} className="border-b border-[#F5F5F7] last:border-0">
                      <td className="py-2.5">{medal}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span>{emoji}</span>
                          <span className="font-medium text-[#1D1D1F]">{item.origem}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 font-medium text-[#1D1D1F]">
                        {item.qty}
                        {item.deltaQty !== 0 && (
                          <span className={`ml-1 text-[10px] ${item.deltaQty > 0 ? "text-green-600" : "text-red-500"}`}>
                            {item.deltaQty > 0 ? "+" : ""}{item.deltaQty}
                          </span>
                        )}
                      </td>
                      <td className="text-right py-2.5 font-medium text-[#1D1D1F]">{fmt(item.receita)}</td>
                      <td className="text-right py-2.5 font-medium text-green-700">{fmt(item.lucro)}</td>
                      <td className="text-right py-2.5 text-[#6E6E73]">{item.margem.toFixed(1)}%</td>
                      <td className="text-right py-2.5 text-[#6E6E73]">{fmt(item.ticket)}</td>
                      <td className="text-right py-2.5 text-[#6E6E73]">{item.share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#D2D2D7]">
                  <td colSpan={2} className="py-2 font-bold text-[#1D1D1F]">TOTAL</td>
                  <td className="text-right py-2 font-bold text-[#1D1D1F]">{data.totalQty}</td>
                  <td className="text-right py-2 font-bold text-[#1D1D1F]">{fmt(data.totalReceita)}</td>
                  <td className="text-right py-2 font-bold text-green-700">{fmt(data.totalLucro)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bar Chart */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">Distribuicao de Faturamento</p>
            {data.ranking.map((item) => {
              const barColor = ORIGEM_COLORS[item.origem] || "#999";
              const widthPct = maxReceita > 0 ? (item.receita / maxReceita) * 100 : 0;
              const emoji = ORIGEM_EMOJI[item.origem] || "📋";

              return (
                <div key={item.origem} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-[#1D1D1F] font-medium flex items-center gap-1 shrink-0">
                    <span>{emoji}</span>
                    <span className="truncate">{item.origem}</span>
                  </div>
                  <div className="flex-1 bg-[#F5F5F7] rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                    />
                    <span className="absolute right-2 top-0 h-full flex items-center text-[10px] font-semibold text-[#1D1D1F]">
                      {fmt(item.receita)} ({item.share.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Destaques */}
          {(data.melhorMargem || data.maiorTicket) && (
            <div className="flex gap-3 pt-2 border-t border-[#F5F5F7]">
              {data.melhorMargem && (
                <div className="flex-1 bg-green-50 rounded-xl p-3">
                  <p className="text-[10px] text-green-600 font-semibold uppercase">Melhor Margem</p>
                  <p className="text-sm font-bold text-green-800">{data.melhorMargem.origem} ({data.melhorMargem.margem}%)</p>
                </div>
              )}
              {data.maiorTicket && (
                <div className="flex-1 bg-orange-50 rounded-xl p-3">
                  <p className="text-[10px] text-orange-600 font-semibold uppercase">Maior Ticket</p>
                  <p className="text-sm font-bold text-orange-800">{data.maiorTicket.origem} ({fmt(data.maiorTicket.ticket)})</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
