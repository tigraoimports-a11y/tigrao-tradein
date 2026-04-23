"use client";

import { useEffect } from "react";
import { captureAndPersistUTMs } from "@/lib/utm-tracker";

/**
 * Componente invisivel que captura UTMs da URL na primeira renderizacao do
 * cliente. Plugado no app/layout.tsx pra rodar em qualquer pagina de entrada.
 *
 * Atribuicao "last-touch": se cliente chega 2x via URLs diferentes, vale a
 * mais recente. UTMs ficam em localStorage por 30 dias e sao incluidas
 * automaticamente em todo POST de simulacao/venda via withUTMs() de
 * lib/utm-tracker.
 */
export default function UTMCapture() {
  useEffect(() => {
    captureAndPersistUTMs();
  }, []);
  return null;
}
