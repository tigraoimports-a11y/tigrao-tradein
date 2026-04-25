import { NextRequest, NextResponse } from "next/server";

// Endpoint generico de upload de midia pra ASSETS DO SITE (logo, influencers,
// fotos de hero, etc). Diferente de /api/admin/mostruario/upload que esta
// acoplado a tabelas especificas (loja_produtos, loja_variacoes), este aqui
// so faz upload e retorna a URL — quem chama decide onde salvar a URL.
//
// Reusa o bucket "product-images" (publico, ja configurado) com prefixo
// "site-" no path pra separar logicamente dos assets de produto.

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_KINDS = ["logo", "influencer", "hero", "misc"] as const;
type Kind = typeof ALLOWED_KINDS[number];

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = (formData.get("kind") as string | null) || "misc";

    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    if (!ALLOWED_KINDS.includes(kind as Kind)) {
      return NextResponse.json(
        { error: `kind invalido. Aceitos: ${ALLOWED_KINDS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo invalido. Aceitos: JPEG, PNG, WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande. Maximo: 5MB" }, { status: 400 });
    }

    const { supabase } = await import("@/lib/supabase");

    // Path: site-{kind}-{timestamp}.{ext}
    // Ex: site-logo-1730000000.jpg, site-influencer-1730000000.png
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `site-${kind}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

    return NextResponse.json({ ok: true, url: urlData.publicUrl, path });
  } catch (err) {
    console.error("[site-upload] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// Permite remover assets antigos quando admin troca a logo ou remove um
// influencer. Recebe { url } ou { path } — extrai o path do bucket e remove.
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    let path: string | null = body.path || null;
    if (!path && body.url) {
      const m = String(body.url).match(/\/product-images\/(.+)$/);
      path = m ? m[1] : null;
    }
    if (!path) return NextResponse.json({ error: "Missing path or url" }, { status: 400 });
    // Seguranca: so permite remover assets do site (prefix site-)
    if (!path.startsWith("site-")) {
      return NextResponse.json({ error: "Path nao e asset do site" }, { status: 403 });
    }

    const { supabase } = await import("@/lib/supabase");
    const { error } = await supabase.storage.from("product-images").remove([path]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[site-upload DELETE] error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
