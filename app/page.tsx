import TradeInCalculator from "@/components/TradeInCalculator";

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-[440px]">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[32px] font-bold tracking-tight text-[#1D1D1F]">
            Trade-In
          </h1>
          <p className="text-[15px] text-[#86868B] mt-1">
            Simule o valor da sua troca
          </p>
        </div>

        <TradeInCalculator />

        {/* Footer */}
        <footer className="text-center mt-12 mb-6">
          <p className="text-[13px] font-medium text-[#1D1D1F]">
            TigraoImports
          </p>
          <p className="text-[12px] text-[#86868B] mt-0.5">
            Barra da Tijuca, Rio de Janeiro
          </p>
          <p className="text-[11px] text-[#86868B] mt-1">
            Produtos lacrados com garantia Apple e Nota Fiscal
          </p>
        </footer>
      </div>
    </main>
  );
}
