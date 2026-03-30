import { redirect } from "next/navigation";

const VENDEDORES: Record<string, { nome: string; whatsapp: string }> = {
  andre: { nome: "André", whatsapp: "5521967442665" },
  nicolas: { nome: "Nicolas", whatsapp: "5521995618747" },
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
  if (sp.p) qs.set("produto", sp.p);
  if (sp.v) qs.set("preco", sp.v);
  if (sp.produto) qs.set("produto", sp.produto);
  if (sp.preco) qs.set("preco", sp.preco);

  redirect(`/compra?${qs.toString()}`);
}
