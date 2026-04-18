import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// Casos de backfill (03/2026 migrados do sistema antigo)
const CASOS = [
  { data: "2026-03-02", nome: "Alexandra Ferrari",         cpf: "09276987738",       serial: "D396PWWHNJ",    slot: 1 as const },
  { data: "2026-03-02", nome: "Roberto Soares",            cpf: "08618514713",       serial: "FWDX7347KL",    slot: 1 as const },
  { data: "2026-03-03", nome: "Andréa Cota Freitas Bastos", nomeLike: "andrea cota freitas", serial: "F17F2PCW0D91", slot: 1 as const },
  { data: "2026-03-03", nome: "Carolina Penades Lima",     cpf: "12353206778",       serial: "KN4924074V",    slot: 1 as const },
  { data: "2026-03-03", nome: "Carolina Penades Lima",     cpf: "12353206778",       serial: "L7LQC9NTJR",    slot: 2 as const },
  { data: "2026-03-03", nome: "Inconnect Marketing LTDA",  cnpj: "24265713000145",   serial: "DVPX4104JT",    slot: 1 as const },
  { data: "2026-03-03", nome: "Jéssica Jorge de Freitas",  cpf: "14388106798",       serial: "M52N70FHPG",    slot: 1 as const },
  { data: "2026-03-03", nome: "Vanessa Rodrigues Santos",  cpf: "00919339271",       serial: "H4T5253763",    slot: 1 as const },
];

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Busca todas as vendas dos 2 dias de uma vez
  const { data: vendasDia, error: vErr } = await supabase
    .from("vendas")
    .select("id, data, cliente, cpf, cnpj, troca_produto, troca_serial, troca_imei, troca_produto2, troca_serial2, troca_imei2")
    .in("data", ["2026-03-02", "2026-03-03"]);
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // Busca os itens de estoque por serial
  const serials = CASOS.map(c => c.serial.toUpperCase());
  const { data: estoqueItems, error: eErr } = await supabase
    .from("estoque")
    .select("id, produto, categoria, cor, serial_no, imei, status, tipo, fornecedor")
    .in("serial_no", serials);
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const result = CASOS.map(caso => {
    // Tenta achar a venda
    const candidatas = (vendasDia || []).filter(v => {
      if (v.data !== caso.data) return false;
      if (caso.cpf && onlyDigits(v.cpf) === caso.cpf) return true;
      if (caso.cnpj && onlyDigits(v.cnpj) === caso.cnpj) return true;
      if (caso.nomeLike && (v.cliente || "").toLowerCase().includes(caso.nomeLike.toLowerCase())) return true;
      return false;
    });

    const estoqueItem = (estoqueItems || []).find(
      e => (e.serial_no || "").toUpperCase() === caso.serial.toUpperCase()
    );

    const diag = {
      caso: `${caso.data} · ${caso.nome}${caso.slot === 2 ? " (2º produto)" : ""}`,
      serial_procurado: caso.serial,
      doc_procurado: caso.cpf || caso.cnpj || `nome:${caso.nomeLike}`,
      // Estoque
      estoque_encontrado: !!estoqueItem,
      estoque_id: estoqueItem?.id || null,
      estoque_produto: estoqueItem?.produto || null,
      estoque_status: estoqueItem?.status || null,
      // Venda
      venda_encontrada: candidatas.length > 0,
      vendas_candidatas: candidatas.length,
      venda_ids: candidatas.map(v => v.id),
      // Estado atual do vínculo (no slot correto)
      ja_vinculado: candidatas.some(v => {
        const field = caso.slot === 2 ? v.troca_serial2 : v.troca_serial;
        return (field || "").toUpperCase() === caso.serial.toUpperCase();
      }),
      troca_serial_atual: candidatas.map(v => caso.slot === 2 ? v.troca_serial2 : v.troca_serial),
      troca_produto_atual: candidatas.map(v => caso.slot === 2 ? v.troca_produto2 : v.troca_produto),
      // Dicas de diagnóstico
      diagnostico: (() => {
        if (!estoqueItem) return "❌ Produto NÃO existe no estoque com esse serial. Verificar se foi cadastrado.";
        if (candidatas.length === 0) return `❌ Venda NÃO encontrada. Verificar se cliente está cadastrado com documento "${caso.cpf || caso.cnpj || caso.nomeLike}" e data ${caso.data}.`;
        if (candidatas.length > 1) return `⚠️ ${candidatas.length} vendas casam — migration atualizou todas (pode dar problema).`;
        const v = candidatas[0];
        const serialAtual = caso.slot === 2 ? v.troca_serial2 : v.troca_serial;
        if (!serialAtual) return "⚠️ Venda encontrada mas troca_serial está NULL — migration provavelmente NÃO rodou (ou rodou mas não casou).";
        if (serialAtual.toUpperCase() === caso.serial.toUpperCase()) return "✅ Vinculado corretamente.";
        return `⚠️ Venda já tem outro troca_serial="${serialAtual}" — migration não sobrescreve (COALESCE).`;
      })(),
    };
    return diag;
  });

  const resumo = {
    total: result.length,
    ok: result.filter(r => r.ja_vinculado).length,
    venda_nao_encontrada: result.filter(r => !r.venda_encontrada).length,
    estoque_nao_encontrado: result.filter(r => !r.estoque_encontrado).length,
    pendentes: result.filter(r => !r.ja_vinculado && r.venda_encontrada && r.estoque_encontrado).length,
  };

  return NextResponse.json({ resumo, casos: result });
}
