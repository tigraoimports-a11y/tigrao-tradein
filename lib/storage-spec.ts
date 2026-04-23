// Parser/formatter pro campo `armazenamento` na tabela avaliacao_usados.
//
// O campo e uma string. Pra iPads/MacBooks/Watches alguns modelos tem
// variantes adicionais (tamanho de tela, conectividade Wi-Fi vs Cellular,
// RAM/SSD no Mac). Em vez de criar colunas novas no DB a gente usa um
// separador " | " pra encaixar as dimensoes extras no mesmo campo:
//
//   "256GB"                 → armazenamento puro (iPhone comum)
//   "64GB | 11\" | Wifi"    → iPad com tela + conectividade
//   "256GB/8GB"             → MacBook SSD/RAM (formato antigo, sem separador |)
//
// Ordem convencionada: armazenamento → tela → conectividade. Campos
// opcionais — omitir deixa em branco.

export interface StorageSpec {
  armazenamento: string;
  tela: string;
  conectividade: string;
}

export function parseStorageSpec(raw: string): StorageSpec {
  const parts = (raw || "").split("|").map(p => p.trim());
  return {
    armazenamento: parts[0] || "",
    tela: parts[1] || "",
    conectividade: parts[2] || "",
  };
}

export function formatStorageSpec(spec: StorageSpec): string {
  const parts = [spec.armazenamento, spec.tela, spec.conectividade]
    .map(p => (p || "").trim())
    .filter(Boolean);
  return parts.join(" | ");
}

// True quando a string tem pelo menos 2 partes (ou seja: usa o formato novo).
// Usado pra decidir se vale a pena renderizar steps separados ou manter o
// botao unico legado.
export function hasStructuredStorage(raw: string): boolean {
  return (raw || "").includes("|");
}
