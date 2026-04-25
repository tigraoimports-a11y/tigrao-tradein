import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consultarImei } from "@/lib/infosimples";

export const runtime = "nodejs";
// 90s pra acomodar 2 tentativas do consultarImei
export const maxDuration = 90;

// Item antifraude — botao "🔄 Reconsultar Anatel" no /admin/simulacoes.
// Chamado quando a equipe ve o status "⚠️ Consultar manual" e quer forcar
// nova consulta sem ter que pedir o cliente reenviar print.
//
// POST /api/admin/reconsultar-imei
// Body: { link_compra_id: string, aparelho: 1 | 2 }
//
// Atualiza as colunas troca_imei_status / troca_imei2_status (e _data /
// _detalhes) com o resultado da nova consulta. Retorna o resultado pra
// frontend mostrar imediatamente sem refresh.
//
// Auth: x-admin-password === ADMIN_PASSWORD

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { link_compra_id?: string; aparelho?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const { link_compra_id, aparelho } = body;
  if (!link_compra_id || (aparelho !== 1 && aparelho !== 2)) {
    return NextResponse.json({ error: "Passe { link_compra_id, aparelho: 1 | 2 }" }, { status: 400 });
  }

  const supabase = getSupabase();
  const colImei = aparelho === 1 ? "troca_imei" : "troca_imei2";
  const colStatus = aparelho === 1 ? "troca_imei_status" : "troca_imei2_status";
  const colData = aparelho === 1 ? "troca_imei_consulta_data" : "troca_imei2_consulta_data";
  const colDetalhes = aparelho === 1 ? "troca_imei_consulta_detalhes" : "troca_imei2_consulta_detalhes";

  // Busca o IMEI atual do link
  const { data: linkRow, error: fetchErr } = await supabase
    .from("link_compras")
    .select(`id, ${colImei}`)
    .eq("id", link_compra_id)
    .single();

  if (fetchErr || !linkRow) {
    return NextResponse.json({ error: fetchErr?.message || "link_compra nao encontrado" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imei = (linkRow as any)[colImei] as string | null;
  if (!imei || imei.trim().length === 0) {
    return NextResponse.json({ error: `Aparelho ${aparelho} nao tem IMEI gravado pra reconsultar` }, { status: 400 });
  }

  // Faz a consulta (com retry interno)
  const result = await consultarImei(imei.trim());

  // Atualiza no banco
  const updatePayload: Record<string, string> = {
    [colStatus]: result.status,
    [colData]: result.consultadoEm,
    [colDetalhes]: result.detalhes,
  };

  const { error: updateErr } = await supabase
    .from("link_compras")
    .update(updatePayload)
    .eq("id", link_compra_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    aparelho,
    imei,
    status: result.status,
    detalhes: result.detalhes,
    consultadoEm: result.consultadoEm,
    responsavel: result.responsavel,
  });
}
