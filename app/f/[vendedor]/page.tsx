import { redirect } from "next/navigation";

const VENDEDORES: Record<string, { nome: string; whatsapp: string }> = {
  andre: { nome: "André", whatsapp: "5521967442665" },
  nicolas: { nome: "Bianca", whatsapp: "5521972461357" }, // Nicolas desativado — redireciona pra Bianca
  bianca: { nome: "Bianca", whatsapp: "5521972461357" },
};

export default async function ShortLinkPage({ params, searchParams }: { params: Promise<{ vendedor: string }>; searchParams: Promise<Record<string, string>> }) {
  const { vendedor: slug } = await params;
  const sp = await searchParams;
  const v = VENDEDORES[slug.toLowerCase()];

  if (!v) {
    redirect("/");
  }

  const qs = new URLSearchParams();
  qs.set("vendedor", v.nome);
  qs.set("whatsapp", v.whatsapp);
  // Passar todos os params do URL original
  for (const [k, val] of Object.entries(sp)) {
    if (k === "p") qs.set("produto", val);
    else if (k === "v") qs.set("preco", val);
    else if (k === "produto" || k === "preco") qs.set(k, val);
    else if (!qs.has(k)) qs.set(k, val);
  }

  redirect(`/compra?${qs.toString()}`);
}
