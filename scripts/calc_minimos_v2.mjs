import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/SUPABASE_URL="([^"]+)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const sb = createClient(url, key);

// ─── Normalização agressiva ───
// Remove TUDO que varia entre vendas e estoque: origem, sufixo SIM, parênteses, etc
function normalize(nome) {
  return nome
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")        // remove (10C CPU/10C GPU), (EUA), etc
    .replace(/[-–]+\s*(IP\s+)?(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E?-?SIM/gi, "")  // --SIM, -E-SIM
    .replace(/\b(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\b/g, "")    // origens
    .replace(/[-–]/g, " ")
    .replace(/["|']/g, " ")
    .replace(/\bSEMINOVO\b/gi, "")
    .replace(/\bWI-?FI\b/gi, "")
    .replace(/\bCELLULAR\b/gi, "CEL")
    .replace(/\bGPS\s*\+\s*CEL\b/gi, "GPS+CEL")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Mapa de cores EN↔PT ───
const COR_MAP = {
  "BLACK": "PRETO", "PRETO": "PRETO",
  "WHITE": "BRANCO", "BRANCO": "BRANCO",
  "SILVER": "PRATA", "PRATA": "PRATA",
  "GOLD": "DOURADO", "DOURADO": "DOURADO", "LIGHT GOLD": "DOURADO",
  "BLUE": "AZUL", "AZUL": "AZUL",
  "DEEP BLUE": "AZUL PROFUNDO", "AZUL PROFUNDO": "AZUL PROFUNDO",
  "SKY BLUE": "AZUL CÉU", "AZUL CÉU": "AZUL CÉU", "AZUL CEU": "AZUL CÉU",
  "MIST BLUE": "AZUL NÉVOA", "AZUL NÉVOA": "AZUL NÉVOA", "AZUL NEVOA": "AZUL NÉVOA",
  "GREEN": "VERDE", "VERDE": "VERDE", "ALPINE GREEN": "VERDE",
  "PINK": "ROSA", "ROSA": "ROSA",
  "PURPLE": "ROXO", "ROXO": "ROXO", "DEEP PURPLE": "ROXO",
  "LAVENDER": "LAVANDA", "LAVANDA": "LAVANDA",
  "RED": "VERMELHO", "VERMELHO": "VERMELHO",
  "ORANGE": "LARANJA", "LARANJA": "LARANJA",
  "COSMIC ORANGE": "LARANJA CÓSMICO", "LARANJA CÓSMICO": "LARANJA CÓSMICO", "LARANJA COSMICO": "LARANJA CÓSMICO",
  "STARLIGHT": "ESTELAR", "ESTELAR": "ESTELAR",
  "MIDNIGHT": "MEIA-NOITE", "MEIA-NOITE": "MEIA-NOITE",
  "SPACE GRAY": "CINZA", "CINZA ESPACIAL": "CINZA", "CINZA": "CINZA", "GRAFITE": "CINZA",
  "SPACE BLACK": "PRETO ESPACIAL", "PRETO ESPACIAL": "PRETO ESPACIAL",
  "NATURAL": "NATURAL", "NATURAL TITANIUM": "NATURAL",
  "BLACK TITANIUM": "TITÂNIO PRETO", "TITANIO PRETO": "TITÂNIO PRETO", "TITÂNIO PRETO": "TITÂNIO PRETO",
  "WHITE TITANIUM": "TITÂNIO BRANCO", "TITANIO BRANCO": "TITÂNIO BRANCO",
  "BLUE TITANIUM": "TITÂNIO AZUL", "TITANIO AZUL": "TITÂNIO AZUL",
  "DESERT TITANIUM": "TITÂNIO DESERTO", "TITANIO DESERTO": "TITÂNIO DESERTO",
  "CLOUD WHITE": "BRANCO", "SAGE": "SÁLVIA", "SÁLVIA": "SÁLVIA", "SALVIA": "SÁLVIA",
  "TEAL": "VERDE", "ULTRAMARINO": "AZUL", "ULTRAMARINE": "AZUL",
  "JET BLACK": "PRETO BRILHANTE", "PRETO BRILHANTE": "PRETO BRILHANTE",
  "INDIGO": "ÍNDIGO", "ÍNDIGO": "ÍNDIGO",
  "DOURADO CLARO": "DOURADO", "ROSE GOLD": "ROSA",
  "PACIFIC BLUE": "AZUL", "SIERRA BLUE": "AZUL",
};

// Cores conhecidas ordenadas por tamanho (match mais longo primeiro)
const CORES_SORTED = Object.keys(COR_MAP).sort((a, b) => b.length - a.length);

function normalizeCor(cor) {
  if (!cor) return null;
  const up = cor.toUpperCase().trim();
  return COR_MAP[up] || up;
}

// Extrai modelo base + cor normalizada de um nome de produto
function extractModeloCorNorm(nome) {
  const norm = normalize(nome);
  // Tenta encontrar cor conhecida no fim do nome normalizado
  for (const cor of CORES_SORTED) {
    const idx = norm.lastIndexOf(cor);
    if (idx >= 0 && idx + cor.length >= norm.length - 5) {
      const base = norm.substring(0, idx).replace(/\s+/g, " ").trim();
      return { base, corNorm: normalizeCor(cor) || cor };
    }
  }
  return { base: norm, corNorm: null };
}

// Tokeniza pra matching fuzzy
function tokenize(s) {
  return s.toUpperCase().replace(/[^A-Z0-9+]/g, " ").split(/\s+/).filter(t => t.length > 0);
}

// Verifica se todos tokens de A existem em B (match por tokens)
function tokensMatch(tokensA, tokensSetB) {
  return tokensA.every(t => tokensSetB.has(t));
}

// ─── Busca dados ───
const desde = new Date();
desde.setDate(desde.getDate() - 30);
const desdeStr = desde.toISOString().split("T")[0];

const [{ data: vendas }, { data: estoque }] = await Promise.all([
  sb.from("vendas").select("produto, data").gte("data", desdeStr).limit(5000),
  sb.from("estoque").select("id, produto, cor, qnt, estoque_minimo, categoria, status, tipo")
    .in("status", ["EM ESTOQUE", "ESGOTADO", "A CAMINHO", "PENDENTE"])
    .limit(5000),
]);

console.log(`Vendas últimos 30 dias: ${vendas?.length || 0}`);
console.log(`Itens no estoque: ${estoque?.length || 0}\n`);

// ─── Indexa estoque por base+corNorm ───
// Cada grupo é um conjunto de IDs do estoque
const estoqueGroups = new Map(); // "BASE|||CORNORM" → { ids[], qntEstoque, qntACaminho, minAtual, categoria }

for (const p of estoque || []) {
  if (!p.produto) continue;
  const { base } = extractModeloCorNorm(p.produto);
  const corNorm = normalizeCor(p.cor) || extractModeloCorNorm(p.produto).corNorm || "(sem cor)";
  const key = `${base}|||${corNorm}`;

  if (!estoqueGroups.has(key)) {
    estoqueGroups.set(key, { ids: [], qntEstoque: 0, qntACaminho: 0, minAtual: 0, categoria: p.categoria || "", base, corNorm });
  }
  const g = estoqueGroups.get(key);
  g.ids.push(p.id);
  if (p.tipo === "A_CAMINHO") {
    g.qntACaminho += p.qnt || 0;
  } else if (p.status === "EM ESTOQUE") {
    g.qntEstoque += p.qnt || 0;
  }
  if (typeof p.estoque_minimo === "number" && p.estoque_minimo > 0) {
    g.minAtual = Math.max(g.minAtual, p.estoque_minimo);
  }
}

// ─── Conta vendas e faz matching fuzzy com estoque ───
const vendasCount = new Map(); // "estoqueKey" → qtdVendida

for (const v of vendas || []) {
  if (!v.produto) continue;
  const { base: vBase, corNorm: vCor } = extractModeloCorNorm(v.produto);
  const vTokens = tokenize(vBase);

  // Tenta match direto
  let matched = false;
  for (const [eKey, eg] of estoqueGroups) {
    const eTokens = new Set(tokenize(eg.base));
    const mesmaCorOuSemCor = !vCor || !eg.corNorm || eg.corNorm === "(sem cor)" || vCor === eg.corNorm;

    if (mesmaCorOuSemCor && tokensMatch(vTokens, eTokens)) {
      // Todos tokens da venda existem no estoque → match
      const matchKey = vCor && eg.corNorm !== "(sem cor)" ? `${eg.base}|||${vCor}` : eKey;
      vendasCount.set(matchKey, (vendasCount.get(matchKey) || 0) + 1);
      matched = true;
      break;
    }
  }

  // Se não achou match direto, tenta match mais flexível (estoque tokens contém venda tokens)
  if (!matched) {
    for (const [eKey, eg] of estoqueGroups) {
      const eTokensSet = new Set(tokenize(eg.base));
      // Pelo menos 80% dos tokens da venda batem
      const matchCount = vTokens.filter(t => eTokensSet.has(t)).length;
      if (matchCount >= vTokens.length * 0.7 && vCor === eg.corNorm) {
        vendasCount.set(eKey, (vendasCount.get(eKey) || 0) + 1);
        matched = true;
        break;
      }
    }
  }

  if (!matched) {
    // Produto vendido sem match no estoque (pode ser esgotado/removido)
    const fallbackKey = `${vBase}|||${vCor || "(sem cor)"}`;
    vendasCount.set(fallbackKey, (vendasCount.get(fallbackKey) || 0) + 1);
  }
}

// ─── Gera tabela de sugestões ───
console.log("=== MÍNIMOS SUGERIDOS (vendas 30 dias × matching inteligente) ===\n");
console.log(`${"Modelo base".padEnd(50)} ${"Cor".padEnd(18)} V/30d  Med/s  MínSug  Estq  ACam  MínAt  IDs`);
console.log("─".repeat(140));

const updates = [];
const allResults = [];

// Consolida: pra cada grupo de estoque COM vendas, calcula mínimo sugerido
for (const [eKey, eg] of estoqueGroups) {
  const qtdVendida = vendasCount.get(eKey) || 0;
  if (qtdVendida === 0 && eg.qntEstoque === 0 && eg.qntACaminho === 0) continue; // sem vendas e sem estoque — ignorar

  const mediaSemanal = qtdVendida / 4.3;
  // Cobertura de ~3-4 dias úteis (produtos chegam no dia seguinte, preço muda com dólar)
  // Piso 2, teto 4 (André definiu: nenhum produto passa de 4)
  const minSugerido = qtdVendida > 0 ? Math.min(4, Math.max(2, Math.ceil(mediaSemanal * 0.7))) : 0;
  const precisaAtualizar = minSugerido > 0 && minSugerido !== eg.minAtual && eg.ids.length > 0;

  allResults.push({
    base: eg.base, corNorm: eg.corNorm, qtdVendida, mediaSemanal: Math.round(mediaSemanal * 10) / 10,
    minSugerido, qntEstoque: eg.qntEstoque, qntACaminho: eg.qntACaminho, minAtual: eg.minAtual,
    ids: eg.ids, precisaAtualizar, categoria: eg.categoria,
  });

  if (precisaAtualizar) {
    updates.push({ ids: eg.ids, min: minSugerido });
  }
}

// Ordena por vendas desc
allResults.sort((a, b) => b.qtdVendida - a.qtdVendida);

for (const r of allResults.filter(r => r.qtdVendida > 0)) {
  const flag = r.precisaAtualizar ? " ← ATUALIZAR" : "";
  console.log(
    `${r.base.padEnd(50)} ${(r.corNorm || "-").padEnd(18)} ${String(r.qtdVendida).padStart(4)}  ${String(r.mediaSemanal).padStart(5)}  ${String(r.minSugerido).padStart(6)}  ${String(r.qntEstoque).padStart(4)}  ${String(r.qntACaminho).padStart(4)}  ${String(r.minAtual).padStart(5)}  ${r.ids.length} item(s)${flag}`
  );
}

const totalUpdates = updates.reduce((s, u) => s + u.ids.length, 0);
console.log(`\n─────────────────────────────`);
console.log(`Produtos com vendas: ${allResults.filter(r => r.qtdVendida > 0).length}`);
console.log(`Grupos a atualizar: ${updates.length} (${totalUpdates} linhas no banco)`);
console.log(`\nPra aplicar: node scripts/calc_minimos_v2.mjs --apply`);

if (process.argv.includes("--apply")) {
  console.log("\n🔄 Aplicando...");
  let ok = 0;
  for (const u of updates) {
    for (let i = 0; i < u.ids.length; i += 100) {
      const chunk = u.ids.slice(i, i + 100);
      const { error } = await sb.from("estoque").update({ estoque_minimo: u.min }).in("id", chunk);
      if (error) console.log(`  ERR: ${error.message}`);
      else ok += chunk.length;
    }
  }
  console.log(`✅ ${ok} linhas atualizadas!`);
}
