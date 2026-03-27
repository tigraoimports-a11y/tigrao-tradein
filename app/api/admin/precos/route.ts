import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

function getPermissoes(req: NextRequest): string[] {
  try { return JSON.parse(req.headers.get("x-admin-permissoes") || "[]"); } catch { return []; }
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
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "precos.write", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();
  const { modelo, armazenamento, preco_pix, status, categoria, tipo } = body;

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
  // tipo: TRADEIN (default) | CATALOGO | AMBOS
  if (tipo) row.tipo = tipo;

  const { error } = await supabase.from("precos").upsert(row, { onConflict: "modelo,armazenamento" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(usuario, "Alterou preco", `${modelo} ${armazenamento} -> R$ ${Number(preco_pix).toLocaleString("pt-BR")}`, "precos");

  // Notificar design via Telegram (apenas para produtos TRADEIN ou AMBOS)
  const tipoFinal = tipo ?? "TRADEIN";
  const shouldNotifyTelegram = tipoFinal === "TRADEIN" || tipoFinal === "AMBOS";
  if (shouldNotifyTelegram) try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_PRECOS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const catEmoji: Record<string, string> = {
        IPHONE: "📱", MACBOOK: "💻", IPAD: "📟",
        APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌",
      };
      const emoji = catEmoji[categoria || "IPHONE"] || "📱";
      // Escapar caracteres especiais para HTML
      const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      // Calcular parcelas com taxas de repasse
      const pix = Number(preco_pix);
      let t12 = 13, t18 = 19, t21 = 22; // fallback hardcoded
      try {
        const { data: repasse } = await supabase.from("taxas_repasse").select("parcelas,taxa_pct").in("parcelas", ["12x", "18x", "21x"]);
        if (repasse && repasse.length > 0) {
          for (const r of repasse) {
            if (r.parcelas === "12x") t12 = Number(r.taxa_pct);
            if (r.parcelas === "18x") t18 = Number(r.taxa_pct);
            if (r.parcelas === "21x") t21 = Number(r.taxa_pct);
          }
        }
      } catch { /* fallback to hardcoded */ }
      const parcelas12 = Math.round((pix * (1 + t12 / 100)) / 12);
      const parcelas18 = Math.round((pix * (1 + t18 / 100)) / 18);
      const parcelas21 = Math.round((pix * (1 + t21 / 100)) / 21);
      const msg = `🐯 <b>ALTERAÇÃO DE PREÇO — TigrãoImports</b>\n\n${emoji} <b>${escHtml(modelo)} ${escHtml(armazenamento)}</b>\n💰 Novo preço PIX: <b>R$ ${pix.toLocaleString("pt-BR")}</b>\n💳 12x <b>R$ ${parcelas12}</b>\n💳 18x <b>R$ ${parcelas18}</b>\n💳 21x <b>R$ ${parcelas21}</b>\n📌 Status: ${escHtml(status ?? "ativo")}\n👤 Alterado por: <b>${escHtml(usuario)}</b>\n\n⚠️ <i>Atualizar arte do Instagram</i>`;
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
      });
      if (!tgRes.ok) {
        const tgErr = await tgRes.text();
        console.error("Telegram send error:", tgRes.status, tgErr);
      }
    } else {
      console.warn("Telegram env vars missing: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    }
  } catch (err) {
    console.error("Telegram notification failed:", err);
  }

  // ── Sincronizar com Mostruário ──
  // Buscar variações do mostruário que correspondem a este modelo+armazenamento
  let syncCount = 0;
  try {
    // Buscar todas as variações que contenham o modelo no nome do produto pai
    const { data: lojaProds } = await supabase
      .from("loja_produtos")
      .select("id, nome")
      .ilike("nome", `%${modelo.replace(/iPhone /i, "").trim()}%`);

    if (lojaProds && lojaProds.length > 0) {
      for (const prod of lojaProds) {
        // Buscar variações deste produto que tenham o armazenamento correspondente
        const { data: vars } = await supabase
          .from("loja_variacoes")
          .select("id, nome, atributos, preco")
          .eq("produto_id", prod.id);

        if (vars) {
          for (const v of vars) {
            const attrs = v.atributos as Record<string, string> | null;
            const varStorage = attrs?.armazenamento || attrs?.storage || "";
            // Match por armazenamento OU pelo nome da variação conter o armazenamento
            if (varStorage === armazenamento || v.nome.includes(armazenamento)) {
              if (Number(v.preco) !== Number(preco_pix)) {
                await supabase.from("loja_variacoes").update({ preco: Number(preco_pix) }).eq("id", v.id);
                syncCount++;
              }
            }
          }
        }
      }
    }
    if (syncCount > 0) console.log(`Mostruario sync: ${syncCount} variacoes atualizadas para ${modelo} ${armazenamento}`);
  } catch (err) {
    console.error("Erro ao sincronizar com mostruario:", err);
  }

  return NextResponse.json({ ok: true, mostruario_sync: syncCount });
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
