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
// OCR via Claude Vision
// ============================================================
// Recebe o buffer da imagem + tipo (serial|imei) e retorna o número
// extraído da tela "Ajustes > Geral > Sobre" do iPhone.
//
// Modelo primário: Haiku 4.5 (barato, ~$0.01/imagem).
// Fallback: Sonnet 4.6 (se Haiku retornar NAO_ENCONTRADO) — prints
// amassados, contraste ruim ou resolução baixa às vezes confundem Haiku.
//
// Logs detalhados em [upload-print:ocr] pra debugar via Vercel logs.
// Fallback final: se ambos falharem, frontend permite digitar manualmente.
// ============================================================
interface ExtractResult {
  ok: boolean;
  value?: string;
  error?: string;
  rawResponse?: string;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

function buildPrompt(tipo: "serial" | "imei"): string {
  if (tipo === "imei") {
    return `Você está analisando uma captura de tela do iPhone (tela "Ajustes > Geral > Sobre").

Sua tarefa: extrair o **IMEI** do aparelho.

Como o IMEI aparece na tela:
- Sempre 15 dígitos numéricos (sem letras)
- Rótulo "IMEI" ou "IMEI 1" (aparelho principal) — se tiver "IMEI2", IGNORE, pegue o primeiro
- Pode aparecer com espaços separando grupos (ex: "35 799960 736598 0"). Retorne concatenado sem espaços.
- Fica na seção "Pessoal" ou similar, perto de "Operadora", "ICCID"

Responda APENAS os 15 dígitos do IMEI principal, sem nenhum outro texto, label, explicação ou formatação. Exemplo de resposta correta: 357999607365980

Se a imagem NÃO contém a tela Ajustes>Sobre do iPhone, ou se nenhum IMEI está visível/legível, responda exatamente: NAO_ENCONTRADO`;
  }
  return `Você está analisando uma captura de tela do iPhone (tela "Ajustes > Geral > Sobre").

Sua tarefa: extrair o **Número de Série** do aparelho.

Como o Número de Série aparece na tela:
- Código alfanumérico (letras maiúsculas e números) com 10-12 caracteres (ex: "KWRL2WNXNH", "F2LMD0P9P27L")
- Rótulo "Número de Série" ou "Serial Number"
- Fica no mesmo card que "Nome", "Versão do iOS", "Nome do Modelo", "Nº do Modelo"
- NÃO é o "Nº do Modelo" (que tem formato diferente, ex: "MFXL4LL/A")

Responda APENAS o Número de Série, em MAIÚSCULAS, sem espaços, traços ou qualquer outro texto. Exemplo de resposta correta: KWRL2WNXNH

Se a imagem NÃO contém a tela Ajustes>Sobre do iPhone, ou se o Número de Série não está visível/legível, responda exatamente: NAO_ENCONTRADO`;
}

async function callClaude(
  client: Anthropic,
  model: string,
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  prompt: string
): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 100,
    // temperature: 0 → determinístico: mesma imagem sempre gera mesma resposta.
    // Sem isso, Haiku às vezes acerta e às vezes retorna NAO_ENCONTRADO na mesma imagem.
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function validateAndSanitize(text: string, tipo: "serial" | "imei"): ExtractResult {
  if (!text || /NAO[_\s]?ENCONTRADO/i.test(text)) {
    return { ok: false, error: "Claude não conseguiu identificar o número no print", rawResponse: text };
  }
  const cleaned = text.replace(/[\s\-.]/g, "");
  if (tipo === "imei") {
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 14 || digits.length > 17) {
      return { ok: false, error: `IMEI com ${digits.length} dígitos (esperado 15)`, rawResponse: text };
    }
    return { ok: true, value: digits };
  }
  // serial: alfanumérico, tipicamente 10-12 chars
  if (cleaned.length < 6 || cleaned.length > 20) {
    return { ok: false, error: `Serial com ${cleaned.length} chars (fora do esperado 10-12)`, rawResponse: text };
  }
  // Normaliza pra maiúsculas (Apple usa serial em caps)
  return { ok: true, value: cleaned.toUpperCase() };
}

async function extractNumberFromPrint(
  buffer: Buffer,
  mediaType: string,
  tipo: "serial" | "imei"
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[upload-print:ocr] ANTHROPIC_API_KEY não configurado");
    return { ok: false, error: "ANTHROPIC_API_KEY não configurado no ambiente" };
  }

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
  const prompt = buildPrompt(tipo);

  // Tentativa 1: Haiku 4.5 (barato e rápido)
  let haikuText = "";
  try {
    haikuText = await callClaude(client, HAIKU_MODEL, base64, mt, prompt);
    console.log(`[upload-print:ocr] haiku ${tipo} response:`, JSON.stringify(haikuText));
    const result = validateAndSanitize(haikuText, tipo);
    if (result.ok) {
      console.log(`[upload-print:ocr] haiku ${tipo} SUCCESS → returning "${result.value}"`);
      return result;
    }
    console.warn(`[upload-print:ocr] haiku ${tipo} validation failed: ${result.error}. Trying Sonnet...`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload-print:ocr] haiku ${tipo} FAIL:`, msg);
  }

  // Tentativa 2 (fallback): Sonnet 4.6 — mais poderoso, ~2x o custo
  try {
    const sonnetText = await callClaude(client, SONNET_MODEL, base64, mt, prompt);
    console.log(`[upload-print:ocr] sonnet ${tipo} response:`, JSON.stringify(sonnetText));
    const result = validateAndSanitize(sonnetText, tipo);
    if (result.ok) {
      console.log(`[upload-print:ocr] sonnet ${tipo} SUCCESS → returning "${result.value}"`);
      return result;
    }
    console.warn(`[upload-print:ocr] sonnet ${tipo} validation failed: ${result.error}`);
    return {
      ok: false,
      error: `Haiku e Sonnet falharam. Haiku: "${haikuText.slice(0, 40)}" | Sonnet: "${sonnetText.slice(0, 40)}"`,
      rawResponse: sonnetText,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload-print:ocr] sonnet ${tipo} FAIL:`, msg);
    return {
      ok: false,
      error: `Erro de API: ${msg}. Haiku disse: "${haikuText.slice(0, 80)}"`,
      rawResponse: haikuText,
    };
  }
}
