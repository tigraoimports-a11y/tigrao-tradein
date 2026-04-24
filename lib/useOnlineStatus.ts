"use client";

import { useEffect, useState } from "react";

/**
 * Hook que rastreia se o sistema tem conexao REAL com o servidor.
 *
 * Porque nao usa so navigator.onLine: o macOS (e em menor grau Chrome no
 * Windows) tem historico de disparar o evento "offline" mesmo com a conexao
 * funcionando — acontece quando o SO detecta qualquer flap momentaneo de
 * rede (troca wifi/ethernet, VPN, sleep/wake, etc).
 *
 * Estrategia:
 *   1. Parte de navigator.onLine como heuristica inicial rapida.
 *   2. Quando evento "offline" dispara, NAO aceita de primeira — faz um
 *      ping rapido em /api/health pra confirmar. Se o ping funciona, mantem
 *      online e ignora o evento do navegador.
 *   3. Quando em estado offline, roda heartbeat a cada 15s tentando o ping.
 *      Se funcionar, volta pra online automaticamente (sem depender do
 *      navegador disparar evento "online" — que pode nao disparar).
 *   4. Aborta pings com timeout curto (3s) pra nao bloquear a UI.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    // Ping real ao servidor. Resolve true se responde 200, false caso contrario
    // ou timeout. Usa HEAD pra ser o mais leve possivel.
    const ping = async (): Promise<boolean> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch("/api/health", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return res.ok;
      } catch {
        clearTimeout(timeout);
        return false;
      }
    };

    const stopHeartbeat = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    // Quando entra em offline, comeca a pingar periodicamente pra voltar
    // automaticamente quando a rede se recuperar (sem depender do evento
    // "online" do navegador, que as vezes nao dispara).
    const startHeartbeat = () => {
      if (heartbeat) return;
      heartbeat = setInterval(async () => {
        const ok = await ping();
        if (cancelled) return;
        if (ok) {
          setIsOnline(true);
          stopHeartbeat();
        }
      }, 15000);
    };

    async function handleOffline() {
      // Navegador disparou offline — confirma com ping real antes de acreditar.
      // 99% dos falsos positivos do macOS sao resolvidos aqui.
      const ok = await ping();
      if (cancelled) return;
      if (ok) {
        // Ping funcionou → foi falso alarme, mantem online.
        return;
      }
      setIsOnline(false);
      startHeartbeat();
    }

    function handleOnline() {
      // Evento "online" do navegador: confia de primeira e para heartbeat.
      setIsOnline(true);
      stopHeartbeat();
    }

    // Estado inicial: se navegador ja acha que esta offline, verifica de fato.
    if (!navigator.onLine) {
      handleOffline();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      cancelled = true;
      stopHeartbeat();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
