import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

/**
 * GET /api/admin/funcionarios-list
 * Retorna lista de funcionarios (nomes distintos) baseada nos vinculos
 * ja registrados em produtos_funcionarios. Usado pra autocomplete em
 * Gastos (SALARIO) e Cadastro de Produto.
 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("produtos_funcionarios")
    .select("funcionario")
    .not("funcionario", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const set = new Set<string>();
  for (const r of data ?? []) {
    const n = (r.funcionario || "").trim();
    if (n) set.add(n.toUpperCase());
  }
  const funcionarios = [...set].sort().map((nome) => ({ nome, tag: "TIGRAO" }));

  return NextResponse.json({ funcionarios });
}
