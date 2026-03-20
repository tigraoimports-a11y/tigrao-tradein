// Script para inserir produtos A CAMINHO e PENDÊNCIAS via API da Vercel
// Uso: ADMIN_PASSWORD=suaSenha node scripts/insert-acaminho-pendencias.mjs

const BASE_URL = "https://tigrao-tradein.vercel.app";
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) { console.error("Defina ADMIN_PASSWORD. Ex: ADMIN_PASSWORD=suaSenha node scripts/insert-acaminho-pendencias.mjs"); process.exit(1); }

const headers = { "Content-Type": "application/json", "x-admin-password": PASSWORD };

// ============================================
// PRODUTOS A CAMINHO
// ============================================
const aCaminho = [
  { produto: "APPLE WATCH ULTRA 3", cor: "NATURAL", categoria: "APPLE_WATCH", qnt: 1, custo_unitario: 4600, fornecedor: "MEGA", observacao: "Crédito pendente", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "APPLE WATCH SERIES 11 46MM GPS+CELLULAR", cor: "PRETO", categoria: "APPLE_WATCH", qnt: 1, custo_unitario: 3320, fornecedor: "MADE", observacao: "Pedido 17/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPHONE 17 PRO MAX 512GB", cor: "LARANJA", categoria: "IPHONES", qnt: 3, custo_unitario: 9300, fornecedor: "TARTARUGA", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "MACBOOK AIR M4 16GB RAM 15 polegadas 512GB", cor: "MIDNIGHT", categoria: "MACBOOK", qnt: 1, custo_unitario: 9380, fornecedor: "ZN CEL", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPAD A16 256GB", cor: "SILVER", categoria: "IPADS", qnt: 2, custo_unitario: 3150, fornecedor: "ZN CEL", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPHONE 17 PRO MAX 2TB", cor: "SILVER", categoria: "IPHONES", qnt: 1, custo_unitario: 12400, fornecedor: "ECO CEL", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "MACBOOK PRO M4 PRO 24GB RAM 14 polegadas 512GB", cor: "PRETO", categoria: "MACBOOK", qnt: 2, custo_unitario: 12600, fornecedor: "TM CEL", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPHONE 17 PRO 512GB", cor: "SILVER", categoria: "IPHONES", qnt: 2, custo_unitario: 8950, fornecedor: "TM CEL", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPHONE 17 PRO MAX 2TB", cor: "AZUL", categoria: "IPHONES", qnt: 1, custo_unitario: 12300, fornecedor: "PLANETA", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
  { produto: "IPHONE 17 PRO MAX 256GB", cor: "LARANJA", categoria: "IPHONES", qnt: 3, custo_unitario: 7900, fornecedor: "ULTRA", observacao: "Pedido 19/03/2026", tipo: "A_CAMINHO", status: "A CAMINHO" },
];

// ============================================
// PENDÊNCIAS
// ============================================
const pendencias = [
  { produto: "IPHONE 14 PLUS 256GB", categoria: "IPHONES", qnt: 1, custo_unitario: 2300, cliente: "PRISCIELLEN", data_compra: "2026-03-17", bateria: 85, observacao: "GRADE A+ / Já coletado", tipo: "PENDENCIA", status: "PENDENTE" },
  { produto: "IPHONE 17 PRO MAX 1TB", categoria: "IPHONES", qnt: 1, custo_unitario: 9500, cliente: "GEIZON", data_compra: "2026-03-19", bateria: 100, observacao: "GRADE A+ / COM CAIXA", tipo: "PENDENCIA", status: "PENDENTE" },
  { produto: "IPHONE 14 PRO MAX 128GB", categoria: "IPHONES", qnt: 1, custo_unitario: 2500, cliente: "NIZIO", data_compra: "2026-03-19", bateria: 79, observacao: "GRADE A+ / COM CAIXA", tipo: "PENDENCIA", status: "PENDENTE" },
  { produto: "IPHONE 16 PRO MAX 256GB", categoria: "IPHONES", qnt: 1, custo_unitario: 5000, cliente: "FABIO RODRIGO", data_compra: "2026-03-19", bateria: 100, observacao: "GRADE A+ / COM CAIXA", tipo: "PENDENCIA", status: "PENDENTE" },
  { produto: "IPHONE 15 PRO MAX 256GB", categoria: "IPHONES", qnt: 1, custo_unitario: 3500, cliente: "RENAN", data_compra: "2026-03-19", bateria: 84, observacao: null, tipo: "PENDENCIA", status: "PENDENTE" },
];

async function insertBatch(label, items) {
  console.log(`\nInserindo ${label}...`);
  const res = await fetch(`${BASE_URL}/api/estoque`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "import", rows: items }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`  ERRO: ${json.error || res.statusText}`);
    return;
  }
  console.log(`  ${json.imported}/${json.total} inseridos`);
  if (json.errors?.length) {
    for (const e of json.errors) console.error(`  ERRO: ${e}`);
  }
}

await insertBatch("PRODUTOS A CAMINHO (10 itens)", aCaminho);
await insertBatch("PENDÊNCIAS (5 itens)", pendencias);
console.log("\nDone!");
