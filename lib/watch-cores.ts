// Helpers compartilhados pra cores do Apple Watch Series por material da
// caixa. Usado pelo fluxo trade-in cliente (StepUsedDeviceMulti) e pelo
// admin de geracao de link/entrega (/admin/gerar-link), pra que ambas as
// telas filtrem cores consistentemente quando o operador/cliente escolhe
// Aluminio vs Aco Inoxidavel vs Titanio.

/** Configuracao de caixas (material) por geracao Series. Series 9 = Al + Aço,
 *  Series 10/11 = Al + Titânio. Aço/Titânio sempre vem GPS+Cel de fabrica.
 *  Cores oficiais Apple por material (BR). Series 10 NAO tem Cinza-espacial. */
export const WATCH_SERIES_CASES: Record<
  string,
  { material: string; cores: string[]; forceGPSCel?: boolean }[]
> = {
  "9": [
    { material: "Alumínio", cores: ["Estelar", "Meia-noite", "Prateado", "Vermelho", "Rosa"] },
    { material: "Aço Inoxidável", cores: ["Grafite", "Prateado", "Dourado"], forceGPSCel: true },
  ],
  "10": [
    { material: "Alumínio", cores: ["Ouro Rosa", "Prateado", "Preto Brilhante"] },
    { material: "Titânio", cores: ["Titânio Natural", "Dourado", "Ardósia"], forceGPSCel: true },
  ],
  "11": [
    { material: "Alumínio", cores: ["Ouro Rosa", "Prateado", "Preto Brilhante", "Cinza-espacial"] },
    { material: "Titânio", cores: ["Titânio Natural", "Dourado", "Ardósia"], forceGPSCel: true },
  ],
};

/** Aliases bidirecionais entre nomes do catalogo (PT genericos / EN Apple) e
 *  o canonico Apple. Catalogo brasileiro usa nomes curtos ("Preto", "Cinza",
 *  "Dourado") que mapeiam pra varias cores Apple especificas dependendo do
 *  modelo+material. Filtro por material restringe pelo allow-list, entao as
 *  aliases podem ser permissivas. */
export const COR_ALIASES: Record<string, string[]> = {
  // Prateado / Prata / Silver
  "prata": ["prateado", "silver"],
  "prateado": ["prata", "silver"],
  "silver": ["prata", "prateado"],
  // Preto generico → cobre Midnight (Series 9 Al), Jet Black (Series 10/11 Al), Black Titanium
  "preto": ["preto brilhante", "jet black", "meia noite", "midnight", "titanio preto", "black titanium"],
  "preto brilhante": ["preto", "jet black"],
  "jet black": ["preto", "preto brilhante"],
  "meia noite": ["midnight", "preto"],
  "midnight": ["meia noite", "preto"],
  "titanio preto": ["preto", "black titanium"],
  "black titanium": ["preto", "titanio preto"],
  // Natural / Titanio Natural
  "natural": ["titanio natural"],
  "titanio natural": ["natural"],
  // Ardosia / Slate
  "ardosia": ["slate", "slate titanium"],
  "slate": ["ardosia", "slate titanium"],
  "slate titanium": ["ardosia", "slate"],
  // Estelar / Starlight
  "estelar": ["starlight"],
  "starlight": ["estelar"],
  // Cinza generico → cobre Graphite, Space Gray, Slate, Cinza-espacial, Ardosia
  "cinza": ["grafite", "graphite", "space gray", "space grey", "cinza espacial", "slate", "ardosia"],
  "cinza espacial": ["space gray", "space grey", "cinza"],
  "space gray": ["cinza espacial", "cinza"],
  "space grey": ["cinza espacial", "cinza"],
  "grafite": ["graphite", "cinza"],
  "graphite": ["grafite", "cinza"],
  // Dourado generico → cobre Gold, Rose Gold, Gold Titanium
  "dourado": ["gold", "ouro", "ouro rosa", "rose gold", "rose", "gold titanium"],
  "gold": ["dourado", "ouro"],
  "ouro": ["dourado", "gold"],
  "ouro rosa": ["rose gold", "rose", "dourado"],
  "rose gold": ["ouro rosa", "dourado"],
  "rose": ["ouro rosa", "dourado"],
  "gold titanium": ["dourado", "gold"],
  // Vermelho / Red / Product RED
  "vermelho": ["red", "product red"],
  "red": ["vermelho"],
  "product red": ["vermelho"],
  // Rosa / Pink
  "rosa": ["pink"],
  "pink": ["rosa"],
};

/** Normaliza cor pra comparacao: lowercase, sem acento, hifen→espaco, trim. */
export function normalizeCor(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bucket de aliases: o nome normalizado da cor + todas as suas aliases.
 *  Duas cores estao no mesmo bucket se Set.intersection nao for vazia. */
export function bucketOfCor(cor: string): Set<string> {
  const n = normalizeCor(cor);
  const bucket = new Set<string>([n]);
  for (const alias of COR_ALIASES[n] || []) bucket.add(normalizeCor(alias));
  return bucket;
}

function bucketsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** Detecta a geracao do Apple Watch Series a partir do nome do produto.
 *  "Apple Watch Series 11 GPS 42mm" → "11". Retorna null se nao bater Series. */
export function detectWatchSeriesGen(nomeProduto: string): string | null {
  if (!/Apple\s+Watch/i.test(nomeProduto)) return null;
  // Exclui SE e Ultra (cores nao dividem por material — SE so tem Aluminio,
  // Ultra so tem Titanio).
  if (/\bSE\b/i.test(nomeProduto) || /\bUltra\b/i.test(nomeProduto)) return null;
  const m = nomeProduto.match(/(?:Series\s+)?(\d+)/i);
  if (!m) return null;
  const gen = m[1];
  return WATCH_SERIES_CASES[gen] ? gen : null;
}

/** Retorna os materiais (Aluminio/Aço/Titânio) que tem AO MENOS uma cor
 *  cadastrada no catalogo pra essa geracao. Usado pra montar o picker de
 *  material — so mostra opcoes que de fato existem no estoque/catalogo do
 *  Tigrao. Ex: se admin so cadastrou cores Aluminio pra Series 11, o picker
 *  nao oferece Titanio. Quando admin ativar/cadastrar Titanio, aparece. */
export function getAvailableMaterials(coresRaw: string[], gen: string): { material: string; cores: string[]; forceGPSCel?: boolean }[] {
  const opts = WATCH_SERIES_CASES[gen];
  if (!opts) return [];
  return opts.filter((opt) => {
    const filtered = filterCoresByCase(coresRaw, gen, opt.material);
    // filterCoresByCase faz fallback pra coresRaw quando intersecao vazia —
    // entao precisamos checar se REALMENTE casou (cor do material existe no catalogo).
    return filtered !== coresRaw && filtered.length > 0;
  });
}

/** Filtra/dedup uma lista de cores do catalogo pelo material da caixa.
 *  - Match e via bucket de aliases (case+acento insensitive, EN/PT, dedup
 *    de variantes — "Preto" e "Preto Brilhante" colapsam).
 *  - Match exato com o nome canonico vence (preserva o nome catalogado).
 *  - Fallback: se nao tem exato mas tem alias, mostra o NOME CANONICO Apple
 *    (ex: catalogo so tem "Cinza" pra Series 10 Titanio → mostra "Ardósia").
 *  - Quando intersecao fica vazia (catalogo desalinhado), cai pra coresRaw
 *    pra nao travar a UI.
 *  - Ordem segue a lista canonica (oficial Apple), nao alfabetica do catalogo. */
export function filterCoresByCase(coresRaw: string[], gen: string, material: string): string[] {
  const opt = WATCH_SERIES_CASES[gen]?.find((o) => o.material === material);
  if (!opt || opt.cores.length === 0) return coresRaw;
  const filtered: string[] = [];
  const usedBuckets: Set<string>[] = [];
  for (const canonica of opt.cores) {
    const cbBucket = bucketOfCor(canonica);
    if (usedBuckets.some((u) => bucketsOverlap(u, cbBucket))) continue;
    // Match exato primeiro
    const exact = coresRaw.find((cor) => normalizeCor(cor) === normalizeCor(canonica));
    if (exact) {
      filtered.push(exact);
      usedBuckets.push(cbBucket);
      continue;
    }
    // Fallback: alias overlap → mostra o nome canonico Apple
    const hasAlias = coresRaw.some((cor) => bucketsOverlap(bucketOfCor(cor), cbBucket));
    if (hasAlias) {
      filtered.push(canonica);
      usedBuckets.push(cbBucket);
    }
  }
  return filtered.length > 0 ? filtered : coresRaw;
}
