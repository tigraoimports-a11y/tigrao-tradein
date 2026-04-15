// ============================================
// Tipos do sistema administrativo TigrãoImports
// ============================================

export type Origem = "ANUNCIO" | "RECOMPRA" | "INDICACAO" | "ATACADO" | "NAO_INFORMARAM" | "ENCOMENDA";
export type TipoVenda = "VENDA" | "UPGRADE" | "ATACADO";
export type Banco = "ITAU" | "INFINITE" | "MERCADO_PAGO" | "ESPECIE";
export type FormaPagamento = "PIX" | "CARTAO" | "DEBITO" | "ESPECIE" | "DINHEIRO" | "FIADO";
export type Recebimento = "D+0" | "D+1" | "FIADO" | "PARCELADO";
export type Bandeira = "VISA" | "MASTERCARD" | "ELO" | "AMEX";
export type TipoGasto = "SAIDA" | "ENTRADA" | "TRANSFERENCIA";

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
  entrada_fiado: number;
  fiado_parcelas: { valor: number; data: string; recebido: boolean }[];
  fiado_recebido?: boolean;
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
  nota_fiscal_url: string | null;
  notas: string | null;
  imei: string | null;
  serial_no: string | null;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  pessoa: string | null;
  cep: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  grupo_id: string | null;
  troca_produto: string | null;
  troca_cor: string | null;
  troca_bateria: string | null;
  troca_obs: string | null;
  troca_produto2: string | null;
  troca_cor2: string | null;
  troca_bateria2: string | null;
  troca_obs2: string | null;
  troca_imei: string | null;
  troca_serial: string | null;
  troca_grade: string | null;
  troca_caixa: string | null;
  troca_cabo: string | null;
  troca_fonte: string | null;
  troca_imei2: string | null;
  troca_serial2: string | null;
  troca_grade2: string | null;
  produto_na_troca2: number;
  // Entrega atacado cobrada à parte
  frete_valor: number | null;
  frete_recebido: boolean | null;
  frete_forma: string | null;
  frete_banco: string | null;
  reajustes: { valor: number; motivo: string; banco: string; data: string }[];
  // Brinde / Cortesia — não impacta faturamento nem lucro
  is_brinde: boolean;
  // Venda programada
  data_programada: string | null;
  // Crédito de lojista usado nesta venda
  credito_lojista_usado: number;
  // Código de rastreio dos Correios
  codigo_rastreio: string | null;
  // Histórico de pagamentos (vendas programadas com múltiplos pagamentos)
  pagamento_historia: { tipo: string; valor: number; data: string; forma: string; banco: string; obs?: string }[];
}

export interface Reajuste {
  id: string;
  created_at: string;
  data: string;
  cliente: string;
  motivo: string;
  valor: number;
  banco: string | null;
  observacao: string | null;
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
  grupo_id: string | null;
  pedido_fornecedor_id: string | null;
}

export interface PedidoFornecedorItem {
  categoria: string;
  produto: string;
  cor: string;
  qnt: number;
  custo_unitario: number;
  fornecedor: string;
  imei: string | null;
  serial_no: string | null;
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
  esp_especie_base?: number;
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
  d1_data?: string;
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
  // Campos extras para relatório completo
  faturamento: number;
  custoTotal: number;
  margemMedia: number;
  porOrigem: Record<string, { qty: number; receita: number }>;
  porTipo: Record<string, { qty: number; receita: number }>;
  upgradesHoje: number;
  gastosDetalhados: { categoria: string; descricao: string; valor: number; banco: string }[];
  totalGastos: number;
  pagFornecedores: { descricao: string; valor: number; banco: string }[];
  totalPagFornecedores: number;
  valorEstoque: number;
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
  faturamentoMes: number;
  // Fiado pendente
  fiadoPendente: { cliente: string; valor: number; data: string }[];
  totalFiado: number;
  // Estoque
  valorEstoque: number;
  valorACaminho: number;
  valorPendencias: number;
  capitalProdutos: number;
  // Patrimônio
  saldoBancarioTotal: number;
  patrimonioTotal: number;
  // É fim de semana?
  isFimDeSemana: boolean;
  // Créditos pendentes (para dias sem recebimento)
  creditosPendentes_itau: number;
  creditosPendentes_inf: number;
  creditosPendentes_mp: number;
  dataPendentes: string;
}

// Categorias comuns de gastos
export const CATEGORIAS_GASTO = [
  "ALIMENTACAO",
  "ANUNCIOS",
  "CORREIOS",
  "DEPOSITO ESPECIE",
  "DOACOES",
  "EQUIPAMENTOS",
  "ESTORNO",
  "FORNECEDOR",
  "GASTOS LOJA",
  "IMPOSTOS",
  "MARKETING",
  "SALARIO",
  "SISTEMAS",
  "TRANSPORTE",
  "TROCA",
  "OUTROS",
  "REEMBOLSO",
] as const;
