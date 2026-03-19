import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarNoite, gerarManha } from "@/lib/reports";
import { sendTelegramMessage, formatNoiteHTML, formatManhaHTML } from "@/lib/telegram";
import { hojeISO, proximoDiaUtil, formatDateBR } from "@/lib/business-days";

const GRUPO_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ============================================
// Helpers
// ============================================

const fmtBRL = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const CAT_EMOJI: Record<string, string> = {
  "SALARIO": "💼",
  "ANUNCIOS": "📣",
  "MARKETING": "📣",
  "GASTOS LOJA": "🏪",
  "SISTEMAS": "💻",
  "CORREIOS": "📦",
  "MOTOBOY RJ": "🏍️",
  "MOTOBOY SP": "🏍️",
  "TRANSPORTE": "🚚",
  "ALIMENTACAO": "🍽️",
  "DOACOES": "🎁",
  "IMPOSTOS": "🧾",
  "EQUIPAMENTOS": "🔧",
  "FORNECEDOR": "🏭",
  "OUTROS": "📋",
};

const PROD_EMOJI: Record<string, string> = {
  "IPHONES": "📱",
  "IPHONE": "📱",
  "IPADS": "📱",
  "IPAD": "📱",
  "MACBOOK": "💻",
  "MACBOOKS": "💻",
  "MAC MINI": "💻",
  "APPLE WATCH": "🍎",
  "AIRPODS": "🎧",
  "ACESSORIOS": "🔧",
  "ACESSÓRIO": "🔧",
  "ACESSÓRIOS": "🔧",
};

function getCatEmoji(cat: string): string {
  const upper = cat.toUpperCase();
  for (const [key, emoji] of Object.entries(CAT_EMOJI)) {
    if (upper.includes(key)) return emoji;
  }
  return "•";
}

function getProdEmoji(cat: string): string {
  const upper = cat.toUpperCase();
  for (const [key, emoji] of Object.entries(PROD_EMOJI)) {
    if (upper.includes(key)) return emoji;
  }
  return "📦";
}

// ============================================
// Shared data fetchers
// ============================================

async function getPatrimonio() {
  // Saldo bancário mais recente
  const { data: saldoRecente } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .order("data", { ascending: false })
    .limit(1)
    .single();

  const saldoBancario = saldoRecente
    ? (Number(saldoRecente.esp_itau || 0) + Number(saldoRecente.esp_inf || 0) + Number(saldoRecente.esp_mp || 0) + Number(saldoRecente.esp_especie || 0))
    : 0;

  // Estoque (produtos com qnt > 0)
  const { data: estoque } = await supabase
    .from("estoque")
    .select("qnt, custo_unitario")
    .gt("qnt", 0)
    .or("tipo.is.null,tipo.eq.NOVO");

  const valorEstoque = (estoque ?? []).reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const unidadesEstoque = (estoque ?? []).reduce((s, p) => s + p.qnt, 0);

  // Produtos a caminho (vendas com status AGUARDANDO fornecedor ou gastos FORNECEDOR recentes)
  const { data: aCaminho } = await supabase
    .from("estoque")
    .select("qnt, custo_unitario")
    .gt("qnt", 0)
    .eq("tipo", "A_CAMINHO");

  const valorACaminho = (aCaminho ?? []).reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);

  const capitalProdutos = valorEstoque + valorACaminho;
  const patrimonioTotal = saldoBancario + capitalProdutos;

  return {
    saldoBancario,
    itau: Number(saldoRecente?.esp_itau || 0),
    infinite: Number(saldoRecente?.esp_inf || 0),
    mp: Number(saldoRecente?.esp_mp || 0),
    especie: Number(saldoRecente?.esp_especie || 0),
    valorEstoque,
    unidadesEstoque,
    valorACaminho,
    capitalProdutos,
    patrimonioTotal,
  };
}

async function getFiadoPendente() {
  const { data: fiados } = await supabase
    .from("vendas")
    .select("cliente, preco_vendido, data, produto")
    .eq("forma", "FIADO")
    .eq("status_pagamento", "AGUARDANDO")
    .order("data", { ascending: true });

  return fiados ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg) return NextResponse.json({ ok: true });

    const chatId = String(msg.chat.id);
    const text = (msg.text || "").trim();
    const command = text.split(" ")[0].toLowerCase();

    // Verificar chat autorizado
    if (chatId !== GRUPO_ID) {
      return NextResponse.json({ ok: true });
    }

    const hoje = hojeISO();

    switch (command) {
      case "/finalizar": {
        // Finalizar todas as vendas AGUARDANDO de hoje
        const { data: finalizadas, error: finErr } = await supabase
          .from("vendas")
          .update({ status_pagamento: "FINALIZADO" })
          .eq("data", hoje)
          .eq("status_pagamento", "AGUARDANDO")
          .select("id, cliente");
        if (finErr) {
          await sendTelegramMessage(`❌ Erro: ${finErr.message}`, chatId);
        } else {
          const n = finalizadas?.length || 0;
          if (n === 0) {
            await sendTelegramMessage(`✅ Nenhuma venda pendente hoje.`, chatId);
          } else {
            const nomes = finalizadas!.map(v => v.cliente).join(", ");
            await sendTelegramMessage(`✅ ${n} venda(s) finalizada(s) hoje:\n${nomes}`, chatId);
          }
        }
        break;
      }

      case "/saldos": {
        // /saldos → mostrar saldos atuais
        // /saldos 120000 260000 1400 0 → atualizar saldos (infinite, itau, mp, especie)
        const parts = text.split(/\s+/).slice(1);
        if (parts.length >= 3) {
          // Atualizar saldos
          const parseVal = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
          const inf = parseVal(parts[0]);
          const itau = parseVal(parts[1]);
          const mp = parseVal(parts[2]);
          const esp = parts[3] ? parseVal(parts[3]) : 0;

          const { error: sErr } = await supabase.from("saldos_bancarios").upsert(
            {
              data: hoje,
              inf_base: inf,
              itau_base: itau,
              mp_base: mp,
              esp_especie: esp,
              esp_itau: itau,
              esp_inf: inf,
              esp_mp: mp,
              manual: true,
            },
            { onConflict: "data" }
          );

          if (sErr) {
            await sendTelegramMessage(`❌ Erro: ${sErr.message}`, chatId);
          } else {
            await sendTelegramMessage(
              [
                `✅ <b>Saldos atualizados para ${hoje}</b>`,
                ``,
                `🏦 Infinite: ${fmtBRL(inf)}`,
                `🏦 Itaú: ${fmtBRL(itau)}`,
                `🏦 Mercado Pago: ${fmtBRL(mp)}`,
                esp > 0 ? `💵 Espécie: ${fmtBRL(esp)}` : "",
                ``,
                `💰 Total: <b>${fmtBRL(inf + itau + mp + esp)}</b>`,
              ].filter(Boolean).join("\n"),
              chatId
            );
          }
        } else {
          // Mostrar saldos atuais
          const patrimonio = await getPatrimonio();
          await sendTelegramMessage(
            [
              `🏦 <b>SALDOS BANCÁRIOS</b>`,
              ``,
              `Itaú: ${fmtBRL(patrimonio.itau)}`,
              `Infinite: ${fmtBRL(patrimonio.infinite)}`,
              `Mercado Pago: ${fmtBRL(patrimonio.mp)}`,
              patrimonio.especie > 0 ? `Espécie: ${fmtBRL(patrimonio.especie)}` : "",
              ``,
              `💰 Total bancário: <b>${fmtBRL(patrimonio.saldoBancario)}</b>`,
              ``,
              `📦 Em estoque: ${fmtBRL(patrimonio.valorEstoque)} (${patrimonio.unidadesEstoque} un.)`,
              `🚚 A caminho: ${fmtBRL(patrimonio.valorACaminho)}`,
              `🏆 Patrimônio total: <b>${fmtBRL(patrimonio.patrimonioTotal)}</b>`,
            ].filter(Boolean).join("\n"),
            chatId
          );
        }
        break;
      }

      case "/status": {
        await sendTelegramMessage(
          [
            `🐯 <b>Status do Bot TigrãoImports</b>`,
            ``,
            `Versao: 2.1 (Vercel)`,
            `Data: ${hoje}`,
            `Plataforma: Vercel Serverless`,
            `Banco: Supabase`,
            `Status: ✅ Online`,
          ].join("\n"),
          chatId
        );
        break;
      }

      case "/dashboard":
      case "/parcial": {
        const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const hojeFormatado = formatDateBR(hoje);

        // 1. Vendas de hoje
        const { data: vendasHojeParcial } = await supabase
          .from("vendas")
          .select("*")
          .eq("data", hoje)
          .neq("status_pagamento", "CANCELADO")
          .order("created_at", { ascending: true });

        const vp = vendasHojeParcial ?? [];
        const fatParcial = vp.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const custoParcial = vp.reduce((s, v) => s + Number(v.custo || 0), 0);
        const lucroParcial = vp.reduce((s, v) => s + Number(v.lucro || 0), 0);
        const margemParcial = fatParcial > 0 ? ((lucroParcial / fatParcial) * 100).toFixed(1) : "0";

        // Atacado vs Cliente Final
        const atacadoP = vp.filter(v => v.tipo === "ATACADO" || v.origem === "ATACADO");
        const clienteFinalP = vp.filter(v => v.tipo !== "ATACADO" && v.origem !== "ATACADO");

        // Por origem (dentro de cliente final)
        const porOrigem: Record<string, { qty: number; lucro: number }> = {};
        for (const v of clienteFinalP) {
          const orig = v.origem || "Não informado";
          if (!porOrigem[orig]) porOrigem[orig] = { qty: 0, lucro: 0 };
          porOrigem[orig].qty++;
          porOrigem[orig].lucro += Number(v.lucro || 0);
        }

        // Mapeamento de origens para labels
        const origemLabel: Record<string, string> = {
          "ANUNCIO": "Anúncio",
          "RECOMPRA": "Recompra",
          "INDICACAO": "Indicação",
          "ATACADO": "Atacado",
        };
        // Por tipo (Upgrade, Venda)
        const porTipo: Record<string, { qty: number; lucro: number }> = {};
        for (const v of clienteFinalP) {
          const tipo = v.tipo || "Não informado";
          if (!porTipo[tipo]) porTipo[tipo] = { qty: 0, lucro: 0 };
          porTipo[tipo].qty++;
          porTipo[tipo].lucro += Number(v.lucro || 0);
        }

        const lines: string[] = [];
        lines.push(`📊 <b>RESUMO DO DIA — TIGRÃO</b>`);
        lines.push(`🕒 ${hojeFormatado} às ${now.split(", ")[1] || now.split(" ")[1] || ""}`);
        lines.push(`──────────────────`);

        // VENDAS REALIZADAS
        lines.push(`🛒 <b>VENDAS REALIZADAS</b>`);
        lines.push(`${vp.length} venda(s) concluída(s)`);
        lines.push(`Faturamento: ${fmtBRL(fatParcial)}`);
        lines.push(`Custo: ${fmtBRL(custoParcial)}`);
        lines.push(`Lucro: ${fmtBRL(lucroParcial)}`);
        lines.push(`Margem: ${margemParcial}%`);

        if (atacadoP.length > 0) {
          lines.push(`🏢 Atacado: ${atacadoP.length} — ${fmtBRL(atacadoP.reduce((s, v) => s + Number(v.lucro || 0), 0))} (lucro)`);
        }
        if (clienteFinalP.length > 0) {
          lines.push(`👤 Cliente Final: ${clienteFinalP.length} — ${fmtBRL(clienteFinalP.reduce((s, v) => s + Number(v.lucro || 0), 0))} (lucro)`);
        }

        // Por origem
        const origemOrder = ["ANUNCIO", "RECOMPRA", "INDICACAO"];
        for (const key of origemOrder) {
          if (porOrigem[key]) {
            lines.push(`  • ${origemLabel[key] || key}: ${porOrigem[key].qty} / ${fmtBRL(porOrigem[key].lucro)}`);
          }
        }
        // Tipos (Upgrade, Venda)
        if (porTipo["UPGRADE"]) {
          lines.push(`  • Upgrade: ${porTipo["UPGRADE"].qty} / ${fmtBRL(porTipo["UPGRADE"].lucro)}`);
        }
        if (porTipo["VENDA"]) {
          lines.push(`  • Venda: ${porTipo["VENDA"].qty} / ${fmtBRL(porTipo["VENDA"].lucro)}`);
        }
        // Outras origens não listadas
        for (const [key, info] of Object.entries(porOrigem)) {
          if (!origemOrder.includes(key)) {
            lines.push(`  • ${origemLabel[key] || key}: ${info.qty} / ${fmtBRL(info.lucro)}`);
          }
        }

        // 2. FIADO VENDIDO HOJE
        const fiadoHoje = vp.filter(v => v.forma === "FIADO");
        if (fiadoHoje.length > 0) {
          lines.push(``);
          lines.push(`⏳ <b>FIADO VENDIDO HOJE</b>`);
          for (const f of fiadoHoje) {
            lines.push(`  • ${f.cliente} — ${fmtBRL(Number(f.preco_vendido || 0))}`);
          }
        }

        // 3. FIADO PENDENTE (todos)
        const fiadosPendentes = await getFiadoPendente();
        if (fiadosPendentes.length > 0) {
          lines.push(``);
          lines.push(`📋 <b>FIADO PENDENTE</b>`);
          // Agrupar por data
          const porData: Record<string, typeof fiadosPendentes> = {};
          for (const f of fiadosPendentes) {
            if (!porData[f.data]) porData[f.data] = [];
            porData[f.data].push(f);
          }
          for (const [data, items] of Object.entries(porData).sort(([a], [b]) => a.localeCompare(b))) {
            const totalData = items.reduce((s, f) => s + Number(f.preco_vendido || 0), 0);
            lines.push(`  📅 ${formatDateBR(data)}: ${items.length} — ${fmtBRL(totalData)}`);
            for (const f of items) {
              lines.push(`    • ${f.cliente} — ${fmtBRL(Number(f.preco_vendido || 0))}`);
            }
          }
        }

        // 4. VENDAS PENDENTES DE PAGAMENTO (status AGUARDANDO, não fiado)
        const { data: pendentes } = await supabase
          .from("vendas")
          .select("cliente, custo, preco_vendido, produto")
          .eq("status_pagamento", "AGUARDANDO")
          .neq("forma", "FIADO")
          .eq("data", hoje);

        if (pendentes && pendentes.length > 0) {
          lines.push(``);
          lines.push(`⏳ <b>VENDAS PENDENTES DE PAGAMENTO</b>`);
          for (const p of pendentes) {
            lines.push(`  • ${p.cliente} — custo: ${fmtBRL(Number(p.custo || 0))}`);
          }
        }

        lines.push(``);
        lines.push(`──────────────────`);

        // 5. RECEBIDO ATÉ AGORA (D+0)
        const vendasD0P = vp.filter(v => v.recebimento === "D+0");
        const pixItauP = vendasD0P.filter(v => v.banco === "ITAU").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixInfP = vendasD0P.filter(v => v.banco === "INFINITE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixMpP = vendasD0P.filter(v => v.banco === "MERCADO_PAGO").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixEspP = vendasD0P.filter(v => v.banco === "ESPECIE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);

        // Sinais antecipados
        const totalSinal = vp.reduce((s, v) => s + Number(v.sinal_antecipado || 0), 0);

        // Reajustes de hoje
        const { data: reajustesHoje } = await supabase
          .from("reajustes")
          .select("*")
          .eq("data", hoje);
        const reajRows = reajustesHoje ?? [];
        const totalReajuste = reajRows.reduce((s, r) => s + Number(r.valor || 0), 0);

        const totalRecebido = pixItauP + pixInfP + pixMpP + pixEspP - totalSinal + totalReajuste;

        lines.push(`💰 <b>RECEBIDO ATÉ AGORA</b>`);
        if (pixItauP > 0) lines.push(`PIX/Dinheiro Itaú: ${fmtBRL(pixItauP)}`);
        if (pixInfP > 0) lines.push(`PIX/Dinheiro Infinity: ${fmtBRL(pixInfP)}`);
        if (pixMpP > 0) lines.push(`Link Mercado Pago: ${fmtBRL(pixMpP)}`);
        if (pixEspP > 0) lines.push(`Dinheiro Espécie: ${fmtBRL(pixEspP)}`);
        if (totalSinal > 0) lines.push(`📥 Sinal antecipado (já recebido): -${fmtBRL(totalSinal)}`);
        for (const r of reajRows) {
          const sinal = Number(r.valor) >= 0 ? "+" : "";
          lines.push(`🔄 Reajuste (${r.cliente}): ${sinal}${fmtBRL(Number(r.valor))}  ${r.motivo || ""}`);
        }
        lines.push(`Total recebido: <b>${fmtBRL(totalRecebido)}</b>`);

        lines.push(``);
        lines.push(`──────────────────`);

        // 6. PREVISÃO RECEBER (próximo dia útil)
        const proxDiaUtil = proximoDiaUtil(new Date(hoje + "T12:00:00"));
        const proxDiaFormatado = formatDateBR(proxDiaUtil);

        const vendasD1P = vp.filter(v => v.recebimento === "D+1");
        const d1ItauP = vendasD1P.filter(v => v.banco === "ITAU").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const d1InfP = vendasD1P.filter(v => v.banco === "INFINITE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const d1MpP = vendasD1P.filter(v => v.banco === "MERCADO_PAGO").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);

        // Fiado previsto
        const fiadoPrevisto = fiadoHoje.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);

        const totalPrevisao = d1ItauP + d1InfP + d1MpP + fiadoPrevisto;

        lines.push(`📅 <b>PREVISÃO RECEBER ${proxDiaFormatado} (próx. dia útil)</b>`);
        if (d1ItauP > 0) lines.push(`💳 Crédito Itaú: ${fmtBRL(d1ItauP)}`);
        if (d1InfP > 0) lines.push(`💳 Crédito Infinite: ${fmtBRL(d1InfP)}`);
        if (d1MpP > 0) lines.push(`💳 Link Mercado Pago: ${fmtBRL(d1MpP)}`);
        if (fiadoHoje.length > 0) {
          lines.push(`📋 Fiado: ${fmtBRL(fiadoPrevisto)} (${fiadoHoje.length} venda(s))`);
          for (const f of fiadoHoje) {
            lines.push(`  • ${f.cliente} — ${fmtBRL(Number(f.preco_vendido || 0))}`);
          }
        }
        lines.push(`Total: <b>${fmtBRL(totalPrevisao)}</b>`);

        lines.push(``);
        lines.push(`──────────────────`);

        // 7. GASTOS OPERACIONAIS
        const { data: gastosHojeP } = await supabase
          .from("gastos")
          .select("valor, tipo, categoria, descricao, banco")
          .eq("data", hoje);

        const gsP = gastosHojeP ?? [];
        const saidasOpP = gsP.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR");
        const fornecedorP = gsP.filter(g => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR");

        if (saidasOpP.length > 0) {
          const catGastosP: Record<string, number> = {};
          for (const g of saidasOpP) {
            catGastosP[g.categoria] = (catGastosP[g.categoria] || 0) + Number(g.valor || 0);
          }
          const totalSaidasP = saidasOpP.reduce((s, g) => s + Number(g.valor || 0), 0);

          lines.push(`💸 <b>GASTOS OPERACIONAIS</b>`);
          for (const [cat, val] of Object.entries(catGastosP).sort((a, b) => b[1] - a[1])) {
            lines.push(`${getCatEmoji(cat)} ${cat}: ${fmtBRL(val)}`);
          }
          lines.push(`Total: <b>${fmtBRL(totalSaidasP)}</b>`);
        }

        // 8. PAGO A FORNECEDOR
        if (fornecedorP.length > 0) {
          const totalFornP = fornecedorP.reduce((s, g) => s + Number(g.valor || 0), 0);
          lines.push(``);
          lines.push(`🚚 <b>PAGO A FORNECEDOR</b>`);
          for (const g of fornecedorP) {
            const bancoLabel = g.banco ? ` (${g.banco})` : "";
            lines.push(`${g.descricao || "Compra"}: ${fmtBRL(Number(g.valor || 0))}${bancoLabel}`);
          }
          lines.push(`Total fornecedores: <b>${fmtBRL(totalFornP)}</b>`);
        }

        lines.push(``);
        lines.push(`<i>Gerado em ${now}</i>`);

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/noite": {
        const report = await gerarNoite(supabase, hoje);

        // Fetch extra data for enhanced report
        const { data: vendasHoje } = await supabase
          .from("vendas")
          .select("*")
          .eq("data", hoje)
          .neq("status_pagamento", "CANCELADO")
          .order("created_at", { ascending: true });

        const vs = vendasHoje ?? [];

        // Gastos de hoje por categoria
        const { data: gastosHoje } = await supabase
          .from("gastos")
          .select("valor, tipo, categoria, descricao, banco")
          .eq("data", hoje);

        const gs = gastosHoje ?? [];
        const saidasHoje = gs.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR");
        const fornecedorHoje = gs.filter(g => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR");

        // Recebimentos hoje (D+0) e amanhã (D+1)
        const vendasD0 = vs.filter(v => v.recebimento === "D+0");
        const vendasD1 = vs.filter(v => v.recebimento === "D+1");

        // Build enhanced report
        const lines: string[] = [];
        lines.push(`🌙 <b>FECHAMENTO DO DIA — TigrãoImports</b>`);
        lines.push(`📅 ${hoje}`);
        lines.push(``);

        // VENDAS DE HOJE
        const faturamento = vs.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const custoTotal = vs.reduce((s, v) => s + Number(v.custo || 0), 0);
        const lucroHoje = vs.reduce((s, v) => s + Number(v.lucro || 0), 0);
        const margemHoje = faturamento > 0 ? ((lucroHoje / faturamento) * 100).toFixed(1) : "0";

        lines.push(`🛒 <b>VENDAS DE HOJE</b>`);
        lines.push(`  Quantidade: <b>${vs.length}</b>`);
        lines.push(`  Faturamento: <b>${fmtBRL(faturamento)}</b>`);
        lines.push(`  Custo: ${fmtBRL(custoTotal)}`);
        lines.push(`  Lucro: <b>${fmtBRL(lucroHoje)}</b>`);
        lines.push(`  Margem: ${margemHoje}%`);

        // Detalhes por tipo
        const tipos: Record<string, { qty: number; lucro: number }> = {};
        for (const v of vs) {
          if (!tipos[v.tipo]) tipos[v.tipo] = { qty: 0, lucro: 0 };
          tipos[v.tipo].qty++;
          tipos[v.tipo].lucro += Number(v.lucro || 0);
        }
        for (const [tipo, info] of Object.entries(tipos)) {
          const emoji = tipo === "UPGRADE" ? "🔄" : tipo === "ATACADO" ? "📦" : "🏪";
          lines.push(`  ${emoji} ${tipo}: ${info.qty}x | ${fmtBRL(info.lucro)}`);
        }
        lines.push(``);

        // RECEBIMENTOS HOJE (PIX/Dinheiro)
        const pixItau = vendasD0.filter(v => v.banco === "ITAU").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixInf = vendasD0.filter(v => v.banco === "INFINITE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixMp = vendasD0.filter(v => v.banco === "MERCADO_PAGO").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const pixEsp = vendasD0.filter(v => v.banco === "ESPECIE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const totalD0 = pixItau + pixInf + pixMp + pixEsp;

        if (totalD0 > 0) {
          lines.push(`💰 <b>RECEBIMENTOS HOJE (PIX/Dinheiro)</b>`);
          if (pixItau > 0) lines.push(`  🏦 Itaú: ${fmtBRL(pixItau)}`);
          if (pixInf > 0) lines.push(`  🏦 Infinite: ${fmtBRL(pixInf)}`);
          if (pixMp > 0) lines.push(`  🏦 Mercado Pago: ${fmtBRL(pixMp)}`);
          if (pixEsp > 0) lines.push(`  💵 Espécie: ${fmtBRL(pixEsp)}`);
          lines.push(`  <b>Total: ${fmtBRL(totalD0)}</b>`);
          lines.push(``);
        }

        // RECEBIMENTOS AMANHÃ (Crédito D+1)
        const d1Itau = vendasD1.filter(v => v.banco === "ITAU").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const d1Inf = vendasD1.filter(v => v.banco === "INFINITE").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const d1Mp = vendasD1.filter(v => v.banco === "MERCADO_PAGO").reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
        const totalD1 = d1Itau + d1Inf + d1Mp;

        if (totalD1 > 0) {
          lines.push(`💳 <b>RECEBIMENTOS AMANHÃ (Crédito)</b>`);
          if (d1Itau > 0) lines.push(`  🏦 Itaú: ${fmtBRL(d1Itau)}`);
          if (d1Inf > 0) lines.push(`  🏦 Infinite: ${fmtBRL(d1Inf)}`);
          if (d1Mp > 0) lines.push(`  🏦 Mercado Pago: ${fmtBRL(d1Mp)}`);
          lines.push(`  <b>Total: ${fmtBRL(totalD1)}</b>`);
          lines.push(``);
        }

        // SAÍDAS DE HOJE (por categoria)
        if (saidasHoje.length > 0) {
          const catGastos: Record<string, number> = {};
          for (const g of saidasHoje) {
            catGastos[g.categoria] = (catGastos[g.categoria] || 0) + Number(g.valor || 0);
          }
          const totalSaidas = saidasHoje.reduce((s, g) => s + Number(g.valor || 0), 0);

          lines.push(`📤 <b>SAÍDAS DE HOJE</b>`);
          for (const [cat, val] of Object.entries(catGastos).sort((a, b) => b[1] - a[1])) {
            lines.push(`  ${getCatEmoji(cat)} ${cat}: ${fmtBRL(val)}`);
          }
          lines.push(`  <b>Total: ${fmtBRL(totalSaidas)}</b>`);
          lines.push(``);
        }

        // PAGO A FORNECEDOR HOJE → PRODUTOS A CAMINHO
        if (fornecedorHoje.length > 0) {
          const totalFornecedor = fornecedorHoje.reduce((s, g) => s + Number(g.valor || 0), 0);
          lines.push(`🏭 <b>PAGO A FORNECEDOR HOJE → PRODUTOS A CAMINHO</b>`);
          for (const g of fornecedorHoje) {
            lines.push(`  • ${g.descricao || "Compra fornecedor"}: ${fmtBRL(Number(g.valor || 0))}`);
          }
          lines.push(`  <b>Total: ${fmtBRL(totalFornecedor)}</b>`);
          lines.push(``);
        }

        // SALDOS BANCÁRIOS
        lines.push(`🏦 <b>SALDOS BANCÁRIOS</b>`);
        lines.push(`  Itaú: <b>${fmtBRL(report.esp_itau)}</b>`);
        lines.push(`  Infinite: <b>${fmtBRL(report.esp_inf)}</b>`);
        lines.push(`  Mercado Pago: <b>${fmtBRL(report.esp_mp)}</b>`);
        lines.push(`  Espécie: <b>${fmtBRL(report.esp_especie)}</b>`);
        const totalSaldos = report.esp_itau + report.esp_inf + report.esp_mp + report.esp_especie;
        lines.push(`  <b>Total: ${fmtBRL(totalSaldos)}</b>`);

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/manha": {
        const report = await gerarManha(supabase, hoje);
        await sendTelegramMessage(formatManhaHTML(report), chatId);
        break;
      }

      case "/saldos": {
        const parts = text.split(/\s+/);
        if (parts.length < 4) {
          // Sem parâmetros: mostrar saldos atuais
          const { data: saldoRecente } = await supabase
            .from("saldos_bancarios")
            .select("*")
            .order("data", { ascending: false })
            .limit(1)
            .single();

          if (!saldoRecente) {
            await sendTelegramMessage(`Nenhum saldo registrado. Use:\n/saldos [itau] [infinite] [mp]\nEx: /saldos 15000 8000 3000`, chatId);
            break;
          }

          const itau = Number(saldoRecente.esp_itau || saldoRecente.itau_base || 0);
          const inf = Number(saldoRecente.esp_inf || saldoRecente.inf_base || 0);
          const mp = Number(saldoRecente.esp_mp || saldoRecente.mp_base || 0);
          const esp = Number(saldoRecente.esp_especie || 0);
          const total = itau + inf + mp + esp;

          await sendTelegramMessage(
            [
              `🏦 <b>SALDOS BANCÁRIOS</b>`,
              `📅 Ref: ${saldoRecente.data}`,
              ``,
              `🏦 Itaú: <b>${fmtBRL(itau)}</b>`,
              `🏦 Infinite: <b>${fmtBRL(inf)}</b>`,
              `🏦 Mercado Pago: <b>${fmtBRL(mp)}</b>`,
              `💵 Espécie: <b>${fmtBRL(esp)}</b>`,
              ``,
              `<b>Total: ${fmtBRL(total)}</b>`,
              ``,
              `Para atualizar base manhã:`,
              `/saldos [itau] [infinite] [mp]`,
            ].join("\n"),
            chatId
          );
          break;
        }

        const itau = parseFloat(parts[1]);
        const inf = parseFloat(parts[2]);
        const mp = parseFloat(parts[3]);

        if (isNaN(itau) || isNaN(inf) || isNaN(mp)) {
          await sendTelegramMessage(`Valores invalidos. Use numeros.\nEx: /saldos 15000 8000 3000`, chatId);
          break;
        }

        await supabase.from("saldos_bancarios").upsert(
          { data: hoje, itau_base: itau, inf_base: inf, mp_base: mp },
          { onConflict: "data" }
        );

        await sendTelegramMessage(
          [
            `✅ <b>Saldos base atualizados</b>`,
            ``,
            `🏦 Itaú: ${fmtBRL(itau)}`,
            `🏦 Infinite: ${fmtBRL(inf)}`,
            `🏦 Mercado Pago: ${fmtBRL(mp)}`,
            ``,
            `Data: ${hoje}`,
          ].join("\n"),
          chatId
        );
        break;
      }

      case "/faltando": {
        const { data: zerados } = await supabase
          .from("estoque")
          .select("produto, categoria, cor")
          .eq("qnt", 0)
          .or("tipo.is.null,tipo.eq.NOVO")
          .order("categoria")
          .order("produto");

        if (!zerados?.length) {
          await sendTelegramMessage(`✅ Nenhum produto zerado no estoque!`, chatId);
          break;
        }

        const byCat: Record<string, string[]> = {};
        for (const p of zerados) {
          if (!byCat[p.categoria]) byCat[p.categoria] = [];
          byCat[p.categoria].push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
        }

        const lines = [`🚨 <b>PRODUTOS ZERADOS — ${zerados.length} itens</b>`, ""];
        for (const [cat, items] of Object.entries(byCat)) {
          lines.push(`${getProdEmoji(cat)} <b>${cat}</b> (${items.length})`);
          lines.push(...items);
          lines.push("");
        }

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/acabando": {
        const { data: lowStock } = await supabase
          .from("estoque")
          .select("produto, categoria, cor, qnt")
          .eq("qnt", 1)
          .or("tipo.is.null,tipo.eq.NOVO")
          .order("categoria")
          .order("produto");

        if (!lowStock?.length) {
          await sendTelegramMessage(`✅ Nenhum produto com apenas 1 unidade!`, chatId);
          break;
        }

        const byCat: Record<string, string[]> = {};
        for (const p of lowStock) {
          if (!byCat[p.categoria]) byCat[p.categoria] = [];
          byCat[p.categoria].push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
        }

        const lines = [`⚠️ <b>ACABANDO (1 unidade) — ${lowStock.length} itens</b>`, ""];
        for (const [cat, items] of Object.entries(byCat)) {
          lines.push(`${getProdEmoji(cat)} <b>${cat}</b> (${items.length})`);
          lines.push(...items);
          lines.push("");
        }

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/reposicao": {
        const { data: criticos } = await supabase
          .from("estoque")
          .select("produto, categoria, cor, qnt")
          .lte("qnt", 1)
          .or("tipo.is.null,tipo.eq.NOVO")
          .order("qnt")
          .order("categoria")
          .order("produto");

        if (!criticos?.length) {
          await sendTelegramMessage(`✅ Estoque saudavel! Nenhum produto critico.`, chatId);
          break;
        }

        const zerados = criticos.filter((p) => p.qnt === 0);
        const acabando = criticos.filter((p) => p.qnt === 1);

        const lines = [`📦 <b>ALERTA DE REPOSIÇÃO</b>`, ""];

        if (zerados.length > 0) {
          lines.push(`🔴 <b>ZERADOS (${zerados.length}):</b>`);
          const byCat: Record<string, string[]> = {};
          for (const p of zerados) {
            if (!byCat[p.categoria]) byCat[p.categoria] = [];
            byCat[p.categoria].push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
          }
          for (const [cat, items] of Object.entries(byCat)) {
            lines.push(`${getProdEmoji(cat)} <b>${cat}</b>`);
            lines.push(...items);
          }
          lines.push("");
        }

        if (acabando.length > 0) {
          lines.push(`🟡 <b>ACABANDO (${acabando.length}):</b>`);
          const byCat: Record<string, string[]> = {};
          for (const p of acabando) {
            if (!byCat[p.categoria]) byCat[p.categoria] = [];
            byCat[p.categoria].push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
          }
          for (const [cat, items] of Object.entries(byCat)) {
            lines.push(`${getProdEmoji(cat)} <b>${cat}</b>`);
            lines.push(...items);
          }
        }

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/semanal": {
        // Últimos 7 dias — usando timezone BR
        const hojeBR = hojeISO(); // "YYYY-MM-DD" em BRT
        const fim = hojeBR;
        const dSem = new Date(hojeBR + "T12:00:00");
        dSem.setDate(dSem.getDate() - 6);
        const inicio = `${dSem.getFullYear()}-${String(dSem.getMonth() + 1).padStart(2, "0")}-${String(dSem.getDate()).padStart(2, "0")}`;

        // Semana anterior (para comparativo)
        const d2Sem = new Date(hojeBR + "T12:00:00");
        d2Sem.setDate(d2Sem.getDate() - 7);
        const fimAnterior = `${d2Sem.getFullYear()}-${String(d2Sem.getMonth() + 1).padStart(2, "0")}-${String(d2Sem.getDate()).padStart(2, "0")}`;
        d2Sem.setDate(d2Sem.getDate() - 6);
        const inicioAnterior = `${d2Sem.getFullYear()}-${String(d2Sem.getMonth() + 1).padStart(2, "0")}-${String(d2Sem.getDate()).padStart(2, "0")}`;

        const [
          { data: vendasSem },
          { data: gastosSem },
          { data: vendasSemAnt },
          { data: gastosSemAnt },
        ] = await Promise.all([
          supabase.from("vendas").select("preco_vendido, custo, lucro, tipo, origem, forma, status_pagamento")
            .gte("data", inicio).lte("data", fim).neq("status_pagamento", "CANCELADO"),
          supabase.from("gastos").select("valor, tipo, categoria")
            .gte("data", inicio).lte("data", fim),
          supabase.from("vendas").select("preco_vendido, custo, lucro, tipo, origem")
            .gte("data", inicioAnterior).lte("data", fimAnterior).neq("status_pagamento", "CANCELADO"),
          supabase.from("gastos").select("valor, tipo, categoria")
            .gte("data", inicioAnterior).lte("data", fimAnterior),
        ]);

        const vs = vendasSem ?? [];
        const gs = gastosSem ?? [];
        const vsAnt = vendasSemAnt ?? [];
        const gsAnt = gastosSemAnt ?? [];

        const faturamento = vs.reduce((s, v) => s + (v.preco_vendido || 0), 0);
        const custoTotal = vs.reduce((s, v) => s + (v.custo || 0), 0);
        const lucroSem = vs.reduce((s, v) => s + (v.lucro || 0), 0);
        const gastosSaida = gs.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);
        const comprasFornecedor = gs.filter(g => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);
        const margemMedia = faturamento > 0 ? ((lucroSem / faturamento) * 100).toFixed(1) : "0";
        const ticketMedio = vs.length > 0 ? Math.round(faturamento / vs.length) : 0;

        // Por tipo
        const upgrades = vs.filter(v => v.tipo === "UPGRADE");
        const vendas = vs.filter(v => v.tipo === "VENDA");
        const atacado = vs.filter(v => v.tipo === "ATACADO" || v.origem === "ATACADO");

        // Médias diárias
        const mediaDiariaFat = vs.length > 0 ? faturamento / 7 : 0;
        const mediaDiariaLucro = vs.length > 0 ? lucroSem / 7 : 0;

        // Gastos por categoria
        const catGastos: Record<string, number> = {};
        gs.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR").forEach(g => {
          catGastos[g.categoria] = (catGastos[g.categoria] || 0) + (g.valor || 0);
        });

        // Comparativo
        const fatAnt = vsAnt.reduce((s, v) => s + (v.preco_vendido || 0), 0);
        const lucroAnt = vsAnt.reduce((s, v) => s + (v.lucro || 0), 0);
        const gastosAnt = gsAnt.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);

        const lines: string[] = [
          `📊 <b>RELATÓRIO SEMANAL — TigrãoImports</b>`,
          `📅 ${inicio} a ${fim}`,
          ``,
          `🛒 <b>VENDAS DA SEMANA</b>`,
          `  Quantidade: <b>${vs.length}</b>`,
          `  Faturamento: <b>${fmtBRL(faturamento)}</b>`,
          `  Custo: ${fmtBRL(custoTotal)}`,
          `  Lucro bruto: <b>${fmtBRL(lucroSem)}</b>`,
          `  Margem: ${margemMedia}%`,
          `  Ticket médio: ${fmtBRL(ticketMedio)}`,
          ``,
          `  🔄 Upgrades: ${upgrades.length}x | ${fmtBRL(upgrades.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          `  🏪 Vendas: ${vendas.length}x | ${fmtBRL(vendas.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          `  📦 Atacado: ${atacado.length}x | ${fmtBRL(atacado.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          ``,
          `📈 <b>MÉDIAS DIÁRIAS</b>`,
          `  Faturamento/dia: ${fmtBRL(mediaDiariaFat)}`,
          `  Lucro/dia: ${fmtBRL(mediaDiariaLucro)}`,
        ];

        // Saídas por categoria
        if (Object.keys(catGastos).length > 0) {
          lines.push(``);
          lines.push(`📤 <b>SAÍDAS DA SEMANA</b>`);
          for (const [cat, val] of Object.entries(catGastos).sort((a, b) => b[1] - a[1])) {
            lines.push(`  ${getCatEmoji(cat)} ${cat}: ${fmtBRL(val)}`);
          }
          lines.push(`  <b>Total operacional: ${fmtBRL(gastosSaida)}</b>`);
        }

        if (comprasFornecedor > 0) {
          lines.push(``);
          lines.push(`🏭 <b>Compras fornecedor:</b> ${fmtBRL(comprasFornecedor)}`);
        }

        lines.push(``);
        lines.push(`💵 <b>RESULTADO</b>`);
        lines.push(`  Lucro bruto: ${fmtBRL(lucroSem)}`);
        lines.push(`  − Gastos operacionais: ${fmtBRL(gastosSaida)}`);
        lines.push(`  <b>= Lucro líquido: ${fmtBRL(lucroSem - gastosSaida)}</b>`);

        // Patrimônio
        try {
          const patrimonio = await getPatrimonio();
          lines.push(``);
          lines.push(`🏛️ <b>PATRIMÔNIO ATUAL</b>`);
          lines.push(`  🏦 Saldo bancário: ${fmtBRL(patrimonio.saldoBancario)}`);
          lines.push(`  📦 Em estoque (${patrimonio.unidadesEstoque} un.): ${fmtBRL(patrimonio.valorEstoque)}`);
          if (patrimonio.valorACaminho > 0) {
            lines.push(`  🚚 A caminho: ${fmtBRL(patrimonio.valorACaminho)}`);
          }
          lines.push(`  💰 Capital em produtos: ${fmtBRL(patrimonio.capitalProdutos)}`);
          lines.push(`  <b>🏆 PATRIMÔNIO TOTAL: ${fmtBRL(patrimonio.patrimonioTotal)}</b>`);
        } catch { /* ignore */ }

        // Comparativo
        if (vsAnt.length > 0) {
          const fatDiff = faturamento - fatAnt;
          const lucroDiff = lucroSem - lucroAnt;
          const fatPct = fatAnt > 0 ? ((fatDiff / fatAnt) * 100).toFixed(1) : "—";
          const lucroPct = lucroAnt > 0 ? ((lucroDiff / lucroAnt) * 100).toFixed(1) : "—";

          lines.push(``);
          lines.push(`📊 <b>COMPARATIVO (semana anterior)</b>`);
          lines.push(`  Vendas: ${vsAnt.length} → ${vs.length} (${vs.length - vsAnt.length >= 0 ? "+" : ""}${vs.length - vsAnt.length})`);
          lines.push(`  Faturamento: ${fatDiff >= 0 ? "+" : ""}${fmtBRL(fatDiff)} (${fatPct}%)`);
          lines.push(`  Lucro: ${lucroDiff >= 0 ? "+" : ""}${fmtBRL(lucroDiff)} (${lucroPct}%)`);
        }

        // Fiado pendente
        const fiados = await getFiadoPendente();
        if (fiados.length > 0) {
          const totalFiado = fiados.reduce((s, f) => s + Number(f.preco_vendido || 0), 0);
          lines.push(``);
          lines.push(`🔴 <b>FIADO PENDENTE (${fiados.length})</b>`);
          for (const f of fiados.slice(0, 10)) {
            lines.push(`  • ${f.cliente}: ${fmtBRL(Number(f.preco_vendido || 0))} (${f.data})`);
          }
          if (fiados.length > 10) lines.push(`  ... e mais ${fiados.length - 10}`);
          lines.push(`  <b>Total: ${fmtBRL(totalFiado)}</b>`);
        }

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/mensal": {
        const mesAtual = hoje.slice(0, 7); // YYYY-MM

        // Mês anterior
        const dMesAnt = new Date(`${mesAtual}-15T12:00:00`);
        dMesAnt.setMonth(dMesAnt.getMonth() - 1);
        const mesAnterior = `${dMesAnt.getFullYear()}-${String(dMesAnt.getMonth() + 1).padStart(2, "0")}`;

        // Dia do mês atual
        const diaDoMes = parseInt(hoje.slice(8, 10));
        const totalDiasMes = new Date(parseInt(mesAtual.slice(0, 4)), parseInt(mesAtual.slice(5, 7)), 0).getDate();

        const [
          { data: vendasMes },
          { data: gastosMes },
          { data: vendasMesAnt },
          { data: gastosMesAnt },
        ] = await Promise.all([
          supabase.from("vendas").select("preco_vendido, custo, lucro, tipo, origem, forma, cliente, status_pagamento")
            .gte("data", `${mesAtual}-01`).lte("data", `${mesAtual}-31`).neq("status_pagamento", "CANCELADO"),
          supabase.from("gastos").select("valor, tipo, categoria, descricao")
            .gte("data", `${mesAtual}-01`).lte("data", `${mesAtual}-31`),
          supabase.from("vendas").select("preco_vendido, custo, lucro, tipo, origem")
            .gte("data", `${mesAnterior}-01`).lte("data", `${mesAnterior}-${String(Math.min(diaDoMes, 28)).padStart(2, "0")}`)
            .neq("status_pagamento", "CANCELADO"),
          supabase.from("gastos").select("valor, tipo, categoria")
            .gte("data", `${mesAnterior}-01`).lte("data", `${mesAnterior}-${String(Math.min(diaDoMes, 28)).padStart(2, "0")}`),
        ]);

        const vm = vendasMes ?? [];
        const gm = gastosMes ?? [];
        const vmAnt = vendasMesAnt ?? [];
        const gmAnt = gastosMesAnt ?? [];

        const faturamento = vm.reduce((s, v) => s + (v.preco_vendido || 0), 0);
        const custoTotal = vm.reduce((s, v) => s + (v.custo || 0), 0);
        const lucroMes = vm.reduce((s, v) => s + (v.lucro || 0), 0);
        const gastosSaida = gm.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);
        const comprasFornecedor = gm.filter(g => g.tipo === "SAIDA" && g.categoria === "FORNECEDOR").reduce((s, g) => s + (g.valor || 0), 0);
        const margemMedia = faturamento > 0 ? ((lucroMes / faturamento) * 100).toFixed(1) : "0";
        const ticketMedio = vm.length > 0 ? Math.round(faturamento / vm.length) : 0;

        // Por tipo
        const upgrades = vm.filter(v => v.tipo === "UPGRADE");
        const vendas = vm.filter(v => v.tipo === "VENDA");
        const atacado = vm.filter(v => v.tipo === "ATACADO" || v.origem === "ATACADO");
        const clienteFinal = vm.filter(v => v.origem !== "ATACADO");

        // Médias e projeção
        const diasUteis = Math.max(diaDoMes, 1);
        const mediaDiariaFat = faturamento / diasUteis;
        const mediaDiariaLucro = lucroMes / diasUteis;
        const projecaoFat = mediaDiariaFat * totalDiasMes;
        const projecaoLucro = mediaDiariaLucro * totalDiasMes;

        const nomeMes = new Date(`${mesAtual}-15`).toLocaleString("pt-BR", { month: "long", year: "numeric" });

        const lines: string[] = [
          `📅 <b>RELATÓRIO MENSAL — ${nomeMes.toUpperCase()}</b>`,
          `📊 Dia ${diaDoMes} de ${totalDiasMes}`,
          ``,
          `🛒 <b>VENDAS DO MÊS</b>`,
          `  Quantidade: <b>${vm.length}</b>`,
          `  Faturamento: <b>${fmtBRL(faturamento)}</b>`,
          `  Custo: ${fmtBRL(custoTotal)}`,
          `  Lucro bruto: <b>${fmtBRL(lucroMes)}</b>`,
          `  Margem: ${margemMedia}%`,
          `  Ticket médio: ${fmtBRL(ticketMedio)}`,
          ``,
          `  🔄 Upgrades: ${upgrades.length}x | ${fmtBRL(upgrades.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          `  🏪 Vendas: ${vendas.length}x | ${fmtBRL(vendas.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          `  📦 Atacado: ${atacado.length}x | ${fmtBRL(atacado.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          `  👤 Cliente final: ${clienteFinal.length}x | ${fmtBRL(clienteFinal.reduce((s, v) => s + (v.lucro || 0), 0))}`,
          ``,
          `📈 <b>MÉDIAS E PROJEÇÃO</b>`,
          `  Média diária fat: ${fmtBRL(mediaDiariaFat)}`,
          `  Média diária lucro: ${fmtBRL(mediaDiariaLucro)}`,
          `  Projeção fat mês: ${fmtBRL(projecaoFat)}`,
          `  Projeção lucro mês: ${fmtBRL(projecaoLucro)}`,
        ];

        // Saídas por categoria com emojis
        const catGastos: Record<string, number> = {};
        gm.filter(g => g.tipo === "SAIDA" && g.categoria !== "FORNECEDOR").forEach(g => {
          catGastos[g.categoria] = (catGastos[g.categoria] || 0) + (g.valor || 0);
        });

        if (Object.keys(catGastos).length > 0) {
          lines.push(``);
          lines.push(`📤 <b>SAÍDAS DO MÊS</b>`);
          for (const [cat, val] of Object.entries(catGastos).sort((a, b) => b[1] - a[1])) {
            lines.push(`  ${getCatEmoji(cat)} ${cat}: ${fmtBRL(val)}`);
          }
          lines.push(`  <b>Total operacional: ${fmtBRL(gastosSaida)}</b>`);
        }

        if (comprasFornecedor > 0) {
          lines.push(``);
          lines.push(`🏭 <b>Compras fornecedor:</b> ${fmtBRL(comprasFornecedor)}`);
        }

        lines.push(``);
        lines.push(`💵 <b>RESULTADO</b>`);
        lines.push(`  Lucro bruto: ${fmtBRL(lucroMes)}`);
        lines.push(`  − Gastos operacionais: ${fmtBRL(gastosSaida)}`);
        lines.push(`  <b>= Lucro líquido: ${fmtBRL(lucroMes - gastosSaida)}</b>`);

        // Patrimônio
        try {
          const patrimonio = await getPatrimonio();
          lines.push(``);
          lines.push(`🏛️ <b>PATRIMÔNIO ATUAL</b>`);
          lines.push(`  🏦 Saldo bancário: ${fmtBRL(patrimonio.saldoBancario)}`);
          lines.push(`    Itaú: ${fmtBRL(patrimonio.itau)}`);
          lines.push(`    Infinite: ${fmtBRL(patrimonio.infinite)}`);
          lines.push(`    MP: ${fmtBRL(patrimonio.mp)}`);
          if (patrimonio.especie > 0) lines.push(`    Espécie: ${fmtBRL(patrimonio.especie)}`);
          lines.push(`  📦 Em estoque (${patrimonio.unidadesEstoque} un.): ${fmtBRL(patrimonio.valorEstoque)}`);
          if (patrimonio.valorACaminho > 0) {
            lines.push(`  🚚 A caminho: ${fmtBRL(patrimonio.valorACaminho)}`);
          }
          lines.push(`  💰 Capital em produtos: ${fmtBRL(patrimonio.capitalProdutos)}`);
          lines.push(`  <b>🏆 PATRIMÔNIO TOTAL: ${fmtBRL(patrimonio.patrimonioTotal)}</b>`);
        } catch { /* ignore */ }

        // Comparativo com mês anterior (mesmo período)
        if (vmAnt.length > 0) {
          const fatAnt = vmAnt.reduce((s, v) => s + (v.preco_vendido || 0), 0);
          const lucroAnt = vmAnt.reduce((s, v) => s + (v.lucro || 0), 0);
          const fatDiff = faturamento - fatAnt;
          const lucroDiff = lucroMes - lucroAnt;
          const fatPct = fatAnt > 0 ? ((fatDiff / fatAnt) * 100).toFixed(1) : "—";
          const lucroPct = lucroAnt > 0 ? ((lucroDiff / lucroAnt) * 100).toFixed(1) : "—";

          const nomeMesAnt = new Date(`${mesAnterior}-15`).toLocaleString("pt-BR", { month: "long" });

          lines.push(``);
          lines.push(`📊 <b>COMPARATIVO (vs ${nomeMesAnt}, mesmo período)</b>`);
          lines.push(`  Vendas: ${vmAnt.length} → ${vm.length} (${vm.length - vmAnt.length >= 0 ? "+" : ""}${vm.length - vmAnt.length})`);
          lines.push(`  Faturamento: ${fatDiff >= 0 ? "+" : ""}${fmtBRL(fatDiff)} (${fatPct}%)`);
          lines.push(`  Lucro: ${lucroDiff >= 0 ? "+" : ""}${fmtBRL(lucroDiff)} (${lucroPct}%)`);
        }

        // Fiado pendente
        const fiados = await getFiadoPendente();
        if (fiados.length > 0) {
          const totalFiado = fiados.reduce((s, f) => s + Number(f.preco_vendido || 0), 0);
          lines.push(``);
          lines.push(`🔴 <b>FIADO PENDENTE (${fiados.length})</b>`);
          for (const f of fiados.slice(0, 10)) {
            lines.push(`  • ${f.cliente}: ${fmtBRL(Number(f.preco_vendido || 0))} — ${f.produto || ""}`);
          }
          if (fiados.length > 10) lines.push(`  ... e mais ${fiados.length - 10}`);
          lines.push(`  <b>Total fiado: ${fmtBRL(totalFiado)}</b>`);
        }

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/estoque": {
        const { data: all } = await supabase
          .from("estoque")
          .select("categoria, qnt, custo_unitario")
          .or("tipo.is.null,tipo.eq.NOVO");

        const cats: Record<string, { qtd: number; valor: number }> = {};
        let totalQtd = 0, totalValor = 0;
        for (const p of all ?? []) {
          if (!cats[p.categoria]) cats[p.categoria] = { qtd: 0, valor: 0 };
          cats[p.categoria].qtd += p.qnt;
          cats[p.categoria].valor += p.qnt * (p.custo_unitario || 0);
          totalQtd += p.qnt;
          totalValor += p.qnt * (p.custo_unitario || 0);
        }

        const lines = [`📦 <b>RESUMO DO ESTOQUE</b>`, ""];
        for (const [cat, v] of Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`${getProdEmoji(cat)} <b>${cat}</b>: ${v.qtd} un. | ${fmtBRL(v.valor)}`);
        }
        lines.push("");
        lines.push(`<b>TOTAL: ${totalQtd} unidades | ${fmtBRL(totalValor)}</b>`);

        await sendTelegramMessage(lines.join("\n"), chatId);
        break;
      }

      case "/debug": {
        const hDbg = hojeISO();
        const dDbg = new Date(hDbg + "T12:00:00");
        dDbg.setDate(dDbg.getDate() - 6);
        const inicioDbg = `${dDbg.getFullYear()}-${String(dDbg.getMonth() + 1).padStart(2, "0")}-${String(dDbg.getDate()).padStart(2, "0")}`;

        const { data: totalVendas, count: countAll } = await supabase
          .from("vendas").select("*", { count: "exact", head: true });

        const { data: vendasSemDbg, count: countSem } = await supabase
          .from("vendas").select("*", { count: "exact", head: true })
          .gte("data", inicioDbg).lte("data", hDbg);

        const { data: vendasSemNaoCanc, count: countSemNaoCanc } = await supabase
          .from("vendas").select("*", { count: "exact", head: true })
          .gte("data", inicioDbg).lte("data", hDbg).neq("status_pagamento", "CANCELADO");

        // Pegar 3 vendas de exemplo para ver as datas
        const { data: exemplos } = await supabase
          .from("vendas").select("data, status_pagamento, cliente, preco_vendido")
          .order("data", { ascending: false }).limit(5);

        // Ver datas distintas
        const { data: datas } = await supabase
          .from("vendas").select("data").order("data", { ascending: false }).limit(20);

        const datasUnicas = [...new Set((datas ?? []).map(d => d.data))].slice(0, 10);

        const dbgLines = [
          `🔧 <b>DEBUG</b>`,
          `hoje (BRT): ${hDbg}`,
          `início semana: ${inicioDbg}`,
          `fim: ${hDbg}`,
          ``,
          `Total vendas no banco: ${countAll}`,
          `Vendas ${inicioDbg} a ${hDbg}: ${countSem}`,
          `Vendas sem CANCELADO: ${countSemNaoCanc}`,
          ``,
          `<b>Últimas 5 vendas:</b>`,
          ...(exemplos ?? []).map(e => `  ${e.data} | ${e.status_pagamento} | ${e.cliente} | R$${e.preco_vendido}`),
          ``,
          `<b>Datas no banco (últ. 10):</b>`,
          ...datasUnicas.map(d => `  ${d}`),
        ];

        await sendTelegramMessage(dbgLines.join("\n"), chatId);
        break;
      }

      default: {
        // Comando desconhecido — ignorar
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Sempre retornar 200 pro Telegram
  }
}
