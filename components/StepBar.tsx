"use client";

const STEPS = [
  { num: 1, label: "Seu aparelho" },
  { num: 2, label: "Aparelho novo" },
  { num: 3, label: "Cotacao" },
];

export default function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between mb-10 px-2">
      {STEPS.map((step, i) => (
        <div key={step.num} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold transition-all duration-300 ${
                current > step.num
                  ? "bg-[#34C759] text-white"
                  : current === step.num
                  ? "bg-[#0071E3] text-white"
                  : "bg-[#F5F5F7] text-[#86868B]"
              }`}
            >
              {current > step.num ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                step.num
              )}
            </div>
            <span
              className={`text-[11px] mt-1.5 font-medium transition-colors ${
                current >= step.num ? "text-[#1D1D1F]" : "text-[#86868B]"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`flex-1 h-[2px] mx-3 mt-[-16px] rounded transition-colors duration-300 ${
                current > step.num ? "bg-[#34C759]" : "bg-[#E8E8ED]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
