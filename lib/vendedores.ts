// lib/vendedores.ts
// Fonte única da lista de vendedores. Lê tradein_config (campos
// _whatsapp_vendedores, _whatsapp_vendedores_nomes e
// _whatsapp_vendedores_recebe_links dentro de labels) via API admin.

import { useEffect, useState } from "react";

export interface Vendedor {
  nome: string;
  numero: string;
  /** Se true, links de compra gerados por esse vendedor vão pro numero
   *  dele. Se false/undefined, caem no destino padrão (Bianca). */
  recebe_links?: boolean;
}

// Defaults: André e Bianca recebem os próprios links. Nicolas tem WhatsApp
// próprio mas os links dele são triados pela Bianca. Nicole/Paloma usam
// Instagram. Flag editável no /admin/configuracoes — cada um pode ligar/
// desligar "Recebe" pela UI sem precisar mexer em código.
export const VENDEDORES_PADRAO: Vendedor[] = [
  { nome: "André",   numero: "5521967442665", recebe_links: true  },
  { nome: "Bianca",  numero: "5521972461357", recebe_links: true  },
  { nome: "Nicolas", numero: "5521995618747", recebe_links: false },
  { nome: "Nicole",  numero: "",              recebe_links: false },
];

function normalizaKey(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Destino final de um link de compra.
 *  - Vendedor com recebe_links=true → numero dele.
 *  - Senão → fallback (ex: WHATSAPP_FORMULARIO = Bianca). */
export function getWhatsAppFromVendedores(
  nome: string,
  vendedores: Vendedor[],
  fallback: string
): string {
  if (!nome) return fallback;
  const key = normalizaKey(nome);
  const encontrado = vendedores.find((v) => normalizaKey(v.nome) === key);
  if (!encontrado) return fallback;
  if (encontrado.recebe_links && encontrado.numero) return encontrado.numero;
  return fallback;
}

export function mergeVendedores(
  dbMap: Record<string, string> | null | undefined,
  nomesMap: Record<string, string> | null | undefined,
  recebeMap?: Record<string, boolean> | null | undefined
): Vendedor[] {
  const map = dbMap && typeof dbMap === "object" && !Array.isArray(dbMap) ? dbMap : {};
  const nomes = nomesMap && typeof nomesMap === "object" ? nomesMap : {};
  const recebe = recebeMap && typeof recebeMap === "object" ? recebeMap : {};
  const usados = new Set<string>();
  const out: Vendedor[] = [];
  for (const v of VENDEDORES_PADRAO) {
    const key = normalizaKey(v.nome);
    out.push({
      nome: nomes[key] || v.nome,
      numero: key in map ? map[key] : v.numero,
      recebe_links: key in recebe ? !!recebe[key] : !!v.recebe_links,
    });
    usados.add(key);
  }
  for (const [key, num] of Object.entries(map)) {
    if (!usados.has(key)) {
      out.push({
        nome: nomes[key] || key.charAt(0).toUpperCase() + key.slice(1),
        numero: num,
        recebe_links: !!recebe[key],
      });
    }
  }
  return out;
}

/** Hook para páginas admin carregarem a lista dinâmica de vendedores. */
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
          data.whatsapp_vendedores_nomes as Record<string, string> | null,
          data.whatsapp_vendedores_recebe_links as Record<string, boolean> | null
        ));
      })
      .catch(() => { /* mantém padrão */ });
    return () => { cancelled = true; };
  }, [password]);

  return vendedores;
}
