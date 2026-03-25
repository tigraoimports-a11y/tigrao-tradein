// ============================================
// Telegram — Envio e formatação de mensagens
// ============================================

import type { DashboardParcial, ReportNoite, ReportManha } from "./admin-types";
import { formatDateBR } from "./business-days";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const GRUPO_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const GRUPO_VENDAS_ID = process.env.TELEGRAM_VENDAS_CHAT_ID ?? "";

/**
 * Envia mensagem para o grupo do Telegram.
 */
export async function sendTelegramMessage(
  text: string,
  chatId?: string,
  parseMode: string = "HTML"
): Promise<boolean> {
  const token = BOT_TOKEN;
  const chat = chatId ?? GRUPO_ID;
  if (!token || !chat) {
    console.error("[Telegram] Token ou chat_id vazio — BOT_TOKEN:", token ? "OK" : "VAZIO", "chat:", chat || "VAZIO");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: parseMode,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Telegram] Erro ao enviar mensagem:", res.status, body);
    }
    return res.ok;
  } catch (err) {
    console.error("[Telegram] Exceção ao enviar mensagem:", err);
    return false;
  }
}

/**
 * Envia documento (PDF, Excel, etc.) para o grupo do Telegram.
 */
export async function sendTelegramDocument(
  fileBuffer: Buffer,
  filename: string,
  caption: string,
  chatId?: string
): Promise<boolean> {
  const token = BOT_TOKEN;
  const chat = chatId ?? GRUPO_ID;
  if (!token || !chat) return false;

  try {
    const formData = new FormData();
    formData.append("chat_id", chat);
    formData.append("document", new Blob([new Uint8Array(fileBuffer)]), filename);
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

/**
 * Envia notificação de nova venda registrada para o grupo do Telegram.
 */
export async function sendSaleNotification(venda: {
  produto?: string;
  cor?: string;
  cliente?: string;
  preco_vendido?: number;
  custo?: number;
  lucro?: number;
  banco?: string;
  forma?: string;
  qnt_parcelas?: number | null;
  bandeira?: string | null;
  vendedor?: string;
}): Promise<boolean> {
  const preco = Number(venda.preco_vendido || 0);
  const lucro = Number(venda.lucro || 0);
  const margem = preco > 0 ? ((lucro / preco) * 100).toFixed(1) : "0";

  // Format payment method with parcelas info
  let formaPag = venda.forma || "—";
  const parcelas = Number(venda.qnt_parcelas || 0);
  if (parcelas > 1) {
    formaPag += ` ${parcelas}x`;
    if (venda.bandeira) formaPag += ` ${venda.bandeira}`;
  } else if (parcelas === 1 && venda.bandeira) {
    formaPag += ` 1x ${venda.bandeira}`;
  }

  const lines = [
    `💰 <b>Nova Venda Registrada!</b>`,
    ``,
    `📱 ${venda.produto || "—"} ${venda.cor || ""}`.trim(),
    `👤 ${venda.cliente || "—"}`,
    `💵 ${fmtBRL(preco)}`,
    `📊 Lucro: ${fmtBRL(lucro)} (${margem}%)`,
    `🏦 ${venda.banco || "—"} — ${formaPag}`,
    ``,
    `Registrado por: ${venda.vendedor || "sistema"}`,
  ];

  // Enviar pro grupo NOVAS VENDAS (se configurado), senão pro grupo padrão
  return sendTelegramMessage(lines.join("\n"), GRUPO_VENDAS_ID || undefined);
}

/**
 * Envia notificação de pagamento confirmado para o grupo do Telegram.
 */
export async function sendPaymentNotification(venda: {
  cliente?: string;
  produto?: string;
  preco_vendido?: number;
  forma?: string;
  banco?: string;
  lucro?: number;
}): Promise<boolean> {
  const lines = [
    `💵 <b>Pagamento confirmado!</b>`,
    ``,
    `👤 ${venda.cliente || "—"}`,
    `📱 ${venda.produto || "—"}`,
    `💰 ${fmtBRL(Number(venda.preco_vendido || 0))} — ${venda.forma || "—"} ${venda.banco || ""}`,
    `📈 Lucro: ${fmtBRL(Number(venda.lucro || 0))}`,
  ];

  return sendTelegramMessage(lines.join("\n"));
}

/**
 * Formata relatório /parcial para Telegram HTML.
 */
export function formatParcialHTML(r: DashboardParcial): string {
  const lines = [
    `🐯 <b>DASHBOARD PARCIAL — TigrãoImports</b>`,
    `📅 ${formatDateBR(r.data)}`,
    ``,
    `📊 <b>Resumo do dia:</b>`,
    `• Vendas: <b>${r.totalVendas}</b>`,
    `• Receita: <b>${fmtBRL(r.receitaBruta)}</b>`,
    `• Lucro: <b>${fmtBRL(r.lucroTotal)}</b>`,
    `• Ticket médio: ${fmtBRL(r.ticketMedio)}`,
    `• Margem média: ${r.margemMedia.toFixed(1)}%`,
  ];

  const origens = Object.entries(r.porOrigem);
  if (origens.length > 0) {
    lines.push(``, `👥 <b>Por origem:</b>`);
    for (const [k, v] of origens) {
      lines.push(`• ${k}: ${v.qty}x — Lucro ${fmtBRL(v.lucro)}`);
    }
  }

  const tipos = Object.entries(r.porTipo);
  if (tipos.length > 0) {
    lines.push(``, `📦 <b>Por tipo:</b>`);
    for (const [k, v] of tipos) {
      lines.push(`• ${k}: ${v.qty}x — Receita ${fmtBRL(v.receita)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formata relatório /noite para Telegram HTML.
 */
export function formatNoiteHTML(r: ReportNoite): string {
  const lines: string[] = [
    `🍎 <b>FECHAMENTO DO DIA — TIGRÃO</b>`,
    `🌙 ${formatDateBR(r.data)}`,
    ``,
    `🛒 <b>VENDAS DE HOJE</b>`,
    `${r.totalVendas} operações`,
    `Faturamento: <b>${fmtBRL(r.faturamento)}</b>`,
    `Custo: ${fmtBRL(r.custoTotal)}`,
    `Lucro: <b>${fmtBRL(r.lucroTotal)}</b>`,
    `Margem: <b>${r.margemMedia.toFixed(1)}%</b>`,
  ];

  // Vendas por origem
  if (r.porOrigem && Object.keys(r.porOrigem).length > 0) {
    lines.push(``, `📋 <b>POR ORIGEM</b>`);
    const sorted = Object.entries(r.porOrigem).sort((a, b) => b[1].qty - a[1].qty);
    for (const [origem, { qty, receita }] of sorted) {
      lines.push(`  ${origem}: ${qty} vendas — ${fmtBRL(receita)}`);
    }
  }

  // Por tipo (VENDA, UPGRADE, ATACADO)
  if (r.porTipo && Object.keys(r.porTipo).length > 0) {
    lines.push(``, `📊 <b>POR TIPO</b>`);
    for (const [tipo, { qty, receita }] of Object.entries(r.porTipo)) {
      lines.push(`  ${tipo}: ${qty} — ${fmtBRL(receita)}`);
    }
  }

  if (r.upgradesHoje > 0) {
    lines.push(``, `🔄 <b>Trade-In/Upgrades hoje:</b> ${r.upgradesHoje}`);
  }

  // Recebimentos hoje (D+0)
  const totalRecebido = r.pix_itau + r.pix_inf + r.pix_mp + r.pix_esp;
  if (totalRecebido > 0) {
    lines.push(``, `💰 <b>RECEBIMENTOS HOJE</b>`);
    if (r.pix_itau > 0) lines.push(`  PIX/Dinheiro Itaú: ${fmtBRL(r.pix_itau)}`);
    if (r.pix_inf > 0) lines.push(`  PIX/Dinheiro Infinite: ${fmtBRL(r.pix_inf)}`);
    if (r.pix_mp > 0) lines.push(`  Link Mercado Pago: ${fmtBRL(r.pix_mp)}`);
    if (r.pix_esp > 0) lines.push(`  Espécie: ${fmtBRL(r.pix_esp)}`);
    lines.push(`  <b>Total recebido: ${fmtBRL(totalRecebido)}</b>`);
  }

  // Créditos D+1 amanhã
  const totalD1 = r.d1_itau + r.d1_inf + r.d1_mp;
  if (totalD1 > 0) {
    lines.push(``, `📅 <b>RECEBIMENTOS AMANHÃ (D+1)</b>`);
    if (r.d1_itau > 0) lines.push(`  Crédito Itaú: ${fmtBRL(r.d1_itau)}`);
    if (r.d1_inf > 0) lines.push(`  Crédito Infinite: ${fmtBRL(r.d1_inf)}`);
    if (r.d1_mp > 0) lines.push(`  Crédito MP: ${fmtBRL(r.d1_mp)}`);
    lines.push(`  <b>Total amanhã: ${fmtBRL(totalD1)}</b>`);
  }

  // Saídas/Gastos do dia
  if (r.totalGastos > 0) {
    lines.push(``, `💸 <b>SAÍDAS DE HOJE</b>`);
    // Agrupar por categoria
    const cats: Record<string, number> = {};
    for (const g of r.gastosDetalhados) {
      const cat = g.categoria || "OUTROS";
      cats[cat] = (cats[cat] || 0) + Number(g.valor);
    }
    for (const [cat, val] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${cat}: ${fmtBRL(val)}`);
    }
    lines.push(`  <b>Total saído: ${fmtBRL(r.totalGastos)}</b>`);
  }

  // Pagamentos a fornecedores
  if (r.totalPagFornecedores > 0) {
    lines.push(``, `🚚 <b>PAGO A FORNECEDOR HOJE</b>`);
    for (const p of r.pagFornecedores) {
      lines.push(`  ${p.descricao} — ${fmtBRL(p.valor)} (${p.banco})`);
    }
  }

  // Saldo final
  const saldoTotal = r.esp_itau + r.esp_inf + r.esp_mp + r.esp_especie;
  lines.push(
    ``,
    `✅ <b>SALDO ESPERADO NAS CONTAS</b>`,
    `  Itaú: <b>${fmtBRL(r.esp_itau)}</b>`,
    `  Infinite: <b>${fmtBRL(r.esp_inf)}</b>`,
    `  Mercado Pago: <b>${fmtBRL(r.esp_mp)}</b>`,
    `  Espécie: <b>${fmtBRL(r.esp_especie)}</b>`,
    `  <b>Total: ${fmtBRL(saldoTotal)}</b>`,
  );

  // Estoque
  if (r.valorEstoque > 0) {
    lines.push(
      ``,
      `📦 <b>ESTOQUE</b>`,
      `  Em estoque: <b>${fmtBRL(r.valorEstoque)}</b>`,
      ``,
      `💎 <b>PATRIMÔNIO TOTAL: ${fmtBRL(saldoTotal + r.valorEstoque)}</b>`,
    );
  }

  const now = new Date();
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  lines.push(``, `<i>Gerado em ${formatDateBR(r.data)} às ${hora}</i>`);

  return lines.join("\n");
}

/**
 * Formata relatório /manha para Telegram HTML.
 */
export function formatManhaHTML(r: ReportManha): string {
  const lines: string[] = [
    `🍎 <b>CONFERÊNCIA BANCÁRIA — TIGRÃO</b>`,
    `📅 Manhã de ${formatDateBR(r.data)}`,
    ``,
  ];

  // Créditos de cartão
  lines.push(`💳 <b>CRÉDITOS DE CARTÃO</b>`);
  if (r.isFimDeSemana) {
    lines.push(`<i>Hoje é fim de semana — sem recebimentos bancários.</i>`);
    const totalPend = r.creditosPendentes_itau + r.creditosPendentes_inf + r.creditosPendentes_mp;
    if (totalPend > 0) {
      lines.push(`Créditos pendentes p/ ${r.dataPendentes} (próx. dia útil)`);
      lines.push(``);
      if (r.creditosPendentes_itau > 0) lines.push(`Itaú: <b>${fmtBRL(r.creditosPendentes_itau)}</b> <i>(pendente)</i>`);
      if (r.creditosPendentes_inf > 0) lines.push(`Infinite: <b>${fmtBRL(r.creditosPendentes_inf)}</b> <i>(pendente)</i>`);
      if (r.creditosPendentes_mp > 0) lines.push(`Link MP: <b>${fmtBRL(r.creditosPendentes_mp)}</b> <i>(pendente)</i>`);
      lines.push(`<b>Total pendente p/ ${r.dataPendentes}: ${fmtBRL(totalPend)}</b>`);
    }
  } else {
    const totalCreditos = r.creditos_itau + r.creditos_inf + r.creditos_mp;
    if (r.creditos_itau > 0) lines.push(`Itaú: <b>${fmtBRL(r.creditos_itau)}</b>`);
    if (r.creditos_inf > 0) lines.push(`Infinite: <b>${fmtBRL(r.creditos_inf)}</b>`);
    if (r.creditos_mp > 0) lines.push(`Link MP: <b>${fmtBRL(r.creditos_mp)}</b>`);
    lines.push(`<b>Total D+1 hoje: ${fmtBRL(totalCreditos)}</b>`);
  }

  // Saldo esperado
  lines.push(
    ``,
    `✅ <b>SALDO ESPERADO NAS CONTAS</b>`,
    `<i>(fechamento ontem - saídas após 20:30 / sem créditos no fim de semana)</i>`,
    `Itaú: <b>${fmtBRL(r.saldo_itau)}</b>`,
    `Infinite: <b>${fmtBRL(r.saldo_inf)}</b>`,
    `Mercado Pago: <b>${fmtBRL(r.saldo_mp)}</b>`,
    `<b>Total: ${fmtBRL(r.saldoBancarioTotal)}</b>`,
  );

  // Fiado pendente
  if (r.totalFiado > 0) {
    lines.push(``, `📋 <b>FIADO PENDENTE</b> (${r.fiadoPendente.length} venda(s) — ${fmtBRL(r.totalFiado)})`);
    // Agrupar por data
    const byDate: Record<string, typeof r.fiadoPendente> = {};
    for (const f of r.fiadoPendente) {
      if (!byDate[f.data]) byDate[f.data] = [];
      byDate[f.data].push(f);
    }
    for (const [data, items] of Object.entries(byDate).sort()) {
      const totalDia = items.reduce((s, i) => s + i.valor, 0);
      lines.push(`📅 ${formatDateBR(data)}: ${items.length} venda(s) — ${fmtBRL(totalDia)}`);
      for (const i of items) {
        lines.push(`  • ${i.cliente} — ${fmtBRL(i.valor)}`);
      }
    }
  }

  // Estoque
  lines.push(
    ``,
    `📦 <b>ESTOQUE</b>`,
    `Em estoque: <b>${fmtBRL(r.valorEstoque)}</b>`,
    `A caminho: ${fmtBRL(r.valorACaminho)}`,
    `Pendências: ${fmtBRL(r.valorPendencias)}`,
    `Capital em produtos: <b>${fmtBRL(r.capitalProdutos)}</b>`,
    ``,
    `💎 <b>CAPITAL TOTAL: ${fmtBRL(r.patrimonioTotal)}</b>`,
  );

  const now = new Date();
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  lines.push(``, `<i>Gerado em ${formatDateBR(r.data)} às ${hora}</i>`);

  return lines.join("\n");
}
