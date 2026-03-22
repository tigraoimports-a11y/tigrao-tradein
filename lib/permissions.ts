// Granular per-page permissions system
// Admin always has full access. Other users check their permissoes array.

/** All available page keys grouped by category */
export const PAGE_GROUPS: { label: string; pages: { key: string; label: string }[] }[] = [
  {
    label: "Financeiro",
    pages: [
      { key: "dashboard", label: "Dashboard" },
      { key: "gastos", label: "Gastos" },
      { key: "saldos", label: "Saldos" },
      { key: "recebiveis", label: "Recebiveis" },
      { key: "conciliacao", label: "Conciliacao" },
    ],
  },
  {
    label: "Produtos",
    pages: [
      { key: "estoque", label: "Estoque" },
      { key: "precos", label: "Precos" },
      { key: "etiquetas", label: "Etiquetas" },
      { key: "agendamento_precos", label: "Agendar Precos" },
    ],
  },
  {
    label: "Operacional",
    pages: [
      { key: "vendas_ver", label: "Vendas (visualizar)" },
      { key: "vendas_registrar", label: "Vendas (registrar)" },
      { key: "entregas", label: "Entregas" },
      { key: "encomendas", label: "Encomendas" },
      { key: "fornecedores", label: "Fornecedores" },
    ],
  },
  {
    label: "Site",
    pages: [
      { key: "mostruario", label: "Mostruario" },
      { key: "simulacoes", label: "Simulacoes" },
      { key: "tradein_config", label: "Trade-In config" },
    ],
  },
  {
    label: "Analytics",
    pages: [
      { key: "funil_tradein", label: "Funil Trade-In" },
      { key: "mapa_vendas", label: "Mapa de Vendas" },
    ],
  },
  {
    label: "Sistema",
    pages: [
      { key: "log", label: "Log de Atividades" },
      { key: "usuarios", label: "Usuarios" },
      { key: "importar", label: "Importar" },
    ],
  },
];

/** All valid page keys */
export const ALL_PAGE_KEYS = PAGE_GROUPS.flatMap((g) => g.pages.map((p) => p.key));

/** Map URL paths to page keys */
const PATH_TO_KEY: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/vendas": "vendas_ver",
  "/admin/gastos": "gastos",
  "/admin/saldos": "saldos",
  "/admin/recebiveis": "recebiveis",
  "/admin/conciliacao": "conciliacao",
  "/admin/estoque": "estoque",
  "/admin/precos": "precos",
  "/admin/etiquetas": "etiquetas",
  "/admin/agendamento-precos": "agendamento_precos",
  "/admin/entregas": "entregas",
  "/admin/encomendas": "encomendas",
  "/admin/fornecedores": "fornecedores",
  "/admin/mostruario": "mostruario",
  "/admin/simulacoes": "simulacoes",
  "/admin/cotacao": "tradein_config",
  "/admin/usados": "tradein_config",
  "/admin/analytics": "funil_tradein",
  "/admin/mapa-vendas": "mapa_vendas",
  "/admin/log": "log",
  "/admin/usuarios": "usuarios",
  "/admin/importar": "importar",
};

/** Map page keys to legacy permission strings (for API route checks) */
const KEY_TO_LEGACY: Record<string, string> = {
  dashboard: "dashboard.read",
  gastos: "gastos.create",
  saldos: "saldos.read",
  recebiveis: "recebiveis.read",
  conciliacao: "conciliacao.read",
  estoque: "estoque.read",
  precos: "precos.write",
  etiquetas: "etiquetas.read",
  agendamento_precos: "precos.write",
  vendas_ver: "vendas.read",
  vendas_registrar: "vendas.create",
  entregas: "entregas.read",
  encomendas: "encomendas.read",
  fornecedores: "fornecedores.read",
  mostruario: "mostruario.read",
  simulacoes: "simulacoes.read",
  tradein_config: "cotacao.read",
  funil_tradein: "analytics.read",
  mapa_vendas: "analytics.read",
  log: "log.read",
  usuarios: "usuarios.manage",
  importar: "importar.write",
};

/** Map nav href to page key */
export function pathToPageKey(path: string): string | null {
  return PATH_TO_KEY[path] || null;
}

/** Check if a user can access a page by URL path */
export function canAccessPage(role: string, page: string, permissoes?: string[]): boolean {
  if (role === "admin") return true;
  const key = PATH_TO_KEY[page];
  if (!key) return false;
  return (permissoes ?? []).includes(key);
}

/** Check if user has a specific page key */
export function userCanAccessPage(
  user: { role: string; permissoes?: string[] } | null,
  pageKey: string
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return (user.permissoes ?? []).includes(pageKey);
}

/** Legacy compatibility: check a permission string (used in API routes) */
export function hasPermission(role: string, permission: string, permissoes?: string[]): boolean {
  if (role === "admin") return true;

  // Find which page key maps to this legacy permission
  for (const [key, legacy] of Object.entries(KEY_TO_LEGACY)) {
    if (legacy === permission) {
      return (permissoes ?? []).includes(key);
    }
  }
  return false;
}

// Keep backward compat: ROLE_PERMISSIONS is still used by some imports
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["*"],
  equipe: [],
};
