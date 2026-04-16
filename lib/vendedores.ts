// lib/vendedores.ts
// Fonte única da lista de vendedores. Lê tradein_config (campos
// _whatsapp_vendedores, _whatsapp_vendedores_nomes,
// _whatsapp_vendedores_recebe_links e _whatsapp_vendedores_ativo
// dentro de labels) via API admin.

import { useEffect, useState } from "react";

export interface Vendedor {
  nome: string;
  numero: string;
  /** Se true, links de compra gerados por esse vendedor vão pro numero
   *  dele. Se false/undefined, caem no destino padrão (Bianca). */
  recebe_links?: boolean;
  /** Se false, vendedor fica oculto das dropdowns mas permanece no banco
   *  para não quebrar histórico. Se undefined ou true, está ativo. */
  ativo?: boolean;
}

// Defaults: André e Bianca recebem os próprios links. Nicolas tem WhatsApp
// próprio mas os links dele são triados pela Bianca. Nicole/Paloma usam
// Instagram. Flags editáveis no /admin/configuracoes — cada um pode ligar/
// desligar "Recebe" e "Ativo" pela UI sem precisar mexer em código.
export const VENDEDORES_PADRAO: Vendedor[] = [
  { nome: "André",   numero: "5521967442665", recebe_links: true,  ativo: true },
  { nome: "Bianca",  numero: "5521972461357", recebe_links: true,  ativo: true },
  { nome: "Nicolas", numero: "5521995618747", recebe_links: false, ativo: true },
  { nome: "Nicole",  numero: "",              recebe_links: false, ativo: true },
];

function normalizaKey(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Vendedor é considerado ativo quando a flag está undefined ou true.
 *  Só fica inativo quando explicitamente marcado como false. */
export function isVendedorAtivo(v: Vendedor): boolean {
  return v.ativo !== false;
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
  recebeMap?: Record<string, boolean> | null | undefined,
  ativoMap?: Record<string, boolean> | null | undefined
): Vendedor[] {
  const map = dbMap && typeof dbMap === "object" && !Array.isArray(dbMap) ? dbMap : {};
  const nomes = nomesMap && typeof nomesMap === "object" ? nomesMap : {};
  const recebe = recebeMap && typeof recebeMap === "object" ? recebeMap : {};
  const ativo = ativoMap && typeof ativoMap === "object" ? ativoMap : {};
  const usados = new Set<string>();
  const out: Vendedor[] = [];
  for (const v of VENDEDORES_PADRAO) {
    const key = normalizaKey(v.nome);
    out.push({
      nome: nomes[key] || v.nome,
      numero: key in map ? map[key] : v.numero,
      recebe_links: key in recebe ? !!recebe[key] : !!v.recebe_links,
      ativo: key in ativo ? !!ativo[key] : v.ativo !== false,
    });
    usados.add(key);
  }
  for (const [key, num] of Object.entries(map)) {
    if (!usados.has(key)) {
      out.push({
        nome: nomes[key] || key.charAt(0).toUpperCase() + key.slice(1),
        numero: num,
        recebe_links: !!recebe[key],
        ativo: key in ativo ? !!ativo[key] : true,
      });
    }
  }
  return out;
}

function fetchVendedoresInto(
  password: string | null | undefined,
  setter: (list: Vendedor[]) => void
): () => void {
  if (!password) return () => {};
  let cancelled = false;
  fetch("/api/admin/tradein-config", { headers: { "x-admin-password": password } })
    .then((r) => r.json())
    .then(({ data }) => {
      if (cancelled || !data) return;
      setter(mergeVendedores(
        data.whatsapp_vendedores as Record<string, string> | null,
        data.whatsapp_vendedores_nomes as Record<string, string> | null,
        data.whatsapp_vendedores_recebe_links as Record<string, boolean> | null,
        data.whatsapp_vendedores_ativo as Record<string, boolean> | null
      ));
    })
    .catch(() => { /* mantém padrão */ });
  return () => { cancelled = true; };
}

/** Hook para dropdowns/seletores — retorna só vendedores ATIVOS.
 *  Use em /admin/gerar-link, /admin/entregas e afins. */
export function useVendedores(password: string | null | undefined): Vendedor[] {
  const [vendedores, setVendedores] = useState<Vendedor[]>(VENDEDORES_PADRAO);
  useEffect(() => fetchVendedoresInto(password, setVendedores), [password]);
  return vendedores.filter(isVendedorAtivo);
}

/** Hook para telas de administração — retorna TODOS (ativos + inativos).
 *  Use em /admin/configuracoes pra que o admin possa reativar quem foi
 *  desativado. */
export function useVendedoresAll(password: string | null | undefined): Vendedor[] {
  const [vendedores, setVendedores] = useState<Vendedor[]>(VENDEDORES_PADRAO);
  useEffect(() => fetchVendedoresInto(password, setVendedores), [password]);
  return vendedores;
}
