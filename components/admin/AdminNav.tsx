"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/vendas", label: "Vendas", icon: "💰" },
  { href: "/admin/gastos", label: "Gastos", icon: "📤" },
  { href: "/admin/saldos", label: "Saldos", icon: "🏦" },
  { href: "/admin/estoque", label: "Estoque", icon: "📦" },
  { href: "/admin/encomendas", label: "Encomendas", icon: "🛒" },
  { href: "/admin/usados", label: "Avaliacao Usados", icon: "🔄" },
  { href: "/admin/importar", label: "Importar", icon: "📥" },
  { href: "/admin/precos", label: "Alteracao de Precos", icon: "🏷️" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="bg-white border-b border-[#D2D2D7] px-6 overflow-x-auto">
      <nav className="flex gap-1 max-w-[1400px] mx-auto">
        {NAV_ITEMS.map((item) => {
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
