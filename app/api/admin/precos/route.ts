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

// GET — lista preços. Filtros opcionais:
//   ?tipo=SEMINOVO   → só seminovos
//   ?tipo=LACRADO    → só lacrados (TRADEIN/CATALOGO/AMBOS/null)
//   (sem tipo)       → tudo (backwards-compat)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const tipoFilter = req.nextUrl.searchParams.get("tipo");
  let q = supabase
    .from("precos")
    .select("*")
    .order("modelo");

  if (tipoFilter === "SEMINOVO") {
    q = q.eq("tipo", "SEMINOVO");
  } else if (tipoFilter === "LACRADO") {
    // Qualquer coisa que não seja SEMINOVO conta como lacrado (inclui rows
    // antigas com tipo null/undefined).
    q = q.or("tipo.neq.SEMINOVO,tipo.is.null");
  }

  const { data, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ordena armazenamento numericamente (nao alfabetico). Antes "1TB" vinha
  // antes de "256GB" porque "1" < "2" em string sort. Agora converte TB → GB
  // pra comparar magnitude real.
  const armazenamentoGB = (arm: string | null): number => {
    if (!arm) return 0;
    const m = String(arm).match(/(\d+)\s*(GB|TB|MB)/i);
    if (!m) return 0;
    const n = parseInt(m[1]);
    const u = m[2].toUpperCase();
    if (u === "TB") return n * 1024;
    if (u === "MB") return n / 1024;
    return n;
  };
  // iPhone: ordem pelos variantes (base → e → Plus → Air → Pro → Pro Max)
  // alem da ordem numerica do modelo. Antes string sort colocava "iPhone 17e"
  // depois de "iPhone 17 Pro Max" porque "e" > " ".
  const IPHONE_VARIANTES = ["", "E", "PLUS", "AIR", "PRO", "PRO MAX"];
  const iphoneKey = (modelo: string | null): [number, number] | null => {
    if (!modelo) return null;
    const m = modelo.match(/^iPhone\s+(\d+)(e)?\s*(Plus|Air|Pro\s+Max|Pro)?$/i);
    if (!m) return null;
    const num = parseInt(m[1]);
    let variante = "";
    if (m[2]) variante = "E";
    else if (m[3]) {
      const v = m[3].toUpperCase().replace(/\s+/g, " ");
      if (v === "PLUS" || v === "AIR" || v === "PRO" || v === "PRO MAX") variante = v;
    }
    const idx = IPHONE_VARIANTES.indexOf(variante);
    return [num, idx < 0 ? 99 : idx];
  };
  const ordenados = (data ?? []).sort((a, b) => {
    const ka = iphoneKey(a.modelo);
    const kb = iphoneKey(b.modelo);
    if (ka && kb) {
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
    } else if (ka && !kb) {
      return -1; // iPhone vem antes de nao-iPhone
    } else if (!ka && kb) {
      return 1;
    } else {
      const mm = (a.modelo || "").localeCompare(b.modelo || "");
      if (mm !== 0) return mm;
    }
    return armazenamentoGB(a.armazenamento) - armazenamentoGB(b.armazenamento);
  });

  return NextResponse.json({ data: ordenados });
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

  if (!modelo || preco_pix === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  // Tipo sempre definido: LACRADO default = TRADEIN. Precisa ser NOT NULL pra
  // o unique constraint (modelo, armazenamento, tipo) funcionar — Postgres
  // trata NULL como distinto em unique, e dois NULLs conviveriam furando a regra.
  const tipoFinal = tipo || "TRADEIN";
  const row: Record<string, unknown> = {
    modelo,
    armazenamento,
    preco_pix: Number(preco_pix),
    status: status ?? "ativo",
    tipo: tipoFinal,
    updated_at: new Date().toISOString(),
  };
  // Só enviar categoria se a coluna existir (backwards-compatible)
  if (categoria) row.categoria = categoria;

  const { error } = await supabase.from("precos").upsert(row, { onConflict: "modelo,armazenamento,tipo" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(usuario, "Alterou preco", `${modelo} ${armazenamento} -> R$ ${Number(preco_pix).toLocaleString("pt-BR")}`, "precos");

  // Notificar design via Telegram (apenas para produtos TRADEIN ou AMBOS)
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
    tipo: "TRADEIN",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("precos")
    .upsert(rows, { onConflict: "modelo,armazenamento,tipo" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: rows.length });
}

// PATCH — operacoes em lote. Hoje suporta `rename_modelo`: troca o `modelo`
// de TODAS as linhas dentro de uma categoria pra agrupa-las sob um novo
// titulo no painel de precos. Usado pelo botao "Renomear grupo" — sem isso,
// admin teria que editar cada variante individual.
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "precos.write", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();
  const { action, oldModelo, newModelo, categoria } = body;

  if (action !== "rename_modelo") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!oldModelo || !newModelo) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (oldModelo === newModelo) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { supabase } = await import("@/lib/supabase");

  // Filtra por categoria quando enviada — evita renomear grupo de outra
  // categoria com mesmo nome (defensivo, geralmente nao acontece).
  let q = supabase.from("precos").update({ modelo: newModelo, updated_at: new Date().toISOString() }).eq("modelo", oldModelo);
  if (categoria) q = q.eq("categoria", categoria);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = (data ?? []).length;
  await logActivity(usuario, "Renomeou grupo de precos", `${oldModelo} -> ${newModelo} (${updated} variantes)`, "precos");

  return NextResponse.json({ ok: true, updated });
}

// DELETE — remover um produto
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { modelo, armazenamento, tipo } = body;

  if (!modelo) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  // tipo distingue LACRADO vs SEMINOVO no unique. Sem ele, deletar iPhone 16
  // 128GB LACRADO tiraria tambem o SEMINOVO. Default TRADEIN pra frontend que
  // ainda nao manda tipo (devem sempre mandar apos este fix).
  const tipoFinal = tipo || "TRADEIN";
  const { error } = await supabase
    .from("precos")
    .delete()
    .eq("modelo", modelo)
    .eq("armazenamento", armazenamento)
    .eq("tipo", tipoFinal);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
