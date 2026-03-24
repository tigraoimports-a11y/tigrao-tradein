/**
 * Script de importação: Vendas Fevereiro 2026
 * Lê o CSV, busca CEP → bairro/cidade, e insere no Supabase
 * Verifica duplicatas antes de inserir
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_PATH = "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/André e Nicolas/Planilhas em CSV/02-VENDAS FEVEREIRO-2026.csv";
const MES = "02";
const ANO = "2026";

// Cache de CEP → endereço
const cepCache = new Map<string, { bairro: string; cidade: string; uf: string }>();

async function lookupCep(cep: string): Promise<{ bairro: string; cidade: string; uf: string } | null> {
  const clean = cep.replace(/\D/g, "");
  if (!clean || clean === "00000000" || clean.length !== 8) return null;
  if (cepCache.has(clean)) return cepCache.get(clean)!;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    const result = { bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "" };
    cepCache.set(clean, result);
    return result;
  } catch {
    return null;
  }
}

function parseReais(val: string): number {
  if (!val) return 0;
  // Remove "R$ ", pontos de milhar, e troca vírgula por ponto
  const clean = val.replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function mapOrigem(fonte: string): string {
  const f = fonte.toUpperCase().trim();
  if (f === "ATACADO") return "ATACADO";
  if (f === "RECOMPRA") return "RECOMPRA";
  if (f.includes("AN") || f.includes("ANÚNCIO")) return "ANUNCIO";
  if (f.includes("INDICA")) return "INDICACAO";
  return "DIRECT";
}

function mapTipo(tipo: string): string {
  const t = tipo.toUpperCase().trim();
  if (t === "ATACADO") return "ATACADO";
  if (t === "UPGRADE") return "UPGRADE";
  return "VENDA";
}

function mapLocal(local: string): string {
  const l = local.toUpperCase().trim();
  if (l === "ENTREGA") return "ENTREGA";
  if (l === "RETIRADA") return "RETIRADA";
  if (l === "ENVIO") return "ENVIO";
  if (l === "ATACADO") return "ATACADO";
  return "ENTREGA";
}

async function main() {
  console.log("=== Importação Vendas Fevereiro 2026 ===\n");

  // Ler CSV
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const header = lines[0];
  console.log("Header:", header.substring(0, 100), "...");
  console.log(`Total linhas: ${lines.length - 1}\n`);

  // Buscar vendas existentes de fevereiro 2026 para checar duplicatas
  console.log("Buscando vendas existentes de fevereiro 2026...");
  const { data: existingVendas, error: fetchErr } = await supabase
    .from("vendas")
    .select("cliente, data, produto, preco_vendido")
    .gte("data", `${ANO}-${MES}-01`)
    .lte("data", `${ANO}-${MES}-28`);

  if (fetchErr) {
    console.error("Erro ao buscar vendas existentes:", fetchErr.message);
    return;
  }

  // Criar set de chaves para duplicatas
  const existingKeys = new Set<string>();
  for (const v of existingVendas ?? []) {
    const key = `${(v.cliente || "").toUpperCase().trim()}|${v.data}|${(v.produto || "").toUpperCase().trim()}|${v.preco_vendido}`;
    existingKeys.add(key);
  }
  console.log(`Vendas existentes em fev/2026: ${existingKeys.size}\n`);

  // Processar linhas
  const toInsert: any[] = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Split por ; mas respeitar aspas
    const cols = line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());

    const [cliente, cpfRaw, cepRaw, fonte, tipo, diaRaw, produto, fornecedor, custoRaw, precoRaw, , , localRaw] = cols;

    if (!cliente || !produto) {
      errors++;
      continue;
    }

    const dia = parseInt(diaRaw);
    if (isNaN(dia) || dia < 1 || dia > 28) {
      errors++;
      continue;
    }

    const data = `${ANO}-${MES}-${String(dia).padStart(2, "0")}`;
    const custo = parseReais(custoRaw);
    const preco = parseReais(precoRaw);
    const cpf = cpfRaw === "-" || !cpfRaw ? null : cpfRaw.trim();
    const cep = cepRaw === "00000-000" || !cepRaw ? null : cepRaw.trim();

    // Checar duplicata
    const key = `${cliente.toUpperCase().trim()}|${data}|${produto.toUpperCase().trim()}|${preco}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    // Adicionar ao set para evitar duplicatas dentro do próprio CSV
    existingKeys.add(key);

    // Lookup CEP
    let bairro = null, cidade = null, uf = null;
    if (cep) {
      const addr = await lookupCep(cep);
      if (addr) {
        bairro = addr.bairro;
        cidade = addr.cidade;
        uf = addr.uf;
      }
    }

    const origem = mapOrigem(fonte);
    const tipoVenda = mapTipo(tipo);
    const isAtacado = tipoVenda === "ATACADO";

    toInsert.push({
      data,
      cliente: cliente.toUpperCase(),
      cpf,
      cep: cep ? cep.replace(/\D/g, "") : null,
      bairro,
      cidade,
      uf,
      origem,
      tipo: tipoVenda,
      produto: produto.trim(),
      fornecedor: (fornecedor || "").trim() || null,
      custo,
      preco_vendido: preco,
      banco: isAtacado ? "ESPECIE" : "ITAU",
      forma: isAtacado ? "PIX" : "PIX",
      recebimento: "D+0",
      local: mapLocal(localRaw || ""),
      status_pagamento: "FINALIZADO",
      sinal_antecipado: 0,
      entrada_pix: 0,
      entrada_especie: 0,
      qnt_parcelas: null,
      bandeira: null,
      valor_comprovante: null,
    });
  }

  console.log(`Vendas a inserir: ${toInsert.length}`);
  console.log(`Duplicatas puladas: ${skipped}`);
  console.log(`Linhas com erro: ${errors}\n`);

  if (toInsert.length === 0) {
    console.log("Nada para inserir!");
    return;
  }

  // Mostrar preview
  console.log("Preview (primeiras 3):");
  for (const v of toInsert.slice(0, 3)) {
    console.log(`  ${v.data} | ${v.cliente} | ${v.produto} | R$ ${v.preco_vendido} | ${v.bairro || "sem bairro"}, ${v.cidade || "sem cidade"}`);
  }
  console.log("");

  // Inserir em lotes de 50
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error } = await supabase.from("vendas").insert(batch);
    if (error) {
      console.error(`Erro no lote ${i / 50 + 1}:`, error.message);
      // Tentar um por um
      for (const v of batch) {
        const { error: singleErr } = await supabase.from("vendas").insert(v);
        if (singleErr) {
          console.error(`  Erro individual: ${v.cliente} | ${v.produto} | ${singleErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
      console.log(`  Lote ${Math.floor(i / 50) + 1}: ${batch.length} inseridos`);
    }
  }

  console.log(`\n✅ Total inserido: ${inserted}`);
  console.log(`⏭ Duplicatas puladas: ${skipped}`);
  console.log(`❌ Erros: ${errors}`);
}

main().catch(console.error);
