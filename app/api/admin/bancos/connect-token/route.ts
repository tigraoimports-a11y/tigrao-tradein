import { NextRequest, NextResponse } from "next/server";
import { criarConnectToken } from "@/lib/pluggy";

export const runtime = "nodejs";

// POST /api/admin/bancos/connect-token
// Body: { itemId?: string }   ← se passado, abre widget em modo "atualizar"
//
// Gera um connect token efemero (vale 30min) pro Pluggy Connect Widget.
// Frontend usa esse token pra abrir a UI nativa do Pluggy onde o admin:
// 1. Escolhe o banco
// 2. Loga com credenciais do app/site do banco
// 3. Autoriza Open Finance
// 4. Pluggy retorna um itemId que o frontend manda pra POST /connections
//
// Auth: x-admin-password
export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const itemId: string | undefined = body.itemId;

  try {
    const token = await criarConnectToken(itemId);
    return NextResponse.json(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bancos/connect-token]", msg);
    // Erro especifico: token Pluggy nao configurado
    if (msg.includes("PLUGGY_CLIENT_ID")) {
      return NextResponse.json({
        error: "Pluggy nao configurado. Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Vercel.",
      }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
