"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook que sincroniza o estado de uma tab com o hash da URL.
 * Quando o usuário atualiza a página, a tab é restaurada.
 *
 * Usa window.location.hash (#tab=valor) para não causar re-render
 * do Next.js router e funcionar 100% client-side.
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[]
): [T, (tab: T) => void] {
  const [tab, setTabState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultTab;
    const hash = window.location.hash.replace("#", "");
    const params = new URLSearchParams(hash);
    const saved = params.get("tab") as T;
    if (saved && (validTabs as readonly string[]).includes(saved)) return saved;
    return defaultTab;
  });

  // Atualizar hash quando tab muda
  const setTab = useCallback((newTab: T) => {
    setTabState(newTab);
    const hash = window.location.hash.replace("#", "");
    const params = new URLSearchParams(hash);
    if (newTab === defaultTab) {
      params.delete("tab");
    } else {
      params.set("tab", newTab);
    }
    const newHash = params.toString();
    window.location.hash = newHash;
  }, [defaultTab]);

  // Ouvir popstate (botão voltar do navegador)
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace("#", "");
      const params = new URLSearchParams(hash);
      const val = params.get("tab") as T;
      if (val && (validTabs as readonly string[]).includes(val)) {
        setTabState(val);
      } else {
        setTabState(defaultTab);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [defaultTab, validTabs]);

  return [tab, setTab];
}
