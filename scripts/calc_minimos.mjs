import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/SUPABASE_URL="([^"]+)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const sb = createClient(url, key);

// Busca vendas dos últimos 30 dias
const desde = new Date();
desde.setDate(desde.getDate() - 30);
const desdeStr = desde.toISOString().split("T")[0];

const { data: vendas } = await sb.from("vendas")
  .select("produto, data")
  .gte("data", desdeStr)
  .limit(5000);

console.log(`Vendas nos últimos 30 dias: ${vendas?.length || 0}\n`);

// Agrupar vendas por modelo base (sem cor/origem)
function stripDetails(nome) {
  return nome
    .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?/gi, "")
    .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
    .replace(/-\s*E-?SIM/gi, "")
    .replace(/\s{2,}/g, " ").trim();
}

// Lista de cores conhecidas pra extrair do nome
const CORES = [
  "PRETO", "BRANCO", "PRATA", "DOURADO", "AZUL", "VERDE", "ROSA", "ROXO",
  "ESTELAR", "MEIA-NOITE", "LAVANDA", "NATURAL", "GRAFITE",
  "LARANJA CÓSMICO", "LARANJA COSMICO", "AZUL PROFUNDO", "AZUL NÉVOA",
  "AZUL CEU", "PRETO ESPACIAL", "CINZA ESPACIAL", "DOURADO CLARO",
  "CLOUD WHITE", "SKY BLUE", "SALVIA", "SÁLVIA", "PRETO BRILHANTE",
  "ÍNDIGO", "INDIGO", "LARANJA", "CINZA",
  "TITANIO PRETO", "TITANIO BRANCO", "TITANIO NATURAL", "TITANIO AZUL",
  "DESERT TITANIUM", "BLACK TITANIUM", "WHITE TITANIUM", "NATURAL TITANIUM",
  "BLUE TITANIUM", "DEEP PURPLE", "PACIFIC BLUE", "ALPINE GREEN",
  "SIERRA BLUE", "JET BLACK", "MIDNIGHT", "STARLIGHT", "GOLD", "SILVER",
  "BLACK", "BLUE", "GREEN", "PINK", "PURPLE", "ORANGE", "WHITE",
  "SPACE GRAY", "RED",
].sort((a, b) => b.length - a.length);

function extractModeloCor(nome) {
  const cleaned = stripDetails(nome);
  const up = cleaned.toUpperCase();
  for (const cor of CORES) {
    const idx = up.lastIndexOf(cor);
    if (idx >= 0 && idx + cor.length >= up.length - 3) {
      const modelo = cleaned.substring(0, idx).trim().replace(/\s*-\s*$/, "").trim();
      return { modelo: modelo.toUpperCase(), cor: cor };
    }
  }
  return { modelo: cleaned.toUpperCase(), cor: "(sem cor)" };
}

// Conta vendas por modelo+cor
const vendasPorModeloCor = {};
for (const v of vendas || []) {
  if (!v.produto) continue;
  const { modelo, cor } = extractModeloCor(v.produto);
  const key = `${modelo}|||${cor}`;
  vendasPorModeloCor[key] = (vendasPorModeloCor[key] || 0) + 1;
}

// Calcula mínimo sugerido: média semanal × 2 (cobertura 2 semanas), mín 2
const sugestoes = [];
for (const [key, qtdVendida] of Object.entries(vendasPorModeloCor)) {
  const [modelo, cor] = key.split("|||");
  const mediaSemanal = qtdVendida / 4.3; // ~30 dias = 4.3 semanas
  const minSugerido = Math.max(2, Math.ceil(mediaSemanal * 2));
  sugestoes.push({ modelo, cor, qtdVendida, mediaSemanal: Math.round(mediaSemanal * 10) / 10, minSugerido });
}

// Ordena por quantidade vendida (desc)
sugestoes.sort((a, b) => b.qtdVendida - a.qtdVendida);

// Busca estoque atual pra comparar
const { data: estoque } = await sb.from("estoque")
  .select("id, produto, cor, qnt, estoque_minimo, categoria, status")
  .in("status", ["EM ESTOQUE", "ESGOTADO"])
  .limit(5000);

console.log("=== MÍNIMOS SUGERIDOS (baseado em vendas dos últimos 30 dias) ===\n");
console.log(`${"Modelo".padEnd(45)} ${"Cor".padEnd(20)} Vendas/30d  Média/sem  Mín sugerido  Estoque atual  Mín atual`);
console.log("─".repeat(150));

let totalUpdates = 0;
const updates = []; // { ids: string[], min: number, modelo: string, cor: string }

for (const s of sugestoes) {
  // Encontra itens do estoque que batem com esse modelo+cor
  const matching = (estoque || []).filter(p => {
    const { modelo, cor } = extractModeloCor(p.produto);
    return modelo === s.modelo && (cor === s.cor || (s.cor === "(sem cor)" && !p.cor));
  });

  const qntAtual = matching.reduce((sum, p) => sum + (p.qnt || 0), 0);
  const minAtual = matching[0]?.estoque_minimo || 0;
  const ids = matching.map(p => p.id);

  if (ids.length > 0 && s.minSugerido !== minAtual) {
    updates.push({ ids, min: s.minSugerido, modelo: s.modelo, cor: s.cor });
    totalUpdates += ids.length;
  }

  const flag = ids.length > 0 && s.minSugerido !== minAtual ? " ← ATUALIZAR" : "";
  console.log(
    `${s.modelo.padEnd(45)} ${s.cor.padEnd(20)} ${String(s.qtdVendida).padStart(5)}      ${String(s.mediaSemanal).padStart(5)}      ${String(s.minSugerido).padStart(6)}         ${String(qntAtual).padStart(5)}      ${String(minAtual).padStart(5)}${flag}`
  );
}

console.log(`\n─────────────────────────────`);
console.log(`Total de modelos+cor com vendas: ${sugestoes.length}`);
console.log(`Updates a aplicar: ${updates.length} grupos (${totalUpdates} linhas no banco)`);
console.log(`\nPra aplicar, rode: node scripts/calc_minimos.mjs --apply`);

// Se --apply, roda os updates
if (process.argv.includes("--apply")) {
  console.log("\n🔄 Aplicando updates...");
  let ok = 0;
  for (const u of updates) {
    for (let i = 0; i < u.ids.length; i += 100) {
      const chunk = u.ids.slice(i, i + 100);
      const { error } = await sb.from("estoque").update({ estoque_minimo: u.min }).in("id", chunk);
      if (error) console.log(`  ERR ${u.modelo} ${u.cor}: ${error.message}`);
      else ok += chunk.length;
    }
  }
  console.log(`✅ ${ok} linhas atualizadas com sucesso!`);
}
