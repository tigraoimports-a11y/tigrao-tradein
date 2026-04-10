import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET público: retorna config de categorias do trade-in (modo + ativo)
export async function GET() {
  const { data, error } = await supabase
    .from("tradein_categoria_config")
    .select("categoria, modo, ativo");
  if (error) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: data || [] });
}
