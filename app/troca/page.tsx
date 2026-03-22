import TradeInCalculator from "@/components/TradeInCalculator";

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string; tema?: string }> }) {
  const params = await searchParams;
  const vendedor = params.ref?.toLowerCase() || null;
  const tema = params.tema?.toLowerCase() || null;

  return (
    <TradeInCalculator vendedor={vendedor} temaParam={tema} />
  );
}
