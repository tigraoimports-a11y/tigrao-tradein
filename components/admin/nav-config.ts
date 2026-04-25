// Estrutura do menu lateral do admin. Extraido pra arquivo separado pra evitar
// circular imports (AdminNav.tsx importa de AdminShell.tsx que importa AdminNav).

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  pageKey: string; // granular permission key
  /**
   * Se preenchido, o item só aparece pros usuários listados (match por primeiro
   * nome, case-insensitive, sem acento). Usado pra features em teste que só o
   * dono/beta tester vê antes de liberar pra todo o admin.
   */
  betaPara?: string[];
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export const NAV: NavEntry[] = [
  { href: "/admin", label: "Dashboard", icon: "\u{1F4CA}", pageKey: "dashboard" },

  // Financeiro
  {
    label: "Financeiro", icon: "\u{1F4B0}",
    items: [
      { href: "/admin/vendas", label: "Vendas", icon: "\u{1F4B0}", pageKey: "vendas_ver" },
      { href: "/admin/clientes", label: "Cadastros", icon: "\u{1F465}", pageKey: "clientes" },
      { href: "/admin/gastos", label: "Gastos", icon: "\u{1F4E4}", pageKey: "gastos" },
      { href: "/admin/saldos", label: "Saldos", icon: "\u{1F3E6}", pageKey: "saldos" },
      { href: "/admin/bancos", label: "Bancos (Open Finance)", icon: "\u{1F517}", pageKey: "saldos" },
      { href: "/admin/recebiveis", label: "Recebiveis", icon: "\u{1F4B3}", pageKey: "recebiveis" },
      { href: "/admin/conciliacao", label: "Conciliacao", icon: "\u{1F50D}", pageKey: "conciliacao" },
      { href: "/admin/auditoria", label: "Auditoria", icon: "📋", pageKey: "saldos" },
      { href: "/admin/reconciliacao-sku", label: "Reconciliação SKU", icon: "\u{1F501}", pageKey: "saldos" },
      { href: "/admin/trocas", label: "Trocas", icon: "\u{1F504}", pageKey: "trocas" },
    ],
  },

  // Produtos
  {
    label: "Produtos", icon: "\u{1F4E6}",
    items: [
      { href: "/admin/estoque", label: "Estoque", icon: "\u{1F4E6}", pageKey: "estoque" },
      { href: "/admin/comprar-urgente", label: "Comprar Urgente", icon: "\u{1F6A8}", pageKey: "estoque" },
      { href: "/admin/giro-sku", label: "Velocidade de Giro", icon: "\u23F1\uFE0F", pageKey: "estoque" },
      { href: "/admin/produtos-funcionarios", label: "Produtos c/ Funcionários", icon: "\u{1F465}", pageKey: "produtos_funcionarios" },
      { href: "/admin/etiquetas", label: "Etiquetas", icon: "\u{1F3F7}\uFE0F", pageKey: "etiquetas" },
      { href: "/admin/etiquetas-preco", label: "Etiquetas de Preco", icon: "\u{1F4B0}", pageKey: "etiquetas_preco" },
      { href: "/admin/impressao-produtos", label: "Impressão Produtos", icon: "🖨️", pageKey: "impressao_produtos" },
      { href: "/admin/encomendas", label: "Encomendas", icon: "\u{1F6D2}", pageKey: "encomendas" },
      { href: "/admin/contrato-encomenda", label: "Contrato de Encomenda", icon: "\u{1F4C4}", pageKey: "contrato_encomenda" },
      { href: "/admin/clientes?tab=fornecedores", label: "Fornecedores", icon: "\u{1F91D}", pageKey: "fornecedores" },
      { href: "/admin/catalogo", label: "Configurações Produtos", icon: "⚙️", pageKey: "catalogo" },
    ],
  },

  // Operacional
  {
    label: "Operacional", icon: "\u{1F69A}",
    items: [
      { href: "/admin/entregas", label: "Entregas", icon: "\u{1F69A}", pageKey: "entregas" },
      { href: "/admin/avisos-clientes", label: "Avisos para Clientes", icon: "\u{1F4E2}", pageKey: "avisos_clientes" },
      { href: "/admin/calculadora-taxas", label: "Calculadora Taxas", icon: "\u{1F4F1}", pageKey: "calculadora_taxas" },
      { href: "/admin/orcamento", label: "Gerador de Orcamentos", icon: "\u{1F4B0}", pageKey: "orcamento" },
      { href: "/admin/calculadora", label: "Calculadora de Encomendas", icon: "\u{1F9EE}", pageKey: "calculadora" },
      { href: "/admin/operacoes", label: "Operacoes", icon: "\u{1F4CB}", pageKey: "operacoes" },
      { href: "/admin/gerar-link", label: "Link de Compra", icon: "\u{1F517}", pageKey: "gerar_link" },
    ],
  },

  // Site
  {
    label: "Site", icon: "\u{1F310}",
    items: [
      { href: "/admin/mostruario", label: "Mostruario", icon: "\u{1F5BC}\uFE0F", pageKey: "mostruario" },
      { href: "/admin/simulacoes", label: "Simulacoes", icon: "\u{1F4F1}", pageKey: "simulacoes" },
      { href: "/admin/configuracoes/site", label: "Configuração do Site", icon: "\u{1F3A8}", pageKey: "configuracoes", betaPara: ["andre", "nicolas"] },
      { href: "/admin/instagram", label: "Instagram", icon: "\u{1F4F8}", pageKey: "instagram", betaPara: ["andre", "nicolas"] },
      { href: "/admin/precos", label: "Alteração de Preços", icon: "\u{1F3F7}\uFE0F", pageKey: "precos" },
      { href: "/admin/usados", label: "Precos Trade-In", icon: "\u{1F4B0}", pageKey: "tradein_precos" },
      { href: "/admin/analytics", label: "Funil Trade-In", icon: "\u{1F4C8}", pageKey: "funil_tradein" },
    ],
  },

  // Analytics
  {
    label: "Analytics", icon: "\u{1F4CA}",
    items: [
      { href: "/admin/relatorios", label: "Relatorios", icon: "\u{1F4CB}", pageKey: "relatorios" },
      { href: "/admin/rastreio", label: "Rastreio Produto", icon: "\u{1F50D}", pageKey: "rastreio" },
      { href: "/admin/analytics-vendas", label: "Analytics Vendas", icon: "\u{1F4CA}", pageKey: "analytics_vendas" },
      { href: "/admin/margem-sku", label: "Margem por SKU", icon: "\u{1F4B0}", pageKey: "analytics_vendas" },
      { href: "/admin/mapa-vendas", label: "Mapa de Vendas", icon: "\u{1F5FA}\uFE0F", pageKey: "mapa_vendas" },
      { href: "/admin/sazonalidade", label: "Sazonalidade", icon: "\u{1F324}\uFE0F", pageKey: "sazonalidade" },
    ],
  },

  // Sistema
  {
    label: "Sistema", icon: "\u2699\uFE0F",
    items: [
      { href: "/admin/ia", label: "Assistente IA", icon: "\u{1F916}", pageKey: "ia" },
      { href: "/admin/taxas", label: "Taxas Maquinas", icon: "\u{1F4B3}", pageKey: "taxas" },
      { href: "/admin/migrations", label: "Migrations", icon: "\u{1F5C4}\uFE0F", pageKey: "migrations" },
      { href: "/admin/log", label: "Log de Atividades", icon: "\u{1F4CB}", pageKey: "log" },
      { href: "/admin/usuarios", label: "Usuarios", icon: "\u{1F465}", pageKey: "usuarios" },
      { href: "/admin/configuracoes", label: "Configuracoes", icon: "⚙️", pageKey: "configuracoes" },
    ],
  },
];
