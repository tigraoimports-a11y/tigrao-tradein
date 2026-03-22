"use client";

import { useState, useEffect } from "react";
import type { NewProduct, UsedDeviceValue, AppConfig } from "@/lib/types";
import type { ConditionData, ModelDiscounts, WarrantyBonuses, AnyConditionData, DeviceType } from "@/lib/calculations";
import { formatBRL } from "@/lib/calculations";
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
  andre:    "5521967442665",
  nicolas:  "5521995618747",
  bianca:   "5521972461357",
  anuncio:  "5521995618747",
  direct:   "5521995618747",
  story:    "5521995618747",
  whatsapp: "5521995618747",
};

export default function TradeInCalculator({ vendedor: vendedorProp }: { vendedor?: string | null }) {
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

  const [deviceType, setDeviceType] = useState<DeviceType>("iphone");
  const [usedModel, setUsedModel] = useState("");
  const [usedStorage, setUsedStorage] = useState("");
  const [condition, setCondition] = useState<AnyConditionData>({
    screenScratch: "none",
    sideScratch: "none",
    peeling: "none",
    battery: 100,
    hasDamage: false,
    partsReplaced: "no",
    hasWarranty: false,
    warrantyMonth: null,
    warrantyYear: null,
    hasOriginalBox: false,
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
    condition: AnyConditionData;
    tradeInValue: number;
    deviceType: DeviceType;
  }) {
    if (step === 1) {
      setDeviceType(data.deviceType);
      setUsedModel(data.usedModel);
      setUsedStorage(data.usedStorage);
      setCondition(data.condition);
      setTradeInValue(data.tradeInValue);
      setStep(1.5);
    } else {
      setDeviceType2(data.deviceType);
      setUsedModel2(data.usedModel);
      setUsedStorage2(data.usedStorage);
      setCondition2(data.condition);
      setTradeInValue2(data.tradeInValue);
      setHasSecondDevice(true);
      setStep(2);
    }
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
    clienteOrigem: string;
  }) {
    setClienteNome(data.clienteNome);
    setClienteWhatsApp(data.clienteWhatsApp);
    setClienteInstagram(data.clienteInstagram);
    setClienteOrigem(data.clienteOrigem);
    setStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Voltar para step 2 mantendo dados do usado (COTAR OUTRO MODELO)
  function handleCotarOutro() {
    setNewModel("");
    setNewStorage("");
    setNewPrice(0);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReset() {
    setStep(1);
    setResetKey(k => k + 1);
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
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 border-[3px] border-[#E8740E] border-t-transparent rounded-full animate-spin" />
        <p className="text-[13px] text-[#888]">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-[#E74C3C] text-[15px] mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] text-[15px] font-medium hover:bg-[#1A1A1A] transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      <StepBar current={step <= 1.7 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4} />

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

        {step === 1.5 && (
          <div className="space-y-6 py-6">
            <div className="text-center">
              <p className="text-[15px] text-[#888] mb-1">Aparelho avaliado com sucesso!</p>
              <p className="text-xs text-[#555] mt-1">{usedModel} {usedStorage}</p>
            </div>
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 text-center space-y-4">
              <p className="text-[15px] font-semibold text-[#F5F5F5]">Deseja adicionar mais um aparelho na troca?</p>
              <p className="text-[13px] text-[#888]">Voce pode dar ate 2 aparelhos usados para comprar 1 novo</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep(1.7)}
                  className="px-6 py-3 rounded-xl bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] font-semibold hover:bg-[#1A1A1A] transition-colors"
                >
                  Adicionar outro usado
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
                >
                  Nao, continuar com apenas um
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1.7 && (
          <div>
            <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-[#2ECC71] font-medium">1o aparelho: {usedModel} {usedStorage} — {formatBRL(tradeInValue)}</p>
            </div>
            <p className="text-[17px] font-bold text-[#F5F5F5] mb-4">Agora avalie o 2o aparelho:</p>
            <StepUsedDevice
              key={resetKey + 100}
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
          </div>
        )}

        {step === 2 && (
          <StepNewDevice
            products={products}
            tradeInValue={totalTradeInValue}
            onNext={handleStep2Complete}
            onBack={() => setStep(hasSecondDevice ? 1.7 : 1)}
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
            deviceType={deviceType}
            tradeInValue={totalTradeInValue}
            usedModel2={hasSecondDevice ? usedModel2 : undefined}
            usedStorage2={hasSecondDevice ? usedStorage2 : undefined}
            condition2={hasSecondDevice ? condition2 : undefined}
            deviceType2={hasSecondDevice ? deviceType2 : undefined}
            tradeInValue1={hasSecondDevice ? tradeInValue : undefined}
            tradeInValue2={hasSecondDevice ? tradeInValue2 : undefined}
            clienteNome={clienteNome}
            clienteWhatsApp={clienteWhatsApp}
            clienteInstagram={clienteInstagram}
            clienteOrigem={clienteOrigem}
            whatsappNumero={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || config.whatsappNumero}
            validadeHoras={config.validadeHoras}
            vendedor={vendedor}
            onReset={handleReset}
            onCotarOutro={handleCotarOutro}
          />
        )}
      </div>
    </div>
  );
}
