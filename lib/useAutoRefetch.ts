import { useEffect } from "react";

/**
 * Sincronização entre usuários: re-chama `refetch` periodicamente
 * (padrão 20s) e também quando a janela ganha foco. Assim,
 * alterações feitas por um usuário aparecem pros outros em tempo
 * quase-real sem precisar F5.
 */
export function useAutoRefetch(refetch: () => void, enabled: boolean = true, intervalMs: number = 20000) {
  useEffect(() => {
    if (!enabled) return;
    // intervalMs <= 0 desabilita o polling — fica só o refetch ao focar a janela
    const interval = intervalMs > 0 ? setInterval(refetch, intervalMs) : null;
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch, enabled, intervalMs]);
}
