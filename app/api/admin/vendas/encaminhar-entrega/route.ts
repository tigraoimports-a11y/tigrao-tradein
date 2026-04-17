import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

// POST { venda_id, data_entrega, horario?, entregador?, observacao? }
// Lê a venda Em Andamento e cria uma entrega com todos os dados do cliente e produto.
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { venda_id, data_entrega, horario, entregador, observacao } = body || {};
  if (!venda_id || !data_entrega) {
    return NextResponse.json({ error: "venda_id e data_entrega obrigatórios" }, { status: 400 });
  }
  const { supabase } = await import("@/lib/supabase");

  // Buscar a venda
  const { data: venda, error: e1 } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", venda_id)
    .single();
  if (e1 || !venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Verificar se já existe entrega pra essa venda
  const { data: existente } = await supabase
    .from("entregas")
    .select("id")
    .eq("venda_id", venda_id)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ error: "Esta venda já tem uma entrega vinculada." }, { status: 409 });
  }

  // Montar endereço a partir dos campos da venda
  const enderecoParts = [
    venda.endereco || "",
    venda.bairro ? `- ${venda.bairro}` : "",
    venda.cidade || "",
    venda.uf || "",
    venda.cep ? `CEP: ${venda.cep}` : "",
  ].filter(Boolean).join(" ");
  const enderecoFinal = enderecoParts.trim() || null;

  // Montar produto (incluir troca se houver)
  let produtoTxt = venda.produto || "";
  if (venda.cor) produtoTxt += ` ${venda.cor}`;

  // Montar forma de pagamento com detalhes completos (bandeira, parcelas, banco)
  let formaPag = "";
  if (venda.forma === "CARTAO" || venda.forma === "CREDITO") {
    const partes: string[] = [];
    if (venda.banco) partes.push(venda.banco);
    if (venda.qnt_parcelas) partes.push(`${venda.qnt_parcelas}x`);
    if (venda.bandeira) partes.push(venda.bandeira);
    formaPag = partes.join(" ") || "CARTAO";
  } else if (venda.forma === "DINHEIRO" || venda.forma === "ESPECIE") {
    formaPag = "DINHEIRO";
  } else if (venda.forma === "PIX") {
    formaPag = `PIX${venda.banco ? ` (${venda.banco})` : ""}`;
  } else if (venda.forma === "DEBITO") {
    formaPag = `DEBITO${venda.banco ? ` (${venda.banco})` : ""}`;
  } else if (venda.forma) {
    formaPag = `${venda.forma}${venda.banco ? ` (${venda.banco})` : ""}`;
  }
  // Adicionar entrada PIX/ESPECIE se houver (motoboy precisa saber separado)
  const entradaPix = Number(venda.entrada_pix || 0);
  const entradaEspecie = Number(venda.entrada_especie || 0);
  const totalEntrada = entradaPix + entradaEspecie;
  if (totalEntrada > 0) {
    const entradaPartes: string[] = [];
    if (entradaPix > 0) entradaPartes.push(`PIX R$ ${entradaPix.toLocaleString("pt-BR")}`);
    if (entradaEspecie > 0) entradaPartes.push(`Espécie R$ ${entradaEspecie.toLocaleString("pt-BR")}`);
    const entradaLabel = `Entrada ${entradaPartes.join(" + ")}`;
    formaPag = formaPag ? `${entradaLabel} + ${formaPag}` : entradaLabel;
  }

  // Montar observação com detalhes úteis pro motoboy (incluindo 1º e 2º produto na troca)
  const obsPartes: string[] = [];
  if (observacao) obsPartes.push(observacao);
  if (venda.troca_produto) {
    obsPartes.push(`TROCA: ${venda.troca_produto} (R$ ${Number(venda.produto_na_troca || 0).toLocaleString("pt-BR")})`);
  }
  if (venda.troca_produto2) {
    obsPartes.push(`TROCA 2: ${venda.troca_produto2} (R$ ${Number(venda.produto_na_troca2 || 0).toLocaleString("pt-BR")})`);
  }
  if (venda.observacao) obsPartes.push(`Obs venda: ${venda.observacao}`);
  const obsFinal = obsPartes.join(" | ") || null;

  // Buscar telefone do cliente (pode estar na tabela clientes)
  let telefone: string | null = null;
  if (venda.cliente) {
    const { data: cliente } = await supabase
      .from("clientes")
      .select("telefone, whatsapp")
      .ilike("nome", venda.cliente)
      .limit(1)
      .maybeSingle();
    if (cliente) {
      telefone = cliente.whatsapp || cliente.telefone || null;
    }
  }

  const { data: entrega, error: e2 } = await supabase
    .from("entregas")
    .insert({
      venda_id,
      cliente: venda.cliente || "Sem nome",
      telefone,
      endereco: enderecoFinal,
      bairro: venda.bairro || null,
      regiao: venda.bairro || venda.cidade || null,
      data_entrega,
      horario: horario || null,
      status: "PENDENTE",
      entregador: entregador || null,
      observacao: obsFinal,
      produto: produtoTxt || null,
      tipo: (venda.troca_produto || venda.troca_produto2 || Number(venda.produto_na_troca || 0) > 0) ? "TROCA" : null,
      detalhes_upgrade: (() => {
        const partes: string[] = [];
        if (venda.troca_produto) {
          partes.push(`${venda.troca_produto}${venda.troca_cor ? ` ${venda.troca_cor}` : ""} — R$ ${Number(venda.produto_na_troca || 0).toLocaleString("pt-BR")}${venda.troca_bateria ? ` (Bat: ${venda.troca_bateria}%)` : ""}${venda.troca_obs ? ` ${venda.troca_obs}` : ""}`);
        }
        if (venda.troca_produto2) {
          partes.push(`${venda.troca_produto2}${venda.troca_cor2 ? ` ${venda.troca_cor2}` : ""} — R$ ${Number(venda.produto_na_troca2 || 0).toLocaleString("pt-BR")}${venda.troca_bateria2 ? ` (Bat: ${venda.troca_bateria2}%)` : ""}${venda.troca_obs2 ? ` ${venda.troca_obs2}` : ""}`);
        }
        return partes.length > 0 ? partes.join(" + ") : null;
      })(),
      forma_pagamento: formaPag || null,
      // Valor bruto = o que o cliente paga (valor_comprovante inclui taxas do cartão)
      // Fallback: preco_vendido (líquido) se não tiver valor_comprovante
      valor: Number(venda.valor_comprovante || venda.preco_vendido || 0) || null,
      entrada: totalEntrada > 0 ? totalEntrada : null,
      parcelas: venda.qnt_parcelas || null,
      valor_total: (() => {
        // Total = entrada + valor no cartão (valor_comprovante) + troca
        const comp = Number(venda.valor_comprovante || 0);
        if (comp > 0) return comp + totalEntrada;
        return Number(venda.preco_vendido || 0) || null;
      })(),
      vendedor: venda.vendedor || null,
    })
    .select()
    .single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // Vincular a venda a entrega recem-criada (facilita UI: esconder botao
  // Encaminhar, mostrar botao Ver Entrega, etc.)
  await supabase
    .from("vendas")
    .update({ entrega_id: entrega.id })
    .eq("id", venda_id);

  await logActivity(
    getUser(request),
    "Encaminhou venda para entrega",
    `${venda.cliente} — ${produtoTxt} → entrega ${entrega.id?.slice(0, 8)}`,
    "vendas",
    venda_id
  ).catch(() => {});

  return NextResponse.json({ ok: true, entrega });
}
