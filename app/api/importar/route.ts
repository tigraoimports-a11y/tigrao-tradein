import { hojeBR } from "@/lib/date-utils";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

// DELETE — limpar tabela inteira
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await req.json();
  if (!table || !["vendas", "gastos", "estoque"].includes(table)) {
    return NextResponse.json({ error: "table must be vendas, gastos or estoque" }, { status: 400 });
  }

  // Deletar todos os registros (Supabase requer um filtro, usamos id > 0 via gte)
  const { error, count } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Limpou tabela", `Tabela: ${table}, Registros removidos: ${count ?? "N/A"}`, table).catch(() => {});

  return NextResponse.json({ ok: true, deleted: count });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table, rows, autoStatus } = await req.json();

  if (!table || !rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "table and rows required" }, { status: 400 });
  }

  if (!["vendas", "gastos", "estoque"].includes(table)) {
    return NextResponse.json({ error: "table must be vendas, gastos or estoque" }, { status: 400 });
  }

  // Se autoStatus=true e table=vendas, definir status_pagamento baseado na data
  // data < hoje = FINALIZADO, data = hoje = AGUARDANDO
  const hoje = hojeBR();
  const processedRows = (table === "vendas" && autoStatus)
    ? rows.map(r => ({
        ...r,
        status_pagamento: r.data < hoje ? "FINALIZADO" : "AGUARDANDO",
      }))
    : rows;

  // Whitelist de colunas por tabela — remove campos que não existem no schema
  const COLUMNS: Record<string, Set<string>> = {
    vendas: new Set(["data", "cliente", "origem", "tipo", "produto", "fornecedor", "custo", "preco_vendido", "banco", "forma", "recebimento", "qnt_parcelas", "parcelas", "bandeira", "local", "produto_na_troca", "sinal_antecipado", "banco_sinal", "status_pagamento", "is_dep_esp", "observacao"]),
    gastos: new Set(["data", "valor", "tipo", "categoria", "descricao", "banco", "forma", "observacao"]),
    estoque: new Set(["produto", "qnt", "quantidade", "custo_unitario", "categoria", "cor", "armazenamento", "status", "fornecedor", "observacao", "tipo", "bateria", "data_compra", "cliente"]),
  };

  const allowedCols = COLUMNS[table];
  const cleanedRows = allowedCols
    ? processedRows.map((row: Record<string, unknown>) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          if (allowedCols.has(k)) clean[k] = v;
        }
        return clean;
      })
    : processedRows;

  // Importar em lotes de 100
  const batchSize = 100;
  let imported = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < cleanedRows.length; i += batchSize) {
    const batch = cleanedRows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      errors.push({ row: i, error: error.message });
    } else {
      imported += batch.length;
    }
  }

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Importou dados", `Tabela: ${table}, Importados: ${imported}/${rows.length}`, table).catch(() => {});

  return NextResponse.json({ ok: true, imported, errors, total: rows.length });
}
