// Carrega fontes Inter (OTF) para uso com next/og (Satori).
// Cache em memória vive enquanto a função Lambda/edge estiver quente.
// jsdelivr.net aponta pro repo oficial rsms/inter, CDN confiável.

type Weight = "Regular" | "Medium" | "SemiBold" | "Bold";

const FONT_CACHE = new Map<Weight, ArrayBuffer>();

const FONT_URLS: Record<Weight, string> = {
  Regular: "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.otf",
  Medium: "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Medium.otf",
  SemiBold: "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-SemiBold.otf",
  Bold: "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Bold.otf",
};

async function loadOne(w: Weight): Promise<ArrayBuffer> {
  const cached = FONT_CACHE.get(w);
  if (cached) return cached;
  const res = await fetch(FONT_URLS[w]);
  if (!res.ok) throw new Error(`Falha ao carregar fonte Inter ${w}: ${res.status}`);
  const buf = await res.arrayBuffer();
  FONT_CACHE.set(w, buf);
  return buf;
}

export async function loadInterFonts() {
  const [regular, medium, semiBold, bold] = await Promise.all([
    loadOne("Regular"),
    loadOne("Medium"),
    loadOne("SemiBold"),
    loadOne("Bold"),
  ]);
  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Inter", data: semiBold, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}
