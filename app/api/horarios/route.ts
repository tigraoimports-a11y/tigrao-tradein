import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET público: retorna horários ativos pra um tipo (entrega/retirada) e dia da semana
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") || "entrega";
  const data = searchParams.get("data"); // YYYY-MM-DD

  // Determina se é sábado ou seg-sex
  let diaSemana = "seg_sex";
  if (data) {
    const d = new Date(data + "T12:00:00");
    const dow = d.getDay(); // 0=dom, 6=sab
    if (dow === 0) {
      return NextResponse.json({ horarios: [], msg: "Não atendemos aos domingos" });
    }
    if (dow === 6) diaSemana = "sabado";
  }

  const { data: rows, error } = await supabase
    .from("horarios_config")
    .select("horario")
    .eq("tipo", tipo)
    .eq("dia_semana", diaSemana)
    .eq("ativo", true)
    .order("horario");

  if (error) return NextResponse.json({ horarios: [], error: error.message });
  return NextResponse.json({ horarios: (rows || []).map(r => r.horario), diaSemana });
}
