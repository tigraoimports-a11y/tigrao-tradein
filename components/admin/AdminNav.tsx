"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

interface NavGroup {
  label: string;
  icon: string;
  roles: string[];
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const NAV: NavEntry[] = [
  { href: "/admin", label: "Dashboard", icon: "📊", roles: ["admin", "vendedor", "visualizador"] },

  // Financeiro
  {
    label: "Financeiro", icon: "💰", roles: ["admin", "vendedor"],
    items: [
      { href: "/admin/vendas", label: "Vendas", icon: "💰", roles: ["admin", "vendedor", "visualizador"] },
      { href: "/admin/gastos", label: "Gastos", icon: "📤", roles: ["admin", "vendedor"] },
      { href: "/admin/saldos", label: "Saldos", icon: "🏦", roles: ["admin"] },
      { href: "/admin/recebiveis", label: "Recebíveis", icon: "💳", roles: ["admin"] },
      { href: "/admin/conciliacao", label: "Conciliação", icon: "🔍", roles: ["admin"] },
    ],
  },

  // Produtos
  {
    label: "Produtos", icon: "📦", roles: ["admin", "estoque", "vendedor", "visualizador"],
    items: [
      { href: "/admin/estoque", label: "Estoque", icon: "📦", roles: ["admin", "estoque", "vendedor", "visualizador"] },
      { href: "/admin/precos", label: "Preços", icon: "🏷️", roles: ["admin"] },
      { href: "/admin/agendamento-precos", label: "Agendar Preços", icon: "📅", roles: ["admin"] },
      { href: "/admin/fornecedores", label: "Fornecedores", icon: "🤝", roles: ["admin"] },
      { href: "/admin/importar", label: "Importar", icon: "📥", roles: ["admin"] },
    ],
  },

  // Operacional
  {
    label: "Operacional", icon: "🚚", roles: ["admin", "estoque", "vendedor"],
    items: [
      { href: "/admin/entregas", label: "Entregas", icon: "🚚", roles: ["admin", "estoque", "vendedor"] },
      { href: "/admin/encomendas", label: "Encomendas", icon: "🛒", roles: ["admin", "estoque"] },
      { href: "/admin/etiquetas", label: "Etiquetas", icon: "🏷️", roles: ["admin", "estoque"] },
    ],
  },

  // Site
  {
    label: "Site", icon: "🌐", roles: ["admin"],
    items: [
      { href: "/admin/mostruario", label: "Mostruário", icon: "🖼️", roles: ["admin"] },
      { href: "/admin/simulacoes", label: "Simulações", icon: "📱", roles: ["admin"] },
    ],
  },

  // Analytics
  {
    label: "Analytics", icon: "📊", roles: ["admin"],
    items: [
      { href: "/admin/analytics", label: "Funil Trade-In", icon: "📈", roles: ["admin"] },
      { href: "/admin/mapa-vendas", label: "Mapa de Vendas", icon: "🗺️", roles: ["admin"] },
    ],
  },

  // Sistema
  {
    label: "Sistema", icon: "⚙️", roles: ["admin"],
    items: [
      { href: "/admin/log", label: "Log de Atividades", icon: "📋", roles: ["admin"] },
      { href: "/admin/usuarios", label: "Usuários", icon: "👥", roles: ["admin"] },
    ],
  },
];

export default function AdminNav({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Auto-open the group that contains the current page
    const s = new Set<string>();
    for (const entry of NAV) {
      if (isGroup(entry) && entry.items.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"))) {
        s.add(entry.label);
      }
    }
    return s;
  });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function renderItem(item: NavItem) {
    const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href + "/"));
    if (!item.roles.includes(userRole)) return null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 mx-2 my-0.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-[#FFF5EB] text-[#E8740E] border border-[#E8740E]/20"
            : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
        }`}
        title={collapsed ? item.label : undefined}
      >
        <span className="text-base shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  function renderGroup(group: NavGroup) {
    const visibleItems = group.items.filter((i) => i.roles.includes(userRole));
    if (visibleItems.length === 0) return null;
    if (!group.roles.some((r) => r === userRole)) return null;

    const isOpen = openGroups.has(group.label);
    const hasActive = visibleItems.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"));

    if (collapsed) {
      // When collapsed, show first item's icon as representative
      return visibleItems.map((item) => renderItem(item));
    }

    return (
      <div key={group.label} className="my-1">
        <button
          onClick={() => toggleGroup(group.label)}
          className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm font-medium w-[calc(100%-16px)] transition-colors ${
            hasActive && !isOpen
              ? "text-[#E8740E] bg-[#FFF5EB]/50"
              : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          }`}
        >
          <span className="text-base shrink-0">{group.icon}</span>
          <span className="truncate flex-1 text-left">{group.label}</span>
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>▶</span>
        </button>
        {isOpen && (
          <div className="ml-3 border-l border-[#E8E8ED] pl-1 mt-0.5">
            {visibleItems.map((item) => renderItem(item))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 w-12 h-12 rounded-full bg-[#E8740E] text-white shadow-lg flex items-center justify-center text-xl hover:bg-[#D06A0D] transition-colors"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-white border-r border-[#E8E8ED] z-40 flex flex-col transition-all duration-200 print:hidden ${
          collapsed ? "w-[60px]" : "w-[220px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo area */}
        <div className="px-3 py-4 border-b border-[#E8E8ED] flex items-center gap-2">
          <span className="text-2xl shrink-0">🐯</span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1D1D1F] truncate">TigrãoImports</p>
              <p className="text-[10px] text-[#86868B]">Painel Admin</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((entry) => (isGroup(entry) ? renderGroup(entry) : renderItem(entry)))}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center py-3 border-t border-[#E8E8ED] text-[#86868B] hover:text-[#1D1D1F] transition-colors text-xs"
        >
          {collapsed ? "→" : "← Recolher"}
        </button>
      </aside>
    </>
  );
}
