import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

const BUCKET = "notas-fiscais";

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const vendaId = formData.get("venda_id") as string | null;

    if (!file || !vendaId) {
      return NextResponse.json({ error: "file e venda_id obrigatorios" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Apenas arquivos PDF sao aceitos" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${vendaId}_${Date.now()}.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
        await supabase.storage.createBucket(BUCKET, { public: true });
        const { error: retry } = await supabase.storage
          .from(BUCKET)
          .upload(filename, buffer, { contentType: "application/pdf", upsert: true });
        if (retry) return NextResponse.json({ error: retry.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(uploadData?.path || filename);

    const publicUrl = urlData?.publicUrl || "";

    const { error: updateError } = await supabase
      .from("vendas")
      .update({ nota_fiscal_url: publicUrl })
      .eq("id", vendaId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
    logActivity(usuario, "Enviou nota fiscal", `Venda ID: ${vendaId}`, "vendas", vendaId).catch(() => {});

    return NextResponse.json({ url: publicUrl, ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
