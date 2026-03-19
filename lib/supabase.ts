import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url) throw new Error("SUPABASE_URL not configured");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Backwards-compatible export — lazy getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export interface Simulacao {
  nome: string;
  whatsapp: string;
  instagram?: string;
  modeloNovo: string;
  storageNovo: string;
  precoNovo: number;
  modeloUsado: string;
  storageUsado: string;
  avaliacaoUsado: number;
  diferenca: number;
  status: "GOSTEI" | "SAIR";
  formaPagamento?: string;
  condicaoLinhas?: string[];
  vendedor?: string;
}

// Keep backwards compat
export type LeadSaiu = Simulacao;
