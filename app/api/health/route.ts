// app/api/health/route.ts
// Endpoint ultra-leve usado pelo hook useOnlineStatus pra confirmar conexao
// real com o servidor (em vez de confiar apenas em navigator.onLine, que
// tem historico de falsos positivos no macOS).
//
// Nao toca banco, nao autentica — so devolve 200 + timestamp. Deve
// responder em <50ms mesmo em cold start.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
