import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

interface ViaCepResult {
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Buscar vendas de março que tem CEP mas não tem bairro
  const { data: vendas, error } = await supabase
    .from("vendas")
    .select("id, cep, bairro, cidade, uf")
    .gte("data", "2026-03-01")
    .lte("data", "2026-03-31")
    .not("cep", "is", null)
    .neq("cep", "");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vendas?.length) return NextResponse.json({ error: "Nenhuma venda com CEP encontrada" }, { status: 404 });

  // Filtrar só as que não tem bairro preenchido
  const semBairro = vendas.filter(v => !v.bairro || v.bairro.trim() === "");

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Cache para não repetir o mesmo CEP
  const cache: Record<string, ViaCepResult | null> = {};

  for (const v of semBairro) {
    const cep = v.cep?.replace(/\D/g, "") || "";
    if (cep.length !== 8) { skipped++; continue; }

    // Buscar no cache ou no ViaCEP
    if (!(cep in cache)) {
      cache[cep] = await fetchViaCep(cep);
      // Rate limit: esperar 100ms entre requests
      await new Promise(r => setTimeout(r, 100));
    }

    const info = cache[cep];
    if (!info) { failed++; continue; }

    const updateFields: Record<string, string> = {};
    if (info.bairro) updateFields.bairro = info.bairro;
    if (info.localidade) updateFields.cidade = info.localidade;
    if (info.uf) updateFields.uf = info.uf;

    if (Object.keys(updateFields).length === 0) { skipped++; continue; }

    const { error: updateErr } = await supabase
      .from("vendas")
      .update(updateFields)
      .eq("id", v.id);

    if (updateErr) {
      errors.push(`${v.id}: ${updateErr.message}`);
      failed++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    totalComCep: vendas.length,
    semBairro: semBairro.length,
    updated,
    failed,
    skipped,
    cepsUnicos: Object.keys(cache).length,
    errors: errors.slice(0, 10),
  });
}
