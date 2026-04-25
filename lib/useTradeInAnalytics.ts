"use client";

import { useCallback, useRef } from "react";
import { getStoredUTMs, type UTMs } from "@/lib/utm-tracker";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("tradein_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("tradein_session_id", id);
  }
  return id;
}

// Endpoint /api/funnel (e nao /api/analytics) — adblockers bloqueiam URLs com
// "analytics" e isso fazia 99% dos eventos sumirem em produ
//
// Usa navigator.sendBeacon como prioridade — survives navegacao (cliente
// clica "Submeter" e o browser pula pro wa.me/MercadoPago, fetch normal e
// CANCELADO; sendBeacon e garantido pelo browser ate completar).
// Fallback: fetch com keepalive:true (mesma garantia em browsers modernos).
function fire(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/funnel", blob);
      if (ok) return;
    }
    fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* silent — tracking should never break UX */
    });
  } catch {
    /* silent */
  }
}

// Helper pra adicionar dimensoes (device_type + UTMs) em TODO evento.
// Sem isso, tradein_analytics so guardava session+step+question — agregado.
// Com as dims, da pra cruzar drop-off por canal e por tipo de dispositivo.
function enrichPayload(base: Record<string, unknown>, deviceType: string | null): Record<string, unknown> {
  const utms: UTMs = getStoredUTMs();
  return {
    ...base,
    deviceType: deviceType || undefined,
    utm_source: utms.utm_source,
    utm_medium: utms.utm_medium,
    utm_campaign: utms.utm_campaign,
  };
}

export function useTradeInAnalytics() {
  const viewedSteps = useRef<Set<number>>(new Set());
  // Device type (iphone|ipad|macbook|watch) e setado pelo Step 0 do simulador
  // via setDeviceContext(). Fica disponivel pra todos eventos seguintes — o
  // tracking de question_answer/step_complete/step_view inclui automaticamente.
  const deviceTypeRef = useRef<string | null>(null);

  const setDeviceContext = useCallback((deviceType: string | null) => {
    deviceTypeRef.current = deviceType;
  }, []);

  const trackSiteView = useCallback(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("tradein_site_view_sent")) return;
    sessionStorage.setItem("tradein_site_view_sent", "1");
    fire(enrichPayload({ event: "site_view", sessionId: getSessionId() }, deviceTypeRef.current));
  }, []);

  const trackStep = useCallback((step: number) => {
    if (viewedSteps.current.has(step)) return;
    viewedSteps.current.add(step);
    fire(enrichPayload({ event: "step_view", step, sessionId: getSessionId() }, deviceTypeRef.current));
  }, []);

  const trackQuestion = useCallback((step: number, question: string) => {
    fire(enrichPayload({ event: "question_answer", step, question, sessionId: getSessionId() }, deviceTypeRef.current));
  }, []);

  const trackComplete = useCallback((step: number) => {
    fire(enrichPayload({ event: "step_complete", step, sessionId: getSessionId() }, deviceTypeRef.current));
  }, []);

  const trackAction = useCallback((action: string) => {
    fire(enrichPayload({ event: action, sessionId: getSessionId() }, deviceTypeRef.current));
  }, []);

  return { trackSiteView, trackStep, trackQuestion, trackComplete, trackAction, setDeviceContext };
}
