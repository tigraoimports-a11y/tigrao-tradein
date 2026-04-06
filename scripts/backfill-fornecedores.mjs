import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = fs.readFileSync("/Users/Nicolas/Projetos/tigrao-tradein/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=["']?(.+?)["']?$/);
  if (m) process.env[m[1]] = m[2];
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry");
const map = JSON.parse(fs.readFileSync("scripts/fornecedores-map.json", "utf8"));
const serialMap = map.serial_to_forn;
const imeiMap = map.imei_to_forn;

console.log(`Carregado: ${Object.keys(serialMap).length} seriais, ${Object.keys(imeiMap).length} IMEIs`);
console.log(`Modo: ${DRY_RUN ? "DRY-RUN" : "APLICANDO"}`);

async function fetchAll(table, sel, filter) {
  const out = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(sel).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

// === VENDAS ===
const vendas = await fetchAll("vendas", "id,serial_no,imei,fornecedor", q => q.is("fornecedor", null));
console.log(`\nVendas com fornecedor NULL: ${vendas.length}`);

let matchSerial = 0, matchImei = 0, noMatch = 0;
const updates = [];
for (const v of vendas) {
  let forn = null;
  if (v.serial_no && serialMap[v.serial_no.toUpperCase()]) {
    forn = serialMap[v.serial_no.toUpperCase()];
    matchSerial++;
  } else if (v.imei && imeiMap[v.imei]) {
    forn = imeiMap[v.imei];
    matchImei++;
  } else {
    noMatch++;
    continue;
  }
  updates.push({ id: v.id, fornecedor: forn });
}
console.log(`  Match por serial: ${matchSerial}`);
console.log(`  Match por IMEI: ${matchImei}`);
console.log(`  Sem match: ${noMatch}`);

if (!DRY_RUN && updates.length > 0) {
  console.log(`\nAplicando ${updates.length} updates em vendas...`);
  let done = 0;
  for (const u of updates) {
    const { error } = await sb.from("vendas").update({ fornecedor: u.fornecedor }).eq("id", u.id);
    if (error) { console.error("ERR", u.id, error.message); break; }
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`✅ Vendas atualizadas: ${done}`);
}

// === ESTOQUE ===
const estoque = await fetchAll("estoque", "id,serial_no,fornecedor", q => q.is("fornecedor", null));
console.log(`\nEstoque com fornecedor NULL: ${estoque.length}`);

let estMatch = 0, estNoMatch = 0;
const estUpdates = [];
for (const e of estoque) {
  if (e.serial_no && serialMap[e.serial_no.toUpperCase()]) {
    estUpdates.push({ id: e.id, fornecedor: serialMap[e.serial_no.toUpperCase()] });
    estMatch++;
  } else {
    estNoMatch++;
  }
}
console.log(`  Match: ${estMatch}, sem match: ${estNoMatch}`);

if (!DRY_RUN && estUpdates.length > 0) {
  console.log(`\nAplicando ${estUpdates.length} updates em estoque...`);
  let done = 0;
  for (const u of estUpdates) {
    const { error } = await sb.from("estoque").update({ fornecedor: u.fornecedor }).eq("id", u.id);
    if (error) { console.error("ERR", u.id, error.message); break; }
    done++;
  }
  console.log(`✅ Estoque atualizado: ${done}`);
}

console.log("\n=== FIM ===");
