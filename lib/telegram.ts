// ============================================
// Telegram — Envio e formatação de mensagens
// ============================================

import type { DashboardParcial, ReportNoite, ReportManha } from "./admin-types";
import { formatDateBR } from "./business-days";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const GRUPO_ID = process.env.TELEGRAM_CHAT_ID ?? "";

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
  if (!token || !chat) return false;

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
    return res.ok;
  } catch {
    return false;
  }
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
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
  return [
    `🌙 <b>FECHAMENTO DO DIA — TigrãoImports</b>`,
    `📅 ${formatDateBR(r.data)}`,
    ``,
    `📊 <b>Vendas:</b> ${r.totalVendas} | Lucro: <b>${fmtBRL(r.lucroTotal)}</b>`,
    ``,
    `🏦 <b>ITAÚ</b>`,
    `  Base manhã: ${fmtBRL(r.itau_base)}`,
    `  + PIX/Din: ${fmtBRL(r.pix_itau)}`,
    `  + D+1: ${fmtBRL(r.d1_itau)}`,
    `  + Reajustes: ${fmtBRL(r.reaj_itau)}`,
    `  − Saídas: ${fmtBRL(r.saiu_itau)}`,
    `  <b>= ${fmtBRL(r.esp_itau)}</b>`,
    ``,
    `🏦 <b>INFINITE</b>`,
    `  Base manhã: ${fmtBRL(r.inf_base)}`,
    `  + PIX/Din: ${fmtBRL(r.pix_inf)}`,
    `  + D+1: ${fmtBRL(r.d1_inf)}`,
    `  + Reajustes: ${fmtBRL(r.reaj_inf)}`,
    `  − Saídas: ${fmtBRL(r.saiu_inf)}`,
    `  <b>= ${fmtBRL(r.esp_inf)}</b>`,
    ``,
    `🏦 <b>MERCADO PAGO</b>`,
    `  Base manhã: ${fmtBRL(r.mp_base)}`,
    `  + PIX/Din: ${fmtBRL(r.pix_mp)}`,
    `  + D+1: ${fmtBRL(r.d1_mp)}`,
    `  + Reajustes: ${fmtBRL(r.reaj_mp)}`,
    `  − Saídas: ${fmtBRL(r.saiu_mp)}`,
    `  <b>= ${fmtBRL(r.esp_mp)}</b>`,
    ``,
    `💵 <b>ESPÉCIE:</b> ${fmtBRL(r.esp_especie)}`,
  ].join("\n");
}

/**
 * Formata relatório /manha para Telegram HTML.
 */
export function formatManhaHTML(r: ReportManha): string {
  return [
    `☀️ <b>CONFERÊNCIA BANCÁRIA — TigrãoImports</b>`,
    `📅 ${formatDateBR(r.data)}`,
    ``,
    `🏦 <b>ITAÚ</b>`,
    `  Fechamento ontem: ${fmtBRL(r.esp_itau_ontem)}`,
    `  + D+1 entrando: ${fmtBRL(r.creditos_itau)}`,
    `  <b>Esperado: ${fmtBRL(r.saldo_itau)}</b>`,
    ``,
    `🏦 <b>INFINITE</b>`,
    `  Fechamento ontem: ${fmtBRL(r.esp_inf_ontem)}`,
    `  + D+1 entrando: ${fmtBRL(r.creditos_inf)}`,
    `  <b>Esperado: ${fmtBRL(r.saldo_inf)}</b>`,
    ``,
    `🏦 <b>MERCADO PAGO</b>`,
    `  Fechamento ontem: ${fmtBRL(r.esp_mp_ontem)}`,
    `  + D+1 entrando: ${fmtBRL(r.creditos_mp)}`,
    `  <b>Esperado: ${fmtBRL(r.saldo_mp)}</b>`,
    ``,
    `💵 <b>ESPÉCIE:</b> ${fmtBRL(r.saldo_especie)}`,
    ``,
    `📈 <b>Mês atual:</b> ${r.vendasMes} vendas | Lucro: ${fmtBRL(r.lucroMes)}`,
  ].join("\n");
}
