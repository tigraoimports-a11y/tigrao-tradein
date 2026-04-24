// components/admin/SkuFilterBanner.tsx
// Banner minimalista que aparece quando a pagina esta filtrando por SKU
// (?sku=X na URL). Mostra o SKU ativo + botao pra limpar filtro. Componente
// compartilhado usado em /admin/vendas, /admin/estoque, /admin/avisos-clientes,
// /admin/encomendas e /admin/simulacoes.
//
// A pagina consumidora aplica o filtro de verdade nos dados — esse componente
// so gerencia a UI do estado de filtro + navegacao.

"use client";

import { useEffect, useState } from "react";
import { skuToNomeCanonico } from "@/lib/sku-validator";

/**
 * Hook "safe" que le ?sku=X direto do window.location.search. Nao usa
 * useSearchParams pra evitar exigencia de Suspense boundary — importante
 * pra integrar em paginas grandes sem refatorar a arvore de componentes.
 *
 * Atualiza quando a URL muda (popstate + custom event disparado por
 * pushState/replaceState via patch no prototype).
 */
export function useSkuFilter(): string | null {
  const [sku, setSku] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      if (typeof window === "undefined") return null;
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("sku");
      return raw ? raw.trim().toUpperCase() : null;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSku(read());

    const handle = () => setSku(read());
    window.addEventListener("popstate", handle);
    window.addEventListener("sku-filter-changed", handle);
    return () => {
      window.removeEventListener("popstate", handle);
      window.removeEventListener("sku-filter-changed", handle);
    };
  }, []);

  return sku;
}

export function SkuFilterBanner({ total }: { total?: number }) {
  const sku = useSkuFilter();
  if (!sku) return null;

  const nome = skuToNomeCanonico(sku);

  const clearFilter = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("sku");
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState(null, "", newUrl);
    window.dispatchEvent(new Event("sku-filter-changed"));
  };

  return (
    <div className="bg-[#FFF5EB] border border-[#E8740E]/30 rounded-xl px-4 py-3 flex items-center gap-3">
      <span className="text-lg">🎯</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#E8740E]">
          Filtrando por SKU
          {typeof total === "number" && (
            <span className="ml-2 text-xs font-normal text-[#86868B]">
              ({total} {total === 1 ? "resultado" : "resultados"})
            </span>
          )}
        </p>
        <p className="text-xs text-[#6E6E73] mt-0.5">
          {nome || sku} <span className="font-mono ml-1">{sku}</span>
        </p>
      </div>
      <button
        onClick={clearFilter}
        className="text-xs px-2.5 py-1 rounded-lg border border-[#E8740E]/30 text-[#E8740E] hover:bg-white transition-colors"
      >
        ✕ Limpar
      </button>
    </div>
  );
}
