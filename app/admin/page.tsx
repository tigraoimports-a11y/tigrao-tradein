"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

interface DashData {
  saldos: { itau_base: number; inf_base: number; mp_base: number; esp_itau: number; esp_inf: number; esp_mp: number; esp_especie: number; manual?: boolean } | null;
  vendas: { id: string; data: string; cliente: string; tipo: string; origem: string; produto: string; custo: number; preco_vendido: number; lucro: number; banco: string; forma: string; recebimento: string; entrada_pix: number; banco_pix: string; produto_na_troca: string; status_pagamento: string }[];
  gastos: { id: string; data: string; tipo: string; categoria: string; descricao: string; valor: number; banco: string }[];
  estoque: { tipo: string; qnt: number; custo_unitario: number }[];
  pendencias: number;
  aCaminho: { qnt: number; custo_unitario: number }[];
}

export default function DashboardPage() {
  const { password } = useAdmin();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [saldosRes, vendasRes, gastosRes, estoqueRes] = await Promise.all([
        fetch("/api/saldos?latest=true", { headers: { "x-admin-password": password } }),
        fetch("/api/vendas", { headers: { "x-admin-password": password } }),
        fetch("/api/gastos", { headers: { "x-admin-password": password } }),
        fetch("/api/estoque", { headers: { "x-admin-password": password } }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [saldos, vendas, gastos, estoque]: any[] = await Promise.all([
        saldosRes.ok ? saldosRes.json().catch(() => ({})) : {},
        vendasRes.ok ? vendasRes.json().catch(() => ({})) : {},
        gastosRes.ok ? gastosRes.json().catch(() => ({})) : {},
        estoqueRes.ok ? estoqueRes.json().catch(() => ({})) : {},
      ]);

      const estoqueArr = Array.isArray(estoque) ? estoque : estoque?.data || [];
      const vendasArr = Array.isArray(vendas) ? vendas : vendas?.data || [];
      const gastosArr = Array.isArray(gastos) ? gastos : gastos?.data || [];

      setData({
        saldos: saldos?.data?.[0] || saldos?.[0] || null,
        vendas: vendasArr,
        gastos: gastosArr,
        estoque: estoqueArr.filter((e: { tipo: string }) => e.tipo === "NOVO" || e.tipo === "SEMINOVO"),
        pendencias: estoqueArr.filter((e: { tipo: string }) => e.tipo === "PENDENCIA").length,
        aCaminho: estoqueArr.filter((e: { tipo: string }) => e.tipo === "A_CAMINHO"),
      });
      setLastUpdate(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) return <div className="p-8 text-center text-[#86868B]">Carregando dashboard...</div>;

  const hoje = new Date().toISOString().split("T")[0];
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
  const gastosReais = (arr: typeof gastosMes) => arr.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR");
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
  const atacado = vendasMes.filter(v => v.tipo === "ATACADO" || v.origem === "ATACADO");
  const clienteFinal = vendasMes.filter(v => v.origem !== "ATACADO");

  // Vendas pendentes
  const vendasPendentes = data.vendas.filter(v => v.status_pagamento === "AGUARDANDO");
  const valorPendente = vendasPendentes.reduce((s, v) => s + (v.preco_vendido || 0), 0);

  // Saldos bancários
  const s = data.saldos;
  const isManual = s?.manual === true;
  const itauBase = s?.itau_base || 0;
  const infBase = s?.inf_base || 0;
  const mpBase = s?.mp_base || 0;
  const espBase = s?.esp_especie || 0;

  // PIX recebido hoje (D+0)
  const pixHojeItau = vendasHoje.filter(v => v.banco_pix === "ITAU" || (v.forma === "PIX" && v.banco === "ITAU")).reduce((s, v) => s + (v.entrada_pix || 0), 0);
  const pixHojeInf = vendasHoje.filter(v => v.banco_pix === "INFINITE" || (v.forma === "PIX" && v.banco === "INFINITE")).reduce((s, v) => s + (v.entrada_pix || 0), 0);
  const pixHojeMP = vendasHoje.filter(v => v.banco === "MERCADO_PAGO" && v.recebimento === "D+0").reduce((s, v) => s + (v.preco_vendido || 0) - (v.entrada_pix || 0), 0);

  // Gastos por banco hoje (todos — incluindo FORNECEDOR — porque SAI da conta)
  const gastosHojeItau = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "ITAU").reduce((s, g) => s + (g.valor || 0), 0);
  const gastosHojeInf = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "INFINITE").reduce((s, g) => s + (g.valor || 0), 0);
  const gastosHojeMP = gastosHoje.filter(g => g.tipo === "SAIDA" && g.banco === "MERCADO_PAGO").reduce((s, g) => s + (g.valor || 0), 0);

  // Se saldos foram informados manualmente (/saldos), usar valores diretos sem recalcular
  const saldoItau = isManual ? (s?.esp_itau || itauBase) : (itauBase - gastosHojeItau + pixHojeItau);
  const saldoInf = isManual ? (s?.esp_inf || infBase) : (infBase - gastosHojeInf + pixHojeInf);
  const saldoMP = isManual ? (s?.esp_mp || mpBase) : (mpBase - gastosHojeMP + pixHojeMP);
  const saldoEsp = espBase;
  const saldoTotal = saldoItau + saldoInf + saldoMP + saldoEsp;

  // Estoque
  const estoqueNovo = data.estoque.filter(e => e.tipo === "NOVO");
  const estoqueSemi = data.estoque.filter(e => e.tipo === "SEMINOVO");
  const valorEstoqueNovo = estoqueNovo.reduce((s, e) => s + (e.qnt || 0) * (e.custo_unitario || 0), 0);
  const valorEstoqueSemi = estoqueSemi.reduce((s, e) => s + (e.qnt || 0) * (e.custo_unitario || 0), 0);
  const valorACaminho = data.aCaminho.reduce((s, e) => s + (e.qnt || 0) * (e.custo_unitario || 0), 0);
  const capitalProdutos = valorEstoqueNovo + valorEstoqueSemi + valorACaminho;
  const patrimonio = capitalProdutos + saldoTotal;

  // Margem média
  const margemMedia = totalVendidoMes > 0 ? ((lucroMes / totalVendidoMes) * 100).toFixed(1) : "0";

  // D+1 previsão amanhã
  const d1Itau = vendasHoje.filter(v => v.banco === "ITAU" && v.recebimento === "D+1").reduce((s, v) => s + (v.preco_vendido || 0), 0);
  const d1Inf = vendasHoje.filter(v => v.banco === "INFINITE" && v.recebimento === "D+1").reduce((s, v) => s + (v.preco_vendido || 0), 0);

  const Card = ({ title, value, color, sub, icon }: { title: string; value: string; color: string; sub?: string; icon?: string }) => (
    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-lg">{icon}</span>}
        <span className="text-xs text-[#86868B] font-medium">{title}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
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
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] transition-colors disabled:opacity-50"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Saldos Bancários */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Saldos Bancários</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="🏦" title="Saldo Itaú (atual)" value={fmt(saldoItau)} color="text-blue-700" sub={isManual ? "Informado manualmente via /saldos" : `Manhã: ${fmt(itauBase)} | Gastos: -${fmt(gastosHojeItau)} | PIX: +${fmt(pixHojeItau)}`} />
          <Card icon="💳" title="Saldo Infinite (atual)" value={fmt(saldoInf)} color="text-purple-700" sub={isManual ? "Informado manualmente via /saldos" : `Manhã: ${fmt(infBase)} | Gastos: -${fmt(gastosHojeInf)} | PIX: +${fmt(pixHojeInf)}`} />
          <Card icon="💚" title="Mercado Pago (atual)" value={fmt(saldoMP)} color="text-green-700" sub={isManual ? "Informado manualmente via /saldos" : `Manhã: ${fmt(mpBase)} | Gastos: -${fmt(gastosHojeMP)} | Link: +${fmt(pixHojeMP)}`} />
          <Card icon="💵" title="Dinheiro em Espécie" value={fmt(saldoEsp)} color="text-[#1D1D1F]" sub={isManual ? "Informado manualmente via /saldos" : `Manhã: ${fmt(espBase)}`} />
        </div>
      </div>

      {/* Operacional Hoje */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Hoje — {new Date().toLocaleDateString("pt-BR")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon="📤" title={`Saídas Hoje`} value={fmt(saidasHoje)} color="text-red-600" sub={`${gastosHoje.filter(g => g.tipo === "SAIDA").length} operações`} />
          <Card icon="🛒" title="Vendas Hoje" value={fmt(vendasHojeTotal)} color="text-blue-600" sub={`${vendasHoje.length} vendas | Lucro: ${fmt(lucroHoje)}`} />
          <Card icon="✅" title="Recebido Hoje" value={fmt(vendasHojeTotal)} color="text-green-600" sub={`PIX/Dinheiro | Link MP`} />
          <Card icon="📅" title="Previsão Amanhã" value={fmt(d1Itau + d1Inf)} color="text-[#1D1D1F]" sub={`Itaú: ${fmt(d1Itau)} | Infinite: ${fmt(d1Inf)}`} />
        </div>
      </div>

      {/* Resumo do Mês */}
      <div>
        <h2 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-3">Março 2026</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card icon="💰" title="Faturamento do Mês" value={fmt(totalVendidoMes)} color="text-blue-700" sub={`${vendasMes.length} vendas | Custo: ${fmt(totalCustoMes)}`} />
          <Card icon="📈" title="Lucro do Mês" value={fmt(lucroMes)} color="text-green-700" sub={`Margem média: ${margemMedia}%`} />
          <Card icon="📤" title="Gastos do Mês" value={fmt(saidasMes)} color="text-red-600" sub={`Compras fornecedor: ${fmt(comprasFornecedorMes)} (não contabilizado)`} />
        </div>
      </div>

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
          <Card icon="📦" title="Em Estoque" value={fmt(valorEstoqueNovo + valorEstoqueSemi)} color="text-blue-700" sub={`Novos: ${fmt(valorEstoqueNovo)} | Semi: ${fmt(valorEstoqueSemi)}`} />
          <Card icon="🚚" title="Produtos a Caminho" value={fmt(valorACaminho)} color="text-orange-600" sub={`${data.aCaminho.reduce((s, e) => s + (e.qnt || 0), 0)} unidades`} />
          <Card icon="⏳" title={`Vendas Pendentes (${vendasPendentes.length})`} value={fmt(valorPendente)} color="text-yellow-600" sub={vendasPendentes.slice(0, 3).map(v => v.cliente).join(" | ") || "Nenhuma"} />
          <Card icon="⚠️" title={`Pendências Troca`} value={String(data.pendencias)} color="text-red-600" sub="Aguardando devolução" />
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🏦</span>
            <span className="text-sm text-blue-600 font-medium">Saldo Total em Conta</span>
          </div>
          <div className="text-2xl font-bold text-blue-800">{fmt(saldoTotal)}</div>
          <div className="text-xs text-blue-500 mt-1">
            Itaú: {fmt(saldoItau)} | Inf: {fmt(saldoInf)} | MP: {fmt(saldoMP)} | Esp: {fmt(saldoEsp)}
          </div>
        </div>
        <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🏆</span>
            <span className="text-sm text-yellow-700 font-medium">Patrimônio da Empresa</span>
          </div>
          <div className="text-2xl font-bold text-yellow-800">{fmt(patrimonio)}</div>
          <div className="text-xs text-yellow-600 mt-1">
            Produtos: {fmt(capitalProdutos)} | Contas: {fmt(saldoTotal)}
          </div>
        </div>
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
    </div>
  );
}
