import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — all questions (including inactive)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const deviceType = searchParams.get("device_type") || "iphone";

  const { data, error } = await supabase
    .from("tradein_perguntas")
    .select("*")
    .eq("device_type", deviceType)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

// PUT — update a single question
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tradein_perguntas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

// POST — reorder or create
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Reorder action
  if (body.action === "reorder" && Array.isArray(body.items)) {
    const errors: string[] = [];
    for (const item of body.items) {
      const { error } = await supabase
        .from("tradein_perguntas")
        .update({ ordem: item.ordem, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (error) errors.push(error.message);
    }
    if (errors.length) return NextResponse.json({ error: errors.join(", ") }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Create new question
  const { data, error } = await supabase
    .from("tradein_perguntas")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
