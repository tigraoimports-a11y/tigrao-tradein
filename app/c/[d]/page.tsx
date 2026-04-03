import { Metadata } from "next";

// Decodifica parâmetros comprimidos e redireciona pro /compra
// Formato: base64url de JSON com keys curtas
// p=produto, v=preco, w=whatsapp, f=forma, x=parcelas, e=entrada_pix, l=local, s=vendedor

const KEY_MAP: Record<string, string> = {
  p: "produto", v: "preco", w: "whatsapp", f: "forma",
  x: "parcelas", e: "entrada_pix", l: "local", s: "vendedor",
  sh: "shopping", h: "horario", dt: "data_entrega",
  tp: "troca_produto", tv: "troca_valor",
  p2: "produto2", p3: "produto3", p4: "produto4", p5: "produto5",
};

async function resolveData(d: string): Promise<Record<string, string>> {
  try {
    if (d.length <= 8 && /^[A-Za-z0-9]+$/.test(d)) {
      const { supabase } = await import("@/lib/supabase");
      const { data: row } = await supabase
        .from("activity_log")
        .select("detalhes")
        .eq("entidade", "short_link")
        .eq("acao", d)
        .single();
      return row ? JSON.parse(row.detalhes) : {};
    } else if (d.startsWith("z")) {
      const zlib = await import("zlib");
      const buf = Buffer.from(d.slice(1).replace(/-/g, "+").replace(/_/g, "/"), "base64");
      return JSON.parse(zlib.inflateRawSync(buf).toString("utf-8"));
    } else {
      return JSON.parse(Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    }
  } catch {
    return {};
  }
}

function buildRedirectUrl(data: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    const fullKey = KEY_MAP[k] || k;
    if (v) searchParams.set(fullKey, String(v));
  }
  return searchParams.toString() ? `/compra?${searchParams.toString()}` : "/compra";
}

export async function generateMetadata({ params }: { params: Promise<{ d: string }> }): Promise<Metadata> {
  const { d } = await params;
  const data = await resolveData(d);

  const produto = data.p || "";
  const preco = data.v ? `R$ ${Number(data.v).toLocaleString("pt-BR")}` : "";
  const baseUrl = "https://tigrao-tradein.vercel.app";

  const title = produto
    ? `${produto} - TigraoImports 🐯`
    : "TigraoImports - Seu pedido 🐯";

  const description = produto
    ? `${produto}${preco ? ` por ${preco}` : ""}. Preencha seus dados para finalizar a compra!`
    : "Preencha seus dados para finalizar sua compra na TigraoImports!";

  const ogParams = new URLSearchParams();
  if (produto) ogParams.set("produto", produto);
  if (data.v) ogParams.set("preco", Number(data.v).toLocaleString("pt-BR"));
  const ogImageUrl = `${baseUrl}/api/og-image${ogParams.toString() ? `?${ogParams.toString()}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "TigraoImports",
      type: "website",
      url: `${baseUrl}/c/${d}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ShortLinkPage({ params }: { params: Promise<{ d: string }> }) {
  const { d } = await params;
  const data = await resolveData(d);
  const redirectUrl = buildRedirectUrl(data);

  return (
    <div>
      <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
      <script dangerouslySetInnerHTML={{ __html: `window.location.replace("${redirectUrl}")` }} />
      <p style={{ fontFamily: "system-ui", textAlign: "center", marginTop: "40vh", color: "#86868B" }}>
        Redirecionando...
      </p>
    </div>
  );
}
