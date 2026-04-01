import { Metadata } from "next";

// OG metadata para preview no Instagram/WhatsApp/Telegram
export const metadata: Metadata = {
  title: "TigraoImports - Formulario de Compra 🐯",
  description: "Preencha seus dados para finalizar sua compra. Entrega rapida no Rio de Janeiro!",
  openGraph: {
    title: "TigraoImports - Formulario de Compra 🐯",
    description: "Preencha seus dados para finalizar sua compra. Entrega rapida no Rio de Janeiro!",
    siteName: "TigraoImports",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

// Decodifica parâmetros comprimidos e redireciona pro /compra
// Formato: base64url de JSON com keys curtas
// p=produto, v=preco, w=whatsapp, f=forma, x=parcelas, e=entrada_pix, l=local, s=vendedor

const KEY_MAP: Record<string, string> = {
  p: "produto", v: "preco", w: "whatsapp", f: "forma",
  x: "parcelas", e: "entrada_pix", l: "local", s: "vendedor",
  p2: "produto2", p3: "produto3", p4: "produto4", p5: "produto5",
};

export default async function ShortLinkPage({ params }: { params: Promise<{ d: string }> }) {
  const { d } = await params;

  let redirectUrl = "/compra";
  try {
    const json = Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const data = JSON.parse(json);

    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      const fullKey = KEY_MAP[k] || k;
      if (v) searchParams.set(fullKey, String(v));
    }
    redirectUrl = `/compra?${searchParams.toString()}`;
  } catch {}

  // Renderiza HTML com meta tags (pra crawlers Instagram/WhatsApp verem OG)
  // + redirect imediato via meta refresh e JS pra usuários reais
  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `window.location.replace("${redirectUrl}")` }} />
        <p style={{ fontFamily: "system-ui", textAlign: "center", marginTop: "40vh", color: "#86868B" }}>
          Redirecionando...
        </p>
      </body>
    </html>
  );
}
