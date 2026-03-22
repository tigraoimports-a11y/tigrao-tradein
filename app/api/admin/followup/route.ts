import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

export async function POST(request: Request) {
  const pw = request.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  const { supabase } = await import("@/lib/supabase");

  const { data: row, error } = await supabase
    .from("simulacoes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const condicoes = (row.condicao_linhas as string[] | null)?.join("\n") ?? "";

  const linhas = [
    `Olá ${row.nome}! 😊`,
    ``,
    `Vi que você fez uma simulação de trade-in aqui na TigrãoImports 🐯`,
    ``,
    `🆕 Produto novo: ${row.modelo_novo} ${row.storage_novo} (${fmt(row.preco_novo)})`,
    `🔄 Seu aparelho: ${row.modelo_usado} ${row.storage_usado}`,
    ...(condicoes ? [condicoes] : []),
    `💎 Avaliação: ${fmt(row.avaliacao_usado)}`,
    `💵 Diferença no PIX: ${fmt(row.diferenca)}`,
    ``,
    `Posso te fazer uma proposta especial? 👉`,
  ];

  const msg = linhas.join("\n");

  const num = (row.whatsapp as string).replace(/\D/g, "");
  const full = num.startsWith("55") ? num : `55${num}`;

  const zapiRes = await fetch(
    `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": process.env.ZAPI_CLIENT_TOKEN!,
      },
      body: JSON.stringify({ phone: full, message: msg }),
    }
  );

  const zapiJson = await zapiRes.json();
  console.log("[followup] zapi:", JSON.stringify(zapiJson));

  await supabase
    .from("simulacoes")
    .update({ contatado: true, follow_up_enviado: true })
    .eq("id", id);

  const usuario = request.headers.get("x-admin-user") || "Sistema";
  logActivity(usuario, "Enviou follow-up", `Simulacao ID: ${id}, Cliente: ${row.nome}`, "simulacoes", id).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const pw = request.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { error } = await supabase
    .from("simulacoes")
    .update({ follow_up_enviado: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuario = request.headers.get("x-admin-user") || "Sistema";
  logActivity(usuario, "Marcou follow-up enviado", `Simulacao ID: ${id}`, "simulacoes", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
