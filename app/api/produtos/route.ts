import { NextRequest, NextResponse } from "next/server";
import { fetchNewProducts } from "@/lib/sheets";
import { rateLimitPublic } from "@/lib/rate-limit";
import type { NewProduct } from "@/lib/types";

const FALLBACK_PRODUCTS: NewProduct[] = [
  { modelo: "iPhone 16 Pro Max", armazenamento: "256GB", precoPix: 8897 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "512GB", precoPix: 10797 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "1TB", precoPix: 11997 },
  { modelo: "iPhone 16", armazenamento: "128GB", precoPix: 4697 },
  { modelo: "iPhone 16", armazenamento: "256GB", precoPix: 5797 },
];

export async function GET(req: NextRequest) {
  const limited = rateLimitPublic(req);
  if (limited) return limited;
  // Tenta Supabase primeiro (painel de preços)
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase
        .from("precos")
        .select("modelo, armazenamento, preco_pix, status, tipo, categoria")
        .order("modelo")
        .order("armazenamento");

      if (data && data.length > 0) {
        const products: NewProduct[] = data
          .filter((r) => r.status !== "esgotado" && (r.tipo === "TRADEIN" || r.tipo === "AMBOS" || r.tipo == null))
          .map((r) => ({
            modelo: r.modelo,
            armazenamento: r.armazenamento,
            precoPix: r.preco_pix,
            categoria: r.categoria || null,
          }));
        return NextResponse.json(products);
      }
    }
  } catch {
    // fallthrough para Sheets
  }

  // Fallback: Google Sheets
  try {
    const products = await fetchNewProducts();
    return NextResponse.json(products);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return NextResponse.json(FALLBACK_PRODUCTS);
  }
}
