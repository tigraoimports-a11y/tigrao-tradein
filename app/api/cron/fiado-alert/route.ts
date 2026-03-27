import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { hojeISO, formatDateBR } from "@/lib/business-days";

interface Parcela {
  valor: number;
  data: string;
  recebido: boolean;
}

interface VendaFiado {
  id: string;
  cliente: string;
  produto: string;
  entrada_fiado: number;
  fiado_parcelas: Parcela[];
}

interface ParcelaInfo {
  cliente: string;
  valor: number;
  data: string;
  parcelaNum: number;
  totalParcelas: number;
}

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function fmtDateShort(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  const hoje = hojeISO();

  // Tomorrow and 3 days from now
  const todayDate = new Date(hoje + "T12:00:00");
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const amanha = toISO(tomorrowDate);

  const em3DiasDate = new Date(todayDate);
  em3DiasDate.setDate(em3DiasDate.getDate() + 3);
  const em3Dias = toISO(em3DiasDate);

  try {
    const { data: vendas, error } = await supabase
      .from("vendas")
      .select("id, cliente, produto, entrada_fiado, fiado_parcelas")
      .gt("entrada_fiado", 0)
      .neq("status_pagamento", "CANCELADO");

    if (error) {
      console.error("Fiado alert query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vencidos: ParcelaInfo[] = [];
    const venceAmanha: ParcelaInfo[] = [];
    const venceEm3Dias: ParcelaInfo[] = [];

    for (const v of (vendas ?? []) as VendaFiado[]) {
      const parcelas = Array.isArray(v.fiado_parcelas) ? v.fiado_parcelas : [];
      const totalParcelas = parcelas.length;

      parcelas.forEach((p, idx) => {
        if (p.recebido || !p.data) return;

        const info: ParcelaInfo = {
          cliente: v.cliente || "SEM NOME",
          valor: p.valor,
          data: p.data,
          parcelaNum: idx + 1,
          totalParcelas,
        };

        if (p.data < hoje) {
          vencidos.push(info);
        } else if (p.data === amanha) {
          venceAmanha.push(info);
        } else if (p.data > amanha && p.data <= em3Dias) {
          venceEm3Dias.push(info);
        }
      });
    }

    // Nothing pending — skip notification
    if (vencidos.length === 0 && venceAmanha.length === 0 && venceEm3Dias.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum fiado pendente" });
    }

    // Build message
    const lines: string[] = [
      `<b>ALERTA DE FIADOS — ${formatDateBR(hoje)}</b>`,
      ``,
    ];

    if (vencidos.length > 0) {
      // Sort oldest first
      vencidos.sort((a, b) => a.data.localeCompare(b.data));
      lines.push(`<b>VENCIDOS:</b>`);
      for (const p of vencidos) {
        lines.push(`  • ${p.cliente} — ${fmtBRL(p.valor)} (venceu ${fmtDateShort(p.data)}) — Parcela ${p.parcelaNum}/${p.totalParcelas}`);
      }
      lines.push(``);
    }

    if (venceAmanha.length > 0) {
      lines.push(`<b>VENCE AMANHA:</b>`);
      for (const p of venceAmanha) {
        lines.push(`  • ${p.cliente} — ${fmtBRL(p.valor)} (${fmtDateShort(p.data)}) — Parcela ${p.parcelaNum}/${p.totalParcelas}`);
      }
      lines.push(``);
    }

    if (venceEm3Dias.length > 0) {
      lines.push(`<b>PROXIMOS 3 DIAS:</b>`);
      for (const p of venceEm3Dias) {
        lines.push(`  • ${p.cliente} — ${fmtBRL(p.valor)} (${fmtDateShort(p.data)}) — Parcela ${p.parcelaNum}/${p.totalParcelas}`);
      }
      lines.push(``);
    }

    const totalReceber = [...vencidos, ...venceAmanha, ...venceEm3Dias].reduce((s, p) => s + p.valor, 0);
    lines.push(`<b>Total a receber: ${fmtBRL(totalReceber)}</b>`);

    await sendTelegramMessage(lines.join("\n"), chatId);

    return NextResponse.json({
      ok: true,
      vencidos: vencidos.length,
      venceAmanha: venceAmanha.length,
      venceEm3Dias: venceEm3Dias.length,
      totalReceber,
    });
  } catch (err) {
    console.error("Fiado alert error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
