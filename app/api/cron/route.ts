import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarParcial, gerarNoite, gerarManha } from "@/lib/reports";
import { sendTelegramMessage, formatParcialHTML, formatNoiteHTML, formatManhaHTML } from "@/lib/telegram";
import { hojeISO } from "@/lib/business-days";

// Proteger endpoint com secret
function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const hoje = hojeISO();
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";

  try {
    switch (tipo) {
      case "manha": {
        const report = await gerarManha(supabase, hoje);
        await sendTelegramMessage(formatManhaHTML(report), chatId);
        return NextResponse.json({ ok: true, tipo: "manha" });
      }

      case "parcial": {
        const report = await gerarParcial(supabase, hoje);
        await sendTelegramMessage(formatParcialHTML(report), chatId);
        return NextResponse.json({ ok: true, tipo: "parcial" });
      }

      case "noite": {
        const report = await gerarNoite(supabase, hoje);
        await sendTelegramMessage(formatNoiteHTML(report), chatId);
        return NextResponse.json({ ok: true, tipo: "noite" });
      }

      case "reposicao": {
        const { data: criticos } = await supabase
          .from("estoque")
          .select("produto, categoria, cor, qnt")
          .lte("qnt", 1)
          .or("tipo.is.null,tipo.eq.NOVO")
          .order("qnt")
          .order("categoria");

        if (criticos?.length) {
          const zerados = criticos.filter((p) => p.qnt === 0);
          const acabando = criticos.filter((p) => p.qnt === 1);
          const lines = [`📦 <b>ALERTA DE REPOSIÇÃO</b>`, ""];
          if (zerados.length) {
            lines.push(`🔴 <b>ZERADOS (${zerados.length}):</b>`);
            zerados.forEach((p) => lines.push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`));
            lines.push("");
          }
          if (acabando.length) {
            lines.push(`🟡 <b>ACABANDO (${acabando.length}):</b>`);
            acabando.forEach((p) => lines.push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`));
          }
          await sendTelegramMessage(lines.join("\n"), chatId);
        }
        return NextResponse.json({ ok: true, tipo: "reposicao" });
      }

      case "faltando": {
        const { data: zerados } = await supabase
          .from("estoque")
          .select("produto, categoria, cor")
          .eq("qnt", 0)
          .or("tipo.is.null,tipo.eq.NOVO")
          .order("categoria");

        if (zerados?.length) {
          const byCat: Record<string, string[]> = {};
          zerados.forEach((p) => {
            if (!byCat[p.categoria]) byCat[p.categoria] = [];
            byCat[p.categoria].push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
          });
          const lines = [`🚨 <b>PRODUTOS ZERADOS — ${zerados.length} itens</b>`, ""];
          Object.entries(byCat).forEach(([cat, items]) => {
            lines.push(`<b>${cat}</b>`);
            lines.push(...items);
            lines.push("");
          });
          await sendTelegramMessage(lines.join("\n"), chatId);
        }
        return NextResponse.json({ ok: true, tipo: "faltando" });
      }

      case "semanal": {
        // Trigger semanal report — redireciona para /api/reports/semanal
        const baseUrl = req.nextUrl.origin;
        const res = await fetch(`${baseUrl}/api/reports/semanal`, {
          headers: { "authorization": req.headers.get("authorization") || "" },
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, tipo: "semanal", ...data });
      }

      default:
        return NextResponse.json({ error: "tipo invalido. Use: manha, parcial, noite, reposicao, faltando, semanal" }, { status: 400 });
    }
  } catch (err) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
