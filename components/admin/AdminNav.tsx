"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "./AdminShell";
import { NAV, isGroup, type NavGroup, type NavItem } from "./nav-config";

interface AdminNavProps {
  userRole: string;
  userPermissoes?: string[];
  abasOcultas?: string[];
}

export default function AdminNav({ userRole, userPermissoes, abasOcultas }: AdminNavProps) {
  const pathname = usePathname();
  const { sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed } = useAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const entry of NAV) {
      if (isGroup(entry) && entry.items.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"))) {
        s.add(entry.label);
      }
    }
    return s;
  });

  const isAdmin = userRole === "admin";
  const perms = userPermissoes ?? [];

  // Páginas visíveis pra todos os usuários (não precisa de permissão)
  const PUBLIC_PAGES = ["gerar_link", "calculadora_taxas", "entregas"];

  // Aliases: se o usuário tem qualquer uma dessas permissões, pode ver o item
  const PAGE_ALIASES: Record<string, string[]> = {
    vendas_ver: ["vendas_ver", "vendas_andamento", "vendas_registrar"],
  };

  function canSee(pageKey: string): boolean {
    if (isAdmin) return true;
    if (PUBLIC_PAGES.includes(pageKey)) return true;
    const aliases = PAGE_ALIASES[pageKey] ?? [pageKey];
    return aliases.some((k) => perms.includes(k));
  }

  // Preferencia visual do usuario — oculta abas mesmo que ele tenha permissao.
  // So afeta o menu; acesso direto pela URL continua funcionando.
  const ocultas = new Set(abasOcultas ?? []);
  function naoOculta(item: NavItem): boolean {
    return !ocultas.has(item.href);
  }

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
    if (!canSee(item.pageKey)) return null;
    if (!naoOculta(item)) return null;
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
    const visibleItems = group.items.filter((i) => canSee(i.pageKey) && naoOculta(i));
    if (visibleItems.length === 0) return null;

    const isOpen = openGroups.has(group.label);
    const hasActive = visibleItems.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"));

    if (collapsed) {
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
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>&#9654;</span>
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
        className="lg:hidden print:hidden fixed top-3 left-3 z-50 w-11 h-11 rounded-full bg-[#E8740E] text-white shadow-lg flex items-center justify-center text-lg hover:bg-[#D06A0D] transition-colors"
      >
        {mobileOpen ? "\u2715" : "\u2630"}
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
        className={`admin-themed-sidebar fixed top-0 left-0 h-full border-r z-40 flex flex-col transition-all duration-200 print:hidden ${
          collapsed ? "w-[60px]" : "w-[220px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "var(--at-sidebar, #FFFFFF)", borderColor: "var(--at-sidebar-border, #E8E8ED)" }}
      >
        {/* Logo area */}
        <div className="px-3 py-4 border-b border-[#E8E8ED] flex items-center gap-2">
          <span className="text-2xl shrink-0">&#x1F42F;</span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1D1D1F] truncate">TigraoImports</p>
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
          {collapsed ? "\u2192" : "\u2190 Recolher"}
        </button>
      </aside>
    </>
  );
}
