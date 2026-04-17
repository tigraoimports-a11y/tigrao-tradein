import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buscarDocumento } from "@/lib/zapsign";

// Webhook do ZapSign — recebe notificacao quando o cliente assina o termo.
// Configurar no painel ZapSign: Configuracoes > Webhooks > URL do seu dominio + /api/webhooks/zapsign
//
// Eventos suportados:
// - doc_signed: documento foi assinado por todos os signatarios
// - doc_refused: signatario recusou assinatura
//
// Payload (ZapSign envia):
// {
//   event_type: "doc_signed" | "doc_refused" | "...",
//   token: "<doc_token>",
//   name: "<doc_name>",
//   signed_file: "<url_pdf_assinado>",
//   ...
// }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType: string = body.event_type || body.event || "";
    const docToken: string = body.token || body.doc_token || "";

    if (!docToken) {
      return NextResponse.json({ error: "doc_token ausente" }, { status: 400 });
    }

    // Buscar o termo pelo token
    const { data: termo } = await supabase
      .from("termos_procedencia")
      .select("id, status")
      .eq("zapsign_doc_token", docToken)
      .maybeSingle();

    if (!termo) {
      // Pode ser webhook de outro sistema — ignorar com 200 pra nao causar retry
      return NextResponse.json({ ok: true, ignored: "termo nao encontrado" });
    }

    if (eventType === "doc_signed") {
      // Buscar detalhes atualizados pra pegar a URL do PDF assinado
      let signedPdfUrl: string | null = body.signed_file || null;
      if (!signedPdfUrl) {
        try {
          const doc = await buscarDocumento(docToken);
          signedPdfUrl = doc.signed_file || null;
        } catch { /* silent — vamos gravar status mesmo assim */ }
      }

      await supabase.from("termos_procedencia").update({
        status: "ASSINADO",
        signed_at: new Date().toISOString(),
        signed_pdf_url: signedPdfUrl,
        updated_at: new Date().toISOString(),
      }).eq("id", termo.id);

      console.log(`[ZapSign] Termo ${termo.id} assinado. PDF: ${signedPdfUrl}`);
    } else if (eventType === "doc_refused") {
      await supabase.from("termos_procedencia").update({
        status: "RECUSADO",
        updated_at: new Date().toISOString(),
      }).eq("id", termo.id);

      console.log(`[ZapSign] Termo ${termo.id} recusado pelo signatario`);
    }
    // Outros eventos (doc_deleted, etc) podem ser adicionados depois

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ZapSign webhook] erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET pra testar que o endpoint está vivo
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "zapsign-webhook" });
}
