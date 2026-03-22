import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

interface CsvRow {
  cliente: string;
  cep: string | null;
  cpf: string | null;
  data: string; // YYYY-MM-DD
  produto: string;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = (await req.json()) as { rows: CsvRow[] };
  if (!rows?.length) return NextResponse.json({ error: "rows required" }, { status: 400 });

  // Buscar todas vendas de março 2026
  const { data: vendas, error } = await supabase
    .from("vendas")
    .select("id, cliente, data, produto, cpf, cep")
    .gte("data", "2026-03-01")
    .lte("data", "2026-03-31");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vendas?.length) return NextResponse.json({ error: "Nenhuma venda encontrada em março" }, { status: 404 });

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  const notFoundList: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.cep && !row.cpf) { skipped++; continue; }

    // Normalizar para match
    const clienteNorm = row.cliente.toUpperCase().trim();
    const produtoNorm = row.produto.toUpperCase().trim();

    // Encontrar venda correspondente (cliente + data + produto)
    const match = vendas.find(v => {
      const vc = (v.cliente || "").toUpperCase().trim();
      const vp = (v.produto || "").toUpperCase().trim();
      const vd = v.data; // já em YYYY-MM-DD
      return vc === clienteNorm && vd === row.data && vp === produtoNorm;
    });

    if (!match) {
      // Tentar match mais flexível: cliente + data (sem produto)
      const matchFlexivel = vendas.find(v => {
        const vc = (v.cliente || "").toUpperCase().trim();
        const vd = v.data;
        return vc === clienteNorm && vd === row.data;
      });

      if (matchFlexivel) {
        // Match por cliente + data
        const updateFields: Record<string, string> = {};
        if (row.cpf && !matchFlexivel.cpf) updateFields.cpf = row.cpf;
        if (row.cep && !matchFlexivel.cep) updateFields.cep = row.cep;

        if (Object.keys(updateFields).length > 0) {
          const { error: updateErr } = await supabase
            .from("vendas")
            .update(updateFields)
            .eq("id", matchFlexivel.id);
          if (updateErr) {
            errors.push(`${row.cliente} (${row.data}): ${updateErr.message}`);
          } else {
            updated++;
          }
        } else {
          skipped++; // já tem CPF/CEP
        }
      } else {
        notFound++;
        if (notFoundList.length < 20) notFoundList.push(`${row.cliente} - ${row.data} - ${row.produto}`);
      }
      continue;
    }

    // Atualizar CPF e CEP (só se não tiver preenchido)
    const updateFields: Record<string, string> = {};
    if (row.cpf && !match.cpf) updateFields.cpf = row.cpf;
    if (row.cep && !match.cep) updateFields.cep = row.cep;

    if (Object.keys(updateFields).length === 0) {
      skipped++; // já tem CPF/CEP
      continue;
    }

    const { error: updateErr } = await supabase
      .from("vendas")
      .update(updateFields)
      .eq("id", match.id);

    if (updateErr) {
      errors.push(`${row.cliente} (${row.data}): ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
    skipped,
    notFound,
    notFoundList,
    errors: errors.slice(0, 20),
    vendasNoBanco: vendas.length,
  });
}
