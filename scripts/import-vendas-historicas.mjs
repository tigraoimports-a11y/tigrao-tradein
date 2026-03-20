#!/usr/bin/env node
/**
 * Importa vendas históricas do JSON para o Supabase via API bulk.
 *
 * Uso: ADMIN_PASSWORD=13A*123456avast node scripts/import-vendas-historicas.mjs
 *
 * Opções:
 *   --dry-run        Não insere, só mostra o que faria
 *   --from=YYYY-MM   Importar a partir desse mês
 *   --to=YYYY-MM     Importar até esse mês
 *   --local          Usar localhost:3000 em vez de produção
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const useLocal = args.includes("--local");
const API_BASE = useLocal ? "http://localhost:3000" : "https://tigrao-tradein.vercel.app";
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error("❌ Defina ADMIN_PASSWORD. Ex: ADMIN_PASSWORD=13A*123456avast node scripts/import-vendas-historicas.mjs");
  process.exit(1);
}

const fromArg = args.find(a => a.startsWith("--from="))?.split("=")[1];
const toArg = args.find(a => a.startsWith("--to="))?.split("=")[1];

// Ler JSON
const vendas = JSON.parse(readFileSync(join(__dirname, "vendas-historicas.json"), "utf-8"));
console.log(`📦 Total de vendas no JSON: ${vendas.length}`);

// Filtrar por período
let filtered = vendas;
if (fromArg) {
  filtered = filtered.filter(v => v.data >= fromArg);
  console.log(`📅 Filtrando de ${fromArg}: ${filtered.length} vendas`);
}
if (toArg) {
  filtered = filtered.filter(v => v.data <= toArg + "-31");
  console.log(`📅 Filtrando até ${toArg}: ${filtered.length} vendas`);
}

// Resumo por mês
const byMonth = {};
for (const v of filtered) {
  const m = v.data.slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
}
console.log("\nVendas por mês:");
for (const [m, count] of Object.entries(byMonth).sort()) {
  console.log(`  ${m}: ${count} vendas`);
}
console.log(`  Total: ${filtered.length} vendas\n`);

if (dryRun) {
  console.log("🔍 DRY RUN — nenhuma venda será inserida");
  process.exit(0);
}

// Importar mês a mês (para não estourar payload)
console.log(`🚀 Importando para ${API_BASE}...\n`);
let totalImported = 0;
let totalErrors = 0;

const months = Object.keys(byMonth).sort();
for (const month of months) {
  const monthVendas = filtered.filter(v => v.data.startsWith(month));

  process.stdout.write(`  ${month}: ${monthVendas.length} vendas... `);

  try {
    const res = await fetch(`${API_BASE}/api/vendas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": PASSWORD,
      },
      body: JSON.stringify({ action: "import_bulk", rows: monthVendas }),
    });

    const json = await res.json();
    if (json.ok) {
      console.log(`✅ ${json.imported} importadas${json.errors?.length ? `, ${json.errors.length} erros` : ""}`);
      totalImported += json.imported;
      if (json.errors?.length) {
        totalErrors += json.errors.length;
        json.errors.slice(0, 3).forEach(e => console.log(`    ⚠️ ${e}`));
      }
    } else {
      console.log(`❌ ${json.error}`);
      totalErrors += monthVendas.length;
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
    totalErrors += monthVendas.length;
  }
}

console.log(`\n✅ Importação concluída!`);
console.log(`  📊 Importadas: ${totalImported}`);
console.log(`  ❌ Erros: ${totalErrors}`);
