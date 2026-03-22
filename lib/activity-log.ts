import { supabase } from "@/lib/supabase";

export async function logActivity(
  usuario: string,
  acao: string,
  detalhes?: string,
  entidade?: string,
  entidade_id?: string
) {
  try {
    await supabase.from("activity_log").insert({
      usuario,
      acao,
      detalhes: detalhes || null,
      entidade: entidade || null,
      entidade_id: entidade_id || null,
    });
  } catch (err) {
    console.error("Erro ao registrar activity_log:", err);
  }
}
