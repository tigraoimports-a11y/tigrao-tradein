"use client";

import { useState, useEffect } from "react";
import type { NewProduct, UsedDeviceValue, AppConfig } from "@/lib/types";
import type { ConditionData, ModelDiscounts, WarrantyBonuses } from "@/lib/calculations";
import StepBar from "./StepBar";
import StepUsedDevice from "./StepUsedDevice";
import StepNewDevice from "./StepNewDevice";
import StepClientData from "./StepClientData";
import StepQuote from "./StepQuote";

interface UsedData {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts: Record<string, ModelDiscounts>;
}

const VENDEDOR_WHATSAPP: Record<string, string> = {
  andre:   "5521967442665",
  nicolas: "5521995618747",
  bianca:  "5521972461357",
  anuncio: "5521995618747", // Meta Ads — cai no WhatsApp do Nicolas
};

export default function TradeInCalculator({ vendedor: vendedorProp }: { vendedor?: string | null }) {
  // Lê ?ref= diretamente da URL como fallback caso o prop do servidor não chegue
  const [vendedor] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const ref = new URLSearchParams(window.location.search).get("ref")?.toLowerCase();
      if (ref) return ref;
    }
    return vendedorProp ?? null;
  });

  const [step, setStep] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    bonusGarantiaAte3m: 200,
    bonusGarantia3a6m: 300,
    bonusGarantia6mMais: 400,
  });

  const [usedModel, setUsedModel] = useState("");
  const [usedStorage, setUsedStorage] = useState("");
  const [condition, setCondition] = useState<ConditionData>({
    screenScratch: "none",
    sideScratch: "none",
    peeling: "none",
    battery: 100,
    hasDamage: false,
    hasWarranty: false,
    warrantyMonth: null,
    warrantyYear: null,
    hasOriginalBox: false,
  });
  const [tradeInValue, setTradeInValue] = useState(0);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteWhatsApp, setClienteWhatsApp] = useState("");
  const [clienteInstagram, setClienteInstagram] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newStorage, setNewStorage] = useState("");
  const [newPrice, setNewPrice] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, usedRes, configRes] = await Promise.all([
          fetch("/api/produtos"),
          fetch("/api/usados"),
          fetch("/api/config"),
        ]);
        const [prodData, usedResData, configData] = await Promise.all([
          prodRes.json(),
          usedRes.json(),
          configRes.json(),
        ]);
        setProducts(prodData);
        setUsedData(usedResData);
        setConfig(configData);
      } catch {
        setError("Erro ao carregar dados. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleStep1Complete(data: {
    usedModel: string;
    usedStorage: string;
    condition: ConditionData;
    tradeInValue: number;
  }) {
    setUsedModel(data.usedModel);
    setUsedStorage(data.usedStorage);
    setCondition(data.condition);
    setTradeInValue(data.tradeInValue);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep2Complete(data: {
    newModel: string;
    newStorage: string;
    newPrice: number;
  }) {
    setNewModel(data.newModel);
    setNewStorage(data.newStorage);
    setNewPrice(data.newPrice);
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep3Complete(data: {
    clienteNome: string;
    clienteWhatsApp: string;
    clienteInstagram: string;
  }) {
    setClienteNome(data.clienteNome);
    setClienteWhatsApp(data.clienteWhatsApp);
    setClienteInstagram(data.clienteInstagram);
    setStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReset() {
    setStep(1);
    setResetKey(k => k + 1);
    setUsedModel("");
    setUsedStorage("");
    setCondition({
      screenScratch: "none",
      sideScratch: "none",
      peeling: "none",
      battery: 100,
      hasDamage: false,
      hasWarranty: false,
      warrantyMonth: null,
    warrantyYear: null,
      hasOriginalBox: false,
    });
    setTradeInValue(0);
    setClienteNome("");
    setClienteWhatsApp("");
    setClienteInstagram("");
    setNewModel("");
    setNewStorage("");
    setNewPrice(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 border-[3px] border-[#0071E3] border-t-transparent rounded-full animate-spin" />
        <p className="text-[13px] text-[#86868B]">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-[#FF3B30] text-[15px] mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-[15px] font-medium hover:bg-[#E8E8ED] transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      <StepBar current={step} />

      <div className="animate-fadeIn">
        {step === 1 && (
          <StepUsedDevice
            key={resetKey}
            usedValues={usedData.usedValues}
            excludedModels={usedData.excludedModels}
            modelDiscounts={usedData.modelDiscounts}
            warrantyBonuses={{
              ate3m: config.bonusGarantiaAte3m,
              de3a6m: config.bonusGarantia3a6m,
              acima6m: config.bonusGarantia6mMais,
            }}
            onNext={handleStep1Complete}
          />
        )}

        {step === 2 && (
          <StepNewDevice
            products={products}
            tradeInValue={tradeInValue}
            onNext={handleStep2Complete}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <StepClientData
            onNext={handleStep3Complete}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <StepQuote
            newModel={newModel}
            newStorage={newStorage}
            newPrice={newPrice}
            usedModel={usedModel}
            usedStorage={usedStorage}
            condition={condition}
            tradeInValue={tradeInValue}
            clienteNome={clienteNome}
            clienteWhatsApp={clienteWhatsApp}
            clienteInstagram={clienteInstagram}
            whatsappNumero={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || config.whatsappNumero}
            validadeHoras={config.validadeHoras}
            vendedor={vendedor}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
