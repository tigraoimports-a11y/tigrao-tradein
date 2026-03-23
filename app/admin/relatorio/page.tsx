"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) =>
  `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const MESES = [
  "", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Venda {
  id: string;
  data: string;
  cliente: string;
  tipo: string;
  origem: string;
  produto: string;
  cor: string;
  custo: number;
  preco_vendido: number;
  lucro: number;
  banco: string;
  forma: string;
  status_pagamento: string;
}

interface Gasto {
  id: string;
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: number;
  banco: string;
}

interface SaldoRow {
  data: string;
  esp_itau: number;
  esp_inf: number;
  esp_mp: number;
  esp_especie: number;
}

export default function RelatorioPage() {
  const { password } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [saldo, setSaldo] = useState<SaldoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");

  // Parse month from URL or default to current month
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      setMonth(m);
    } else {
      setMonth(new Date().toISOString().slice(0, 7));
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!month || !password) return;
    setLoading(true);

    const [ano, mes] = month.split("-").map(Number);
    // First and last day of month
    const from = `${month}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;

    try {
      const headers: Record<string, string> = { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" };
      const [vendasRes, gastosRes, saldoRes] = await Promise.all([
        fetch(`/api/vendas?from=${from}&to=${to}`, { headers }),
        fetch(`/api/gastos?from=${from}&to=${to}`, { headers }),
        fetch(`/api/saldos?data=${to}`, { headers }),
      ]);

      const vendasJson = vendasRes.ok ? await vendasRes.json() : {};
      const gastosJson = gastosRes.ok ? await gastosRes.json() : {};
      const saldoJson = saldoRes.ok ? await saldoRes.json() : {};

      setVendas((vendasJson?.data || []).filter((v: Venda) => v.status_pagamento !== "CANCELADO"));
      setGastos(gastosJson?.data || []);
      setSaldo(saldoJson?.data || null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [month, password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!month) return null;

  const [anoStr, mesStr] = month.split("-");
  const mesNum = Number(mesStr);
  const titulo = `${MESES[mesNum]} ${anoStr}`;

  if (loading) {
    return (
      <div className="p-8 text-center text-[#86868B]">
        <p>Carregando relatorio de {titulo}...</p>
      </div>
    );
  }

  // --- Calculations ---
  const totalFaturamento = vendas.reduce((s, v) => s + (v.preco_vendido || 0), 0);
  const totalCusto = vendas.reduce((s, v) => s + (v.custo || 0), 0);
  const totalLucro = vendas.reduce((s, v) => s + (v.lucro || 0), 0);
  const margem = totalFaturamento > 0 ? ((totalLucro / totalFaturamento) * 100).toFixed(1) : "0";
  const ticketMedio = vendas.length > 0 ? totalFaturamento / vendas.length : 0;

  // Vendas por tipo
  const vendasPorTipo: Record<string, { qty: number; receita: number; lucro: number }> = {};
  vendas.forEach((v) => {
    const tipo = v.tipo || "VENDA";
    if (!vendasPorTipo[tipo]) vendasPorTipo[tipo] = { qty: 0, receita: 0, lucro: 0 };
    vendasPorTipo[tipo].qty += 1;
    vendasPorTipo[tipo].receita += v.preco_vendido || 0;
    vendasPorTipo[tipo].lucro += v.lucro || 0;
  });

  // Top 5 produtos
  const produtoMap: Record<string, { qty: number; receita: number }> = {};
  vendas.forEach((v) => {
    const key = v.produto || "Outros";
    if (!produtoMap[key]) produtoMap[key] = { qty: 0, receita: 0 };
    produtoMap[key].qty += 1;
    produtoMap[key].receita += v.preco_vendido || 0;
  });
  const topProdutos = Object.entries(produtoMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5);

  // Gastos por categoria (excluir FORNECEDOR)
  const gastosReais = gastos.filter((g) => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR");
  const totalGastos = gastosReais.reduce((s, g) => s + (g.valor || 0), 0);
  const gastosPorCategoria: Record<string, number> = {};
  gastosReais.forEach((g) => {
    gastosPorCategoria[g.categoria || "Outros"] = (gastosPorCategoria[g.categoria || "Outros"] || 0) + (g.valor || 0);
  });
  const categoriasOrdenadas = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]);

  // Compras de fornecedor
  const comprasFornecedor = gastos
    .filter((g) => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR")
    .reduce((s, g) => s + (g.valor || 0), 0);

  // Saldos
  const saldoItau = saldo?.esp_itau || 0;
  const saldoInf = saldo?.esp_inf || 0;
  const saldoMP = saldo?.esp_mp || 0;
  const saldoEsp = saldo?.esp_especie || 0;
  const saldoTotal = saldoItau + saldoInf + saldoMP + saldoEsp;

  return (
    <>
      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          /* Hide admin sidebar, nav, and non-print elements */
          nav, [data-admin-nav], [data-admin-sidebar], .admin-sidebar,
          .no-print, header, footer {
            display: none !important;
          }
          /* Remove backgrounds and shadows for clean print */
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Make content full width */
          main, .admin-content, [data-admin-content] {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          /* Ensure page breaks work well */
          .print-section {
            break-inside: avoid;
          }
          .print-page-break {
            break-before: page;
          }
        }
      `}</style>

      <div className="max-w-4xl mx-auto p-6 print:p-0">
        {/* Print button - hidden on print */}
        <div className="no-print flex items-center gap-3 mb-6">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#D06A0D] transition-colors"
          >
            Imprimir / Salvar PDF
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-3 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] font-medium hover:bg-[#E8E8ED] transition-colors"
          >
            Fechar
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8 print-section">
          <h1 className="text-3xl font-bold text-[#1D1D1F] print:text-black">
            TigraoImports
          </h1>
          <h2 className="text-xl font-semibold text-[#86868B] print:text-gray-600 mt-1">
            Relatorio Mensal — {titulo}
          </h2>
          <div className="mt-2 text-sm text-[#86868B] print:text-gray-500">
            Gerado em {new Date().toLocaleDateString("pt-BR")}
          </div>
        </div>

        {/* Divider */}
        <hr className="border-[#D2D2D7] print:border-gray-300 mb-6" />

        {/* Resumo Financeiro */}
        <div className="print-section mb-8">
          <h3 className="text-lg font-bold text-[#1D1D1F] print:text-black mb-4">
            Resumo Financeiro
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SummaryItem label="Faturamento Bruto" value={fmt(totalFaturamento)} />
            <SummaryItem label="Custo dos Produtos" value={fmt(totalCusto)} />
            <SummaryItem label="Lucro Bruto" value={fmt(totalLucro)} highlight />
            <SummaryItem label="Margem" value={`${margem}%`} />
            <SummaryItem label="Quantidade de Vendas" value={String(vendas.length)} />
            <SummaryItem label="Ticket Medio" value={fmt(ticketMedio)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <SummaryItem label="Gastos Operacionais" value={fmt(totalGastos)} negative />
            <SummaryItem label="Compras Fornecedor" value={fmt(comprasFornecedor)} />
            <SummaryItem label="Lucro Liquido (Bruto - Gastos)" value={fmt(totalLucro - totalGastos)} highlight />
          </div>
        </div>

        {/* Vendas por Tipo */}
        <div className="print-section mb-8">
          <h3 className="text-lg font-bold text-[#1D1D1F] print:text-black mb-4">
            Vendas por Tipo
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[#D2D2D7] print:border-gray-400">
                <th className="text-left py-2 font-semibold text-[#86868B]">Tipo</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Qtd</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Receita</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Lucro</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Margem</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(vendasPorTipo).map(([tipo, d]) => (
                <tr key={tipo} className="border-b border-[#E8E8ED] print:border-gray-200">
                  <td className="py-2 font-medium text-[#1D1D1F] print:text-black">{tipo}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{d.qty}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{fmt(d.receita)}</td>
                  <td className="py-2 text-right text-green-700">{fmt(d.lucro)}</td>
                  <td className="py-2 text-right text-[#86868B]">
                    {d.receita > 0 ? ((d.lucro / d.receita) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top 5 Produtos */}
        <div className="print-section mb-8">
          <h3 className="text-lg font-bold text-[#1D1D1F] print:text-black mb-4">
            Top 5 Produtos Mais Vendidos
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[#D2D2D7] print:border-gray-400">
                <th className="text-left py-2 font-semibold text-[#86868B]">#</th>
                <th className="text-left py-2 font-semibold text-[#86868B]">Produto</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Qtd</th>
                <th className="text-right py-2 font-semibold text-[#86868B]">Receita</th>
              </tr>
            </thead>
            <tbody>
              {topProdutos.map(([produto, d], i) => (
                <tr key={produto} className="border-b border-[#E8E8ED] print:border-gray-200">
                  <td className="py-2 text-[#86868B]">{i + 1}</td>
                  <td className="py-2 font-medium text-[#1D1D1F] print:text-black">{produto}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{d.qty}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{fmt(d.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Gastos por Categoria */}
        <div className="print-section mb-8">
          <h3 className="text-lg font-bold text-[#1D1D1F] print:text-black mb-4">
            Gastos Operacionais por Categoria
          </h3>
          {categoriasOrdenadas.length === 0 ? (
            <p className="text-sm text-[#86868B]">Nenhum gasto operacional registrado no periodo.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-[#D2D2D7] print:border-gray-400">
                  <th className="text-left py-2 font-semibold text-[#86868B]">Categoria</th>
                  <th className="text-right py-2 font-semibold text-[#86868B]">Valor</th>
                  <th className="text-right py-2 font-semibold text-[#86868B]">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {categoriasOrdenadas.map(([cat, valor]) => (
                  <tr key={cat} className="border-b border-[#E8E8ED] print:border-gray-200">
                    <td className="py-2 font-medium text-[#1D1D1F] print:text-black">{cat}</td>
                    <td className="py-2 text-right text-red-600">{fmt(valor)}</td>
                    <td className="py-2 text-right text-[#86868B]">
                      {totalGastos > 0 ? ((valor / totalGastos) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#D2D2D7] print:border-gray-400 font-bold">
                  <td className="py-2 text-[#1D1D1F]">Total</td>
                  <td className="py-2 text-right text-red-700">{fmt(totalGastos)}</td>
                  <td className="py-2 text-right text-[#86868B]">100%</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Saldos Bancários */}
        {saldo && (
          <div className="print-section mb-8">
            <h3 className="text-lg font-bold text-[#1D1D1F] print:text-black mb-4">
              Saldos Bancarios (Ultimo registro do mes)
            </h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-[#D2D2D7] print:border-gray-400">
                  <th className="text-left py-2 font-semibold text-[#86868B]">Banco</th>
                  <th className="text-right py-2 font-semibold text-[#86868B]">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#E8E8ED]">
                  <td className="py-2 text-[#1D1D1F]">Itau</td>
                  <td className="py-2 text-right font-medium text-blue-700">{fmt(saldoItau)}</td>
                </tr>
                <tr className="border-b border-[#E8E8ED]">
                  <td className="py-2 text-[#1D1D1F]">Infinite Pay</td>
                  <td className="py-2 text-right font-medium text-purple-700">{fmt(saldoInf)}</td>
                </tr>
                <tr className="border-b border-[#E8E8ED]">
                  <td className="py-2 text-[#1D1D1F]">Mercado Pago</td>
                  <td className="py-2 text-right font-medium text-green-700">{fmt(saldoMP)}</td>
                </tr>
                <tr className="border-b border-[#E8E8ED]">
                  <td className="py-2 text-[#1D1D1F]">Especie</td>
                  <td className="py-2 text-right font-medium text-[#1D1D1F]">{fmt(saldoEsp)}</td>
                </tr>
                <tr className="border-t-2 border-[#D2D2D7] font-bold">
                  <td className="py-2 text-[#1D1D1F]">Total em Conta</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{fmt(saldoTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-[#86868B] print:text-gray-400 mt-12 pt-4 border-t border-[#E8E8ED] print:border-gray-200">
          TigraoImports — Relatorio gerado automaticamente pelo sistema
        </div>
      </div>
    </>
  );
}

function SummaryItem({ label, value, highlight, negative }: { label: string; value: string; highlight?: boolean; negative?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${highlight ? "border-green-200 bg-green-50 print:bg-white" : "border-[#E8E8ED] bg-[#F5F5F7] print:bg-white"}`}>
      <div className="text-xs text-[#86868B] print:text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-green-700" : negative ? "text-red-600" : "text-[#1D1D1F] print:text-black"}`}>
        {value}
      </div>
    </div>
  );
}
