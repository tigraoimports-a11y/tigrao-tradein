#!/usr/bin/env node
/**
 * Script para juntar todos os CSVs de estoque num JSON unificado
 * para importar via /api/estoque
 *
 * Usage: node scripts/merge-estoque.mjs "/path/to/estoque folder"
 * Output: estoque-merged.json no mesmo diretório
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const folder = process.argv[2] || "/Users/andrefelippe/Downloads/estoque 2026 csv ";

function parseCSV(text, delimiter = ";") {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function parseReais(val) {
  if (!val) return 0;
  const clean = val.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(clean) || 0;
}

function parseQnt(val) {
  return parseInt(val) || 0;
}

const allProducts = [];

// ========================================
// 1. IPHONES
// ========================================
function processIphones() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE IPHONES.csv");
  try {
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const mem = (r["MEMORIA"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: `${modelo} ${mem}`.trim(),
        categoria: "IPHONES",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Iphones: ${allProducts.length} items`);
  } catch (e) { console.log("⚠️ Iphones not found"); }
}

// ========================================
// 2. IPADS
// ========================================
function processIpads() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE IPADS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const mem = (r["MEMORIA"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: `${modelo} ${mem}`.trim(),
        categoria: "IPADS",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Ipads: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Ipads not found"); }
}

// ========================================
// 3. MACBOOK
// ========================================
function processMacbooks() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE MACBOOK.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const tela = (r["TELA"] || "").trim();
      const armaz = (r["ARMAZ."] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      const nomeProd = tela ? `${modelo} ${tela} ${armaz}`.trim() : `${modelo} ${armaz}`.trim();
      allProducts.push({
        produto: nomeProd,
        categoria: "MACBOOK",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Macbooks: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Macbooks not found"); }
}

// ========================================
// 4. MAC MINI
// ========================================
function processMacMini() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE MAC MINI.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const armaz = (r["ARMAZ."] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: `${modelo} ${armaz}`.trim(),
        categoria: "MACBOOK",
        qnt,
        custo_unitario: custo,
        cor: null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Mac Mini: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Mac Mini not found"); }
}

// ========================================
// 5. APPLE WATCH (Varejo)
// ========================================
function processAppleWatch() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE APPLE WATCH.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const tam = (r["TAMANHO"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const puls = (r["PULSEIRA"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      const obs = puls ? `Pulseira: ${puls}` : null;
      allProducts.push({
        produto: `${modelo} ${tam}`.trim(),
        categoria: "APPLE_WATCH",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
        observacao: obs,
      });
    }
    console.log(`✅ Apple Watch: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Apple Watch not found"); }
}

// ========================================
// 6. APPLE WATCH ATACADO
// ========================================
function processAppleWatchAtacado() {
  const file = join(folder, "ESTOQUE PRODUTOS-APPLE WATCH ESTOQUE- ATACADO.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const tam = (r["TAMANHO"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: `${modelo} ${tam}`.trim(),
        categoria: "APPLE_WATCH",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
        observacao: "Atacado",
      });
    }
    console.log(`✅ Apple Watch Atacado: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Apple Watch Atacado not found"); }
}

// ========================================
// 7. APPLE WATCH RESERVA
// ========================================
function processAppleWatchReserva() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE RESERVA DE APPLE WATCH.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const tam = (r["TAMANHO"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: `${modelo} ${tam}`.trim(),
        categoria: "APPLE_WATCH",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
        observacao: "Reserva",
      });
    }
    console.log(`✅ Apple Watch Reserva: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Apple Watch Reserva not found"); }
}

// ========================================
// 8. AIRPODS
// ========================================
function processAirpods() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE AIRPODS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["VALOR UNIT."] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      // Some airpods have color in name (AIRPODS MAX ESTELAR)
      let cor = null;
      const corMatch = modelo.match(/(ESTELAR|MIDNIGHT|PRETO|BRANCO|AZUL|ROSA|SILVER|GOLD|SPACE)$/i);
      if (corMatch) cor = corMatch[1].toUpperCase();
      allProducts.push({
        produto: modelo,
        categoria: "AIRPODS",
        qnt,
        custo_unitario: custo,
        cor,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Airpods: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Airpods not found"); }
}

// ========================================
// 9. ACESSÓRIOS
// ========================================
function processAcessorios() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE ACESSÓRIOS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: modelo,
        categoria: "ACESSORIOS",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
      });
    }
    console.log(`✅ Acessórios: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Acessórios not found"); }
}

// ========================================
// 10. CABOS E FONTES
// ========================================
function processCabosFontes() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE CABOS E FONTES.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["VALOR UNIT."] || r["Valor unitário"]);
      const fornecedor = (r["FORNECEDOR"] || "").trim();
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      allProducts.push({
        produto: modelo,
        categoria: "ACESSORIOS",
        qnt,
        custo_unitario: custo,
        cor: null,
        status: "EM ESTOQUE",
        tipo: "NOVO",
        fornecedor: fornecedor || null,
      });
    }
    console.log(`✅ Cabos/Fontes: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Cabos/Fontes not found"); }
}

// ========================================
// 11. SEMINOVOS
// ========================================
function processSeminovos() {
  const file = join(folder, "ESTOQUE PRODUTOS-ESTOQUE DE SEMINOVOS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const obs = (r["OBSERVAÇOES"] || r["OBSERVAÇÕES"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const bat = (r["BATERI."] || r["BATERIA%"] || "").replace("%", "").trim();
      const qnt = parseQnt(r["QNT"]);
      const custo = parseReais(r["Valor unitário "] || r["Valor unitário"]);
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      // Skip section headers (e.g. "16 PM COM GARANTIA APPLE")
      if (!custo && !qnt) continue;
      allProducts.push({
        produto: modelo,
        categoria: "IPHONES",
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "EM ESTOQUE",
        tipo: "SEMINOVO",
        bateria: parseInt(bat) || null,
        observacao: obs || null,
      });
    }
    console.log(`✅ Seminovos: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Seminovos not found"); }
}

// ========================================
// 12. PRODUTOS A CAMINHO
// ========================================
function processACaminho() {
  const file = join(folder, "ESTOQUE PRODUTOS-PRODUTOS A CAMINHO   PEDIDOS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const modelo = (r["MODELO"] || "").trim();
      const qnt = parseQnt(r["QNT."] || r["QNT"]);
      const custo = parseReais(r["VALOR "] || r["VALOR"]);
      const fornecedor = (r["FORNECEDOR"] || "").trim();
      if (!modelo || modelo === "TOTAL" || qnt === 0) continue;
      // Skip section headers like "PEDIDO 17/03/2026" or "CRÉDITO PENDENTE"
      if (modelo.startsWith("PEDIDO") || modelo.startsWith("CRÉDITO PENDENTE") && !custo) continue;
      if (!custo) continue;

      // Detect category from name
      let cat = "OUTROS";
      const up = modelo.toUpperCase();
      if (up.includes("IPHONE")) cat = "IPHONES";
      else if (up.includes("IPAD")) cat = "IPADS";
      else if (up.includes("MACBOOK") || up.includes("MAC MINI") || up.includes("MAC STUDIO")) cat = "MACBOOK";
      else if (up.includes("WATCH")) cat = "APPLE_WATCH";
      else if (up.includes("AIRPODS")) cat = "AIRPODS";

      allProducts.push({
        produto: modelo,
        categoria: cat,
        qnt,
        custo_unitario: custo,
        cor: null,
        status: "A CAMINHO",
        tipo: "NOVO",
        fornecedor: fornecedor || null,
      });
    }
    console.log(`✅ A Caminho: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ A Caminho not found"); }
}

// ========================================
// 13. PENDÊNCIAS (produtos que o cliente vai devolver)
// ========================================
function processPendencias() {
  const file = join(folder, "ESTOQUE PRODUTOS-PENDENCIAS.csv");
  try {
    const before = allProducts.length;
    const rows = parseCSV(readFileSync(file, "utf8"));
    for (const r of rows) {
      const produto = (r["PRODUTO"] || "").trim();
      const cliente = (r["CLIENTE"] || "").trim();
      const detalhes = (r["DETALHES DO PRODUTO"] || "").trim();
      const cor = (r["COR"] || "").trim();
      const bat = (r["BATERIA%"] || "").replace("%", "").trim();
      const qnt = parseQnt(r["QT"]);
      const custo = parseReais(r["VALOR"]);
      const dataCompra = r["DATA DA COMPRA"] || "";
      if (!produto || produto === "TOTAL" || qnt === 0 || !custo) continue;

      let cat = "OUTROS";
      const up = produto.toUpperCase();
      if (up.includes("IPHONE")) cat = "IPHONES";
      else if (up.includes("IPAD")) cat = "IPADS";
      else if (up.includes("MACBOOK")) cat = "MACBOOK";
      else if (up.includes("WATCH")) cat = "APPLE_WATCH";

      // Parse date
      let dataISO = null;
      const dm = dataCompra.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
      if (dm) {
        let year = dm[3];
        if (year.length === 2) year = `20${year}`;
        dataISO = `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
      }

      allProducts.push({
        produto,
        categoria: cat,
        qnt,
        custo_unitario: custo,
        cor: cor || null,
        status: "PENDENTE",
        tipo: "SEMINOVO",
        bateria: parseInt(bat) || null,
        cliente: cliente || null,
        data_compra: dataISO,
        observacao: detalhes || null,
      });
    }
    console.log(`✅ Pendências: ${allProducts.length - before} items`);
  } catch (e) { console.log("⚠️ Pendências not found"); }
}

// ========================================
// RUN ALL
// ========================================
processIphones();
processIpads();
processMacbooks();
processMacMini();
processAppleWatch();
processAppleWatchAtacado();
processAppleWatchReserva();
processAirpods();
processAcessorios();
processCabosFontes();
processSeminovos();
processACaminho();
processPendencias();

console.log(`\n📦 TOTAL: ${allProducts.length} produtos`);

// Show summary by category
const byCat = {};
for (const p of allProducts) {
  byCat[p.categoria] = (byCat[p.categoria] || 0) + p.qnt;
}
console.log("\n📊 Por categoria (unidades):");
for (const [cat, qty] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${qty}`);
}

// Show by status
const byStatus = {};
for (const p of allProducts) {
  byStatus[p.status] = (byStatus[p.status] || 0) + p.qnt;
}
console.log("\n📊 Por status (unidades):");
for (const [st, qty] of Object.entries(byStatus)) {
  console.log(`  ${st}: ${qty}`);
}

// Save
const outPath = join(folder, "estoque-merged.json");
writeFileSync(outPath, JSON.stringify(allProducts, null, 2));
console.log(`\n✅ Salvo em: ${outPath}`);
