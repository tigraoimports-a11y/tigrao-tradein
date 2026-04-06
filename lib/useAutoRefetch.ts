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
    const interval = setInterval(refetch, intervalMs);
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refetch, enabled, intervalMs]);
}
