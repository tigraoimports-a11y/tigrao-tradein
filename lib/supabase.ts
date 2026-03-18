import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

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
}

// Keep backwards compat
export type LeadSaiu = Simulacao;
