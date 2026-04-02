import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ vendedor: "André", whatsapp: "5521967442665" });
  // Passar todos os params do URL original
  for (const [k, v] of Object.entries(sp)) {
    if (k === "p") qs.set("produto", v);
    else if (k === "v") qs.set("preco", v);
    else if (!qs.has(k)) qs.set(k, v);
  }
  redirect(`/compra?${qs.toString()}`);
}
