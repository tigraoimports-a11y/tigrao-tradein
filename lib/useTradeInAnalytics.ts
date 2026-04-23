"use client";

import { useCallback, useRef } from "react";

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
function fire(payload: Record<string, unknown>) {
  try {
    fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* silent — tracking should never break UX */
    });
  } catch {
    /* silent */
  }
}

export function useTradeInAnalytics() {
  const viewedSteps = useRef<Set<number>>(new Set());

  const trackSiteView = useCallback(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("tradein_site_view_sent")) return;
    sessionStorage.setItem("tradein_site_view_sent", "1");
    fire({ event: "site_view", sessionId: getSessionId() });
  }, []);

  const trackStep = useCallback((step: number) => {
    if (viewedSteps.current.has(step)) return;
    viewedSteps.current.add(step);
    fire({ event: "step_view", step, sessionId: getSessionId() });
  }, []);

  const trackQuestion = useCallback((step: number, question: string) => {
    fire({ event: "question_answer", step, question, sessionId: getSessionId() });
  }, []);

  const trackComplete = useCallback((step: number) => {
    fire({ event: "step_complete", step, sessionId: getSessionId() });
  }, []);

  const trackAction = useCallback((action: string) => {
    fire({ event: action, sessionId: getSessionId() });
  }, []);

  return { trackSiteView, trackStep, trackQuestion, trackComplete, trackAction };
}
