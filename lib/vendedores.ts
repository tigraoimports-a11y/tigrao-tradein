// lib/vendedores.ts
// Fonte única da lista de vendedores. Lê tradein_config.whatsapp_vendedores
// (editável em /admin/configuracoes) e faz merge com o padrão.

import { useEffect, useState } from "react";

export interface Vendedor {
  nome: string;
  numero: string;
}

export const VENDEDORES_PADRAO: Vendedor[] = [
  { nome: "André",   numero: "5521967442665" },
  { nome: "Bianca",  numero: "5521972461357" },
  { nome: "Nicolas", numero: "5521995618747" },
  { nome: "Nicole",  numero: "" },
];

function normalizaKey(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function mergeVendedores(
  dbMap: Record<string, string> | null | undefined,
  nomesMap: Record<string, string> | null | undefined
): Vendedor[] {
  const map = dbMap && typeof dbMap === "object" && !Array.isArray(dbMap) ? dbMap : {};
  const nomes = nomesMap && typeof nomesMap === "object" ? nomesMap : {};
  const usados = new Set<string>();
  const out: Vendedor[] = [];
  for (const v of VENDEDORES_PADRAO) {
    const key = normalizaKey(v.nome);
    out.push({
      nome: nomes[key] || v.nome,
      numero: key in map ? map[key] : v.numero,
    });
    usados.add(key);
  }
  for (const [key, num] of Object.entries(map)) {
    if (!usados.has(key)) {
      out.push({ nome: nomes[key] || key.charAt(0).toUpperCase() + key.slice(1), numero: num });
    }
  }
  return out;
}

/** Hook para páginas admin carregarem a lista dinâmica de vendedores.
 *  Usa `/api/admin/tradein-config` (requer x-admin-password).
 *  Enquanto a resposta não chega, retorna VENDEDORES_PADRAO como fallback. */
export function useVendedores(password: string | null | undefined): Vendedor[] {
  const [vendedores, setVendedores] = useState<Vendedor[]>(VENDEDORES_PADRAO);

  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    fetch("/api/admin/tradein-config", { headers: { "x-admin-password": password } })
      .then((r) => r.json())
      .then(({ data }) => {
        if (cancelled || !data) return;
        setVendedores(mergeVendedores(
          data.whatsapp_vendedores as Record<string, string> | null,
          data.whatsapp_vendedores_nomes as Record<string, string> | null
        ));
      })
      .catch(() => { /* mantém padrão */ });
    return () => { cancelled = true; };
  }, [password]);

  return vendedores;
}
