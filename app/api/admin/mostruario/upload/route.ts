import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const produto_id = formData.get("produto_id") as string | null;
    const variacao_id = formData.get("variacao_id") as string | null;

    // Backwards compat: also accept "id" field (legacy)
    const legacyId = formData.get("id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!produto_id && !variacao_id && !legacyId) {
      return NextResponse.json({ error: "Missing produto_id or variacao_id" }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo invalido. Aceitos: JPEG, PNG, WebP" },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Maximo: 5MB" },
        { status: 400 }
      );
    }

    const { supabase } = await import("@/lib/supabase");

    // Determine target table and id
    let table: string;
    let targetId: string;
    let imageField = "imagem_url";

    if (produto_id) {
      table = "loja_produtos";
      targetId = produto_id;
    } else if (variacao_id) {
      table = "loja_variacoes";
      targetId = variacao_id;
    } else {
      // Legacy: update precos table
      table = "precos";
      targetId = legacyId!;
      imageField = "image_url";
    }

    // Check if record already has an image — delete old file if so
    const { data: existing } = await supabase
      .from(table)
      .select(imageField)
      .eq("id", targetId)
      .single();

    const existingUrl = (existing as Record<string, string> | null)?.[imageField];
    if (existingUrl) {
      const oldPath = extractStoragePath(existingUrl);
      if (oldPath) {
        await supabase.storage.from("product-images").remove([oldPath]);
      }
    }

    // Upload new file
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const prefix = variacao_id ? "var" : "prod";
    const path = `${prefix}-${targetId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Update record
    const { error: updateError } = await supabase
      .from(table)
      .update({ [imageField]: publicUrl })
      .eq("id", targetId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function extractStoragePath(publicUrl: string): string | null {
  const match = publicUrl.match(/\/product-images\/(.+)$/);
  return match ? match[1] : null;
}
