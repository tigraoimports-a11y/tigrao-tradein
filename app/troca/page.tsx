import TradeInCalculatorMulti from "@/components/TradeInCalculatorMulti";

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string; tema?: string }> }) {
  const params = await searchParams;
  const vendedor = params.ref?.toLowerCase() || null;
  const tema = params.tema?.toLowerCase() || null;

  return (
    <TradeInCalculatorMulti vendedor={vendedor} temaParam={tema} />
  );
}
