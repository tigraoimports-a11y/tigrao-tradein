"use client";

import { useState, useEffect, useMemo } from "react";
import type { NewProduct, UsedDeviceValue, AppConfig } from "@/lib/types";
import type { ConditionData, ModelDiscounts, WarrantyBonuses, AnyConditionData, DeviceType } from "@/lib/calculations";
import { formatBRL } from "@/lib/calculations";
import { getTemaTI, temaTICSSVars } from "@/lib/temas-tradein";
import { useTradeInAnalytics } from "@/lib/useTradeInAnalytics";
import StepBar from "./StepBar";
import StepUsedDevice from "./StepUsedDevice";
import StepNewDevice from "./StepNewDevice";
import StepClientData from "./StepClientData";
import StepQuote from "./StepQuote";
import ExitIntentPopup from "./ExitIntentPopup";

interface UsedData {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts: Record<string, ModelDiscounts>;
}

const VENDEDOR_WHATSAPP: Record<string, string> = {
  andre:    "5521967442665",
  nicolas:  "5521995618747",
  bianca:   "5521972461357",
  anuncio:  "5521995618747",
  direct:   "5521995618747",
  story:    "5521995618747",
  whatsapp: "5521995618747",
};

export default function TradeInCalculator({ vendedor: vendedorProp, temaParam }: { vendedor?: string | null; temaParam?: string | null }) {
  const [vendedor] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const ref = new URLSearchParams(window.location.search).get("ref")?.toLowerCase();
      if (ref) return ref;
    }
    return vendedorProp ?? null;
  });

  // Theme — from URL ?tema= or admin config with auto night mode (19h–5h)
  const [temaDia, setTemaDia] = useState<string>("tigrao");
  const [temaNoite, setTemaNoite] = useState<string>("tigrao");
  const [temaKey, setTemaKey] = useState<string>(temaParam || "tigrao");
  const tema = useMemo(() => getTemaTI(temaKey), [temaKey]);
  const cssVars = useMemo(() => temaTICSSVars(tema), [tema]);

  // Auto switch theme based on time of day (19h–5h = night)
  useEffect(() => {
    if (temaParam) return; // URL override — don't auto switch
    function pickByHour() {
      const h = new Date().getHours();
      const isNight = h >= 19 || h < 5;
      setTemaKey(isNight ? temaNoite : temaDia);
    }
    pickByHour();
    const id = setInterval(pickByHour, 60_000);
    return () => clearInterval(id);
  }, [temaParam, temaDia, temaNoite]);

  const { trackStep, trackQuestion, trackComplete, trackAction } = useTradeInAnalytics();

  const [step, setStep] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Track step views
  useEffect(() => {
    const mappedStep = step <= 1.7 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;
    trackStep(mappedStep);
  }, [step, trackStep]);

  const [products, setProducts] = useState<NewProduct[]>([]);
  const [usedData, setUsedData] = useState<UsedData>({
    usedValues: [],
    excludedModels: [],
    modelDiscounts: {},
  });
  const [config, setConfig] = useState<AppConfig>({
    multiplier12: 1.14,
    multiplier18: 1.2,
    multiplier21: 1.21,
    validadeHoras: 24,
    whatsappNumero: "5521967442665",
    bonusGarantiaAte3m: 0.03,
    bonusGarantia3a6m: 0.05,
    bonusGarantia6mMais: 0.07,
  });

  const [deviceType, setDeviceType] = useState<DeviceType>("iphone");
  const [usedModel, setUsedModel] = useState("");
  const [usedStorage, setUsedStorage] = useState("");
  const [condition, setCondition] = useState<AnyConditionData>({
    screenScratch: "none", sideScratch: "none", peeling: "none",
    battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false,
    warrantyMonth: null, warrantyYear: null, hasOriginalBox: false,
  } as ConditionData);
  const [tradeInValue, setTradeInValue] = useState(0);

  const [deviceType2, setDeviceType2] = useState<DeviceType>("iphone");
  const [usedModel2, setUsedModel2] = useState("");
  const [usedStorage2, setUsedStorage2] = useState("");
  const [condition2, setCondition2] = useState<AnyConditionData>({
    screenScratch: "none", sideScratch: "none", peeling: "none",
    battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false,
    warrantyMonth: null, warrantyYear: null, hasOriginalBox: false,
  } as ConditionData);
  const [tradeInValue2, setTradeInValue2] = useState(0);
  const [hasSecondDevice, setHasSecondDevice] = useState(false);

  const [clienteNome, setClienteNome] = useState("");
  const [clienteWhatsApp, setClienteWhatsApp] = useState("");
  const [clienteInstagram, setClienteInstagram] = useState("");
  const [clienteOrigem, setClienteOrigem] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newStorage, setNewStorage] = useState("");
  const [newPrice, setNewPrice] = useState(0);

  const totalTradeInValue = tradeInValue + (hasSecondDevice ? tradeInValue2 : 0);

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, usedRes, configRes, lojaRes] = await Promise.all([
          fetch("/api/produtos"),
          fetch("/api/usados"),
          fetch("/api/config"),
          fetch("/api/loja?format=grouped").catch(() => null),
        ]);
        const [prodData, usedResData, configData] = await Promise.all([
          prodRes.json(),
          usedRes.json(),
          configRes.json(),
        ]);
        setProducts(prodData);
        setUsedData(usedResData);
        setConfig(configData);
        // Load theme config from mostruario_config (Supabase)
        try {
          const lojaData = lojaRes ? await lojaRes.json() : null;
          const lojaCfg = lojaData?.config;
          if (lojaCfg?.tema_tradein) setTemaDia(lojaCfg.tema_tradein);
          if (lojaCfg?.tema_tradein_noite) setTemaNoite(lojaCfg.tema_tradein_noite);
        } catch { /* ignore */ }
      } catch {
        setError("Erro ao carregar dados. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [temaParam]);

  function handleStep1Complete(data: {
    usedModel: string; usedStorage: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType;
  }) {
    trackComplete(1);
    if (step === 1) {
      setDeviceType(data.deviceType); setUsedModel(data.usedModel); setUsedStorage(data.usedStorage);
      setCondition(data.condition); setTradeInValue(data.tradeInValue); setStep(1.5);
    } else {
      setDeviceType2(data.deviceType); setUsedModel2(data.usedModel); setUsedStorage2(data.usedStorage);
      setCondition2(data.condition); setTradeInValue2(data.tradeInValue); setHasSecondDevice(true); setStep(2);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep2Complete(data: { newModel: string; newStorage: string; newPrice: number }) {
    trackComplete(2);
    setNewModel(data.newModel); setNewStorage(data.newStorage); setNewPrice(data.newPrice);
    setStep(3); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep3Complete(data: { clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string }) {
    trackComplete(3);
    setClienteNome(data.clienteNome); setClienteWhatsApp(data.clienteWhatsApp);
    setClienteInstagram(data.clienteInstagram); setClienteOrigem(data.clienteOrigem);
    setStep(4); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleGoToStep(targetStep: number) {
    trackAction(`quote_edit_step_${targetStep}`);
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCotarOutro() {
    trackAction("quote_cotar_outro");
    setNewModel(""); setNewStorage(""); setNewPrice(0);
    setStep(2); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReset() {
    setStep(1); setResetKey(k => k + 1);
    setDeviceType("iphone"); setDeviceType2("iphone");
    setUsedModel(""); setUsedStorage(""); setTradeInValue(0);
    setUsedModel2(""); setUsedStorage2(""); setTradeInValue2(0);
    setHasSecondDevice(false);
    setCondition({ screenScratch: "none", sideScratch: "none", peeling: "none", battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false, warrantyMonth: null, warrantyYear: null, hasOriginalBox: false } as ConditionData);
    setCondition2({ screenScratch: "none", sideScratch: "none", peeling: "none", battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false, warrantyMonth: null, warrantyYear: null, hasOriginalBox: false } as ConditionData);
    setClienteNome(""); setClienteWhatsApp(""); setClienteInstagram(""); setClienteOrigem("");
    setNewModel(""); setNewStorage(""); setNewPrice(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: tema.pageBg, ...cssVars }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: tema.accent, borderTopColor: "transparent" }} />
          <p className="text-[13px]" style={{ color: tema.textMuted }}>Carregando...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: tema.pageBg, ...cssVars }}>
        <div className="text-center">
          <p className="text-[15px] mb-4" style={{ color: tema.error }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl text-[15px] font-medium transition-colors"
            style={{ backgroundColor: tema.cardBg, border: `1px solid ${tema.cardBorder}`, color: tema.text }}
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-8" style={{ backgroundColor: tema.pageBg, ...cssVars }}>
      <div className="w-full max-w-[440px]">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[32px] font-bold tracking-tight" style={{ color: tema.text }}>Trade-In</h1>
          <p className="text-[15px] mt-1" style={{ color: tema.textMuted }}>Simule o valor da sua troca</p>
        </div>

        <StepBar current={step <= 1.7 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4} />

        <div className="animate-fadeIn">
          {step === 1 && (
            <StepUsedDevice
              key={resetKey}
              usedValues={usedData.usedValues}
              excludedModels={usedData.excludedModels}
              modelDiscounts={usedData.modelDiscounts}
              warrantyBonuses={{ ate3m: config.bonusGarantiaAte3m, de3a6m: config.bonusGarantia3a6m, acima6m: config.bonusGarantia6mMais }}
              onNext={handleStep1Complete}
              onTrackQuestion={trackQuestion}
            />
          )}

          {step === 1.5 && (
            <div className="space-y-6 py-6">
              <div className="text-center">
                <p className="text-[15px]" style={{ color: tema.textMuted }}>Aparelho avaliado com sucesso!</p>
                <p className="text-xs mt-1" style={{ color: tema.textDim }}>{usedModel} {usedStorage}</p>
              </div>
              <div className="rounded-2xl p-6 text-center space-y-4" style={{ backgroundColor: tema.cardBg, border: `1px solid ${tema.cardBorder}` }}>
                <p className="text-[15px] font-semibold" style={{ color: tema.text }}>Deseja adicionar mais um aparelho na troca?</p>
                <p className="text-[13px]" style={{ color: tema.textMuted }}>Voce pode dar ate 2 aparelhos usados para comprar 1 novo</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setStep(1.7)}
                    className="px-6 py-3 rounded-xl font-semibold transition-colors"
                    style={{ backgroundColor: tema.btnBg, border: `1px solid ${tema.btnBorder}`, color: tema.btnText }}
                  >
                    Adicionar outro usado
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-colors"
                    style={{ backgroundColor: tema.accent }}
                  >
                    Nao, continuar com apenas um
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1.7 && (
            <div>
              <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: tema.successLight, border: `1px solid ${tema.success}40` }}>
                <p className="text-xs font-medium" style={{ color: tema.success }}>1o aparelho: {usedModel} {usedStorage} — {formatBRL(tradeInValue)}</p>
              </div>
              <p className="text-[17px] font-bold mb-4" style={{ color: tema.text }}>Agora avalie o 2o aparelho:</p>
              <StepUsedDevice
                key={resetKey + 100}
                usedValues={usedData.usedValues}
                excludedModels={usedData.excludedModels}
                modelDiscounts={usedData.modelDiscounts}
                warrantyBonuses={{ ate3m: config.bonusGarantiaAte3m, de3a6m: config.bonusGarantia3a6m, acima6m: config.bonusGarantia6mMais }}
                onNext={handleStep1Complete}
                onTrackQuestion={trackQuestion}
              />
            </div>
          )}

          {step === 2 && (
            <StepNewDevice products={products} tradeInValue={totalTradeInValue} onNext={handleStep2Complete} onBack={() => setStep(hasSecondDevice ? 1.7 : 1)} />
          )}

          {step === 3 && (
            <StepClientData onNext={handleStep3Complete} onBack={() => setStep(2)}
              initialNome={clienteNome} initialWhatsApp={clienteWhatsApp}
              initialInstagram={clienteInstagram} initialOrigem={clienteOrigem} />
          )}

          {step === 4 && (
            <StepQuote
              newModel={newModel} newStorage={newStorage} newPrice={newPrice}
              usedModel={usedModel} usedStorage={usedStorage} condition={condition} deviceType={deviceType}
              tradeInValue={totalTradeInValue}
              usedModel2={hasSecondDevice ? usedModel2 : undefined} usedStorage2={hasSecondDevice ? usedStorage2 : undefined}
              condition2={hasSecondDevice ? condition2 : undefined} deviceType2={hasSecondDevice ? deviceType2 : undefined}
              tradeInValue1={hasSecondDevice ? tradeInValue : undefined} tradeInValue2={hasSecondDevice ? tradeInValue2 : undefined}
              clienteNome={clienteNome} clienteWhatsApp={clienteWhatsApp} clienteInstagram={clienteInstagram} clienteOrigem={clienteOrigem}
              whatsappNumero={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || config.whatsappNumero}
              validadeHoras={config.validadeHoras} vendedor={vendedor}
              onReset={handleReset} onCotarOutro={handleCotarOutro}
              onGoToStep={handleGoToStep}
              onTrackAction={trackAction}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 mb-6">
          <p className="text-[13px] font-medium" style={{ color: tema.text }}>TigraoImports</p>
          <p className="text-[12px] mt-0.5" style={{ color: tema.textMuted }}>Barra da Tijuca, Rio de Janeiro</p>
          <p className="text-[11px] mt-1" style={{ color: tema.textDim }}>Produtos lacrados com garantia Apple e Nota Fiscal</p>
        </footer>
      </div>

      {/* Exit intent popup — only shows once per session, after step 1 */}
      <ExitIntentPopup
        step={step}
        clienteNome={clienteNome}
        usedModel={usedModel ? `${usedModel} ${usedStorage}` : undefined}
        newModel={newModel ? `${newModel} ${newStorage}` : undefined}
        tradeInValue={totalTradeInValue}
      />
    </main>
  );
}
