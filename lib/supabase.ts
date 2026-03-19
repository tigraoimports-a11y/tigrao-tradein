import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — only created on first actual use at runtime
let _instance: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_instance) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    _instance = createClient(url, key);
  }
  return _instance;
}

export const getSupabase = getInstance;

// Backwards-compatible named export using getter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient = new Proxy({} as any, {
  get(_, prop, receiver) {
    const real = getInstance();
    const val = Reflect.get(real, prop, receiver);
    return typeof val === "function" ? val.bind(real) : val;
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
