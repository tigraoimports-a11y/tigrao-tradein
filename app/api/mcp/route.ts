import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TOOLS } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const maxDuration = 30;

// MCP Server (Model Context Protocol) — expoe dados do sistema pra Claude
// Desktop / Claude.ai / ChatGPT consumirem via JSON-RPC sobre HTTP.
//
// Spec: https://modelcontextprotocol.io/docs/concepts/transports
// Usamos "Streamable HTTP" stateless — POST com JSON-RPC, resposta JSON
// (sem SSE bi-direcional, sem session management).
//
// Auth: Bearer token via header `Authorization: Bearer <MCP_TOKEN>` OU
// `?token=<MCP_TOKEN>` em query string. Comparacao timing-safe.
//
// Tools: ver lib/mcp-tools.ts (8 tools read-only iniciais).
//
// Como conectar:
// - Claude Desktop: edita ~/Library/Application Support/Claude/claude_desktop_config.json
//   (ver doc no PR/README)
// - Claude.ai (Pro/Max): Customize → Connectors → + → Add custom connector
//   URL: https://<dominio>/api/mcp?token=<MCP_TOKEN>

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = "2025-06-18";

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Valida o token MCP. Aceita 2 formas:
 * 1. Header `Authorization: Bearer <token>` (Claude Desktop, ChatGPT)
 * 2. Query string `?token=<token>` (Claude.ai custom connector se nao
 *    suportar configurar headers)
 *
 * Comparacao timing-safe pra evitar timing attack.
 */
function authValido(req: NextRequest): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) {
    // Em prod, sem token configurado = bloqueia tudo (evita exposicao acidental)
    console.warn("[mcp] MCP_TOKEN nao configurado — bloqueando todas requests");
    return false;
  }

  const auth = req.headers.get("authorization") || "";
  let token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get("token") || "";
  }
  if (!token || token.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Roteia o JSON-RPC method pra handler apropriado.
 * Retorna `null` pra notifications (sem response).
 */
async function handleRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  // Notifications nao tem response (HTTP 202 no transporte)
  if (req.method.startsWith("notifications/")) {
    return null;
  }

  if (req.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {}, // declara que suportamos tools/list e tools/call
        },
        serverInfo: {
          name: "tigrao-mcp",
          version: "1.0.0",
        },
        instructions:
          "Servidor MCP do TigraoImports. Use as tools pra consultar vendas, estoque, clientes, saldos, recebiveis, top SKUs, funil trade-in e gastos. Tudo read-only.",
      },
    };
  }

  if (req.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }

  if (req.method === "tools/call") {
    const name = req.params?.name;
    const args = req.params?.arguments || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool nao encontrada: ${name}` },
      };
    }
    try {
      const supabase = getSupabase();
      const text = await tool.handler(args, supabase);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] tool=${name} erro:`, msg);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Erro executando ${name}: ${msg}` }],
          isError: true,
        },
      };
    }
  }

  // Method desconhecido
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method nao suportado: ${req.method}` },
  };
}

export async function POST(req: NextRequest) {
  if (!authValido(req)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized" },
      },
      { status: 401 }
    );
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: JSON invalido" },
      },
      { status: 400 }
    );
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: { code: -32600, message: "Invalid Request" },
      },
      { status: 400 }
    );
  }

  const response = await handleRpc(body);

  // Notifications: HTTP 202 sem body (spec MCP)
  if (response === null) {
    return new NextResponse(null, { status: 202 });
  }

  return NextResponse.json(response);
}

// GET serve pra health-check / debug humano. MCP spec aceita 405 quando
// nao suportamos SSE bi-direcional.
export async function GET(req: NextRequest) {
  // Se for chamada do MCP cliente pedindo SSE stream, devolve 405
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    return new NextResponse("SSE stream nao suportado (servidor stateless)", {
      status: 405,
    });
  }

  // Caso contrario, mostra info pra humano (sem auth — so metadados publicos)
  return NextResponse.json({
    ok: true,
    name: "tigrao-mcp",
    version: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    transport: "Streamable HTTP (stateless)",
    auth: "Bearer token via 'Authorization' header OU '?token=' query string",
    tools_count: TOOLS.length,
    docs: "POST com JSON-RPC. Ver lib/mcp-tools.ts pra lista de tools.",
  });
}
