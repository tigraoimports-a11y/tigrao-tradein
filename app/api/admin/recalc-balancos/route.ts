import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { recalcBalancos } from "@/lib/recalc-balancos";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * Recalcula o balanço (custo_unitario = preço médio ponderado) de todos
 * os produtos EM ESTOQUE. Agora usa a função compartilhada de lib/.
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { groups, updated } = await recalcBalancos();

    await logActivity(
      getUsuario(req),
      "Recalculou balanços",
      `${groups} grupos, ${updated} produtos atualizados`,
      "estoque"
    );

    return NextResponse.json({ ok: true, groups, updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
