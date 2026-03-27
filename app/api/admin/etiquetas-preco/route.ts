import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — lista produtos do estoque com precos para gerar etiquetas de preco
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");

  // Buscar estoque
  let query = supabase
    .from("estoque")
    .select("id, produto, categoria, cor, custo_unitario, serial_no, imei, tipo, qnt")
    .gt("qnt", 0)
    .order("categoria")
    .order("produto");

  if (categoria) query = query.eq("categoria", categoria);

  const { data: estoqueData, error: estoqueError } = await query;
  if (estoqueError) return NextResponse.json({ error: estoqueError.message }, { status: 500 });

  // Buscar precos
  const { data: precosData } = await supabase
    .from("precos")
    .select("modelo, armazenamento, preco_pix, status, tipo")
    .neq("status", "esgotado");

  // Construir mapa de precos: modelo -> preco_pix (menor preco disponivel)
  const precosMap = new Map<string, number>();
  if (precosData) {
    for (const p of precosData) {
      const key = `${p.modelo} ${p.armazenamento}`.toUpperCase();
      if (!precosMap.has(key) || p.preco_pix < precosMap.get(key)!) {
        precosMap.set(key, p.preco_pix);
      }
      // Tambem mapear so pelo modelo
      const keyModelo = p.modelo.toUpperCase();
      if (!precosMap.has(keyModelo) || p.preco_pix < precosMap.get(keyModelo)!) {
        precosMap.set(keyModelo, p.preco_pix);
      }
    }
  }

  // Enriquecer estoque com preco de venda
  const produtos = (estoqueData || []).map((item) => {
    const nomeUp = (item.produto || "").toUpperCase();
    // Tentar match exato primeiro, depois parcial
    let precoVenda = precosMap.get(nomeUp) || null;
    if (!precoVenda) {
      // Tentar match parcial
      for (const [key, val] of precosMap.entries()) {
        if (nomeUp.includes(key) || key.includes(nomeUp)) {
          precoVenda = val;
          break;
        }
      }
    }
    return {
      ...item,
      preco_venda: precoVenda,
    };
  });

  return NextResponse.json({ data: produtos });
}
