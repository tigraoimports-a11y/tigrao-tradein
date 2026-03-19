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
