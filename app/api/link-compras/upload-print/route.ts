import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Upload do print do iPhone (N° de Série ou IMEI) pra link_compras.
 * Chamado pelo formulário público /compra quando o cliente marca "produto na troca".
 *
 * FormData:
 *   file: File (imagem do print)
 *   short_code: código curto do link de compra
 *   tipo: "serial" | "imei"
 *   aparelho: "1" | "2" (qual aparelho da troca)
 *
 * Além de salvar o print, roda OCR com Claude Haiku Vision pra extrair
 * o número digitado na tela "Ajustes > Geral > Sobre" e grava na coluna
 * de texto correspondente (troca_serial, troca_imei, troca_serial2,
 * troca_imei2). Retorna o valor extraído pro frontend exibir imediatamente.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const shortCode = formData.get("short_code") as string | null;
    const tipo = formData.get("tipo") as string | null;
    const aparelho = formData.get("aparelho") as string | null;

    if (!file || !shortCode || !tipo) {
      return NextResponse.json({ error: "file, short_code e tipo obrigatorios" }, { status: 400 });
    }
    if (tipo !== "serial" && tipo !== "imei") {
      return NextResponse.json({ error: "tipo deve ser 'serial' ou 'imei'" }, { status: 400 });
    }
    const aparelhoNum = aparelho === "2" ? 2 : 1;

    // Busca o link pra garantir que existe — tenta exato primeiro, depois case-insensitive
    let { data: link, error: linkErr } = await supabase
      .from("link_compras")
      .select("id")
      .eq("short_code", shortCode)
      .maybeSingle();
    if (!link && !linkErr) {
      const retry = await supabase
        .from("link_compras")
        .select("id")
        .ilike("short_code", shortCode)
        .maybeSingle();
      link = retry.data;
      linkErr = retry.error;
    }

    // Se nao existe, cria um registro placeholder (acontece quando o cliente
    // vem direto do simulador de troca sem passar pelo /link-compras-auto).
    // Assim o fluxo de upload funciona e o submit posterior completa os dados.
    if (!link) {
      const produto = formData.get("produto") as string | null;
      const cliente_nome = formData.get("cliente_nome") as string | null;
      const cliente_telefone = formData.get("cliente_telefone") as string | null;
      const troca_produto = formData.get("troca_produto") as string | null;
      const troca_valor = formData.get("troca_valor") as string | null;

      const insertPayload = {
        short_code: shortCode,
        url_curta: `https://tigrao-tradein.vercel.app/c/${shortCode}`,
        tipo: troca_produto ? "TROCA" : "COMPRA",
        cliente_nome: cliente_nome || null,
        cliente_telefone: cliente_telefone || null,
        produto: produto || "(produto será preenchido no submit)",
        troca_produto: troca_produto || null,
        troca_valor: troca_valor ? Number(troca_valor) || 0 : null,
        status: "PENDENTE",
        arquivado: false,
      };

      const { data: novoLink, error: insertErr } = await supabase
        .from("link_compras")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr || !novoLink) {
        console.error(`[upload-print] Falha ao criar link_compras: ${insertErr?.message}`);
        return NextResponse.json({ error: `link_compras nao encontrado e falha ao criar: ${insertErr?.message || "desconhecido"}` }, { status: 500 });
      }
      link = novoLink;
    }

    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "arquivo muito grande (max 5MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const filename = `troca-prints/${shortCode}_${tipo}${aparelhoNum}_${Date.now()}.${ext}`;

    // Upload no bucket "comprovantes" (reusa o existente pra simplicidade)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("comprovantes")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
        await supabase.storage.createBucket("comprovantes", { public: true });
        const { error: retry } = await supabase.storage
          .from("comprovantes")
          .upload(filename, buffer, { contentType: file.type, upsert: true });
        if (retry) return NextResponse.json({ error: retry.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    const { data: urlData } = supabase.storage
      .from("comprovantes")
      .getPublicUrl(uploadData?.path || filename);
    const publicUrl = urlData?.publicUrl || "";

    // OCR com Claude Haiku Vision: extrai o número digitado no print.
    // Roda em paralelo com a gravação da URL no banco.
    const extracted = await extractNumberFromPrint(buffer, file.type, tipo);

    // Mapeia qual coluna da URL do print atualizar
    const urlCol =
      tipo === "serial" && aparelhoNum === 1 ? "troca_print_serial_url" :
      tipo === "imei" && aparelhoNum === 1 ? "troca_print_imei_url" :
      tipo === "serial" && aparelhoNum === 2 ? "troca_print_serial2_url" :
      "troca_print_imei2_url";

    // Mapeia qual coluna de texto (IMEI/Serial digitado) atualizar
    const textCol =
      tipo === "serial" && aparelhoNum === 1 ? "troca_serial" :
      tipo === "imei" && aparelhoNum === 1 ? "troca_imei" :
      tipo === "serial" && aparelhoNum === 2 ? "troca_serial2" :
      "troca_imei2";

    const updatePayload: Record<string, string> = { [urlCol]: publicUrl };
    if (extracted.ok && extracted.value) {
      updatePayload[textCol] = extracted.value;
    }

    const { error: updateError } = await supabase
      .from("link_compras")
      .update(updatePayload)
      .eq("id", link.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      field: urlCol,
      extracted: extracted.value || null,
      extractedOk: extracted.ok,
      extractedError: extracted.ok ? null : extracted.error,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ============================================================
// OCR via Claude Haiku Vision
// ============================================================
// Recebe o buffer da imagem + tipo (serial|imei) e retorna o número
// extraído da tela "Ajustes > Geral > Sobre" do iPhone.
//
// Modelo: claude-haiku-4-5 (rápido, barato ~$0.01/imagem, suficiente
// pra leitura de números de tela Apple com alta legibilidade).
//
// Fallback: se falhar (API fora, imagem ilegível, timeout), retorna
// { ok: false } e o frontend permite o cliente digitar manualmente.
// ============================================================
interface ExtractResult {
  ok: boolean;
  value?: string;
  error?: string;
}

async function extractNumberFromPrint(
  buffer: Buffer,
  mediaType: string,
  tipo: "serial" | "imei"
): Promise<ExtractResult> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "ANTHROPIC_API_KEY não configurado" };
    }

    // Claude aceita apenas image/jpeg, image/png, image/gif, image/webp
    const supportedTypes: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
      "image/jpeg": "image/jpeg",
      "image/jpg": "image/jpeg",
      "image/png": "image/png",
      "image/gif": "image/gif",
      "image/webp": "image/webp",
    };
    const mt = supportedTypes[mediaType.toLowerCase()] || "image/png";

    const base64 = buffer.toString("base64");
    const client = new Anthropic({ apiKey });

    const prompt = tipo === "imei"
      ? `Esta é uma captura de tela do iPhone na tela "Ajustes > Geral > Sobre". Extraia APENAS o IMEI (15 dígitos, geralmente aparece como "IMEI" ou "IMEI 1"). Retorne SOMENTE os 15 dígitos sem espaços, traços, pontos ou qualquer outro caractere. Se houver múltiplos IMEIs, retorne o primeiro. Se não conseguir identificar o IMEI com certeza, retorne exatamente "NAO_ENCONTRADO".`
      : `Esta é uma captura de tela do iPhone na tela "Ajustes > Geral > Sobre". Extraia APENAS o Número de Série (aparece como "Número de Série" ou "Serial Number"). Retorne SOMENTE o código alfanumérico (letras e números, sem espaços ou traços). Se não conseguir identificar o Número de Série com certeza, retorne exatamente "NAO_ENCONTRADO".`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mt, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text || text === "NAO_ENCONTRADO") {
      return { ok: false, error: "Não foi possível ler o número do print" };
    }

    // Sanitiza: remove espaços, traços, pontos
    const cleaned = text.replace(/[\s\-.]/g, "");

    // Validação mínima por tipo
    if (tipo === "imei") {
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length < 14 || digits.length > 17) {
        return { ok: false, error: `IMEI com ${digits.length} dígitos (esperado 15)` };
      }
      return { ok: true, value: digits };
    }
    // serial: alfanumérico, tipicamente 10-12 chars
    if (cleaned.length < 6 || cleaned.length > 20) {
      return { ok: false, error: `Serial com ${cleaned.length} chars (fora do esperado)` };
    }
    return { ok: true, value: cleaned };
  } catch (err) {
    console.error("[upload-print:ocr]", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
