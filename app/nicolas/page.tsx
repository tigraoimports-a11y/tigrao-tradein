import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ vendedor: "Nicolas", whatsapp: "5521967442665" });
  if (sp.p) qs.set("produto", sp.p);
  if (sp.v) qs.set("preco", sp.v);
  redirect(`/compra?${qs.toString()}`);
}
