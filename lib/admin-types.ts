// ============================================
// Tipos do sistema administrativo TigrãoImports
// ============================================

export type Origem = "ANUNCIO" | "RECOMPRA" | "INDICACAO" | "ATACADO";
export type TipoVenda = "VENDA" | "UPGRADE" | "ATACADO";
export type Banco = "ITAU" | "INFINITE" | "MERCADO_PAGO" | "ESPECIE";
export type FormaPagamento = "PIX" | "CARTAO" | "ESPECIE" | "DINHEIRO" | "FIADO";
export type Recebimento = "D+0" | "D+1" | "FIADO" | "PARCELADO";
export type Bandeira = "VISA" | "MASTERCARD" | "ELO" | "AMEX";
export type TipoGasto = "SAIDA" | "ENTRADA";

export interface Venda {
  id: string;
  created_at: string;
  data: string;
  cliente: string;
  origem: Origem;
  tipo: TipoVenda;
  produto: string;
  fornecedor: string | null;
  custo: number;
  preco_vendido: number;
  banco: Banco;
  forma: FormaPagamento;
  recebimento: Recebimento;
  lucro: number;
  margem_pct: number;
  sinal_antecipado: number;
  banco_sinal: string | null;
  local: string | null;
  produto_na_troca: string | null;
  entrada_pix: number;
  entrada_especie: number;
  banco_pix: string | null;
  banco_2nd: string | null;
  qnt_parcelas: number | null;
  bandeira: Bandeira | null;
  valor_comprovante: number | null;
  banco_alt: string | null;
  parc_alt: number | null;
  band_alt: string | null;
  comp_alt: number | null;
  status_pagamento: string;
  comprovante_url: string | null;
  notas: string | null;
  imei: string | null;
}

export interface Reajuste {
  id: string;
  created_at: string;
  data: string;
  cliente: string;
  motivo: string;
  valor: number;
  banco: string | null;
  venda_ref: string | null;
}

export interface Gasto {
  id: string;
  created_at: string;
  data: string;
  tipo: TipoGasto;
  hora: string | null;
  categoria: string;
  descricao: string | null;
  valor: number;
  banco: Banco | null;
  observacao: string | null;
  is_dep_esp: boolean;
}

export interface SaldoBancario {
  id: string;
  created_at: string;
  data: string;
  itau_base: number;
  inf_base: number;
  mp_base: number;
  esp_itau: number;
  esp_inf: number;
  esp_mp: number;
  esp_especie: number;
}

// Relatórios
export interface DashboardParcial {
  data: string;
  totalVendas: number;
  receitaBruta: number;
  lucroTotal: number;
  ticketMedio: number;
  margemMedia: number;
  porOrigem: Record<string, { qty: number; receita: number; lucro: number }>;
  porTipo: Record<string, { qty: number; receita: number; lucro: number }>;
  vendasDoDia: Venda[];
}

export interface ReportNoite {
  data: string;
  // Bases da manhã
  itau_base: number;
  inf_base: number;
  mp_base: number;
  // Entradas D+0 (PIX/dinheiro/débito de hoje)
  pix_itau: number;
  pix_inf: number;
  pix_mp: number;
  pix_esp: number;
  // Créditos D+1 que entraram hoje
  d1_itau: number;
  d1_inf: number;
  d1_mp: number;
  // Reajustes
  reaj_itau: number;
  reaj_inf: number;
  reaj_mp: number;
  reaj_esp: number;
  // Saídas (gastos)
  saiu_itau: number;
  saiu_inf: number;
  saiu_mp: number;
  saiu_esp: number;
  // Saldo final (esperado)
  esp_itau: number;
  esp_inf: number;
  esp_mp: number;
  esp_especie: number;
  // Resumo do dia
  totalVendas: number;
  lucroTotal: number;
}

export interface ReportManha {
  data: string;
  // Fechamento da noite anterior
  esp_itau_ontem: number;
  esp_inf_ontem: number;
  esp_mp_ontem: number;
  esp_especie_ontem: number;
  // Créditos D+1 que entram hoje
  creditos_itau: number;
  creditos_inf: number;
  creditos_mp: number;
  // Saldo esperado
  saldo_itau: number;
  saldo_inf: number;
  saldo_mp: number;
  saldo_especie: number;
  // Vendas do mês até agora
  vendasMes: number;
  lucroMes: number;
}

// Categorias comuns de gastos
export const CATEGORIAS_GASTO = [
  "ALIMENTACAO",
  "GASTOS LOJA",
  "FORNECEDOR",
  "TRANSPORTE",
  "MARKETING",
  "IMPOSTOS",
  "EQUIPAMENTOS",
  "OUTROS",
] as const;
