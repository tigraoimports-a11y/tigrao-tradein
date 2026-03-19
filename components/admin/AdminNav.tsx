"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[]; // quais roles podem ver
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "📊", roles: ["admin"] },
  { href: "/admin/simulacoes", label: "Simulacoes", icon: "📱", roles: ["admin"] },
  { href: "/admin/vendas", label: "Vendas", icon: "💰", roles: ["admin"] },
  { href: "/admin/gastos", label: "Gastos", icon: "📤", roles: ["admin"] },
  { href: "/admin/saldos", label: "Saldos", icon: "🏦", roles: ["admin"] },
  { href: "/admin/estoque", label: "Estoque", icon: "📦", roles: ["admin", "estoque"] },
  { href: "/admin/encomendas", label: "Encomendas", icon: "🛒", roles: ["admin", "estoque"] },
  { href: "/admin/cotacao", label: "Cotacao", icon: "💬", roles: ["admin"] },
  { href: "/admin/usados", label: "Avaliacao Usados", icon: "🔄", roles: ["admin"] },
  { href: "/admin/importar", label: "Importar", icon: "📥", roles: ["admin"] },
  { href: "/admin/precos", label: "Alteracao de Precos", icon: "🏷️", roles: ["admin"] },
];

export default function AdminNav({ userRole }: { userRole: string }) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole));

  return (
    <div className="bg-white border-b border-[#D2D2D7] px-6 overflow-x-auto">
      <nav className="flex gap-1 max-w-[1400px] mx-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-[#E8740E] text-[#E8740E]"
                  : "border-transparent text-[#86868B] hover:text-[#1D1D1F] hover:border-[#D2D2D7]"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
