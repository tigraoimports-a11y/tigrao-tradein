// Parser/formatter pro campo `armazenamento` na tabela avaliacao_usados.
//
// O campo e uma string. Pra iPads/MacBooks/Watches alguns modelos tem
// variantes adicionais (tamanho de tela, conectividade Wi-Fi vs Cellular,
// RAM/SSD no Mac). Em vez de criar colunas novas no DB a gente usa um
// separador " | " pra encaixar as dimensoes extras no mesmo campo:
//
//   "256GB"                 → armazenamento puro (iPhone comum)
//   "64GB | 11\" | Wifi"    → iPad legacy com tela + conectividade
//   "64GB | Wifi"           → iPad novo (tela vai no nome do modelo)
//   "256GB/8GB"             → MacBook SSD/RAM (formato antigo, sem separador |)
//
// Parser detecta cada parte por VALOR (nao posicao): conectividade casa com
// um set fixo de opcoes (Wifi/Wifi+Cel/GPS/GPS+Cel), tela casa com regex de
// polegadas (ex: 11", 12.9"), o resto vai pra armazenamento. Tolera ordens
// fora do convencionado e variantes legacy com partes extras.

export interface StorageSpec {
  armazenamento: string;
  tela: string;
  conectividade: string;
}

const CONECT_VALUES = new Set(["Wifi", "Wifi + Cel", "GPS", "GPS + Cel"]);
const TELA_PATTERN = /^\d+(?:\.\d+)?"$/;

export function parseStorageSpec(raw: string): StorageSpec {
  const parts = (raw || "").split("|").map(p => p.trim()).filter(Boolean);
  let armazenamento = "";
  let tela = "";
  let conectividade = "";
  for (const p of parts) {
    if (CONECT_VALUES.has(p)) conectividade = p;
    else if (TELA_PATTERN.test(p)) tela = p;
    else if (!armazenamento) armazenamento = p;
  }
  return { armazenamento, tela, conectividade };
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
