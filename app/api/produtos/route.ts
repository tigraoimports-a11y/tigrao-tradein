import { NextResponse } from "next/server";
import { fetchNewProducts } from "@/lib/sheets";
import type { NewProduct } from "@/lib/types";

const FALLBACK_PRODUCTS: NewProduct[] = [
  { modelo: "iPhone 16 Pro Max", armazenamento: "256GB", precoPix: 8897 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "512GB", precoPix: 10797 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "1TB", precoPix: 11997 },
  { modelo: "iPhone 16", armazenamento: "128GB", precoPix: 4697 },
  { modelo: "iPhone 16", armazenamento: "256GB", precoPix: 5797 },
];

export async function GET() {
  try {
    const products = await fetchNewProducts();
    return NextResponse.json(products);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return NextResponse.json(FALLBACK_PRODUCTS);
  }
}
