import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Upload do print do iPhone (N° de Série ou IMEI) pra link_compras.
 * Chamado pelo formulário público /compra quando o cliente marca "produto na troca".
 *
 * FormData:
 *   file: File (imagem do print)
 *   short_code: código curto do link de compra
 *   tipo: "serial" | "imei"
 *   aparelho: "1" | "2" (qual aparelho da troca)
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

    // Mapeia qual coluna atualizar
    const col =
      tipo === "serial" && aparelhoNum === 1 ? "troca_print_serial_url" :
      tipo === "imei" && aparelhoNum === 1 ? "troca_print_imei_url" :
      tipo === "serial" && aparelhoNum === 2 ? "troca_print_serial2_url" :
      "troca_print_imei2_url";

    const { error: updateError } = await supabase
      .from("link_compras")
      .update({ [col]: publicUrl })
      .eq("id", link.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl, field: col, ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
