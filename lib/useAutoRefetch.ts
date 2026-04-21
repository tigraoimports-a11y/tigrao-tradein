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
 *
 * Visibility threshold: só refetch quando a aba ficou oculta por >30s.
 * Alt-tab rápido não dispara fetch (evita ver a página "piscando" toda
 * vez que o usuário troca de janela brevemente).
 */
const VISIBILITY_REFETCH_THRESHOLD_MS = 30_000;

export function useAutoRefetch(refetch: () => void, enabled: boolean = true, intervalMs: number = 0) {
  const refetchRef = useRef(refetch);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    const call = () => { try { refetchRef.current(); } catch { /* ignore */ } };
    // Fetch inicial imediato na montagem
    call();
    const interval = intervalMs > 0 ? setInterval(call, intervalMs) : null;
    // Refetch ao voltar o foco só quando a aba ficou oculta por tempo
    // suficiente pra valer a pena — alt-tab curto não dispara.
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt >= VISIBILITY_REFETCH_THRESHOLD_MS) {
        call();
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
