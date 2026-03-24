/**
 * Cruzar TODAS planilhas (Jan, Fev, Mar) com banco para preencher CEP/bairro/cidade
 * Atualiza vendas que estão sem bairro no banco
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLANILHAS = [
  { path: "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/André e Nicolas/Planilhas em CSV/01-VENDAS JANEIRO-2026.csv", mes: "01", ano: "2026", dateCol: "day" },
  { path: "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/André e Nicolas/Planilhas em CSV/02-VENDAS FEVEREIRO-2026.csv", mes: "02", ano: "2026", dateCol: "day" },
  { path: "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/André e Nicolas/Planilhas em CSV/VENDAS MARÇO 2026.csv", mes: "03", ano: "2026", dateCol: "full" },
];

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
    await new Promise(r => setTimeout(r, 80));
    return result;
  } catch { return null; }
}

interface CsvRecord {
  cliente: string;
  cpf: string | null;
  cep: string | null;
  data: string;
  produto: string;
}

function parseCsv(planilha: typeof PLANILHAS[0]): CsvRecord[] {
  const raw = fs.readFileSync(planilha.path, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());
  const records: CsvRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map(c => c.replace(/^"|"$/g, "").trim());
    const [cliente, cpfRaw, cepRaw, , , dataRaw, produto] = cols;
    if (!cliente || !produto) continue;

    let data: string;
    if (planilha.dateCol === "full") {
      // Format: 01/03/26 or 01/03/2026
      const parts = dataRaw.split("/");
      if (parts.length !== 3) continue;
      const [d, m, y] = parts;
      const year = y.length === 2 ? `20${y}` : y;
      data = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
      const dia = parseInt(dataRaw);
      if (isNaN(dia) || dia < 1 || dia > 31) continue;
      data = `${planilha.ano}-${planilha.mes}-${String(dia).padStart(2, "0")}`;
    }

    const cpf = (!cpfRaw || cpfRaw === "-") ? null : cpfRaw.trim();
    const cep = (!cepRaw || cepRaw === "00000-000" || cepRaw === "00000000") ? null : cepRaw.trim();

    records.push({ cliente: cliente.toUpperCase(), cpf, cep, data, produto: produto.toUpperCase() });
  }
  return records;
}

async function main() {
  console.log("=== Cruzamento CEP: Jan + Fev + Mar 2026 ===\n");

  // Parse todas planilhas
  let allRecords: CsvRecord[] = [];
  for (const p of PLANILHAS) {
    const records = parseCsv(p);
    console.log(`${p.mes}/${p.ano}: ${records.length} registros no CSV`);
    allRecords = allRecords.concat(records);
  }
  console.log(`Total registros CSV: ${allRecords.length}\n`);

  // Buscar TODAS vendas Jan-Mar sem bairro (exceto atacado)
  const { data: vendas, error } = await supabase
    .from("vendas")
    .select("id, data, cliente, produto, preco_vendido, bairro, cep, cpf, tipo")
    .gte("data", "2026-01-01")
    .lte("data", "2026-03-31")
    .order("data", { ascending: true });

  if (error) { console.log("Erro:", error.message); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semBairro = (vendas ?? []).filter((v: any) =>
    (!v.bairro || v.bairro === "" || v.bairro === "Nao informado") && v.tipo !== "ATACADO"
  );

  console.log(`Vendas Jan-Mar no banco: ${vendas?.length}`);
  console.log(`Sem bairro (excl. atacado): ${semBairro.length}\n`);

  let updated = 0;
  let noMatch = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notFound: any[] = [];

  for (const venda of semBairro as any[]) {
    const clienteUpper = (venda.cliente || "").toUpperCase().trim();
    const vendaData = venda.data;
    const vendaProduto = (venda.produto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Tentar match por cliente + data + produto
    const match = allRecords.find(r => {
      const nomeMatch = r.cliente === clienteUpper ||
        clienteUpper.includes(r.cliente.substring(0, 10)) ||
        r.cliente.includes(clienteUpper.substring(0, 10));
      const dataMatch = r.data === vendaData;
      const prodA = r.produto.replace(/[^A-Z0-9]/g, "");
      const prodMatch = prodA === vendaProduto || prodA.includes(vendaProduto) || vendaProduto.includes(prodA);
      return nomeMatch && dataMatch && (prodMatch || !vendaProduto);
    });

    if (!match || !match.cep) {
      noMatch++;
      notFound.push({ data: venda.data, cliente: venda.cliente, produto: venda.produto, id: venda.id });
      continue;
    }

    const addr = await lookupCep(match.cep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (match.cpf && !venda.cpf) updateData.cpf = match.cpf;
    if (match.cep) updateData.cep = match.cep.replace(/\D/g, "");
    if (addr?.bairro) updateData.bairro = addr.bairro;
    if (addr?.cidade) updateData.cidade = addr.cidade;
    if (addr?.uf) updateData.uf = addr.uf;

    if (Object.keys(updateData).length === 0) { noMatch++; continue; }

    const { error: updateErr } = await supabase.from("vendas").update(updateData).eq("id", venda.id);
    if (updateErr) {
      console.log(`❌ ${venda.data} | ${venda.cliente} | ${updateErr.message}`);
    } else {
      console.log(`✅ ${venda.data} | ${venda.cliente} | ${venda.produto} → ${addr?.bairro || ""}, ${addr?.cidade || ""}`);
      updated++;
    }
  }

  console.log(`\n✅ Atualizadas: ${updated}`);
  console.log(`⏭ Sem match/CEP: ${noMatch}`);

  if (notFound.length > 0) {
    console.log(`\n=== VENDAS CLIENTE FINAL SEM CEP (${notFound.length}) ===`);
    for (const v of notFound) {
      console.log(`${v.data} | ${v.cliente} | ${v.produto}`);
    }
  }
}

main().catch(console.error);
