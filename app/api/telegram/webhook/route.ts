import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarParcial, gerarNoite, gerarManha } from "@/lib/reports";
import { sendTelegramMessage, formatParcialHTML, formatNoiteHTML, formatManhaHTML } from "@/lib/telegram";
import { hojeISO } from "@/lib/business-days";

const GRUPO_ID = process.env.TELEGRAM_CHAT_ID ?? "";

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
      case "/status": {
        await sendTelegramMessage(
          [
            `<b>Status do Bot TigrãoImports</b>`,
            ``,
            `Versao: 2.0 (Vercel)`,
            `Data: ${hoje}`,
            `Plataforma: Vercel Serverless`,
            `Banco: Supabase`,
            `Status: Online`,
          ].join("\n"),
          chatId
        );
        break;
      }

      case "/dashboard":
      case "/parcial": {
        const report = await gerarParcial(supabase, hoje);
        await sendTelegramMessage(formatParcialHTML(report), chatId);
        break;
      }

      case "/noite": {
        const report = await gerarNoite(supabase, hoje);
        await sendTelegramMessage(formatNoiteHTML(report), chatId);
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
          await sendTelegramMessage(
            `Uso: /saldos [itau] [infinite] [mp]\nEx: /saldos 15000 8000 3000`,
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

        const fmtBRL = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
        await sendTelegramMessage(
          [
            `<b>Saldos base atualizados</b>`,
            ``,
            `Itau: ${fmtBRL(itau)}`,
            `Infinite: ${fmtBRL(inf)}`,
            `Mercado Pago: ${fmtBRL(mp)}`,
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
          lines.push(`<b>${cat}</b>`);
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
          lines.push(`<b>${cat}</b>`);
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
          for (const p of zerados) {
            lines.push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
          }
          lines.push("");
        }

        if (acabando.length > 0) {
          lines.push(`🟡 <b>ACABANDO (${acabando.length}):</b>`);
          for (const p of acabando) {
            lines.push(`  • ${p.produto}${p.cor ? ` (${p.cor})` : ""}`);
          }
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

        const fmtBRL = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
        const lines = [`📦 <b>RESUMO DO ESTOQUE</b>`, ""];
        for (const [cat, v] of Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`<b>${cat}</b>: ${v.qtd} un. | ${fmtBRL(v.valor)}`);
        }
        lines.push("");
        lines.push(`<b>TOTAL: ${totalQtd} unidades | ${fmtBRL(totalValor)}</b>`);

        await sendTelegramMessage(lines.join("\n"), chatId);
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
