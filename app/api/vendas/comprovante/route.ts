import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const vendaId = formData.get("venda_id") as string | null;

    if (!file || !vendaId) {
      return NextResponse.json({ error: "file e venda_id obrigatorios" }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = file.name.split(".").pop() || "png";
    const filename = `comprovantes/${vendaId}_${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("comprovantes")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      // If bucket doesn't exist, try creating it
      if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
        await supabase.storage.createBucket("comprovantes", { public: true });
        const { error: retry } = await supabase.storage
          .from("comprovantes")
          .upload(filename, buffer, { contentType: file.type, upsert: true });
        if (retry) {
          return NextResponse.json({ error: retry.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("comprovantes")
      .getPublicUrl(uploadData?.path || filename);

    const publicUrl = urlData?.publicUrl || "";

    // Update venda with comprovante URL
    const { error: updateError } = await supabase
      .from("vendas")
      .update({ comprovante_url: publicUrl })
      .eq("id", vendaId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl, ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
