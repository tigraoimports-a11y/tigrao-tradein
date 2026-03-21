"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS_ETIQUETA,
  ARMAZENAMENTOS,
  CORES_ETIQUETA,
  TAMANHOS_ETIQUETA,
  STATUS_ETIQUETA,
  renderBarcode,
  formatarCodigo,
} from "@/lib/barcode";

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
function useGlobalScanner(onScan: (codigo: string) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastTime = 0;
    const THRESHOLD = 80;

    function handleKey(e: KeyboardEvent) {
      // Ignorar se está focado em input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const now = Date.now();
      if (now - lastTime > THRESHOLD) buffer = "";
      lastTime = now;

      if (e.key === "Enter") {
        const codigo = buffer.trim();
        if (codigo.length >= 4) {
          e.preventDefault();
          onScan(codigo);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onScan, enabled]);
}

// ── Fornecedores padrão ──
const FORNECEDORES = [
  "EcoCel", "TM CEL", "Mega Center", "Ultra", "Miami",
  "Maximus", "DUE", "Smart Cell", "Trade-In Cliente", "Outro",
];

export default function EtiquetasPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<"gerar" | "bipar" | "historico">("gerar");

  // ── Estado: Gerar Etiqueta ──
  const [form, setForm] = useState({
    categoria: "",
    produto: "",
    cor: "",
    armazenamento: "",
    custo_unitario: "",
    fornecedor: "",
    observacao: "",
    tamanho_etiqueta: "57x32",
    quantidade: "1",
  });
  const [gerandoLoading, setGerandoLoading] = useState(false);
  const [etiquetaGerada, setEtiquetaGerada] = useState<Etiqueta | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── Estado: Bipador ──
  const [scanResult, setScanResult] = useState<{ tipo: string; etiqueta?: Etiqueta; mensagem: string } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanManual, setScanManual] = useState("");
  const [modalScan, setModalScan] = useState<Etiqueta | null>(null);
  const [historicoSessao, setHistoricoSessao] = useState<{ codigo: string; nome: string; acao: string; hora: string }[]>([]);

  // ── Estado: Histórico ──
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [histLoading, setHistLoading] = useState(false);

  // ── Listas dinâmicas ──
  const modelos = form.categoria ? CATEGORIAS_ETIQUETA[form.categoria] || [] : [];
  const armazenamentos = form.categoria ? ARMAZENAMENTOS[form.categoria] || [] : [];
  const cores = form.categoria ? CORES_ETIQUETA[form.categoria] || [] : [];

  // ── Login ──
  useEffect(() => {
    const saved = localStorage.getItem("admin_password");
    if (saved) { setPassword(saved); setLoggedIn(true); }
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("admin_password", password);
    setLoggedIn(true);
  }

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
    if (!form.produto) { setErrMsg("Selecione o modelo do produto."); return; }
    if (!form.custo_unitario) { setErrMsg("Informe o custo unitário."); return; }
    setErrMsg("");
    setGerandoLoading(true);

    const nomeProduto = [
      form.produto,
      form.armazenamento || null,
      form.cor || null,
    ].filter(Boolean).join(" ");

    try {
      const qty = Math.max(1, parseInt(form.quantidade) || 1);
      let lastEtiqueta: Etiqueta | null = null;

      for (let i = 0; i < qty; i++) {
        const res = await fetch("/api/etiquetas", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            categoria: form.categoria,
            produto: nomeProduto,
            cor: form.cor || null,
            armazenamento: form.armazenamento || null,
            custo_unitario: parseFloat(form.custo_unitario.replace(/\./g, "").replace(",", ".")) || 0,
            fornecedor: form.fornecedor || null,
            observacao: form.observacao || null,
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

  // ── Imprimir Etiqueta ──
  function handlePrint(etiqueta: Etiqueta) {
    const tamanho = TAMANHOS_ETIQUETA[form.tamanho_etiqueta] || TAMANHOS_ETIQUETA["57x32"];
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta ${etiqueta.codigo_barras}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{width:${tamanho.width}mm;height:${tamanho.height}mm;font-family:Arial,sans-serif;overflow:hidden}
        .etiqueta{width:${tamanho.width}mm;height:${tamanho.height}mm;padding:2mm;display:flex;flex-direction:column;justify-content:space-between;border:0.3mm solid #000}
        .header{display:flex;justify-content:space-between;align-items:center}
        .marca{font-size:${tamanho.height > 30 ? 7 : 5}pt;font-weight:bold}
        .codigo-texto{font-size:${tamanho.height > 30 ? 6 : 5}pt;color:#555}
        .produto{font-size:${tamanho.height > 30 ? 8 : 6}pt;font-weight:bold;line-height:1.2}
        .detalhe{font-size:${tamanho.height > 30 ? 6 : 5}pt;color:#333}
        .barcode-area{text-align:center}
        svg{max-width:100%}
        @page{size:${tamanho.width}mm ${tamanho.height}mm;margin:0}
      </style></head><body>
      <div class="etiqueta">
        <div class="header">
          <span class="marca">TIGRAO IMPORTS</span>
          <span class="codigo-texto">${etiqueta.codigo_barras}</span>
        </div>
        <div>
          <div class="produto">${etiqueta.produto}</div>
          ${etiqueta.fornecedor ? `<div class="detalhe">Forn: ${etiqueta.fornecedor}</div>` : ""}
          <div class="detalhe">Custo: R$ ${Number(etiqueta.custo_unitario).toLocaleString("pt-BR")}</div>
        </div>
        <div class="barcode-area"><svg id="bc"></svg></div>
      </div>
      <script>
        JsBarcode('#bc','${etiqueta.codigo_barras}',{format:'CODE128',width:${tamanho.width > 50 ? 1.8 : 1.3},height:${tamanho.height > 30 ? 28 : 20},displayValue:false,margin:0});
        window.onload=()=>{window.print();window.close()};
      <\/script></body></html>`);
    win.document.close();
  }

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
        setScanResult({ tipo: "erro", mensagem: `Codigo "${codigo}" nao encontrado no sistema.` });
        setScanLoading(false);
        return;
      }

      setModalScan(etiqueta);
    } catch {
      setScanResult({ tipo: "erro", mensagem: "Erro ao buscar produto." });
    } finally {
      setScanLoading(false);
    }
  }, [modalScan, scanLoading, headers]);

  // Ativar scanner global na aba "bipar"
  useGlobalScanner(handleScan, tab === "bipar");

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
    if (loggedIn && tab === "historico") carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroStatus, loggedIn]);

  // ── Login Screen ──
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-lg w-80">
          <h2 className="text-xl font-bold mb-4">Etiquetas - Admin</h2>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha admin" className="w-full border rounded-lg px-3 py-2 mb-4" />
          <button type="submit" className="w-full bg-orange-500 text-white font-bold py-2 rounded-lg">Entrar</button>
        </form>
      </div>
    );
  }

  function handleChange(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "categoria" ? { produto: "", cor: "", armazenamento: "" } : {}),
    }));
  }

  function handleNova() {
    setEtiquetaGerada(null);
    setSuccessMsg("");
    setForm((prev) => ({ ...prev, custo_unitario: "", observacao: "", quantidade: "1" }));
  }

  const statusConfig = modalScan ? STATUS_ETIQUETA[modalScan.status as keyof typeof STATUS_ETIQUETA] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-400 hover:text-gray-600 text-sm">&larr; Voltar</button>
            <h1 className="text-xl font-bold text-gray-900">Etiquetas & Scanner</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
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

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ═══════════ TAB: GERAR ETIQUETA ═══════════ */}
        {tab === "gerar" && !etiquetaGerada && !successMsg && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Gerar Nova Etiqueta</h2>

            {/* Categoria + Modelo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Categoria *</label>
                <select value={form.categoria} onChange={(e) => handleChange("categoria", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione...</option>
                  {Object.keys(CATEGORIAS_ETIQUETA).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Modelo *</label>
                <select value={form.produto} onChange={(e) => handleChange("produto", e.target.value)} disabled={!form.categoria} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100">
                  <option value="">Selecione...</option>
                  {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Armazenamento + Cor */}
            <div className="grid grid-cols-2 gap-4">
              {armazenamentos.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Armazenamento</label>
                  <select value={form.armazenamento} onChange={(e) => handleChange("armazenamento", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                    <option value="">Selecione...</option>
                    {armazenamentos.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Cor</label>
                <select value={form.cor} onChange={(e) => handleChange("cor", e.target.value)} disabled={!form.categoria} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100">
                  <option value="">Selecione...</option>
                  {cores.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Custo + Fornecedor + Quantidade */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Custo Unitario (R$) *</label>
                <input type="text" placeholder="5.100" value={form.custo_unitario} onChange={(e) => handleChange("custo_unitario", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fornecedor</label>
                <select value={form.fornecedor} onChange={(e) => handleChange("fornecedor", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione...</option>
                  {FORNECEDORES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Quantidade</label>
                <input type="number" min="1" max="50" value={form.quantidade} onChange={(e) => handleChange("quantidade", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>

            {/* Tamanho etiqueta */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tamanho da Etiqueta</label>
              <select value={form.tamanho_etiqueta} onChange={(e) => handleChange("tamanho_etiqueta", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                {Object.entries(TAMANHOS_ETIQUETA).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
              </select>
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observacao (opcional)</label>
              <input type="text" placeholder="Ex: eSIM only, bateria 87%..." value={form.observacao} onChange={(e) => handleChange("observacao", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
            </div>

            {errMsg && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{errMsg}</div>}

            <button onClick={handleGerar} disabled={gerandoLoading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors">
              {gerandoLoading ? "Gerando..." : `Gerar ${parseInt(form.quantidade) > 1 ? form.quantidade + " Etiquetas" : "Etiqueta"}`}
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
                <p className="text-sm text-green-600">Bipe qualquer etiqueta Tigrao. O sistema detecta automaticamente.</p>
              </div>
            </div>

            {/* Input manual */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-600 mb-2">Ou digite o codigo manualmente:</p>
              <form onSubmit={(e) => { e.preventDefault(); if (scanManual.trim()) { handleScan(scanManual.trim().toUpperCase()); setScanManual(""); } }} className="flex gap-2">
                <input type="text" value={scanManual} onChange={(e) => setScanManual(e.target.value.toUpperCase())} placeholder="TG000001" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-orange-400" maxLength={10} />
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
            {/* Filtros */}
            <div className="bg-white rounded-xl border p-4 flex gap-4 items-center">
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Todos os status</option>
                <option value="AGUARDANDO_ENTRADA">Aguardando Entrada</option>
                <option value="EM_ESTOQUE">Em Estoque</option>
                <option value="SAIU">Saiu</option>
              </select>
              <button onClick={carregarHistorico} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Atualizar</button>
              <span className="text-sm text-gray-500">{etiquetas.length} etiquetas</span>
            </div>

            {/* Tabela */}
            {histLoading ? (
              <div className="text-center py-8 text-gray-400">Carregando...</div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
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
                        <tr key={et.id} className="hover:bg-gray-50">
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
                            {et.status === "AGUARDANDO_ENTRADA" && (
                              <button onClick={() => handlePrint(et)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded-lg">Imprimir</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {etiquetas.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhuma etiqueta encontrada</td></tr>
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
