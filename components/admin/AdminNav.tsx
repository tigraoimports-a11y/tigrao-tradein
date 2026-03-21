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

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "📊", roles: ["admin"] },
  { href: "/admin/vendas", label: "Vendas", icon: "💰", roles: ["admin"] },
  { href: "/admin/estoque", label: "Estoque", icon: "📦", roles: ["admin", "estoque"] },
  { href: "/admin/gastos", label: "Gastos", icon: "📤", roles: ["admin"] },
  { href: "/admin/saldos", label: "Saldos", icon: "🏦", roles: ["admin"] },
  { href: "/admin/simulacoes", label: "Simulacoes", icon: "📱", roles: ["admin"] },
  { href: "/admin/fornecedores", label: "Fornecedores", icon: "🤝", roles: ["admin"] },
  { href: "/admin/entregas", label: "Entregas", icon: "🚚", roles: ["admin", "estoque"] },
  { href: "/admin/encomendas", label: "Encomendas", icon: "🛒", roles: ["admin", "estoque"] },
  { href: "/admin/importar", label: "Importar", icon: "📥", roles: ["admin"] },
  { href: "/admin/precos", label: "Precos", icon: "🏷️", roles: ["admin"] },
  { href: "/admin/mostruario", label: "Mostruario", icon: "🖼️", roles: ["admin"] },
];

export default function AdminNav({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole));

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
        className={`fixed top-0 left-0 h-full bg-white border-r border-[#E8E8ED] z-40 flex flex-col transition-all duration-200 ${
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
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 mx-2 my-0.5 rounded-lg text-sm font-medium transition-colors ${
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
          })}
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
