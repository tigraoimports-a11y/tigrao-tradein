// app/api/admin/sku/sugerir/route.ts
// Endpoint que recebe os dados de um produto e retorna o SKU canonico
// sugerido. Util pra UI mostrar o SKU em tempo real (ex: enquanto admin
// digita um novo item de estoque, mostrar "vai virar IPHONE-17-PRO-256...").
//
// Uso:
//   POST { produto, categoria, cor?, observacao?, tipo? } → SkuResult
//   GET  ?produto=...&categoria=...&cor=...               → SkuResult

import { NextRequest, NextResponse } from "next/server";
import { gerarSku, type ProdutoInput } from "@/lib/sku";

export const dynamic = "force-dynamic";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function processarInput(input: ProdutoInput) {
  if (!input?.produto || typeof input.produto !== "string") {
    return NextResponse.json({ error: "campo 'produto' obrigatorio" }, { status: 400 });
  }
  const result = gerarSku({
    produto: input.produto,
    categoria: input.categoria || "",
    cor: input.cor ?? null,
    observacao: input.observacao ?? null,
    tipo: input.tipo ?? null,
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: ProdutoInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }
  return processarInput(body);
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  return processarInput({
    produto: sp.get("produto") || "",
    categoria: sp.get("categoria") || "",
    cor: sp.get("cor"),
    observacao: sp.get("observacao"),
    tipo: sp.get("tipo"),
  });
}
