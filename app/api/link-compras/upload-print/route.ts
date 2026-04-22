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

    // OCR: Claude Vision extrai AMBOS serial e IMEI do print, não importa qual
    // foi anexado (cliente às vezes troca os 2 prints de lugar — a tela Sobre é
    // comprida e precisa 2 prints pra mostrar tudo).
    const both = await extractBothFromPrint(buffer, file.type);

    // Mapeia qual coluna da URL do print atualizar (isso segue o slot original)
    const urlCol =
      tipo === "serial" && aparelhoNum === 1 ? "troca_print_serial_url" :
      tipo === "imei" && aparelhoNum === 1 ? "troca_print_imei_url" :
      tipo === "serial" && aparelhoNum === 2 ? "troca_print_serial2_url" :
      "troca_print_imei2_url";

    // Preenche whichever campo do banco Claude encontrou — independente de
    // qual slot foi anexado. Se print anexado em "serial" contém IMEI,
    // preenchemos troca_imei em vez de troca_serial.
    const colSerial = aparelhoNum === 1 ? "troca_serial" : "troca_serial2";
    const colImei = aparelhoNum === 1 ? "troca_imei" : "troca_imei2";
    const updatePayload: Record<string, string> = { [urlCol]: publicUrl };
    if (both.serial) updatePayload[colSerial] = both.serial;
    if (both.imei) updatePayload[colImei] = both.imei;

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
      extractedSerial: both.serial,
      extractedImei: both.imei,
      extractedOk: !!(both.serial || both.imei),
      extractedError: both.error,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ============================================================
// OCR via Claude Vision
// ============================================================
// Recebe o buffer da imagem e retorna TANTO o Nº de Série QUANTO o IMEI
// encontrados no print, se estiverem visíveis.
//
// A tela "Ajustes > Geral > Sobre" do iPhone é comprida e precisa de 2 prints
// pra mostrar tudo (parte de cima: Nº de Série. Parte de baixo: IMEI). Cliente
// às vezes troca os 2 prints de lugar — extraindo both, a API preenche o
// campo certo independente do slot onde foi anexado.
//
// Modelo primário: Haiku 4.5. Fallback: Sonnet 4.6.
// ============================================================
interface BothExtracted {
  serial: string | null;
  imei: string | null;
  descricao: string | null;
  error?: string;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

const BOTH_PROMPT = `Você está analisando uma captura de tela do iPhone — provavelmente da tela "Ajustes > Geral > Sobre".

Sua tarefa: extrair o **Número de Série** E/OU o **IMEI** do aparelho, se estiverem visíveis. Essa tela é comprida e precisa ser rolada — um print captura a parte de cima (Nº de Série) e outro a parte de baixo (IMEI). Nem sempre os dois aparecem no mesmo print.

Como aparecem na tela:
- **Número de Série**: código alfanumérico com 10-12 caracteres (letras maiúsculas e números, ex: "KWRL2WNXNH", "F2LMD0P9P27L"). Rótulo "Número de Série" ou "Serial Number". Fica perto de "Nome", "Versão do iOS", "Nome do Modelo". NÃO é o "Nº do Modelo" (formato MFXL4LL/A).
- **IMEI**: 15 dígitos numéricos. Rótulo "IMEI" ou "IMEI 1" (se tiver "IMEI 2", ignore, pegue o primeiro). Pode aparecer com espaços separando grupos (ex: "35 799960 736598 0"). Fica perto de "ICCID", "SEID", "EID", "Bloqueio de Operadora".

Responda APENAS um JSON válido, sem markdown, sem explicação, sem code fences. Formato:
{"serial": "KWRL2WNXNH", "imei": "357999607365980", "descricao": "tela Sobre completa"}

Se algum campo não aparecer na imagem, use null:
{"serial": null, "imei": "357999607365980", "descricao": "parte de baixo da tela Sobre com IMEI, ICCID, SEID"}
{"serial": "KWRL2WNXNH", "imei": null, "descricao": "parte de cima da tela Sobre com Nome, Versão, Modelo, Serial"}

Se nenhum aparecer:
{"serial": null, "imei": null, "descricao": "tela de Wi-Fi, não é a tela Sobre"}
{"serial": null, "imei": null, "descricao": "foto desfocada, não consigo ler os textos"}`;

function parseJsonResponse(text: string): { serial: string | null; imei: string | null; descricao: string | null } | null {
  // Remove markdown code fences se Claude adicionar (apesar do prompt pedir pra não adicionar)
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      serial: typeof parsed.serial === "string" ? parsed.serial : null,
      imei: typeof parsed.imei === "string" ? parsed.imei : null,
      descricao: typeof parsed.descricao === "string" ? parsed.descricao : null,
    };
  } catch {
    return null;
  }
}

function sanitizeSerial(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-.]/g, "").toUpperCase();
  if (cleaned.length < 8 || cleaned.length > 15) return null;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}

function sanitizeImei(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 15) return null;
  return digits;
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
    // 300 tokens permite o modelo explicar o que viu quando não acha o número
    // (formato "NAO_ENCONTRADO: descrição"). Antes 100 cortava no meio da frase.
    max_tokens: 300,
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

async function tryExtract(
  client: Anthropic,
  model: string,
  base64: string,
  mt: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  label: string
): Promise<{ serial: string | null; imei: string | null; descricao: string | null; rawText: string } | null> {
  try {
    const rawText = await callClaude(client, model, base64, mt, BOTH_PROMPT);
    console.log(`[upload-print:ocr] ${label} response:`, JSON.stringify(rawText));
    const parsed = parseJsonResponse(rawText);
    if (!parsed) {
      console.warn(`[upload-print:ocr] ${label} JSON parse failed`);
      return { serial: null, imei: null, descricao: null, rawText };
    }
    return {
      serial: sanitizeSerial(parsed.serial),
      imei: sanitizeImei(parsed.imei),
      descricao: parsed.descricao,
      rawText,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload-print:ocr] ${label} FAIL:`, msg);
    return null;
  }
}

async function extractBothFromPrint(buffer: Buffer, mediaType: string): Promise<BothExtracted> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[upload-print:ocr] ANTHROPIC_API_KEY não configurado");
    return { serial: null, imei: null, descricao: null, error: "ANTHROPIC_API_KEY não configurado no ambiente" };
  }

  const supportedTypes: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  };
  const originalMime = mediaType.toLowerCase();
  const mt = supportedTypes[originalMime];
  if (!mt) {
    console.warn(`[upload-print:ocr] MIME não suportado: ${originalMime}`);
    return {
      serial: null,
      imei: null,
      descricao: null,
      error: `Formato "${originalMime}" não suportado. Use JPG ou PNG (print com Botão Lateral + Volume).`,
    };
  }
  const base64 = buffer.toString("base64");
  console.log(`[upload-print:ocr] image: mime=${originalMime}, size=${buffer.length} bytes`);
  const client = new Anthropic({ apiKey });

  // Haiku primeiro (barato e rápido)
  const haiku = await tryExtract(client, HAIKU_MODEL, base64, mt, "haiku");
  if (haiku && (haiku.serial || haiku.imei)) {
    console.log(`[upload-print:ocr] haiku SUCCESS → serial=${haiku.serial || "null"}, imei=${haiku.imei || "null"}`);
    return { serial: haiku.serial, imei: haiku.imei, descricao: haiku.descricao };
  }

  // Fallback Sonnet
  const sonnet = await tryExtract(client, SONNET_MODEL, base64, mt, "sonnet");
  if (sonnet && (sonnet.serial || sonnet.imei)) {
    console.log(`[upload-print:ocr] sonnet SUCCESS → serial=${sonnet.serial || "null"}, imei=${sonnet.imei || "null"}`);
    return { serial: sonnet.serial, imei: sonnet.imei, descricao: sonnet.descricao };
  }

  // Ambos falharam: monta erro com descrição do que Claude viu (se houver)
  const haikuDesc = haiku?.descricao || haiku?.rawText?.slice(0, 150) || "sem resposta";
  const sonnetDesc = sonnet?.descricao || sonnet?.rawText?.slice(0, 150) || "sem resposta";
  return {
    serial: null,
    imei: null,
    descricao: sonnet?.descricao || haiku?.descricao || null,
    error: `Claude não achou serial nem IMEI. Haiku viu: "${haikuDesc}" | Sonnet viu: "${sonnetDesc}"`,
  };
}
