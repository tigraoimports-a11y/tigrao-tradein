import { NextRequest, NextResponse } from "next/server";
import { fetchConfig } from "@/lib/sheets";
import { rateLimitPublic } from "@/lib/rate-limit";
import type { AppConfig } from "@/lib/types";

const FALLBACK_CONFIG: AppConfig = {
  multiplier12: 1.14,
  multiplier18: 1.20,
  multiplier21: 1.21,
  validadeHoras: 24,
  whatsappNumero: process.env.WHATSAPP_NUMBER || "5521967442665",
  bonusGarantiaAte3m: 0.03,
  bonusGarantia3a6m: 0.05,
  bonusGarantia6mMais: 0.07,
};

export async function GET(req: NextRequest) {
  const limited = rateLimitPublic(req);
  if (limited) return limited;
  try {
    const config = await fetchConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Erro ao buscar config:", error);
    return NextResponse.json(FALLBACK_CONFIG);
  }
}
