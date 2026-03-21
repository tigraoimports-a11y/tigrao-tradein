"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";
import {
  TAMANHOS_ETIQUETA,
  STATUS_ETIQUETA,
  renderBarcode,
  formatarCodigo,
} from "@/lib/barcode";
import {
  CATEGORIAS,
  CAT_LABELS,
  STRUCTURED_CATS,
  IPHONE_MODELOS, IPHONE_STORAGES,
  MACBOOK_TIPOS, MACBOOK_TELAS_AIR, MACBOOK_TELAS_PRO, MACBOOK_CHIPS, MACBOOK_RAMS, MACBOOK_STORAGES,
  MAC_MINI_CHIPS, MAC_MINI_RAMS, MAC_MINI_STORAGES,
  IPAD_MODELOS, IPAD_TELAS, IPAD_STORAGES, IPAD_CONNS,
  WATCH_MODELOS, WATCH_TAMANHOS, WATCH_CONNS,
  AIRPODS_MODELOS,
  DEFAULT_SPEC, buildProdutoName,
  type ProdutoSpec,
} from "@/lib/produto-specs";

interface Etiqueta {
  id: string;
  codigo_barras: string;
  categoria: string;
  produto: string;
  cor: string | null;
  armazenamento: string | null;
  custo_unitario: number;
  fornecedor: string | null;
  observacao: string | null;
  status: string;
  created_at: string;
  data_entrada: string | null;
  data_saida: string | null;
}

// ── Hook: detecta scanner USB HID (digita muito rápido + Enter) ──
function useGlobalScanner(onScan: (codigo: string) => void, enabled: boolean, inputRef?: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastTime = 0;
    const THRESHOLD = 80; // Scanner USB digita muito rápido (< 80ms entre teclas)

    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInScanInput = inputRef?.current && e.target === inputRef.current;

      // Permitir captura global OU dentro do input do scanner
      if (!isInScanInput && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;

      const now = Date.now();
      if (now - lastTime > THRESHOLD) buffer = "";
      lastTime = now;

      if (e.key === "Enter") {
        const codigo = buffer.trim().toUpperCase();
        if (codigo.length >= 4) {
          e.preventDefault();
          onScan(codigo);
          // Limpar o input se o scanner digitou nele
          if (isInScanInput && inputRef?.current) inputRef.current.value = "";
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onScan, enabled, inputRef]);
}

export function EtiquetasContent({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { password } = useAdmin();
  const [tab, setTab] = useState<"gerar" | "bipar" | "historico">("gerar");

  // ── Estado: Gerar Etiqueta ──
  const [categoria, setCategoria] = useState("");
  const [spec, setSpec] = useState<ProdutoSpec>({ ...DEFAULT_SPEC });
  const setS = (field: string, value: string) => setSpec((s) => ({ ...s, [field]: value }));
  const [cor, setCor] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [tamanhoEtiqueta, setTamanhoEtiqueta] = useState("29x30");
  const [quantidade, setQuantidade] = useState("1");
  const [produtoLivre, setProdutoLivre] = useState("");
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);

  const [gerandoLoading, setGerandoLoading] = useState(false);
  const [etiquetaGerada, setEtiquetaGerada] = useState<Etiqueta | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isStructured = STRUCTURED_CATS.includes(categoria);

  // ── Produtos do estoque (para selecionar variações reais) ──
  interface EstoqueItem { id: string; produto: string; categoria: string; cor: string | null; custo: number; tipo?: string; qnt?: number }
  const [estoqueProdutos, setEstoqueProdutos] = useState<EstoqueItem[]>([]);
  const [produtoEstoque, setProdutoEstoque] = useState("");
  const [useEstoque, setUseEstoque] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"NOVO" | "SEMINOVO" | "">("NOVO"); // Padrão: só lacrados

  // Buscar TODOS os produtos do estoque (sem filtro de categoria — para pegar tudo)
  useEffect(() => {
    if (!password) return;
    fetch("/api/estoque", { headers: { "x-admin-password": password } })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((json) => {
        const items = (json.data || []) as EstoqueItem[];
        setEstoqueProdutos(items);
      })
      .catch(() => setEstoqueProdutos([]));
  }, [password]);

  // Filtrar por categoria selecionada + tipo (NOVO/SEMINOVO) + qnt > 0
  const produtosFiltrados = estoqueProdutos
    .filter((p) => !categoria || p.categoria === categoria)
    .filter((p) => !filtroTipo || p.tipo === filtroTipo)
    .filter((p) => (p.qnt || 0) > 0);

  // Produtos únicos, ordenados alfabeticamente
  const produtosUnicos = [...new Map(produtosFiltrados.map((p) => [p.produto, p])).values()]
    .sort((a, b) => a.produto.localeCompare(b.produto));

  // Cores disponíveis para o produto selecionado (dentro do filtro)
  const coresDoEstoque = produtosFiltrados.filter((p) => p.produto === produtoEstoque).map((p) => p.cor).filter(Boolean) as string[];
  const coresUnicas = [...new Set(coresDoEstoque)].sort();

  // Buscar fornecedores do banco
  useEffect(() => {
    fetch("/api/fornecedores", { headers: { "x-admin-password": password } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setFornecedores(Array.isArray(data) ? data : data?.data || []))
      .catch(() => {});
  }, [password]);

  // ── Estado: Bipador ──
  const [scanResult, setScanResult] = useState<{ tipo: string; etiqueta?: Etiqueta; mensagem: string } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanManual, setScanManual] = useState("");
  const [modalScan, setModalScan] = useState<Etiqueta | null>(null);
  const [historicoSessao, setHistoricoSessao] = useState<{ codigo: string; nome: string; acao: string; hora: string }[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const cameraRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<unknown>(null);

  // ── Estado: Histórico ──
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [histLoading, setHistLoading] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-password": password,
  }), [password]);

  // ── Renderizar barcode quando etiqueta é gerada ──
  useEffect(() => {
    if (etiquetaGerada?.codigo_barras) {
      setTimeout(() => {
        renderBarcode("barcode-preview", etiquetaGerada.codigo_barras);
      }, 200);
    }
  }, [etiquetaGerada]);

  // ── Gerar Etiqueta ──
  async function handleGerar() {
    const nomeProduto = useEstoque ? produtoEstoque : (isStructured ? buildProdutoName(categoria, spec) : produtoLivre);
    if (!nomeProduto) { setErrMsg("Selecione um produto."); return; }
    if (!custoUnitario) { setErrMsg("Informe o custo unitário."); return; }
    setErrMsg("");
    setGerandoLoading(true);

    try {
      const qty = Math.max(1, parseInt(quantidade) || 1);
      let lastEtiqueta: Etiqueta | null = null;

      for (let i = 0; i < qty; i++) {
        const res = await fetch("/api/etiquetas", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            categoria,
            produto: nomeProduto,
            cor: cor || null,
            armazenamento: null,
            custo_unitario: parseFloat(custoUnitario.replace(/\./g, "").replace(",", ".")) || 0,
            fornecedor: fornecedor || null,
            observacao: observacao || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        lastEtiqueta = json.data;
      }

      if (qty === 1 && lastEtiqueta) {
        setEtiquetaGerada(lastEtiqueta);
      } else {
        setSuccessMsg(`${qty} etiquetas geradas com sucesso!`);
        setEtiquetaGerada(null);
      }
    } catch (e: unknown) {
      setErrMsg("Erro: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setGerandoLoading(false);
    }
  }

  // ── Imprimir Etiqueta individual (Brother 29mm DK-2210) ──
  function handlePrint(etiqueta: Etiqueta) {
    const win = window.open("", "_blank", "width=500,height=200");
    if (!win) return;
    // Layout horizontal: 62mm largura x 29mm altura (padrão Brother DK-2210)
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta ${etiqueta.codigo_barras}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:62mm;height:29mm;overflow:hidden}
        body{font-family:Arial,Helvetica,sans-serif}
        .etiqueta{width:62mm;height:29mm;padding:1.5mm 2mm;display:flex;flex-direction:row;align-items:center;gap:2mm}
        .info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0.5mm;min-width:0}
        .marca{font-size:5pt;font-weight:bold;letter-spacing:0.3pt;white-space:nowrap}
        .produto{font-size:7pt;font-weight:bold;line-height:1.2;word-wrap:break-word}
        .cor{font-size:5.5pt;color:#555}
        .codigo{font-size:5pt;color:#888;margin-top:0.5mm}
        .barcode-area{width:26mm;flex-shrink:0;display:flex;align-items:center;justify-content:center}
        .barcode-area svg{width:100%!important;height:auto!important}
        @page{size:62mm 29mm;margin:0}
        @media print{body{-webkit-print-color-adjust:exact}}
      </style></head><body>
      <div class="etiqueta">
        <div class="info">
          <div class="marca">TIGRAO IMPORTS</div>
          <div class="produto">${etiqueta.produto}</div>
          ${etiqueta.cor ? `<div class="cor">${etiqueta.cor}</div>` : ""}
          <div class="codigo">${etiqueta.codigo_barras}</div>
        </div>
        <div class="barcode-area"><svg id="bc"></svg></div>
      </div>
      <script>
        JsBarcode('#bc','${etiqueta.codigo_barras}',{format:'CODE128',width:1.8,height:50,displayValue:false,margin:0});
        window.onload=()=>{window.print();window.close()};
      <\/script></body></html>`);
    win.document.close();
  }

  // ── Beep sonoro para feedback de scan ──
  const playBeep = useCallback((sucesso: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (sucesso) {
        osc.frequency.value = 1200;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.value = 400;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
      osc.onended = () => ctx.close();
    } catch {}
  }, []);

  // ── Scanner: processar código ──
  const handleScan = useCallback(async (codigo: string) => {
    if (modalScan || scanLoading) return;
    setScanLoading(true);
    setScanResult(null);

    try {
      // Buscar etiqueta
      const res = await fetch(`/api/etiquetas?codigo=${encodeURIComponent(codigo)}`, { headers: headers() });
      const data = await res.json();
      const etiqueta = Array.isArray(data) ? data[0] : null;

      if (!etiqueta) {
        playBeep(false);
        setScanResult({ tipo: "erro", mensagem: `Codigo "${codigo}" nao encontrado no sistema.` });
        setScanLoading(false);
        return;
      }

      playBeep(true);
      setModalScan(etiqueta);
    } catch {
      playBeep(false);
      setScanResult({ tipo: "erro", mensagem: "Erro ao buscar produto." });
    } finally {
      setScanLoading(false);
    }
  }, [modalScan, scanLoading, headers, playBeep]);

  // Ativar scanner global na aba "bipar"
  useGlobalScanner(handleScan, tab === "bipar", scanInputRef);

  // Auto-focus no input quando abre aba bipar (scanner USB digita no campo focado)
  useEffect(() => {
    if (tab === "bipar") {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [tab]);

  // ── Camera scanner (celular) ──
  const iniciarCamera = useCallback(async () => {
    if (cameraAtiva) return;
    setCameraAtiva(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("camera-scanner", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerInstanceRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 20,
          // Sem qrbox = escaneia o frame inteiro (mais chance de ler)
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText: string) => {
          const codigo = decodedText.trim().toUpperCase();
          if (codigo.length >= 4) {
            handleScan(codigo);
            scanner.stop().then(() => {
              scanner.clear();
              scannerInstanceRef.current = null;
              setCameraAtiva(false);
            }).catch(() => {});
          }
        },
        () => {}
      );
    } catch {
      setCameraAtiva(false);
    }
  }, [cameraAtiva, handleScan]);

  const pararCamera = useCallback(async () => {
    const scanner = scannerInstanceRef.current as { stop: () => Promise<void>; clear: () => void } | null;
    if (scanner) {
      try { await scanner.stop(); scanner.clear(); } catch {}
      scannerInstanceRef.current = null;
    }
    setCameraAtiva(false);
  }, []);

  // Limpar câmera ao sair da aba
  useEffect(() => {
    if (tab !== "bipar") pararCamera();
  }, [tab, pararCamera]);

  // ── Confirmar ação do scan (entrada ou saída) ──
  async function confirmarScan(etiqueta: Etiqueta) {
    setScanLoading(true);
    try {
      const res = await fetch("/api/etiquetas/scan", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ codigo_barras: etiqueta.codigo_barras }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const acao = json.acao as string;
      setScanResult({ tipo: "sucesso", mensagem: `${acao === "ENTRADA" ? "ENTRADA" : "SAIDA"} confirmada: ${etiqueta.produto}`, etiqueta: json.etiqueta });
      setHistoricoSessao((prev) => [
        { codigo: etiqueta.codigo_barras, nome: etiqueta.produto, acao, hora: new Date().toLocaleTimeString("pt-BR") },
        ...prev.slice(0, 19),
      ]);
      setModalScan(null);
    } catch (e: unknown) {
      setScanResult({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro" });
    } finally {
      setScanLoading(false);
    }
  }

  // ── Carregar histórico ──
  async function carregarHistorico() {
    setHistLoading(true);
    try {
      const url = `/api/etiquetas${filtroStatus ? `?status=${filtroStatus}` : ""}`;
      const res = await fetch(url, { headers: headers() });
      const data = await res.json();
      setEtiquetas(Array.isArray(data) ? data : []);
    } catch {
      setEtiquetas([]);
    } finally {
      setHistLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "historico") carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroStatus]);

  function handleNova() {
    setEtiquetaGerada(null);
    setSuccessMsg("");
    setCustoUnitario("");
    setObservacao("");
    setQuantidade("1");
  }

  // ── Seleção de etiquetas ──
  function toggleSelecionada(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTodas() {
    if (selecionadas.size === etiquetas.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(etiquetas.map((e) => e.id)));
    }
  }

  // ── Imprimir múltiplas etiquetas (2 por fita, lado a lado na Brother 29mm) ──
  function handlePrintBatch() {
    const lista = etiquetas.filter((e) => selecionadas.has(e.id));
    if (lista.length === 0) return;
    const win = window.open("", "_blank", "width=500,height=600");
    if (!win) return;

    const etiquetasHtml = lista.map((et, idx) => `
      <div class="etiqueta" ${idx < lista.length - 1 ? 'style="page-break-after:always"' : ''}>
        <div class="info">
          <div class="marca">TIGRAO IMPORTS</div>
          <div class="produto">${et.produto}</div>
          ${et.cor ? `<div class="cor">${et.cor}</div>` : ""}
          <div class="codigo">${et.codigo_barras}</div>
        </div>
        <div class="barcode-area"><svg id="bc-${idx}"></svg></div>
      </div>
    `).join("");

    const barcodeScripts = lista.map((et, idx) =>
      `JsBarcode('#bc-${idx}','${et.codigo_barras}',{format:'CODE128',width:1.8,height:50,displayValue:false,margin:0});`
    ).join("\n");

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Imprimir ${lista.length} Etiquetas</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:62mm;overflow:hidden}
        body{font-family:Arial,Helvetica,sans-serif}
        .etiqueta{width:62mm;height:29mm;padding:1.5mm 2mm;display:flex;flex-direction:row;align-items:center;gap:2mm}
        .info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0.5mm;min-width:0}
        .marca{font-size:5pt;font-weight:bold;letter-spacing:0.3pt;white-space:nowrap}
        .produto{font-size:7pt;font-weight:bold;line-height:1.2;word-wrap:break-word}
        .cor{font-size:5.5pt;color:#555}
        .codigo{font-size:5pt;color:#888;margin-top:0.5mm}
        .barcode-area{width:26mm;flex-shrink:0;display:flex;align-items:center;justify-content:center}
        .barcode-area svg{width:100%!important;height:auto!important}
        @page{size:62mm 29mm;margin:0}
        @media print{body{-webkit-print-color-adjust:exact}}
      </style></head><body>
      ${etiquetasHtml}
      <script>
        ${barcodeScripts}
        window.onload=()=>{window.print();window.close()};
      <\/script></body></html>`);
    win.document.close();
  }

  // ── Excluir etiqueta ──
  async function handleExcluir(etiqueta: Etiqueta) {
    if (!confirm(`Excluir etiqueta ${etiqueta.codigo_barras}?\n${etiqueta.produto}`)) return;
    setExcluindoId(etiqueta.id);
    try {
      const res = await fetch("/api/etiquetas", {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ id: etiqueta.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEtiquetas((prev) => prev.filter((e) => e.id !== etiqueta.id));
      setSelecionadas((prev) => { const next = new Set(prev); next.delete(etiqueta.id); return next; });
    } catch (e: unknown) {
      alert("Erro ao excluir: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setExcluindoId(null);
    }
  }

  // Preview do nome gerado
  const previewNome = isStructured ? buildProdutoName(categoria, spec) : produtoLivre;

  const statusConfig = modalScan ? STATUS_ETIQUETA[modalScan.status as keyof typeof STATUS_ETIQUETA] : null;

  const labelCls = "text-xs font-semibold text-gray-500 mb-1";
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400";

  return (
    <div className={embedded ? "" : "min-h-screen bg-gray-50"}>
      {/* Header — só mostra quando não está embedded */}
      {!embedded && (
        <div className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/admin")} className="text-gray-400 hover:text-gray-600 text-sm">&larr; Voltar</button>
              <h1 className="text-xl font-bold text-gray-900">Etiquetas & Scanner</h1>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={embedded ? "" : "max-w-4xl mx-auto px-4 pt-4"}>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {([
            { key: "gerar", label: "Gerar Etiqueta", icon: "🏷️" },
            { key: "bipar", label: "Bipar Produto", icon: "📡" },
            { key: "historico", label: "Historico", icon: "📋" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === t.key ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={embedded ? "py-4" : "max-w-4xl mx-auto px-4 py-6"}>

        {/* ═══════════ TAB: GERAR ETIQUETA ═══════════ */}
        {tab === "gerar" && !etiquetaGerada && !successMsg && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Gerar Nova Etiqueta</h2>

            {/* Categoria */}
            <div>
              <p className={labelCls}>Categoria *</p>
              <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setSpec({ ...DEFAULT_SPEC }); setCor(""); setProdutoEstoque(""); }} className={inputCls}>
                <option value="">Selecione...</option>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
              </select>
            </div>

            {/* Modo: Estoque vs Livre */}
            {categoria && (
              <div className="flex gap-2">
                <button onClick={() => setUseEstoque(true)} className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${useEstoque ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"}`}>
                  📦 Selecionar do Estoque
                </button>
                <button onClick={() => setUseEstoque(false)} className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${!useEstoque ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"}`}>
                  ✏️ Digitação Livre
                </button>
              </div>
            )}

            {/* ── Modo Estoque: selecionar produto existente ── */}
            {categoria && useEstoque && (
              <>
                {/* Filtro: Lacrado ou Seminovo */}
                <div className="flex gap-2">
                  {([
                    { value: "NOVO" as const, label: "🔒 Lacrados", desc: "Produtos novos" },
                    { value: "SEMINOVO" as const, label: "📱 Seminovos", desc: "Produtos usados" },
                    { value: "" as const, label: "📋 Todos", desc: "Todos os tipos" },
                  ]).map((opt) => (
                    <button key={opt.value} onClick={() => { setFiltroTipo(opt.value); setProdutoEstoque(""); setCor(""); }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${filtroTipo === opt.value ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div>
                  <p className={labelCls}>Produto * <span className="text-gray-400 font-normal">({produtosUnicos.length} disponíveis)</span></p>
                  {produtosUnicos.length > 0 ? (
                    <select value={produtoEstoque} onChange={(e) => { setProdutoEstoque(e.target.value); setCor(""); }} className={inputCls}>
                      <option value="">Selecione o produto...</option>
                      {produtosUnicos.map((p) => <option key={p.id} value={p.produto}>{p.produto}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Nenhum produto {filtroTipo === "NOVO" ? "lacrado" : filtroTipo === "SEMINOVO" ? "seminovo" : ""} nesta categoria.</p>
                  )}
                </div>

                {/* Cor: opções do estoque */}
                {produtoEstoque && coresUnicas.length > 0 && (
                  <div>
                    <p className={labelCls}>Cor</p>
                    <select value={cor} onChange={(e) => setCor(e.target.value)} className={inputCls}>
                      <option value="">Selecione a cor...</option>
                      {coresUnicas.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {/* Preview */}
                {produtoEstoque && (
                  <div className="px-4 py-3 bg-gray-900 rounded-xl">
                    <p className="text-xs text-gray-400">Produto na etiqueta:</p>
                    <p className="text-white font-bold">{produtoEstoque}{cor ? ` — ${cor}` : ""}</p>
                  </div>
                )}
              </>
            )}

            {/* ── Modo Livre: campos manuais ── */}
            {categoria && !useEstoque && (
              <>
                {/* Campos estruturados por categoria */}
                {categoria === "IPHONES" && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Modelo</p><select value={spec.ip_modelo} onChange={(e) => setS("ip_modelo", e.target.value)} className={inputCls}>
                      {IPHONE_MODELOS.map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Armazenamento</p><select value={spec.ip_storage} onChange={(e) => setS("ip_storage", e.target.value)} className={inputCls}>
                      {IPHONE_STORAGES.map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                  </div>
                )}

                {categoria === "MACBOOK" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Modelo</p><select value={spec.mb_modelo} onChange={(e) => setS("mb_modelo", e.target.value)} className={inputCls}>
                      {MACBOOK_TIPOS.map((t) => <option key={t} value={t}>{t === "AIR" ? "MacBook Air" : "MacBook Pro"}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Tela</p><select value={spec.mb_tela} onChange={(e) => setS("mb_tela", e.target.value)} className={inputCls}>
                      {(spec.mb_modelo === "AIR" ? MACBOOK_TELAS_AIR : MACBOOK_TELAS_PRO).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Chip</p><select value={spec.mb_chip} onChange={(e) => setS("mb_chip", e.target.value)} className={inputCls}>
                      {MACBOOK_CHIPS.map((c) => <option key={c}>{c}</option>)}
                    </select></div>
                    <div><p className={labelCls}>RAM</p><select value={spec.mb_ram} onChange={(e) => setS("mb_ram", e.target.value)} className={inputCls}>
                      {MACBOOK_RAMS.map((r) => <option key={r}>{r}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Armazenamento</p><select value={spec.mb_storage} onChange={(e) => setS("mb_storage", e.target.value)} className={inputCls}>
                      {MACBOOK_STORAGES.map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                  </div>
                )}

                {categoria === "MAC_MINI" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Chip</p><select value={spec.mm_chip} onChange={(e) => setS("mm_chip", e.target.value)} className={inputCls}>
                      {MAC_MINI_CHIPS.map((c) => <option key={c}>{c}</option>)}
                    </select></div>
                    <div><p className={labelCls}>RAM</p><select value={spec.mm_ram} onChange={(e) => setS("mm_ram", e.target.value)} className={inputCls}>
                      {MAC_MINI_RAMS.map((r) => <option key={r}>{r}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Armazenamento</p><select value={spec.mm_storage} onChange={(e) => setS("mm_storage", e.target.value)} className={inputCls}>
                      {MAC_MINI_STORAGES.map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                  </div>
                )}

                {categoria === "IPADS" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Modelo</p><select value={spec.ipad_modelo} onChange={(e) => setS("ipad_modelo", e.target.value)} className={inputCls}>
                      {IPAD_MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Tela</p><select value={spec.ipad_tela} onChange={(e) => setS("ipad_tela", e.target.value)} className={inputCls}>
                      {IPAD_TELAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Armazenamento</p><select value={spec.ipad_storage} onChange={(e) => setS("ipad_storage", e.target.value)} className={inputCls}>
                      {IPAD_STORAGES.map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Conectividade</p><select value={spec.ipad_conn} onChange={(e) => setS("ipad_conn", e.target.value)} className={inputCls}>
                      {IPAD_CONNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select></div>
                  </div>
                )}

                {categoria === "APPLE_WATCH" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Modelo</p><select value={spec.aw_modelo} onChange={(e) => setS("aw_modelo", e.target.value)} className={inputCls}>
                      {WATCH_MODELOS.map((m) => <option key={m}>{m}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Tamanho</p><select value={spec.aw_tamanho} onChange={(e) => setS("aw_tamanho", e.target.value)} className={inputCls}>
                      {WATCH_TAMANHOS.map((t) => <option key={t}>{t}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Conectividade</p><select value={spec.aw_conn} onChange={(e) => setS("aw_conn", e.target.value)} className={inputCls}>
                      {WATCH_CONNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select></div>
                  </div>
                )}

                {categoria === "AIRPODS" && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div><p className={labelCls}>Modelo</p><select value={spec.air_modelo} onChange={(e) => setS("air_modelo", e.target.value)} className={inputCls}>
                      {AIRPODS_MODELOS.map((m) => <option key={m}>{m}</option>)}
                    </select></div>
                  </div>
                )}

                {/* Categorias sem campos estruturados */}
                {!isStructured && (
                  <div>
                    <p className={labelCls}>Nome do Produto *</p>
                    <input value={produtoLivre} onChange={(e) => setProdutoLivre(e.target.value)} placeholder="Ex: Cabo USB-C Lightning 1m" className={inputCls} />
                  </div>
                )}

                {/* Preview do nome */}
                {previewNome && (
                  <div className="px-4 py-3 bg-gray-900 rounded-xl">
                    <p className="text-xs text-gray-400">Produto na etiqueta:</p>
                    <p className="text-white font-bold">{previewNome}</p>
                  </div>
                )}

                {/* Cor */}
                <div>
                  <p className={labelCls}>Cor</p>
                  <input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Ex: Preto, Natural, Prata..." className={inputCls} />
                </div>
              </>
            )}

            {/* Custo + Fornecedor + Quantidade */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className={labelCls}>Custo Unitario (R$) *</p>
                <input type="text" placeholder="5.100" value={custoUnitario} onChange={(e) => setCustoUnitario(e.target.value)} className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Fornecedor</p>
                <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={inputCls}>
                  <option value="">Selecione...</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>Quantidade</p>
                <input type="number" min="1" max="50" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Tamanho etiqueta */}
            <div>
              <p className={labelCls}>Tamanho da Etiqueta</p>
              <select value={tamanhoEtiqueta} onChange={(e) => setTamanhoEtiqueta(e.target.value)} className={inputCls}>
                {Object.entries(TAMANHOS_ETIQUETA).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
              </select>
            </div>

            {/* Observação */}
            <div>
              <p className={labelCls}>Observacao (opcional)</p>
              <input type="text" placeholder="Ex: eSIM only, bateria 87%..." value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputCls} />
            </div>

            {errMsg && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{errMsg}</div>}

            <button onClick={handleGerar} disabled={gerandoLoading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors">
              {gerandoLoading ? "Gerando..." : `Gerar ${parseInt(quantidade) > 1 ? quantidade + " Etiquetas" : "Etiqueta"}`}
            </button>

            <p className="text-xs text-gray-400 text-center">
              O produto sera salvo com status <strong>AGUARDANDO ENTRADA</strong>. Apos imprimir, bipe para confirmar entrada.
            </p>
          </div>
        )}

        {/* ── Etiqueta gerada (preview + imprimir) ── */}
        {tab === "gerar" && etiquetaGerada && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-bold text-green-800">Etiqueta gerada!</p>
                <p className="text-green-600 text-sm">Codigo: <strong>{etiquetaGerada.codigo_barras}</strong> — {etiquetaGerada.produto}</p>
              </div>
            </div>

            {/* Preview */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 flex justify-center">
              <div className="bg-white border border-gray-400 rounded p-3 shadow-sm" style={{ minWidth: 200, maxWidth: 280 }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-orange-600">TIGRAO IMPORTS</span>
                  <span className="text-xs text-gray-400">{etiquetaGerada.codigo_barras}</span>
                </div>
                <p className="text-sm font-bold text-gray-900 leading-tight">{etiquetaGerada.produto}</p>
                {etiquetaGerada.fornecedor && <p className="text-xs text-gray-500">Forn: {etiquetaGerada.fornecedor}</p>}
                <p className="text-xs font-semibold text-gray-700 mt-1">Custo: R$ {Number(etiquetaGerada.custo_unitario).toLocaleString("pt-BR")}</p>
                <div className="mt-2 flex justify-center"><svg id="barcode-preview"></svg></div>
              </div>
            </div>

            {/* Próximos passos */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-bold text-blue-800 mb-2">Proximos passos:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Clique em <strong>Imprimir Etiqueta</strong></li>
                <li>No dialogo de impressao, selecione sua etiquetadora</li>
                <li>Cole a etiqueta na caixa do produto</li>
                <li><strong>Bipe o produto</strong> na aba "Bipar Produto" para confirmar entrada</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button onClick={() => handlePrint(etiquetaGerada)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl">
                Imprimir Etiqueta
              </button>
              <button onClick={handleNova} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl">
                Nova Etiqueta
              </button>
            </div>
          </div>
        )}

        {/* ── Sucesso múltiplas etiquetas ── */}
        {tab === "gerar" && successMsg && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-bold text-green-800">{successMsg}</p>
              <p className="text-green-600 text-sm mt-1">As etiquetas estao no historico. Imprima cada uma de la.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleNova} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl">Gerar Mais</button>
              <button onClick={() => { setTab("historico"); setSuccessMsg(""); }} className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl">Ver Historico</button>
            </div>
          </div>
        )}

        {/* ═══════════ TAB: BIPAR PRODUTO ═══════════ */}
        {tab === "bipar" && (
          <div className="space-y-4">
            {/* Indicador scanner ativo */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <div>
                <p className="font-semibold text-green-800">Scanner ativo — pronto para bipar</p>
                <p className="text-sm text-green-600">Bipe com leitor USB, camera do celular, ou digite o codigo.</p>
              </div>
            </div>

            {/* Camera do celular */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-600">Camera do celular:</p>
                {!cameraAtiva ? (
                  <button onClick={iniciarCamera} className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                    📷 Abrir Camera
                  </button>
                ) : (
                  <button onClick={pararCamera} className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                    ✕ Fechar Camera
                  </button>
                )}
              </div>
              {cameraAtiva && (
                <div className="relative rounded-lg overflow-hidden bg-black">
                  <div id="camera-scanner" ref={cameraRef} className="w-full" />
                  <p className="text-center text-xs text-gray-400 mt-2 pb-2">Aponte para o codigo de barras da etiqueta</p>
                </div>
              )}
            </div>

            {/* Input manual / Scanner USB */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-600 mb-2">Leitor USB ou codigo manual:</p>
              <form onSubmit={(e) => { e.preventDefault(); if (scanManual.trim()) { handleScan(scanManual.trim().toUpperCase()); setScanManual(""); } }} className="flex gap-2">
                <input ref={scanInputRef} type="text" value={scanManual} onChange={(e) => setScanManual(e.target.value.toUpperCase())} placeholder="TG000001" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-orange-400" maxLength={10} autoFocus />
                <button type="submit" disabled={scanLoading} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg">Buscar</button>
              </form>
            </div>

            {/* Feedback */}
            {scanResult && (
              <div className={`rounded-xl p-4 text-sm font-medium border ${scanResult.tipo === "sucesso" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {scanResult.mensagem}
              </div>
            )}

            {/* Histórico da sessão */}
            {historicoSessao.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <p className="font-semibold text-gray-700 text-sm">Historico desta sessao</p>
                  <button onClick={() => setHistoricoSessao([])} className="text-xs text-gray-400 hover:text-red-500">Limpar</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {historicoSessao.map((item, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.codigo}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.acao === "ENTRADA" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.acao}</span>
                        <p className="text-xs text-gray-400 mt-1">{item.hora}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ TAB: HISTORICO ═══════════ */}
        {tab === "historico" && (
          <div className="space-y-4">
            {/* Filtros + Ações em lote */}
            <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
              <select value={filtroStatus} onChange={(e) => { setFiltroStatus(e.target.value); setSelecionadas(new Set()); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Todos os status</option>
                <option value="AGUARDANDO_ENTRADA">Aguardando Entrada</option>
                <option value="EM_ESTOQUE">Em Estoque</option>
                <option value="SAIU">Saiu</option>
              </select>
              <button onClick={carregarHistorico} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Atualizar</button>
              <span className="text-sm text-gray-500">{etiquetas.length} etiquetas</span>
              {selecionadas.size > 0 && (
                <button onClick={handlePrintBatch} className="ml-auto bg-gray-800 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                  🖨️ Imprimir {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}
                </button>
              )}
            </div>

            {/* Tabela */}
            {histLoading ? (
              <div className="text-center py-8 text-gray-400">Carregando...</div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-3 text-center w-10">
                        <input type="checkbox" checked={etiquetas.length > 0 && selecionadas.size === etiquetas.length} onChange={toggleTodas} className="w-4 h-4 accent-orange-500 cursor-pointer" />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Codigo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Produto</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Fornecedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Data</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {etiquetas.map((et) => {
                      const st = STATUS_ETIQUETA[et.status as keyof typeof STATUS_ETIQUETA];
                      return (
                        <tr key={et.id} className={`hover:bg-gray-50 ${selecionadas.has(et.id) ? "bg-orange-50" : ""}`}>
                          <td className="px-3 py-3 text-center">
                            <input type="checkbox" checked={selecionadas.has(et.id)} onChange={() => toggleSelecionada(et.id)} className="w-4 h-4 accent-orange-500 cursor-pointer" />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{et.codigo_barras}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{et.produto}</p>
                            {et.cor && <p className="text-xs text-gray-400">{et.cor}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{et.fornecedor || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              et.status === "EM_ESTOQUE" ? "bg-green-100 text-green-700" :
                              et.status === "AGUARDANDO_ENTRADA" ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                et.status === "EM_ESTOQUE" ? "bg-green-500" :
                                et.status === "AGUARDANDO_ENTRADA" ? "bg-yellow-500" :
                                "bg-red-500"
                              }`} />
                              {st?.label || et.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(et.created_at).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex gap-1.5 justify-center">
                              <button onClick={() => handlePrint(et)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded-lg">Imprimir</button>
                              {et.status === "AGUARDANDO_ENTRADA" && (
                                <button onClick={() => handleExcluir(et)} disabled={excluindoId === et.id} className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg disabled:opacity-50">
                                  {excluindoId === et.id ? "..." : "Excluir"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {etiquetas.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhuma etiqueta encontrada</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════ MODAL: Confirmação de Scan ═══════════ */}
      {modalScan && statusConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className={`p-6 rounded-t-2xl ${statusConfig.proximo === "EM_ESTOQUE" ? "bg-green-500" : statusConfig.proximo === "SAIU" ? "bg-red-500" : "bg-gray-500"}`}>
              <p className="text-white font-bold text-lg">
                {statusConfig.proximo === "EM_ESTOQUE" ? "Confirmar Entrada" : "Confirmar Saida"}
              </p>
              <p className="text-white/80 text-sm font-mono mt-1">{formatarCodigo(modalScan.codigo_barras)}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-gray-900 text-lg">{modalScan.produto}</p>
                {modalScan.cor && <p className="text-sm text-gray-600">Cor: {modalScan.cor}</p>}
                {modalScan.armazenamento && <p className="text-sm text-gray-600">Armazenamento: {modalScan.armazenamento}</p>}
                {modalScan.fornecedor && <p className="text-sm text-gray-600">Fornecedor: {modalScan.fornecedor}</p>}
                <p className="text-sm font-semibold text-gray-800">Custo: R$ {Number(modalScan.custo_unitario || 0).toLocaleString("pt-BR")}</p>
              </div>

              <div className="flex items-center gap-3 justify-center">
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{statusConfig.label}</span>
                <span className="text-gray-400">→</span>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${statusConfig.proximo === "EM_ESTOQUE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {statusConfig.proximo === "EM_ESTOQUE" ? "Em Estoque" : "Saiu"}
                </span>
              </div>

              {!statusConfig.proximo && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm">
                  Este produto ja saiu do estoque. Nenhuma acao disponivel.
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setModalScan(null)} className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-3 rounded-xl">Cancelar</button>
                {statusConfig.proximo && (
                  <button onClick={() => confirmarScan(modalScan)} disabled={scanLoading} className={`flex-1 text-white font-bold py-3 rounded-xl disabled:opacity-50 ${statusConfig.proximo === "EM_ESTOQUE" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}>
                    {scanLoading ? "Salvando..." : statusConfig.acao}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EtiquetasPage() {
  return <EtiquetasContent />;
}
