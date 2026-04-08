import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { logActivity } from "@/lib/activity-log";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

type AppliedRow = { nome: string; aplicada_em: string; aplicada_por: string | null; sucesso: boolean; erro: string | null };

async function listFiles(): Promise<{ nome: string; sql: string }[]> {
  try {
    const files = await fs.readdir(MIGRATIONS_DIR);
    const sqls = files.filter(f => f.endsWith(".sql")).sort();
    const out: { nome: string; sql: string }[] = [];
    for (const f of sqls) {
      try {
        const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf-8");
        out.push({ nome: f, sql });
      } catch { /* ignore */ }
    }
    return out;
  } catch {
    return [];
  }
}

// GET: lista todas as migrations (arquivo no disco + status de aplicada no banco)
export async function GET(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const files = await listFiles();
  const { data: applied, error } = await supabase
    .from("_migrations_applied")
    .select("*")
    .order("aplicada_em", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, hint: "Rode a migration 20260408_migrations_applied.sql no Supabase primeiro." }, { status: 500 });

  const appliedMap = new Map<string, AppliedRow>();
  for (const a of (applied || []) as AppliedRow[]) appliedMap.set(a.nome, a);

  const items = files.map(f => {
    const a = appliedMap.get(f.nome);
    return {
      nome: f.nome,
      sql: f.sql,
      aplicada: !!a,
      aplicada_em: a?.aplicada_em || null,
      aplicada_por: a?.aplicada_por || null,
      sucesso: a?.sucesso ?? null,
      erro: a?.erro || null,
    };
  });

  // também inclui linhas de applied que não têm arquivo (baseline / órfãs)
  const fileNames = new Set(files.map(f => f.nome));
  const orfas = (applied || [])
    .filter((a: AppliedRow) => !fileNames.has(a.nome))
    .map((a: AppliedRow) => ({
      nome: a.nome, sql: "", aplicada: true,
      aplicada_em: a.aplicada_em, aplicada_por: a.aplicada_por,
      sucesso: a.sucesso, erro: a.erro, orfa: true,
    }));

  return NextResponse.json({ items: [...items, ...orfas] });
}

// POST { nome, action: "run" | "mark" | "unmark" }
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { nome, action } = body || {};
  if (!nome || !action) return NextResponse.json({ error: "nome e action obrigatórios" }, { status: 400 });
  const { supabase } = await import("@/lib/supabase");
  const user = getUser(request);

  if (action === "mark") {
    const { error } = await supabase
      .from("_migrations_applied")
      .upsert({ nome, aplicada_por: user, aplicada_em: new Date().toISOString(), sucesso: true, erro: null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logActivity(user, "Marcou migration como aplicada", nome, "migration").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (action === "unmark") {
    const { error } = await supabase.from("_migrations_applied").delete().eq("nome", nome);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logActivity(user, "Desmarcou migration", nome, "migration").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (action === "run") {
    // Lê o arquivo
    let sql = "";
    try {
      sql = await fs.readFile(path.join(MIGRATIONS_DIR, nome), "utf-8");
    } catch {
      return NextResponse.json({ error: "Arquivo não encontrado: " + nome }, { status: 404 });
    }
    // Executa via RPC exec_sql (criado pela bootstrap migration)
    const { error: runErr } = await supabase.rpc("exec_sql", { sql });
    if (runErr) {
      await supabase.from("_migrations_applied").upsert({
        nome, aplicada_por: user, aplicada_em: new Date().toISOString(),
        sucesso: false, erro: runErr.message,
      });
      return NextResponse.json({ error: runErr.message }, { status: 500 });
    }
    await supabase.from("_migrations_applied").upsert({
      nome, aplicada_por: user, aplicada_em: new Date().toISOString(),
      sucesso: true, erro: null,
    });
    logActivity(user, "Rodou migration", nome, "migration").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}
