import { useEffect, useRef } from "react";

/**
 * Sincronização entre usuários: re-chama `refetch` periodicamente
 * (padrão 20s) e também quando a janela ganha foco. Assim,
 * alterações feitas por um usuário aparecem pros outros em tempo
 * quase-real sem precisar F5.
 *
 * IMPORTANTE: usa um ref para o callback para não tear down o
 * setInterval / listener a cada render. Antes, passar uma função
 * inline causava clear+reset do timer constantemente (travando
 * polling e gerando lag percebido).
 */
export function useAutoRefetch(refetch: () => void, enabled: boolean = true, intervalMs: number = 20000) {
  const refetchRef = useRef(refetch);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    const call = () => { try { refetchRef.current(); } catch { /* ignore */ } };
    const interval = intervalMs > 0 ? setInterval(call, intervalMs) : null;
    // Refetch ao focar apenas se a aba esteve oculta (evita re-fetch em toda troca de foco de janela)
    let wasHidden = false;
    const onVisibility = () => {
      if (document.hidden) { wasHidden = true; return; }
      if (wasHidden) { wasHidden = false; call(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
