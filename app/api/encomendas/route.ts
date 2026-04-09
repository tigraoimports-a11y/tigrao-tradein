import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("encomendas").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.cliente) body.cliente = String(body.cliente).toUpperCase();
  const { data, error } = await supabase.from("encomendas").insert({ ...body, updated_at: new Date().toISOString() }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Criou encomenda", `Cliente: ${body.cliente || "N/A"}, Produto: ${body.produto || "N/A"}`, "encomendas", data?.id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (fields.cliente) fields.cliente = String(fields.cliente).toUpperCase();
  const { error } = await supabase.from("encomendas").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Vincular/desvincular estoque ↔ encomenda
  if ("estoque_id" in fields) {
    if (fields.estoque_id) {
      // Vincular: seta encomenda_id no item do estoque
      await supabase.from("estoque").update({ encomenda_id: id }).eq("id", fields.estoque_id);
    }
    // Se desvinculando (estoque_id = null), limpar encomenda_id do estoque antigo
    if (!fields.estoque_id) {
      await supabase.from("estoque").update({ encomenda_id: null }).eq("encomenda_id", id);
    }
  }

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Atualizou encomenda", `Campos: ${Object.keys(fields).join(", ")}`, "encomendas", id).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("encomendas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Removeu encomenda", `ID: ${id}`, "encomendas", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
