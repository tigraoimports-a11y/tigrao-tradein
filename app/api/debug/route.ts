import { NextResponse } from "next/server";
import { fetchModelDiscounts, buildModelDiscountsMap } from "@/lib/sheets";

export async function GET() {
  const url = process.env.SHEET_USADOS_DESCONTOS_MODELO_URL;

  if (!url) {
    return NextResponse.json({
      error: "SHEET_USADOS_DESCONTOS_MODELO_URL nao configurada no Vercel",
      fix: "Vá em Vercel → Settings → Environment Variables e adicione a variável",
    });
  }

  try {
    const raw = await fetchModelDiscounts();
    const built = buildModelDiscountsMap(raw);

    return NextResponse.json({
      url_configurada: url.substring(0, 60) + "...",
      modelos_encontrados: Object.keys(raw),
      garantia_por_modelo: Object.fromEntries(
        Object.entries(built).map(([modelo, discounts]) => [
          modelo,
          (discounts as { warrantyBonuses?: object }).warrantyBonuses || "usando_global",
        ])
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
