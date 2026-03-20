#!/usr/bin/env node
/**
 * Processa o CSV de vendas do Numbers e gera JSON limpo para importar
 * Usage: node scripts/process-vendas.mjs "/path/to/VENDAS MÊS-v.csv"
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const csvPath = process.argv[2] || "/Users/andrefelippe/Downloads/VENDAS MARÇO 2026 csv/VENDAS MÊS-v.csv";
const raw = readFileSync(csvPath, "utf8");

// Parse CSV com delimitador ;
const lines = raw.split("\n").map(l => l.trim()).filter(l => l);
const headerLine = lines[0];
const headers = headerLine.split(";").map(h => h.trim());

console.log("📋 Colunas encontradas:", headers.length);
console.log(headers.join(" | "));

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
  if (v.includes("ITAU") && v.includes("MP")) return "ITAU";
  if (v.includes("ITAU") && v.includes("INFINITE")) return "ITAU";
  if (v.includes("ITAU")) return "ITAU";
  if (v.includes("INFINITE") || v.includes("INF")) return "INFINITE";
  if (v.includes("MERCADO") || v.includes("MP")) return "MERCADO_PAGO";
  if (v.includes("ESPECIE") || v.includes("DINHEIRO")) return "ESPECIE";
  return null;
}

function parseForma(val) {
  if (!val) return null;
  const v = val.toUpperCase().trim();
  if (v.includes("CREDITO") || v.includes("CRÉDITO")) return "CARTAO";
  if (v.includes("DEBITO") || v.includes("DÉBITO")) return "CARTAO";
  if (v.includes("LINK")) return "CARTAO";
  if (v.includes("PIX")) return "PIX";
  if (v.includes("DINHEIRO")) return "DINHEIRO";
  if (v.includes("FIADO")) return "FIADO";
  if (v.includes("ESPECIE") || v.includes("ESPÉCIE")) return "DINHEIRO";
  if (v.includes("CARTAO") || v.includes("CARTÃO")) return "CARTAO";
  return null;
}

function parseOrigem(val) {
  if (!val) return null;
  const v = val.toUpperCase().trim()
    .replace(/[ÀÁÂÃÄ]/g, "A").replace(/[ÈÉÊË]/g, "E").replace(/[ÌÍÎÏ]/g, "I")
    .replace(/[ÒÓÔÕÖ]/g, "O").replace(/[ÙÚÛÜ]/g, "U").replace(/[Ç]/g, "C");
  if (v.includes("ANUNCIO")) return "ANUNCIO";
  if (v.includes("RECOMPRA")) return "RECOMPRA";
  if (v.includes("INDICACAO") || v.includes("INDICAC")) return "INDICACAO";
  if (v.includes("ATACADO")) return "ATACADO";
  if (v.includes("CHAT") || v.includes("GPT") || v.includes("TIK") || v.includes("TOK")) return "ANUNCIO";
  return null;
}

function parseRecebimento(formaRaw) {
  if (!formaRaw) return "D+0";
  const f = formaRaw.toUpperCase();
  if (f.includes("CREDITO") || f.includes("CRÉDITO")) return "D+1";
  if (f.includes("LINK")) return "D+0"; // Mercado Pago Link = D+0
  if (f.includes("FIADO")) return "FIADO";
  return "D+0";
}

// Determine today for auto-status
const hoje = new Date().toISOString().split("T")[0]; // 2026-03-19

const vendas = [];
const skipped = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(";");
  if (cols.length < 8) continue;

  const cliente = (cols[0] || "").trim();
  const origemRaw = (cols[1] || "").trim();
  const tipoRaw = (cols[2] || "").trim();
  const dataRaw = (cols[3] || "").trim();
  const produto = (cols[4] || "").trim();
  const fornecedor = (cols[5] || "").trim();
  const custoRaw = (cols[6] || "").trim();
  const precoRaw = (cols[7] || "").trim();
  const bancoRaw = (cols[8] || "").trim();
  const formaRaw = (cols[9] || "").trim();
  const recebimentoRaw = (cols[10] || "").trim();
  // cols[11] = lucro (skip - computed)
  // cols[12] = margem (skip)
  const sinalRaw = (cols[13] || "").trim();
  const bancoSinalRaw = (cols[14] || "").trim();
  const local = (cols[15] || "").trim();
  const produtoTroca = (cols[16] || "").trim();

  // Parse data
  const data = parseDate(dataRaw);
  if (!data) {
    skipped.push(`Linha ${i}: sem data (${cliente || "vazio"})`);
    continue;
  }

  if (!cliente) {
    skipped.push(`Linha ${i}: sem cliente`);
    continue;
  }

  // Parse values
  const custo = parseReais(custoRaw);
  const preco_vendido = parseReais(precoRaw);

  if (preco_vendido === 0 && custo === 0) {
    skipped.push(`Linha ${i}: ${cliente} - custo e preço zerados`);
    continue;
  }

  // Origem (NOT NULL, check constraint)
  let origem = parseOrigem(origemRaw);
  if (!origem) {
    const tipoUp = tipoRaw.toUpperCase();
    if (tipoUp === "ATACADO") origem = "ATACADO";
    else origem = "RECOMPRA";
  }

  // Tipo (NOT NULL, check constraint: VENDA, UPGRADE, ATACADO)
  let tipo = tipoRaw.toUpperCase().trim();
  if (!["VENDA", "UPGRADE", "ATACADO"].includes(tipo)) {
    if (origem === "ATACADO") tipo = "ATACADO";
    else tipo = "VENDA";
  }

  // Banco (NOT NULL)
  let banco = parseBanco(bancoRaw);
  if (!banco) banco = "ITAU";

  // Forma (NOT NULL)
  let forma = parseForma(formaRaw);
  if (!forma) forma = "PIX";

  // Recebimento
  let recebimento = parseRecebimento(formaRaw);
  // If recebimentoRaw is D+0/D+1/FIADO use it
  const recUp = recebimentoRaw.toUpperCase();
  if (recUp === "D+0" || recUp === "D+1" || recUp === "FIADO") {
    recebimento = recUp;
  }

  // Sinal antecipado
  const sinal_antecipado = parseReais(sinalRaw);

  // Banco sinal
  const banco_sinal = parseBanco(bancoSinalRaw);

  // Auto-status
  const status_pagamento = data < hoje ? "FINALIZADO" : "AGUARDANDO";

  const row = {
    data,
    cliente: cliente.toUpperCase(),
    origem,
    tipo,
    produto: produto.toUpperCase(),
    fornecedor: fornecedor.toUpperCase() || null,
    custo,
    preco_vendido,
    banco,
    forma,
    recebimento,
    status_pagamento,
  };

  // Opcionais (só adicionar se tiver valor)
  if (sinal_antecipado > 0) row.sinal_antecipado = sinal_antecipado;
  if (banco_sinal) row.banco_sinal = banco_sinal;
  if (local && local !== "-") row.local = local.toUpperCase();
  if (produtoTroca && produtoTroca !== "-") row.produto_na_troca = produtoTroca.toUpperCase();

  vendas.push(row);
}

console.log(`\n✅ ${vendas.length} vendas processadas`);
console.log(`⚠️ ${skipped.length} linhas ignoradas`);

if (skipped.length > 0) {
  console.log("\nLinhas ignoradas:");
  for (const s of skipped.slice(0, 20)) console.log(`  ${s}`);
  if (skipped.length > 20) console.log(`  ... e mais ${skipped.length - 20}`);
}

// Stats
const porOrigem = {};
const porTipo = {};
const porStatus = {};
for (const v of vendas) {
  porOrigem[v.origem] = (porOrigem[v.origem] || 0) + 1;
  porTipo[v.tipo] = (porTipo[v.tipo] || 0) + 1;
  porStatus[v.status_pagamento] = (porStatus[v.status_pagamento] || 0) + 1;
}
console.log("\n📊 Por origem:", porOrigem);
console.log("📊 Por tipo:", porTipo);
console.log("📊 Por status:", porStatus);

const fatTotal = vendas.reduce((s, v) => s + v.preco_vendido, 0);
const lucroTotal = vendas.reduce((s, v) => s + (v.preco_vendido - v.custo), 0);
console.log(`\n💰 Faturamento: R$ ${Math.round(fatTotal).toLocaleString("pt-BR")}`);
console.log(`💰 Lucro: R$ ${Math.round(lucroTotal).toLocaleString("pt-BR")}`);

// Save
const outPath = join(dirname(csvPath), "vendas-clean.json");
writeFileSync(outPath, JSON.stringify(vendas, null, 2));
console.log(`\n✅ Salvo em: ${outPath}`);
