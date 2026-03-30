import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ vendedor: "Bianca", whatsapp: "5521972461357" });
  if (sp.p) qs.set("produto", sp.p);
  if (sp.v) qs.set("preco", sp.v);
  redirect(`/compra?${qs.toString()}`);
}
