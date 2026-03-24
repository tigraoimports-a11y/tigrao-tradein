// app/api/admin/mapa-vendas/route.ts — Sales geography analytics
import { NextRequest, NextResponse } from "next/server";

// Lookup table: common Rio de Janeiro bairros with approximate center coordinates
const BAIRRO_COORDS: Record<string, { lat: number; lng: number }> = {
  "Barra da Tijuca": { lat: -23.0003, lng: -43.3658 },
  "Recreio dos Bandeirantes": { lat: -23.0247, lng: -43.4637 },
  "Jacarepagua": { lat: -22.9494, lng: -43.3506 },
  "Copacabana": { lat: -22.9711, lng: -43.1863 },
  "Ipanema": { lat: -22.9838, lng: -43.2096 },
  "Leblon": { lat: -22.9841, lng: -43.2247 },
  "Botafogo": { lat: -22.9519, lng: -43.1832 },
  "Flamengo": { lat: -22.9326, lng: -43.1765 },
  "Tijuca": { lat: -22.9253, lng: -43.2318 },
  "Vila Isabel": { lat: -22.9235, lng: -43.2431 },
  "Meier": { lat: -22.9024, lng: -43.2813 },
  "Centro": { lat: -22.9068, lng: -43.1729 },
  "Lapa": { lat: -22.9134, lng: -43.1815 },
  "Laranjeiras": { lat: -22.9383, lng: -43.1891 },
  "Catete": { lat: -22.9264, lng: -43.1776 },
  "Gloria": { lat: -22.9226, lng: -43.1759 },
  "Gavea": { lat: -22.9812, lng: -43.2334 },
  "Jardim Botanico": { lat: -22.9666, lng: -43.2233 },
  "Lagoa": { lat: -22.9718, lng: -43.2112 },
  "Sao Conrado": { lat: -23.0015, lng: -43.2740 },
  "Humaita": { lat: -22.9546, lng: -43.1978 },
  "Urca": { lat: -22.9560, lng: -43.1683 },
  "Santa Teresa": { lat: -22.9243, lng: -43.1919 },
  "Cosme Velho": { lat: -22.9379, lng: -43.1923 },
  "Maracana": { lat: -22.9116, lng: -43.2302 },
  "Grajau": { lat: -22.9204, lng: -43.2598 },
  "Andarai": { lat: -22.9232, lng: -43.2467 },
  "Penha": { lat: -22.8442, lng: -43.2752 },
  "Olaria": { lat: -22.8495, lng: -43.2661 },
  "Ramos": { lat: -22.8501, lng: -43.2541 },
  "Bonsucesso": { lat: -22.8559, lng: -43.2497 },
  "Ilha do Governador": { lat: -22.8168, lng: -43.2113 },
  "Madureira": { lat: -22.8739, lng: -43.3393 },
  "Bangu": { lat: -22.8740, lng: -43.4654 },
  "Campo Grande": { lat: -22.9019, lng: -43.5601 },
  "Santa Cruz": { lat: -22.9119, lng: -43.6883 },
  "Guaratiba": { lat: -23.0548, lng: -43.5922 },
  "Realengo": { lat: -22.8693, lng: -43.4223 },
  "Padre Miguel": { lat: -22.8790, lng: -43.4403 },
  "Senador Camara": { lat: -22.8795, lng: -43.4500 },
  "Del Castilho": { lat: -22.8826, lng: -43.2745 },
  "Benfica": { lat: -22.8881, lng: -43.2359 },
  "Sao Cristovao": { lat: -22.8978, lng: -43.2192 },
  "Engenho Novo": { lat: -22.9031, lng: -43.2627 },
  "Todos os Santos": { lat: -22.8969, lng: -43.2811 },
  "Cachambi": { lat: -22.8961, lng: -43.2724 },
  "Abolição": { lat: -22.8962, lng: -43.2948 },
  "Piedade": { lat: -22.8896, lng: -43.3037 },
  "Cascadura": { lat: -22.8801, lng: -43.3385 },
  "Vicente de Carvalho": { lat: -22.8586, lng: -43.3062 },
  "Irajá": { lat: -22.8348, lng: -43.3283 },
  "Colégio": { lat: -22.8361, lng: -43.3183 },
  "Taquara": { lat: -22.9225, lng: -43.3715 },
  "Pechincha": { lat: -22.9384, lng: -43.3571 },
  "Freguesia": { lat: -22.9330, lng: -43.3481 },
  "Anil": { lat: -22.9383, lng: -43.3450 },
  "Curicica": { lat: -22.9491, lng: -43.3753 },
  "Gardenia Azul": { lat: -22.9541, lng: -43.3687 },
  "Itanhanga": { lat: -22.9870, lng: -43.3118 },
  "Vargem Grande": { lat: -23.0115, lng: -43.5008 },
  "Vargem Pequena": { lat: -22.9905, lng: -43.4628 },
  "Camorim": { lat: -22.9785, lng: -43.4304 },
  "Grumari": { lat: -23.0481, lng: -43.5203 },
  "Joá": { lat: -23.0069, lng: -43.2953 },
  // Niterói
  "Niteroi": { lat: -22.8833, lng: -43.1036 },
  "Icarai": { lat: -22.8999, lng: -43.1105 },
  "Ingá": { lat: -22.8984, lng: -43.1220 },
  "São Francisco": { lat: -22.8894, lng: -43.0994 },
  "Charitas": { lat: -22.9308, lng: -43.0972 },
  "Itaipu": { lat: -22.9635, lng: -43.0557 },
  "Piratininga": { lat: -22.9421, lng: -43.0753 },
  "Camboinhas": { lat: -22.9710, lng: -43.0465 },
  "Pendotiba": { lat: -22.8700, lng: -43.1010 },
  // Baixada Fluminense
  "Nova Iguacu": { lat: -22.7556, lng: -43.4503 },
  "Duque de Caxias": { lat: -22.7856, lng: -43.3117 },
  "São João de Meriti": { lat: -22.8058, lng: -43.3728 },
  "Nilópolis": { lat: -22.8058, lng: -43.4187 },
  "Belford Roxo": { lat: -22.7644, lng: -43.3994 },
  "Mesquita": { lat: -22.8022, lng: -43.4222 },
  // Zona Sul / other
  "Leme": { lat: -22.9638, lng: -43.1714 },
  "Vidigal": { lat: -22.9929, lng: -43.2337 },
  "Rocinha": { lat: -22.9879, lng: -43.2468 },
};

function normalizeBairroName(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findBairroCoords(nome: string): { lat: number; lng: number } | null {
  const normalized = normalizeBairroName(nome);
  for (const [key, coords] of Object.entries(BAIRRO_COORDS)) {
    if (normalizeBairroName(key) === normalized) return coords;
  }
  // Partial match fallback
  for (const [key, coords] of Object.entries(BAIRRO_COORDS)) {
    const nk = normalizeBairroName(key);
    if (nk.includes(normalized) || normalized.includes(nk)) return coords;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";

  // Build date filter
  let dateFilter: string | null = null;
  if (range === "month") {
    const now = new Date();
    dateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  } else if (range !== "all") {
    const days = parseInt(range, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    dateFilter = since.toISOString().split("T")[0];
  }

  try {
    let query = supabase
      .from("vendas")
      .select("*")
      .order("data", { ascending: false });

    const { data: rawVendas, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtrar no JS para evitar bug do .neq() excluir NULLs no Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredVendas = (rawVendas ?? []).filter((v: any) => {
      if (v.status_pagamento === "CANCELADO") return false;
      if (v.tipo === "ATACADO") return false;
      // Filtrar CEPs inválidos
      const cep = (v.cep || "").replace(/\D/g, "");
      if (cep === "00000000") return false;
      // Filtrar por data se necessário
      if (dateFilter && v.data < dateFilter) return false;
      return true;
    });

    const rows = filteredVendas as {
      id: string;
      data: string;
      cliente: string;
      preco_vendido: number;
      custo: number;
      lucro: number;
      bairro: string | null;
      cidade: string | null;
      uf: string | null;
    }[];

    // --- Aggregate by bairro (top 20) ---
    const porBairro: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const b = (v.bairro || "").trim() || "Nao informado";
      if (!porBairro[b]) porBairro[b] = { qty: 0, receita: 0, lucro: 0 };
      porBairro[b].qty++;
      porBairro[b].receita += Number(v.preco_vendido || 0);
      porBairro[b].lucro += Number(v.lucro || 0);
    }

    const bairros = Object.entries(porBairro)
      .map(([nome, d]) => {
        const coords = findBairroCoords(nome);
        return {
          nome,
          qty: d.qty,
          receita: d.receita,
          lucro: d.lucro,
          ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);

    // --- Aggregate by cidade (top 10) ---
    const porCidade: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const c = (v.cidade || "").trim() || "Nao informado";
      if (!porCidade[c]) porCidade[c] = { qty: 0, receita: 0, lucro: 0 };
      porCidade[c].qty++;
      porCidade[c].receita += Number(v.preco_vendido || 0);
      porCidade[c].lucro += Number(v.lucro || 0);
    }

    const cidades = Object.entries(porCidade)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // --- Aggregate by UF ---
    const porUF: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const u = (v.uf || "").trim().toUpperCase() || "N/A";
      if (!porUF[u]) porUF[u] = { qty: 0, receita: 0, lucro: 0 };
      porUF[u].qty++;
      porUF[u].receita += Number(v.preco_vendido || 0);
      porUF[u].lucro += Number(v.lucro || 0);
    }

    const estados = Object.entries(porUF)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    // --- Top clients by volume ---
    const porCliente: Record<string, { qty: number; total: number; lucro: number; lastDate: string }> = {};
    for (const v of rows) {
      const cli = (v.cliente || "").trim().toUpperCase();
      if (!cli) continue;
      if (!porCliente[cli]) porCliente[cli] = { qty: 0, total: 0, lucro: 0, lastDate: "" };
      porCliente[cli].qty++;
      porCliente[cli].total += Number(v.preco_vendido || 0);
      porCliente[cli].lucro += Number(v.lucro || 0);
      if (v.data > porCliente[cli].lastDate) porCliente[cli].lastDate = v.data;
    }

    const topClientes = Object.entries(porCliente)
      .map(([nome, d]) => ({
        nome,
        compras: d.qty,
        total: d.total,
        lucro: d.lucro,
        ultimaCompra: d.lastDate,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // --- Day of week analysis ---
    const diasSemana = [0, 0, 0, 0, 0, 0, 0];
    const receitaDia = [0, 0, 0, 0, 0, 0, 0];
    for (const v of rows) {
      if (!v.data) continue;
      const [y, m, d] = v.data.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      diasSemana[dow]++;
      receitaDia[dow] += Number(v.preco_vendido || 0);
    }

    const NOMES_DIAS = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const porDiaSemana = NOMES_DIAS.map((nome, i) => ({
      dia: nome,
      vendas: diasSemana[i],
      receita: receitaDia[i],
    }));

    // --- Totals ---
    const totalVendas = rows.length;
    const totalReceita = rows.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const totalLucro = rows.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const ticketMedio = totalVendas > 0 ? Math.round(totalReceita / totalVendas) : 0;

    return NextResponse.json({
      totalVendas,
      totalReceita,
      totalLucro,
      ticketMedio,
      bairros,
      cidades,
      estados,
      topClientes,
      porDiaSemana,
    });
  } catch (err) {
    console.error("Erro mapa-vendas:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
