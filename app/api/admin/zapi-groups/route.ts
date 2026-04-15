import { NextResponse } from "next/server";

// ============================================================
// GET /api/admin/zapi-groups
// ============================================================
// Lista os grupos de WhatsApp da instância Z-API principal.
// Utilidade: descobrir o ID do grupo pra configurar na env var
// ZAPI_GRUPO_PAGAMENTOS (endpoint /api/mp-webhook usa isso pra
// notificar quando cliente paga via link MP).
//
// Uso: admin acessa /admin/zapi-grupos e clica "copiar" no grupo
// desejado. Depois adiciona no Vercel > Environment Variables.
// ============================================================

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(request: Request) {
  if (!auth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    return NextResponse.json(
      { error: "ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurado no servidor." },
      { status: 500 }
    );
  }

  // Z-API não tem endpoint dedicado "list groups" — retornamos os chats
  // (conversas recentes) e filtramos os que são grupos (isGroup=true).
  const chatsUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/chats?page=1&pageSize=100`;
  // Endpoint que retorna o device/phone conectado — útil pra admin saber de
  // qual WhatsApp os grupos estão vindo (alguns números estão em grupos, outros não).
  const deviceUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/device`;

  try {
    const [chatsRes, deviceRes] = await Promise.all([
      fetch(chatsUrl, { headers: { "Client-Token": clientToken } }),
      fetch(deviceUrl, { headers: { "Client-Token": clientToken } }),
    ]);

    const data = await chatsRes.json().catch(() => null);
    const deviceInfo = await deviceRes.json().catch(() => null);

    if (!chatsRes.ok) {
      return NextResponse.json(
        { error: "Z-API retornou erro", status: chatsRes.status, details: data },
        { status: 502 }
      );
    }

    // Extrai telefone + nome do device conectado (se a Z-API retornou)
    const phoneConectado = deviceInfo?.phone || deviceInfo?.me?.user || null;
    const nomeConectado = deviceInfo?.pushname || deviceInfo?.name || null;

    // Z-API retorna um array de chats — filtramos só grupos.
    type Chat = {
      phone?: string;
      name?: string;
      isGroup?: boolean;
      lastMessageTime?: number;
      unread?: number;
    };
    const chats: Chat[] = Array.isArray(data) ? data : [];
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: c.phone || "",
        nome: c.name || "(sem nome)",
        ultimaMensagem: c.lastMessageTime
          ? new Date(c.lastMessageTime * 1000).toISOString()
          : null,
      }))
      .sort((a, b) => (b.ultimaMensagem || "").localeCompare(a.ultimaMensagem || ""));

    return NextResponse.json({
      groups,
      totalChats: chats.length,
      phoneConectado,
      nomeConectado,
    });
  } catch (err) {
    console.error("[zapi-groups] erro:", err);
    return NextResponse.json(
      { error: "Erro de rede ao contatar Z-API" },
      { status: 502 }
    );
  }
}
