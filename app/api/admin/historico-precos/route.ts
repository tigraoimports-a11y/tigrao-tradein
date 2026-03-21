import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const produto = searchParams.get("produto");
  const fornecedor = searchParams.get("fornecedor");
  const meses = parseInt(searchParams.get("meses") || "3") || 3;

  // Calculate date range
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - meses);
  const startStr = startDate.toISOString().split("T")[0];

  // Query estoque entries with fornecedor and custo_unitario
  let query = supabase
    .from("estoque")
    .select("id, produto, fornecedor, custo_unitario, data_compra, qnt, cor, categoria, created_at")
    .not("fornecedor", "is", null)
    .gt("custo_unitario", 0)
    .gte("data_compra", startStr)
    .order("data_compra", { ascending: true });

  if (produto) query = query.ilike("produto", `%${produto}%`);
  if (fornecedor) query = query.eq("fornecedor", fornecedor);

  const { data: estoqueData, error: estoqueErr } = await query;

  // Also query estoque_log for price changes
  let logQuery = supabase
    .from("estoque_log")
    .select("*")
    .eq("campo", "custo_unitario")
    .gte("created_at", startStr)
    .order("created_at", { ascending: true });

  if (produto) logQuery = logQuery.ilike("produto_nome", `%${produto}%`);

  const { data: logData } = await logQuery;

  // Also check reajustes table
  let reajQuery = supabase
    .from("reajustes")
    .select("*")
    .gte("created_at", startStr)
    .order("created_at", { ascending: true });

  if (produto) reajQuery = reajQuery.ilike("produto", `%${produto}%`);

  const { data: reajData } = await reajQuery;

  if (estoqueErr) return NextResponse.json({ error: estoqueErr.message }, { status: 500 });

  // Get unique products and suppliers
  const items = estoqueData ?? [];
  const products = [...new Set(items.map((i) => i.produto))].sort();
  const suppliers = [...new Set(items.map((i) => i.fornecedor).filter(Boolean))].sort();

  // Group by month + supplier + product
  const monthLabels: string[] = [];
  const monthKeys: string[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (meses - 1 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(key);
    monthLabels.push(d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }));
  }

  // Build datasets: group by supplier
  const supplierData: Record<string, Record<string, { total: number; count: number }>> = {};
  for (const item of items) {
    const sup = item.fornecedor || "Desconhecido";
    if (!supplierData[sup]) supplierData[sup] = {};
    const date = item.data_compra || (item.created_at ? item.created_at.split("T")[0] : null);
    if (!date) continue;
    const monthKey = date.substring(0, 7); // YYYY-MM
    if (!supplierData[sup][monthKey]) supplierData[sup][monthKey] = { total: 0, count: 0 };
    supplierData[sup][monthKey].total += item.custo_unitario;
    supplierData[sup][monthKey].count += 1;
  }

  // Format datasets for chart
  const COLORS = ["#E8740E", "#3498DB", "#2ECC71", "#9B59B6", "#E74C3C", "#F39C12", "#1ABC9C", "#34495E"];
  const datasets = Object.entries(supplierData).map(([supplier, months], idx) => ({
    supplier,
    color: COLORS[idx % COLORS.length],
    prices: monthKeys.map((mk) => {
      const d = months[mk];
      return d ? Math.round(d.total / d.count) : null;
    }),
  }));

  // Stats
  const allPrices = items.map((i) => i.custo_unitario);
  const stats = {
    current: allPrices.length > 0 ? allPrices[allPrices.length - 1] : 0,
    lowest: allPrices.length > 0 ? Math.min(...allPrices) : 0,
    highest: allPrices.length > 0 ? Math.max(...allPrices) : 0,
    avg: allPrices.length > 0 ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0,
    trend: allPrices.length >= 2 ? (allPrices[allPrices.length - 1] > allPrices[0] ? "up" : allPrices[allPrices.length - 1] < allPrices[0] ? "down" : "stable") : "stable",
  };

  // Detail table: individual purchase entries
  const details = items.map((i) => ({
    data: i.data_compra || (i.created_at ? i.created_at.split("T")[0] : ""),
    fornecedor: i.fornecedor,
    produto: i.produto,
    cor: i.cor,
    custo: i.custo_unitario,
    qnt: i.qnt,
  })).sort((a, b) => b.data.localeCompare(a.data));

  return NextResponse.json({
    labels: monthLabels,
    datasets,
    products,
    suppliers,
    stats,
    details,
    reajustes: reajData ?? [],
    logs: (logData ?? []).slice(0, 50),
  });
}
