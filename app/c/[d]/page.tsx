import { redirect } from "next/navigation";

// Decodifica parâmetros comprimidos e redireciona pro /compra
// Formato: base64url de JSON com keys curtas
// p=produto, v=preco, w=whatsapp, f=forma, x=parcelas, e=entrada_pix, l=local, s=vendedor, p2..p5=produtos extras

const KEY_MAP: Record<string, string> = {
  p: "produto", v: "preco", w: "whatsapp", f: "forma",
  x: "parcelas", e: "entrada_pix", l: "local", s: "vendedor",
  p2: "produto2", p3: "produto3", p4: "produto4", p5: "produto5",
};

export default async function ShortLinkPage({ params }: { params: Promise<{ d: string }> }) {
  const { d } = await params;

  try {
    // Decodifica base64url → JSON
    const json = Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const data = JSON.parse(json);

    // Converte keys curtas pra keys longas
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      const fullKey = KEY_MAP[k] || k;
      if (v) searchParams.set(fullKey, String(v));
    }

    redirect(`/compra?${searchParams.toString()}`);
  } catch {
    redirect("/compra");
  }
}
