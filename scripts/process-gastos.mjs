#!/usr/bin/env node
/**
 * Processa o CSV de gastos (DESPESAS) do Numbers e gera JSON limpo
 * Usage: node scripts/process-gastos.mjs "/path/to/GASTOS DE MARÇO-DESPESAS.csv"
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const csvPath = process.argv[2] || "/Users/andrefelippe/Downloads/VENDAS MARÇO 2026 csv/GASTOS DE MARÇO-DESPESAS.csv";
const raw = readFileSync(csvPath, "utf8");

const lines = raw.split("\n").map(l => l.trim()).filter(l => l);
const headers = lines[0].split(";").map(h => h.trim());

console.log("📋 Colunas:", headers.join(" | "));

// Helpers
function parseDate(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const m = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseReais(val) {
  if (!val) return 0;
  const clean = val.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(clean) || 0;
}

function parseBanco(val) {
  if (!val) return null;
  const v = val.toUpperCase().replace(/[ÚÜ]/g, "U").replace(/[ÃÂ]/g, "A").replace(/[ÉÊ]/g, "E").trim();
  if (v.includes("ITAU")) return "ITAU";
  if (v.includes("INFINITE") || v.includes("INF")) return "INFINITE";
  if (v.includes("MERCADO") || v.includes("MP")) return "MERCADO_PAGO";
  if (v.includes("ESPECIE") || v.includes("DINHEIRO")) return "ESPECIE";
  return null;
}

function parseCategoria(val) {
  if (!val) return "OUTROS";
  const v = val.toUpperCase().trim()
    .replace(/[ÀÁÂÃÄ]/g, "A").replace(/[ÈÉÊË]/g, "E").replace(/[ÌÍÎÏ]/g, "I")
    .replace(/[ÒÓÔÕÖ]/g, "O").replace(/[ÙÚÛÜ]/g, "U").replace(/[Ç]/g, "C");
  if (v.includes("SALARIO")) return "SALARIO";
  if (v.includes("ANUNCIO")) return "ANUNCIOS";
  if (v.includes("ALIMENTA")) return "ALIMENTACAO";
  if (v.includes("CORREIO")) return "CORREIOS";
  if (v.includes("MOTOBOY") && v.includes("RJ")) return "MOTOBOY RJ";
  if (v.includes("MOTOBOY") && v.includes("SP")) return "MOTOBOY SP";
  if (v.includes("MOTOBOY")) return "MOTOBOY RJ";
  if (v.includes("SISTEMA")) return "SISTEMAS";
  if (v.includes("GASTOS LOJA") || v.includes("LOJA")) return "GASTOS LOJA";
  if (v.includes("FORNECEDOR")) return "FORNECEDOR";
  if (v.includes("IMPOSTO")) return "IMPOSTOS";
  if (v.includes("EQUIP")) return "EQUIPAMENTOS";
  if (v.includes("DOAC")) return "DOACOES";
  if (v.includes("TRANSPORT")) return "TRANSPORTE";
  if (v.includes("MARKETING")) return "MARKETING";
  return v;
}

function parseTipo(val) {
  if (!val) return "SAIDA";
  const v = val.toUpperCase().trim()
    .replace(/[ÀÁÂÃÄ]/g, "A").replace(/[ÈÉÊË]/g, "E").replace(/[ÌÍÎÏ]/g, "I")
    .replace(/[ÒÓÔÕÖ]/g, "O").replace(/[ÙÚÛÜ]/g, "U");
  if (v.includes("ENTRADA")) return "ENTRADA";
  return "SAIDA";
}

// Headers map: DATA;TIPO;HORA;CATEGORIA;DESCRIÇÃO;VALOR (R$);BANCO;OBSERVAÇÃO
const gastos = [];
const skipped = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(";").map(c => c.trim());
  if (cols.length < 6) continue;

  const dataRaw = cols[0];
  const tipoRaw = cols[1];
  // cols[2] = hora (skip)
  const categoriaRaw = cols[3];
  const descricaoRaw = cols[4];
  const valorRaw = cols[5];
  const bancoRaw = cols[6] || "";
  const obsRaw = cols[7] || "";

  const data = parseDate(dataRaw);
  if (!data) {
    skipped.push(`Linha ${i}: sem data (${descricaoRaw || "vazio"})`);
    continue;
  }

  const valor = parseReais(valorRaw);
  if (valor === 0) {
    skipped.push(`Linha ${i}: valor zero (${descricaoRaw})`);
    continue;
  }

  const tipo = parseTipo(tipoRaw);
  const categoria = parseCategoria(categoriaRaw);
  const banco = parseBanco(bancoRaw);

  const row = {
    data,
    tipo,
    categoria,
    valor,
    descricao: (descricaoRaw || "").toUpperCase() || null,
    banco: banco || "ITAU",
    observacao: (obsRaw || "").trim() || null,
  };

  gastos.push(row);
}

console.log(`\n✅ ${gastos.length} gastos processados`);
console.log(`⚠️ ${skipped.length} linhas ignoradas`);

if (skipped.length > 0) {
  console.log("\nLinhas ignoradas:");
  for (const s of skipped.slice(0, 10)) console.log(`  ${s}`);
}

// Stats
const porCat = {};
for (const g of gastos) {
  porCat[g.categoria] = (porCat[g.categoria] || 0) + g.valor;
}
console.log("\n📊 Por categoria:");
for (const [cat, val] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: R$ ${Math.round(val).toLocaleString("pt-BR")}`);
}

const total = gastos.reduce((s, g) => s + g.valor, 0);
console.log(`\n💰 Total gastos: R$ ${Math.round(total).toLocaleString("pt-BR")}`);

const outPath = join(dirname(csvPath), "gastos-clean.json");
writeFileSync(outPath, JSON.stringify(gastos, null, 2));
console.log(`\n✅ Salvo em: ${outPath}`);
