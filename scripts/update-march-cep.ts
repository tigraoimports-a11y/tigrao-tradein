/**
 * Script: Cruzar planilha de março com banco de dados
 * Atualiza CEP, CPF e bairro/cidade das vendas de março que estão sem
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_PATH = "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/André e Nicolas/Planilhas em CSV/VENDAS MARÇO 2026.csv";

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
  } catch { return null; }
}

function parseReais(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseData(val: string): string | null {
  // Format: 01/03/26 or 01/03/2026
  const parts = val.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  const day = parseInt(d);
  if (day > 23) return null; // Skip after 23rd
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function main() {
  console.log("=== Cruzamento Março 2026: Atualizar CEP/CPF ===\n");

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  console.log(`Linhas na planilha: ${lines.length - 1}`);

  // Parse CSV into records
  interface CsvRow {
    cliente: string;
    cpf: string | null;
    cep: string | null;
    data: string;
    produto: string;
    preco: number;
  }

  const csvRows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((c) => c.replace(/^"|"$/g, "").trim());
    const [cliente, cpfRaw, cepRaw, , , dataRaw, produto, , , precoRaw] = cols;
    if (!cliente || !produto) continue;

    const data = parseData(dataRaw);
    if (!data) continue;

    const cpf = (!cpfRaw || cpfRaw === "-") ? null : cpfRaw.trim();
    const cep = (!cepRaw || cepRaw === "00000-000" || cepRaw === "00000000") ? null : cepRaw.trim();
    const preco = parseReais(precoRaw);

    csvRows.push({ cliente: cliente.toUpperCase(), cpf, cep, data, produto: produto.toUpperCase(), preco });
  }
  console.log(`Registros válidos do CSV (até dia 23): ${csvRows.length}`);

  // Buscar vendas de março sem bairro
  const { data: vendas, error } = await supabase
    .from("vendas")
    .select("id, data, cliente, produto, preco_vendido, bairro, cep, cpf")
    .gte("data", "2026-03-01")
    .lte("data", "2026-03-23")
    .order("data", { ascending: true });

  if (error) { console.log("Erro:", error.message); return; }

  const semBairro = (vendas ?? []).filter((v: any) => !v.bairro || v.bairro === "" || v.bairro === "Nao informado");
  console.log(`Vendas março no banco: ${vendas?.length}`);
  console.log(`Vendas sem bairro: ${semBairro.length}\n`);

  let updated = 0;
  let notFound = 0;

  for (const venda of semBairro as any[]) {
    // Tentar match por cliente + data + produto similar
    const clienteUpper = (venda.cliente || "").toUpperCase().trim();
    const vendaData = venda.data;

    const match = csvRows.find((r) => {
      const nomeMatch = r.cliente === clienteUpper ||
        clienteUpper.includes(r.cliente) || r.cliente.includes(clienteUpper);
      const dataMatch = r.data === vendaData;
      // Fuzzy produto match
      const prodA = r.produto.replace(/[^A-Z0-9]/g, "");
      const prodB = (venda.produto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const prodMatch = prodA === prodB || prodA.includes(prodB) || prodB.includes(prodA);
      return nomeMatch && dataMatch && prodMatch;
    });

    if (!match || !match.cep) {
      notFound++;
      continue;
    }

    // Lookup CEP
    const addr = await lookupCep(match.cep);
    const updateData: any = {};
    if (match.cpf && !venda.cpf) updateData.cpf = match.cpf;
    if (match.cep) updateData.cep = match.cep.replace(/\D/g, "");
    if (addr?.bairro) updateData.bairro = addr.bairro;
    if (addr?.cidade) updateData.cidade = addr.cidade;
    if (addr?.uf) updateData.uf = addr.uf;

    if (Object.keys(updateData).length === 0) {
      notFound++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("vendas")
      .update(updateData)
      .eq("id", venda.id);

    if (updateErr) {
      console.log(`❌ ${venda.data} | ${venda.cliente} | ${updateErr.message}`);
    } else {
      console.log(`✅ ${venda.data} | ${venda.cliente} | ${venda.produto} → ${addr?.bairro || "sem bairro"}, ${addr?.cidade || ""}`);
      updated++;
    }
  }

  console.log(`\n✅ Atualizadas: ${updated}`);
  console.log(`⏭ Sem match/CEP: ${notFound}`);
}

main().catch(console.error);
