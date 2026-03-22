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

function fire(payload: Record<string, unknown>) {
  try {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* silent — analytics should never break UX */
    });
  } catch {
    /* silent */
  }
}

export function useTradeInAnalytics() {
  // Track which steps we already sent "step_view" for to avoid duplicates within same session render
  const viewedSteps = useRef<Set<number>>(new Set());

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

  return { trackStep, trackQuestion, trackComplete, trackAction };
}
