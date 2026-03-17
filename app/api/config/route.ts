import { NextResponse } from "next/server";
import { fetchConfig } from "@/lib/sheets";
import type { AppConfig } from "@/lib/types";

const FALLBACK_CONFIG: AppConfig = {
  multiplier12: 1.14,
  multiplier18: 1.20,
  multiplier21: 1.21,
  validadeHoras: 24,
  whatsappNumero: process.env.WHATSAPP_NUMBER || "5521967442665",
};

export async function GET() {
  try {
    const config = await fetchConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Erro ao buscar config:", error);
    return NextResponse.json(FALLBACK_CONFIG);
  }
}
