import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — lista todos os preços
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const { data, error } = await supabase
    .from("precos")
    .select("*")
    .order("modelo")
    .order("armazenamento");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST — upsert de um produto (modelo + armazenamento + preco_pix + status + categoria)
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { modelo, armazenamento, preco_pix, status, categoria } = body;

  if (!modelo || !armazenamento || preco_pix === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const row: Record<string, unknown> = {
    modelo,
    armazenamento,
    preco_pix: Number(preco_pix),
    status: status ?? "ativo",
    updated_at: new Date().toISOString(),
  };
  // Só enviar categoria se a coluna existir (backwards-compatible)
  if (categoria) row.categoria = categoria;

  const { error } = await supabase.from("precos").upsert(row, { onConflict: "modelo,armazenamento" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notificar design via Telegram
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const catEmoji: Record<string, string> = {
        IPHONE: "📱", MACBOOK: "💻", IPAD: "📟",
        APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌",
      };
      const emoji = catEmoji[categoria || "IPHONE"] || "📱";
      const msg = `🐯 *ALTERAÇÃO DE PREÇO — TigrãoImports*\n\n${emoji} *${modelo} ${armazenamento}*\n💰 Novo preço PIX: *R$ ${Number(preco_pix).toLocaleString("pt-BR")}*\n📌 Status: ${status ?? "ativo"}\n\n⚠️ _Atualizar arte do Instagram_`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
      });
    }
  } catch {
    // Telegram notification failure is non-critical
  }

  return NextResponse.json({ ok: true });
}

// PUT — importa todos os produtos do Google Sheets para o Supabase (só iPhones)
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fetchNewProducts } = await import("@/lib/sheets");
  const { supabase } = await import("@/lib/supabase");

  const products = await fetchNewProducts();

  const rows = products.map((p) => ({
    modelo: p.modelo,
    armazenamento: p.armazenamento,
    preco_pix: p.precoPix,
    status: "ativo",
    categoria: "IPHONE",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("precos")
    .upsert(rows, { onConflict: "modelo,armazenamento" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: rows.length });
}

// DELETE — remover um produto
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { modelo, armazenamento } = body;

  if (!modelo || !armazenamento) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { error } = await supabase
    .from("precos")
    .delete()
    .eq("modelo", modelo)
    .eq("armazenamento", armazenamento);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
