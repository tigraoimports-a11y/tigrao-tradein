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
    const id = formData.get("id") as string | null;

    if (!file || !id) {
      return NextResponse.json({ error: "Missing file or id" }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de arquivo invalido. Aceitos: JPEG, PNG, WebP` },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Maximo: 5MB` },
        { status: 400 }
      );
    }

    const { supabase } = await import("@/lib/supabase");

    // Check if product already has an image — delete old file if so
    const { data: existing } = await supabase
      .from("precos")
      .select("image_url")
      .eq("id", id)
      .single();

    if (existing?.image_url) {
      // Extract path from public URL
      const oldPath = extractStoragePath(existing.image_url);
      if (oldPath) {
        await supabase.storage.from("product-images").remove([oldPath]);
      }
    }

    // Upload new file
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `produto-${id}-${Date.now()}.${ext}`;
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

    // Update precos table
    const { error: updateError } = await supabase
      .from("precos")
      .update({ image_url: publicUrl })
      .eq("id", id);

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
  // Public URL format: https://<project>.supabase.co/storage/v1/object/public/product-images/<path>
  const match = publicUrl.match(/\/product-images\/(.+)$/);
  return match ? match[1] : null;
}
