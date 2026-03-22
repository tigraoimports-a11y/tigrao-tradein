export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["*"],
  vendedor: [
    "vendas.create",
    "vendas.read",
    "estoque.read",
    "dashboard.read",
    "gastos.create",
    "entregas.read",
    "entregas.create",
  ],
  visualizador: [
    "dashboard.read",
    "estoque.read",
    "vendas.read",
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

// Map admin pages to required permissions
const PAGE_PERMISSIONS: Record<string, string> = {
  "/admin": "dashboard.read",
  "/admin/vendas": "vendas.read",
  "/admin/gastos": "gastos.create",
  "/admin/saldos": "saldos.read",
  "/admin/conciliacao": "conciliacao.read",
  "/admin/estoque": "estoque.read",
  "/admin/precos": "precos.write",
  "/admin/agendamento-precos": "precos.write",
  "/admin/fornecedores": "fornecedores.read",
  "/admin/importar": "importar.write",
  "/admin/entregas": "entregas.read",
  "/admin/encomendas": "encomendas.read",
  "/admin/etiquetas": "etiquetas.read",
  "/admin/mostruario": "mostruario.read",
  "/admin/simulacoes": "simulacoes.read",
  "/admin/analytics": "analytics.read",
  "/admin/cotacao": "cotacao.read",
  "/admin/usados": "usados.read",
  "/admin/log": "log.read",
  "/admin/usuarios": "usuarios.manage",
};

export function canAccessPage(role: string, page: string): boolean {
  // Admin can access everything
  if (role === "admin") return true;

  const permission = PAGE_PERMISSIONS[page];
  if (!permission) return false;

  return hasPermission(role, permission);
}
