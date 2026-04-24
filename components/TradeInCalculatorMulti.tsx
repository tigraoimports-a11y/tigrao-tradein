"use client";

import { useState, useEffect, useMemo } from "react";
import type { NewProduct, UsedDeviceValue, AppConfig, TradeInQuestion, TradeInConfig } from "@/lib/types";
import type { ConditionData, ModelDiscounts, AnyConditionData, DeviceType } from "@/lib/calculations";
import { formatBRL } from "@/lib/calculations";
import { getTemaTI, temaTICSSVars } from "@/lib/temas-tradein";
import { useTradeInAnalytics } from "@/lib/useTradeInAnalytics";
import StepBar from "./StepBar";
import StepUsedDeviceMulti from "./StepUsedDeviceMulti";
import StepNewDevice from "./StepNewDevice";
import StepManualHandoff from "./StepManualHandoff";
import StepClientData from "./StepClientData";
import StepQuote from "./StepQuote";
import ExitIntentPopup from "./ExitIntentPopup";

type MultiDeviceType = DeviceType | "watch";

interface UsedData {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts: Record<string, ModelDiscounts>;
}

// Fallback hardcoded — sera sobrescrito por tradeinConfig.whatsapp_vendedores se existir
const DEFAULT_VENDEDOR_WHATSAPP: Record<string, string> = {
  andre:    "5521967442665",
  bianca:   "5521972461357",
  anuncio:  "5521972461357",
  direct:   "5521972461357",
  story:    "5521972461357",
  whatsapp: "5521972461357",
};

const DEVICE_OPTIONS: { type: MultiDeviceType; emoji: string; label: string }[] = [
  { type: "iphone", emoji: "\u{1F4F1}", label: "iPhone" },
  { type: "ipad", emoji: "\u{1F4F1}", label: "iPad" },
  { type: "macbook", emoji: "\u{1F4BB}", label: "MacBook" },
  { type: "watch", emoji: "\u{231A}", label: "Apple Watch" },
];

export default function TradeInCalculatorMulti({ vendedor: vendedorProp, temaParam, previewMode = false }: { vendedor?: string | null; temaParam?: string | null; previewMode?: boolean }) {
  const [vendedor] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const ref = new URLSearchParams(window.location.search).get("ref")?.toLowerCase();
      if (ref) return ref;
    }
    return vendedorProp ?? null;
  });

  // Theme — from URL ?tema= or admin config with auto night mode (18h-6h)
  const [temaDia, setTemaDia] = useState<string>("clean");
  const [temaNoite, setTemaNoite] = useState<string>("tigrao");
  const [temaKey, setTemaKey] = useState<string>(temaParam || "tigrao");
  const tema = useMemo(() => getTemaTI(temaKey), [temaKey]);
  const cssVars = useMemo(() => temaTICSSVars(tema), [tema]);

  // Auto switch theme based on time of day (19h-6h = night)
  useEffect(() => {
    if (temaParam) return; // URL override — don't auto switch
    function pickByHour() {
      const h = new Date().getHours();
      const isNight = h >= 19 || h < 6;
      setTemaKey(isNight ? temaNoite : temaDia);
    }
    pickByHour();
    const id = setInterval(pickByHour, 60_000);
    return () => clearInterval(id);
  }, [temaParam, temaDia, temaNoite]);

  const { trackSiteView, trackStep, trackQuestion, trackComplete, trackAction } = useTradeInAnalytics();

  useEffect(() => { trackSiteView(); }, [trackSiteView]);

  // Meta Pixel helper — dispara eventos de conversao
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fbq = (...args: any[]) => { if (typeof window !== "undefined" && (window as any).fbq) (window as any).fbq(...args); };

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedDeviceType, setSelectedDeviceType] = useState<MultiDeviceType | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Track step views
  useEffect(() => {
    const mappedStep = step === 0 ? 0 : step <= 1.7 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;
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
  });

  const [questionsConfig, setQuestionsConfig] = useState<TradeInQuestion[] | null>(null);
  const [catConfigs, setCatConfigs] = useState<{ categoria: string; modo: string; ativo: boolean }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tradeinConfig, setTradeinConfig] = useState<(TradeInConfig & { whatsapp_principal?: string; whatsapp_formularios_seminovos?: string; whatsapp_seminovo_iphone?: string; whatsapp_seminovo_ipad?: string; whatsapp_seminovo_macbook?: string; whatsapp_seminovo_watch?: string; whatsapp_vendedores?: Record<string, string> }) | null>(null);
  // Mapa dinamico de WhatsApp por vendedor — usa DB se disponivel
  const VENDEDOR_WHATSAPP = useMemo(() => {
    const dbMap = tradeinConfig?.whatsapp_vendedores;
    return dbMap && Object.keys(dbMap).length > 0 ? { ...DEFAULT_VENDEDOR_WHATSAPP, ...dbMap } : DEFAULT_VENDEDOR_WHATSAPP;
  }, [tradeinConfig]);
  // WhatsApp principal — usa DB se disponivel
  const whatsappPrincipal: string = tradeinConfig?.whatsapp_principal || config.whatsappNumero;
  // WhatsApp destino dos formularios de seminovo — Nicolas por padrao,
  // configurado em /admin/configuracoes. Fallback pro principal.
  const whatsappFormulariosSeminovos: string = tradeinConfig?.whatsapp_formularios_seminovos || whatsappPrincipal;
  // Override por categoria (iPhone Seminovo pro Nicolas, iPad pro Rodrigo, etc).
  const whatsappSeminovoByCat: Record<"iphone" | "ipad" | "macbook" | "watch", string> = {
    iphone: tradeinConfig?.whatsapp_seminovo_iphone || whatsappFormulariosSeminovos,
    ipad: tradeinConfig?.whatsapp_seminovo_ipad || whatsappFormulariosSeminovos,
    macbook: tradeinConfig?.whatsapp_seminovo_macbook || whatsappFormulariosSeminovos,
    watch: tradeinConfig?.whatsapp_seminovo_watch || whatsappFormulariosSeminovos,
  };
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

  // Avaliacao manual: cliente vai pro WhatsApp em vez de ver orcamento automatico.
  // Aciona quando:
  //   1. Categoria do aparelho usado esta em modo=manual em /admin/usados, ou
  //   2. Modelo+armazenamento do usado nao tem valorBase cadastrado (ou = 0)
  //   3. Se tem 2o aparelho, qualquer um dos dois sem preco ja forca manual
  const deviceTypeToCategoria: Record<string, string> = {
    iphone: "IPHONE", ipad: "IPAD", macbook: "MACBOOK", watch: "APPLE_WATCH",
  };
  function hasPriceFor(model: string, storage: string): boolean {
    if (!model) return true; // nao selecionou ainda → assume auto
    const row = usedData.usedValues.find(
      (v) => v.modelo === model && v.armazenamento === storage
    );
    return !!row && Number(row.valorBase) > 0;
  }
  const catForcesManual = (dt: string) => {
    const cat = deviceTypeToCategoria[dt];
    const cfg = catConfigs.find((c) => c.categoria === cat);
    return cfg?.modo === "manual";
  };
  const avaliacaoManual =
    catForcesManual(deviceType) ||
    !hasPriceFor(usedModel, usedStorage) ||
    (hasSecondDevice && (catForcesManual(deviceType2) || !hasPriceFor(usedModel2, usedStorage2)));

  // Map MultiDeviceType ao device_type da API. A API /api/tradein-perguntas
  // suporta "watch" nativamente (DEFAULT_QUESTIONS tem bloco proprio), entao
  // nao coerce pra "iphone" como antes — isso fazia o Watch carregar
  // perguntas do iPhone e ignorar as especificas cadastradas em /admin/simulacoes.
  const apiDeviceType: MultiDeviceType = selectedDeviceType || "iphone";

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, usedRes, configRes, lojaRes, tiConfigRes] = await Promise.all([
          fetch("/api/produtos"),
          fetch("/api/usados"),
          fetch("/api/config"),
          fetch("/api/loja?format=grouped").catch(() => null),
          fetch("/api/tradein-config").catch(() => null),
        ]);
        const [prodData, usedResData, configData] = await Promise.all([
          prodRes.json(),
          usedRes.json(),
          configRes.json(),
        ]);
        setProducts(prodData);
        setUsedData(usedResData);
        setConfig(configData);
        // Load trade-in form config (seminovos, labels, origens)
        try {
          const tiCfgData = tiConfigRes ? await tiConfigRes.json() : null;
          if (tiCfgData?.data) setTradeinConfig(tiCfgData.data);
        } catch { /* use hardcoded fallback */ }
        // Load tradein category configs (modo + ativo)
        try {
          const catRes = await fetch("/api/tradein-cat-config");
          if (catRes.ok) {
            const catData = await catRes.json();
            if (catData?.data) setCatConfigs(catData.data);
          }
        } catch { /* ignore */ }
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

  // Fetch questions dynamically when device type changes
  useEffect(() => {
    if (!selectedDeviceType) return;
    async function loadQuestions() {
      try {
        const res = await fetch(`/api/tradein-perguntas?device_type=${apiDeviceType}`);
        const data = await res.json();
        if (data?.data && data.data.length > 0) setQuestionsConfig(data.data);
        else setQuestionsConfig(null);
      } catch { /* use hardcoded fallback */ }
    }
    loadQuestions();
  }, [selectedDeviceType, apiDeviceType]);

  function handleDeviceSelect(dt: MultiDeviceType) {
    setSelectedDeviceType(dt);
    trackAction(`device_type_${dt}`);
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const [usedColor, setUsedColor] = useState("");
  const [usedColor2, setUsedColor2] = useState("");
  // Respostas das perguntas dinamicas (criadas via /admin/simulacoes pra
  // categorias nao-iPhone). Separado do `condition` hardcoded pra nao mexer
  // no tipo `AnyConditionData`. Passa adiante pro StepManualHandoff e pro
  // StepQuote (quando a avaliacao for manual — onde a info realmente importa).
  const [extraAnswers, setExtraAnswers] = useState<Record<string, unknown> | undefined>(undefined);
  const [extraAnswers2, setExtraAnswers2] = useState<Record<string, unknown> | undefined>(undefined);
  // Snapshot das perguntas usadas em cada aparelho (pra formatar depois)
  const [extraQuestions, setExtraQuestions] = useState<TradeInQuestion[]>([]);
  const [extraQuestions2, setExtraQuestions2] = useState<TradeInQuestion[]>([]);

  function handleStep1Complete(data: {
    usedModel: string; usedStorage: string; usedColor: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType;
    extraAnswers?: Record<string, unknown>;
  }) {
    trackComplete(1);
    fbq("track", "ViewContent", { content_name: `${data.usedModel} ${data.usedStorage}`, content_category: "trade-in-usado" });
    // Snapshot das perguntas dinamicas ativas no momento do submit — usa o
    // questionsConfig atual, filtrado por slugs fora dos hardcoded.
    const dynamicQs = (questionsConfig ?? []).filter(
      (q) => q.ativo !== false && !["battery","hasDamage","hasOriginalBox","hasWarranty","hasWearMarks","partsReplaced","peeling","screenScratch","sideScratch","warrantyMonth","wearMarks"].includes(q.slug)
    );
    if (step === 1) {
      setDeviceType(data.deviceType); setUsedModel(data.usedModel); setUsedStorage(data.usedStorage);
      setUsedColor(data.usedColor || "");
      setCondition(data.condition); setTradeInValue(data.tradeInValue);
      setExtraAnswers(data.extraAnswers);
      setExtraQuestions(dynamicQs);
      setStep(1.5);
    } else {
      setDeviceType2(data.deviceType); setUsedModel2(data.usedModel); setUsedStorage2(data.usedStorage);
      setUsedColor2(data.usedColor || "");
      setCondition2(data.condition); setTradeInValue2(data.tradeInValue); setHasSecondDevice(true);
      setExtraAnswers2(data.extraAnswers);
      setExtraQuestions2(dynamicQs);
      setStep(2);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep2Complete(data: { newModel: string; newStorage: string; newPrice: number }) {
    trackComplete(2);
    fbq("track", "AddToWishlist", { content_name: `${data.newModel} ${data.newStorage}`, value: data.newPrice, currency: "BRL" });
    setNewModel(data.newModel); setNewStorage(data.newStorage); setNewPrice(data.newPrice);
    setStep(3); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep3Complete(data: { clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string }) {
    trackComplete(3);
    fbq("track", "Lead", { content_name: "trade-in-dados-pessoais" });
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
    setStep(0); setResetKey(k => k + 1);
    setSelectedDeviceType(null);
    setDeviceType("iphone"); setDeviceType2("iphone");
    setUsedModel(""); setUsedStorage(""); setTradeInValue(0);
    setUsedModel2(""); setUsedStorage2(""); setTradeInValue2(0);
    setHasSecondDevice(false);
    setCondition({ screenScratch: "none", sideScratch: "none", peeling: "none", battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false, warrantyMonth: null, warrantyYear: null, hasOriginalBox: false } as ConditionData);
    setCondition2({ screenScratch: "none", sideScratch: "none", peeling: "none", battery: 100, hasDamage: false, partsReplaced: "no", hasWarranty: false, warrantyMonth: null, warrantyYear: null, hasOriginalBox: false } as ConditionData);
    setClienteNome(""); setClienteWhatsApp(""); setClienteInstagram(""); setClienteOrigem("");
    setNewModel(""); setNewStorage(""); setNewPrice(0);
    setQuestionsConfig(null);
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

  if (!started && !loading) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-4" style={{ backgroundColor: tema.pageBg, ...cssVars }}>
        <div className="w-full max-w-[440px] text-center space-y-6 animate-fadeIn">
          {/* Logo */}
          <div className="text-[48px]">{"\u{1F34E}"}</div>

          <div>
            <h1 className="text-[28px] font-bold tracking-tight leading-tight" style={{ color: tema.text }}>
              Troque seu produto Apple usado por um <span style={{ color: "var(--ti-accent, #E8740E)" }}>novo</span> e pague<br />em ate <span style={{ color: "var(--ti-accent, #E8740E)" }}>21x</span> no cartao!
            </h1>
          </div>

          <p className="text-[16px] leading-relaxed" style={{ color: tema.textMuted }}>
            Descubra em <strong>30 segundos</strong> quanto vale seu aparelho na troca por um novo lacrado com garantia Apple.
          </p>

          {/* CTA */}
          <button
            onClick={() => { setStarted(true); setStep(0); trackStep(0); }}
            className="w-full py-4 rounded-2xl text-[18px] font-bold text-white transition-all duration-200 active:scale-[0.98] shadow-lg"
            style={{ backgroundColor: "#22c55e" }}
          >
            Descobrir o valor do meu aparelho
          </button>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="flex -space-x-1">
              <span className="text-lg">{"\u2B50\u2B50\u2B50\u2B50\u2B50"}</span>
            </div>
            <span className="text-[13px] font-medium" style={{ color: tema.textMuted }}>+400 trocas realizadas</span>
          </div>

          <div className="flex items-center justify-center gap-4 text-[12px] pt-1" style={{ color: tema.textMuted }}>
            <span>{"\u2705"} Produtos lacrados</span>
            <span>{"\u2705"} Nota fiscal</span>
            <span>{"\u2705"} Garantia Apple</span>
          </div>

          {/* Footer */}
          <div className="pt-4">
            <p className="text-[13px] font-semibold" style={{ color: tema.textMuted }}>TigraoImports</p>
            <p className="text-[11px]" style={{ color: tema.textMuted }}>Barra da Tijuca, Rio de Janeiro</p>
          </div>
        </div>
      </main>
    );
  }

  // Progress bar logic — 5 steps: 0=Dispositivo, 1=Seu aparelho, 2=Aparelho novo, 3=Seus dados, 4=Cotacao
  const progressStep = step === 0 ? 0 : step <= 1.7 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;
  const progressLabels = ["Dispositivo", "Seu aparelho", "Aparelho novo", "Seus dados", "Cotacao"];
  const totalSteps = 5;

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-8" style={{ backgroundColor: tema.pageBg, ...cssVars }}>
      {/* Honeypot anti-bot — invisível pra humanos (off-screen + aria-hidden).
          Bots que fazem scraping preenchem todos os inputs; o valor é lido via
          document.getElementById('tradein-honeypot') nos handlers de submit e
          enviado no payload pra /api/leads e /api/link-compras-auto. O backend
          descarta via checkHoneypot() retornando 200 fake pra não dar feedback. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <label htmlFor="tradein-honeypot">Website (não preencher)</label>
        <input
          id="tradein-honeypot"
          type="text"
          name="website"
          autoComplete="off"
          tabIndex={-1}
          defaultValue=""
        />
      </div>

      <div className="w-full max-w-[440px]">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-[13px] font-semibold tracking-wider uppercase" style={{ color: tema.textMuted }}>TigraoImports</p>
          <h1 className="text-[24px] font-bold tracking-tight mt-1" style={{ color: tema.text }}>Avaliacao do seu aparelho</h1>
        </div>

        {/* Barra de progresso simples */}
        <div className="mb-8">
          <div className="flex justify-between text-[11px] font-medium mb-2" style={{ color: tema.textMuted }}>
            <span>Etapa {progressStep + 1} de {totalSteps}</span>
            <span>{progressLabels[progressStep]}</span>
          </div>
          <div className="w-full h-[6px] rounded-full" style={{ backgroundColor: "var(--ti-card-border)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((progressStep + 1) / totalSteps) * 100}%`, backgroundColor: "var(--ti-accent)" }} />
          </div>
        </div>

        {/* Navegacao de teste — so no modo admin. Permite pular pra qualquer
            etapa sem reiniciar, util pra validar perguntas/UX sem refazer o
            fluxo inteiro a cada tweak. Cliente publico NAO ve essa barra. */}
        {previewMode && (
          <div className="mb-4 rounded-xl border border-dashed border-[#E8740E]/50 bg-[#FFF7ED] px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-[#E8740E]">🧪 Nav teste:</span>
              {progressLabels.map((label, i) => {
                const targetSteps = [0, 1, 2, 3, 4] as const;
                const target = targetSteps[i];
                const active = progressStep === i;
                return (
                  <button
                    key={i}
                    onClick={() => { setStep(target); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`px-2 py-1 rounded font-semibold transition-colors ${
                      active
                        ? "bg-[#E8740E] text-white"
                        : "bg-white border border-[#E8740E]/40 text-[#1D1D1F] hover:bg-[#FFEFE0]"
                    }`}
                  >
                    {i}. {label}
                  </button>
                );
              })}
              <button
                onClick={handleReset}
                className="ml-auto px-2 py-1 rounded font-semibold bg-white border border-[#86868B]/40 text-[#86868B] hover:bg-[#F5F5F7] transition-colors"
                title="Volta pro step 0 e limpa os dados"
              >
                🔄 Reiniciar
              </button>
            </div>
          </div>
        )}

        <div className="animate-fadeIn">
          {/* Step 0 — Device type selector */}
          {step === 0 && (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-[22px] font-bold" style={{ color: "var(--ti-text)" }}>Qual aparelho voce quer avaliar?</h2>
                <p className="text-[14px] mt-1" style={{ color: "var(--ti-muted)" }}>Selecione o tipo de dispositivo</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {DEVICE_OPTIONS.filter(d => {
                  // previewMode (route admin /admin/simulador-teste): bypassa o
                  // filtro de ativo pra admin ver categorias ainda nao ligadas.
                  // Cliente publico em / continua respeitando cfg.ativo.
                  if (previewMode) return true;
                  const catMap: Record<string, string> = { iphone: "IPHONE", ipad: "IPAD", macbook: "MACBOOK", watch: "APPLE_WATCH" };
                  const cfg = catConfigs.find(c => c.categoria === catMap[d.type]);
                  return !cfg || cfg.ativo; // se não tem config ou está ativo, mostra
                }).map((d) => (
                  <button
                    key={d.type}
                    onClick={() => handleDeviceSelect(d.type)}
                    className="flex flex-col items-center gap-2 px-4 py-6 rounded-2xl text-[15px] font-semibold transition-all duration-200 active:scale-[0.98]"
                    style={{
                      backgroundColor: "var(--ti-btn-bg)",
                      color: "var(--ti-btn-text)",
                      border: "1px solid var(--ti-btn-border)",
                    }}
                  >
                    <span className="text-[32px]">{d.emoji}</span>
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && selectedDeviceType && (
            <StepUsedDeviceMulti
              key={`${resetKey}-${selectedDeviceType}`}
              usedValues={usedData.usedValues}
              excludedModels={usedData.excludedModels}
              modelDiscounts={usedData.modelDiscounts}
              questionsConfig={questionsConfig}
              deviceType={selectedDeviceType}
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

          {step === 1.7 && selectedDeviceType && (
            <div>
              <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: tema.successLight, border: `1px solid ${tema.success}40` }}>
                <p className="text-xs font-medium" style={{ color: tema.success }}>1o aparelho: {usedModel} {usedStorage} — {formatBRL(tradeInValue)}</p>
              </div>
              <p className="text-[17px] font-bold mb-4" style={{ color: tema.text }}>Agora avalie o 2o aparelho:</p>
              <StepUsedDeviceMulti
                key={`${resetKey + 100}-${selectedDeviceType}`}
                usedValues={usedData.usedValues}
                excludedModels={usedData.excludedModels}
                modelDiscounts={usedData.modelDiscounts}
                questionsConfig={questionsConfig}
                deviceType={selectedDeviceType}
                onNext={handleStep1Complete}
                onTrackQuestion={trackQuestion}
              />
            </div>
          )}

          {step === 2 && (
            <StepNewDevice products={products} tradeInValue={totalTradeInValue} onNext={handleStep2Complete} onBack={() => setStep(hasSecondDevice ? 1.7 : 1)} usedModel={usedModel} usedStorage={usedStorage} usedColor={usedColor} whatsappNumber={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || whatsappFormulariosSeminovos} whatsappSeminovoByCat={whatsappSeminovoByCat} vendedorOverride={!!(vendedor && VENDEDOR_WHATSAPP[vendedor])} condition={condition} deviceType={deviceType} tradeinConfig={tradeinConfig} usedModel2={hasSecondDevice ? usedModel2 : undefined} usedStorage2={hasSecondDevice ? usedStorage2 : undefined} usedColor2={hasSecondDevice ? usedColor2 : undefined} condition2={hasSecondDevice ? condition2 : undefined} deviceType2={hasSecondDevice ? deviceType2 : undefined} tradeInValue1={hasSecondDevice ? tradeInValue : undefined} tradeInValue2={hasSecondDevice ? tradeInValue2 : undefined} />
          )}

          {step === 3 && (
            <StepClientData onNext={handleStep3Complete} onBack={() => setStep(2)}
              initialNome={clienteNome} initialWhatsApp={clienteWhatsApp}
              initialInstagram={clienteInstagram} initialOrigem={clienteOrigem}
              tradeinConfig={tradeinConfig} />
          )}

          {step === 4 && avaliacaoManual && (
            <StepManualHandoff
              usedModel={usedModel} usedStorage={usedStorage} usedColor={usedColor} condition={condition} deviceType={deviceType}
              usedModel2={hasSecondDevice ? usedModel2 : undefined} usedStorage2={hasSecondDevice ? usedStorage2 : undefined} usedColor2={hasSecondDevice ? usedColor2 : undefined}
              condition2={hasSecondDevice ? condition2 : undefined} deviceType2={hasSecondDevice ? deviceType2 : undefined}
              extraAnswers={extraAnswers} extraQuestions={extraQuestions}
              extraAnswers2={hasSecondDevice ? extraAnswers2 : undefined} extraQuestions2={hasSecondDevice ? extraQuestions2 : undefined}
              newModel={newModel} newStorage={newStorage} newPrice={newPrice}
              clienteNome={clienteNome} clienteWhatsApp={clienteWhatsApp} clienteInstagram={clienteInstagram} clienteOrigem={clienteOrigem}
              whatsappNumero={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || whatsappPrincipal}
              vendedor={vendedor}
              onReset={handleReset}
              onGoToStep={handleGoToStep}
            />
          )}
          {step === 4 && !avaliacaoManual && (
            <StepQuote
              newModel={newModel} newStorage={newStorage} newPrice={newPrice}
              usedModel={usedModel} usedStorage={usedStorage} usedColor={usedColor} condition={condition} deviceType={deviceType}
              tradeInValue={totalTradeInValue}
              allProducts={products}
              usedModel2={hasSecondDevice ? usedModel2 : undefined} usedStorage2={hasSecondDevice ? usedStorage2 : undefined} usedColor2={hasSecondDevice ? usedColor2 : undefined}
              condition2={hasSecondDevice ? condition2 : undefined} deviceType2={hasSecondDevice ? deviceType2 : undefined}
              tradeInValue1={hasSecondDevice ? tradeInValue : undefined} tradeInValue2={hasSecondDevice ? tradeInValue2 : undefined}
              clienteNome={clienteNome} clienteWhatsApp={clienteWhatsApp} clienteInstagram={clienteInstagram} clienteOrigem={clienteOrigem}
              whatsappNumero={(vendedor && VENDEDOR_WHATSAPP[vendedor]) || whatsappPrincipal}
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
