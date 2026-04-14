"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAdmin } from "@/components/admin/AdminShell";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import TradeInQuestionsAdmin from "@/components/admin/TradeInQuestionsAdmin";
import { corParaPT } from "@/lib/cor-pt";
import {
  calculateTradeInValue,
  calculateIPadTradeInValue,
  calculateMacBookTradeInValue,
  calculateQuote,
  getDiscountsForModel,
  formatBRL,
} from "@/lib/calculations";
import type { ConditionData, IPadConditionData, MacBookConditionData, ModelDiscounts } from "@/lib/calculations";
import { INSTALLMENT_RATES } from "@/lib/calculations";
import type { UsedDeviceValue } from "@/lib/types";
import FlexiblePaymentSimulator from "@/components/FlexiblePaymentSimulator";

const FunnelPanel = dynamic(() => import("@/app/admin/analytics/page"), { ssr: false });

interface SimulacaoRow {
  id: string;
  created_at: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  modelo_novo: string;
  storage_novo: string;
  preco_novo: number;
  modelo_usado: string;
  storage_usado: string;
  cor_usado?: string | null;
  avaliacao_usado: number;
  diferenca: number;
  status: "GOSTEI" | "SAIR";
  forma_pagamento: string | null;
  condicao_linhas: string[] | null;
  // 2º aparelho na troca
  modelo_usado2?: string | null;
  storage_usado2?: string | null;
  cor_usado2?: string | null;
  avaliacao_usado2?: number | null;
  condicao_linhas2?: string[] | null;
  contatado: boolean | null;
  vendedor: string | null;
  follow_up_enviado: boolean | null;
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR")}`;

/** Extrai campos estruturados das linhas de condição salvas com a simulação. */
function parseCondicao(linhas: string[] | null | undefined): {
  bateria: string;
  marcasUso: string;
  pecasTrocadas: string;
  caixaOriginal: string;
  outras: string[];
} {
  const out = { bateria: "", marcasUso: "", pecasTrocadas: "", caixaOriginal: "", outras: [] as string[] };
  if (!linhas || linhas.length === 0) return out;
  const marcasParts: string[] = [];
  for (const raw of linhas) {
    const l = raw.trim();
    if (!l) continue;
    const lower = l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Bateria: "Saude bateria 88%" ou "Ciclos de bateria: 250"
    const batMatch = l.match(/(?:saude\s*bateria|saúde\s*bateria)\s*(\d{1,3})\s*%?/i) || l.match(/ciclos?\s*de\s*bateria[:\s]*(\d+)/i);
    if (batMatch && !out.bateria) { out.bateria = batMatch[1]; continue; }
    // Caixa
    if (/caixa/.test(lower)) {
      if (/sem\s+caixa/.test(lower)) out.caixaOriginal = "nao";
      else if (/tem\s+a?\s*caixa|com\s+caixa/.test(lower)) out.caixaOriginal = "sim";
      continue;
    }
    // Peças trocadas
    if (/pec[ao]\s+trocad|peca\s+trocada|peças\s+trocad|pe[çc]as?\s+trocad/i.test(l)) {
      out.pecasTrocadas = l;
      continue;
    }
    // Marcas de uso (positivas e negativas)
    if (/sem\s+marcas?\s+de\s+uso/.test(lower)) { out.marcasUso = "nao"; continue; }
    if (/marcas?\s+de\s+uso/.test(lower) || /arranh/.test(lower) || /descascad/.test(lower)) {
      marcasParts.push(l);
      continue;
    }
    out.outras.push(l);
  }
  if (marcasParts.length > 0 && out.marcasUso !== "nao") {
    out.marcasUso = marcasParts.join("; ");
  }
  return out;
}

/** Concatena tudo num bloco de observação livre legível. */
function buildTrocaObs(linhas: string[] | null | undefined): string {
  const p = parseCondicao(linhas);
  const parts: string[] = [];
  if (p.marcasUso === "nao") parts.push("Sem marcas de uso");
  else if (p.marcasUso) parts.push(`Marcas: ${p.marcasUso}`);
  if (p.pecasTrocadas) parts.push(p.pecasTrocadas);
  if (p.caixaOriginal === "sim") parts.push("Com caixa original");
  else if (p.caixaOriginal === "nao") parts.push("Sem caixa original");
  for (const o of p.outras) parts.push(o);
  return parts.join(" | ");
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminPage() {
  const { password, user } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SimulacaoRow[] | null>(null);
  const [tab, setTab] = useState<"todos" | "GOSTEI" | "SAIR" | "PENDENTE">("todos");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modalRow, setModalRow] = useState<SimulacaoRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [modalParcelasVisiveis, setModalParcelasVisiveis] = useState<number[] | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<"todos" | "hoje" | "ontem" | "7dias" | "30dias" | "mes" | "personalizado">("todos");
  const [filterModelo, setFilterModelo] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [mainTab, setMainTab] = useState<"simulacoes" | "historico" | "followup" | "funil" | "perguntas" | "simulador">("simulacoes");
  const [followUpLoading, setFollowUpLoading] = useState<string | null>(null);
  // Histórico: clientes que passaram por todo o funil (simulação → gostei → link gerado → formulário preenchido → chegou no WhatsApp)
  interface HistoricoItem {
    id: string;
    created_at: string;
    short_code: string;
    tipo: string;
    cliente_nome: string;
    cliente_telefone: string;
    cliente_cpf: string | null;
    cliente_email: string | null;
    produto: string;
    produtos_extras: string | null;
    cor: string | null;
    valor: number;
    desconto: number;
    entrada: number;
    forma_pagamento: string | null;
    parcelas: string | null;
    status: string;
    cliente_preencheu_em: string | null;
    cliente_dados_preenchidos: Record<string, string> | null;
    pagamento_pago: string | null;
    vendedor: string | null;
    operador: string | null;
    troca_produto: string | null;
    troca_valor: number | null;
    troca_condicao: string | null;
    troca_cor: string | null;
    troca_produto2: string | null;
    troca_valor2: number | null;
    troca_condicao2: string | null;
    troca_cor2: string | null;
    simulacao_id: string | null;
    entrega_id: string | null;
    observacao: string | null;
  }
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoBusca, setHistoricoBusca] = useState("");
  const [encaminhando, setEncaminhando] = useState<string | null>(null);
  const [historicoModal, setHistoricoModal] = useState<HistoricoItem | null>(null);
  // Modal "Gerar Entrega": coleta data/horário/entregador/obs, pré-preenchidos do formulário do cliente
  const [gerarEntregaItem, setGerarEntregaItem] = useState<HistoricoItem | null>(null);
  const [gerarData, setGerarData] = useState("");
  const [gerarHorario, setGerarHorario] = useState("");
  const [gerarEntregador, setGerarEntregador] = useState("");
  const [gerarObs, setGerarObs] = useState("");

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": pw },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? []);
      } else {
        // Evitar tela em branco — setar array vazio se erro
        setData([]);
      }
    } catch {
      setData([]);
    }
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(password);
    setRefreshing(false);
  };

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);
  useAutoRefetch(useCallback(() => { if (password) fetchData(password); }, [password, fetchData]), !!password);

  // Fetch histórico (link_compras com formulário preenchido + simulações GOSTEI sem link)
  const fetchHistorico = useCallback(async () => {
    if (!password) return;
    setHistoricoLoading(true);
    try {
      // 1) Link_compras com formulário preenchido OU auto-criados pelo simulador de trade-in.
      //    incluir_simulador=1 pega também os GOSTEI onde o cliente enviou o formulário
      //    completo só pelo WhatsApp (cliente_preencheu_em null mas operador=Simulador).
      const res = await fetch("/api/admin/link-compras?preenchidos=1&incluir_simulador=1&limit=500", {
        headers: { "x-admin-password": password },
      });
      let items: HistoricoItem[] = [];
      if (res.ok) {
        const json = await res.json();
        items = (json.data || []).filter((r: HistoricoItem) =>
          r.cliente_preencheu_em || r.operador === "Simulador"
        );
      }

      // 2) Simulações GOSTEI que não têm link_compras — converter para HistoricoItem
      // Pegar telefones já presentes nos link_compras
      const linkTels = new Set(items.map(i => (i.cliente_telefone || "").replace(/\D/g, "").slice(-8)).filter(t => t.length >= 8));
      const linkSimIds = new Set(items.map(i => i.simulacao_id).filter(Boolean));
      const gosteiFiltrado = (data || []).filter(s =>
        s.status === "GOSTEI" &&
        !linkSimIds.has(s.id) &&
        !(s.whatsapp && linkTels.has(s.whatsapp.replace(/\D/g, "").slice(-8)))
      );
      // Dedup por telefone (pegar só o mais recente)
      const seen = new Set<string>();
      for (const s of gosteiFiltrado) {
        const tel8 = (s.whatsapp || "").replace(/\D/g, "").slice(-8);
        if (tel8 && seen.has(tel8)) continue;
        if (tel8) seen.add(tel8);
        items.push({
          id: `sim_${s.id}`,
          created_at: s.created_at,
          short_code: "",
          tipo: "TROCA",
          cliente_nome: s.nome,
          cliente_telefone: s.whatsapp,
          cliente_cpf: null,
          cliente_email: null,
          produto: `${s.modelo_novo} ${s.storage_novo}`.trim(),
          produtos_extras: null,
          cor: null,
          valor: s.preco_novo || 0,
          desconto: 0,
          entrada: 0,
          forma_pagamento: s.forma_pagamento || null,
          parcelas: null,
          status: "GOSTEI",
          cliente_preencheu_em: s.created_at,
          cliente_dados_preenchidos: null,
          pagamento_pago: null,
          vendedor: s.vendedor || null,
          operador: null,
          troca_produto: `${s.modelo_usado} ${s.storage_usado}`.trim(),
          troca_valor: s.avaliacao_usado || 0,
          troca_condicao: Array.isArray(s.condicao_linhas) ? s.condicao_linhas.join(" | ") : null,
          troca_cor: s.cor_usado || null,
          troca_produto2: s.modelo_usado2 ? `${s.modelo_usado2} ${s.storage_usado2 || ""}`.trim() : null,
          troca_valor2: s.avaliacao_usado2 || 0,
          troca_condicao2: Array.isArray(s.condicao_linhas2) ? s.condicao_linhas2.join(" | ") : null,
          troca_cor2: s.cor_usado2 || null,
          simulacao_id: s.id,
          entrega_id: null,
          observacao: null,
        });
      }

      setHistorico(items);
    } catch { /* silent */ }
    setHistoricoLoading(false);
  }, [password, data]);

  useEffect(() => {
    if (mainTab === "historico" && data && data.length > 0) fetchHistorico();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, data?.length, password]);

  // Abre o modal de Gerar Entrega com dados pré-preenchidos do formulário do cliente.
  // Se o item é um "sim_" (simulação sem link_compras), tenta achar um link_compras
  // real com o mesmo telefone. Prioriza link com cliente_dados_preenchidos; se não
  // tiver, aceita um link auto-criado pelo simulador (operador=Simulador) — nesse
  // caso o admin vai precisar conferir endereço no WhatsApp.
  const openGerarEntrega = useCallback((h: HistoricoItem) => {
    let target = h;
    if (h.id.startsWith("sim_")) {
      const tel8 = (h.cliente_telefone || "").replace(/\D/g, "").slice(-8);
      const candidatos = tel8.length >= 8
        ? historico.filter(x => !x.id.startsWith("sim_")
            && (x.cliente_telefone || "").replace(/\D/g, "").slice(-8) === tel8)
        : [];
      // Prefere link com formulário completo preenchido
      const comForm = candidatos.find(x => x.cliente_dados_preenchidos);
      const qualquer = candidatos[0] || null;
      const real = comForm || qualquer;
      if (real) {
        target = real;
      } else {
        alert("⚠️ Esse cliente só tem simulação — ainda não chegou ao formulário de compra. Peça pra ele clicar em 'DESEJO FECHAR MEU PEDIDO' na simulação.");
        return;
      }
    }
    const p = target.cliente_dados_preenchidos || {};
    // Data de entrega: preferir o que o cliente informou; senão, hoje
    let dataDefault = "";
    const pd = (p.data_entrega || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(pd)) {
      dataDefault = pd.slice(0, 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(pd)) {
      const [d, m, y] = pd.split("/");
      dataDefault = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (!dataDefault) {
      const hoje = new Date();
      dataDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    }
    setGerarData(dataDefault);
    setGerarHorario((p.horario || "").trim());
    setGerarEntregador("");
    setGerarObs("");
    setGerarEntregaItem(target);
  }, [historico]);

  const confirmarGerarEntrega = async () => {
    if (!gerarEntregaItem) return;
    if (!gerarData) { alert("Informe a data da entrega"); return; }
    setEncaminhando(gerarEntregaItem.id);
    try {
      const res = await fetch("/api/admin/link-compras/encaminhar-entrega", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
        body: JSON.stringify({
          link_id: gerarEntregaItem.id,
          data_entrega: gerarData,
          horario: gerarHorario || null,
          entregador: gerarEntregador || null,
          observacao: gerarObs || null,
        }),
      });
      if (res.ok) {
        const id = gerarEntregaItem.id;
        setHistorico(prev => prev.map(x => x.id === id ? { ...x, status: "ENCAMINHADO", entrega_id: "created" } : x));
        setHistoricoModal(prev => prev && prev.id === id ? { ...prev, status: "ENCAMINHADO", entrega_id: "created" } : prev);
        setGerarEntregaItem(null);
        alert("✅ Entrega criada com sucesso! Veja em Entregas.");
      } else {
        const json = await res.json();
        alert("Erro: " + (json.error || "Falha"));
      }
    } catch (err) { alert("Erro: " + String(err)); }
    setEncaminhando(null);
  };

  // Unique models for filter dropdown — must be before any early return (Rules of Hooks)
  const uniqueModelos = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((d) => d.modelo_novo))].sort();
  }, [data]);

  if (loading && data === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#86868B]">Carregando...</p>
      </div>
    );
  }

  if (!data) return null;

  // --- STATS ---
  const total = data.length;
  const gostei = data.filter((d) => d.status === "GOSTEI").length;
  const saiu = data.filter((d) => d.status === "SAIR").length;
  const conversao = total > 0 ? Math.round((gostei / total) * 100) : 0;
  const ticketMedio = total > 0
    ? Math.round(data.reduce((acc, d) => acc + d.diferenca, 0) / total)
    : 0;
  const totalValor = data.reduce((acc, d) => acc + d.diferenca, 0);

  // Top modelos
  const modeloCount: Record<string, number> = {};
  data.forEach((d) => {
    const key = `${d.modelo_novo} ${d.storage_novo}`;
    modeloCount[key] = (modeloCount[key] || 0) + 1;
  });
  const topModelos = Object.entries(modeloCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const maxModeloCount = topModelos[0]?.[1] ?? 1;

  const pendente = data.filter((d) => !d.contatado).length;

  // Filtered rows
  const filtered = data.filter((d) => {
    if (tab === "PENDENTE") return !d.contatado;
    if (tab !== "todos" && d.status !== tab) return false;

    if (search) {
      const s = search.toLowerCase();
      const match =
        d.nome?.toLowerCase().includes(s) ||
        d.whatsapp?.includes(s) ||
        d.modelo_novo?.toLowerCase().includes(s) ||
        d.modelo_usado?.toLowerCase().includes(s);
      if (!match) return false;
    }

    if (filterModelo && d.modelo_novo !== filterModelo) return false;

    // Extrair data YYYY-MM-DD do created_at (suporta timestamp e date string)
    const raw = d.created_at || "";
    // Se for "2026-03-24T14:30:00Z" ou "2026-03-24T14:30:00+00:00" → extrair data local
    // Se for "2026-03-24" (só data) → usar direto
    let createdDateStr: string;
    if (raw.includes("T") || raw.includes(" ")) {
      // É timestamp — converter para data local do browser
      const dt = new Date(raw);
      createdDateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    } else {
      createdDateStr = raw.substring(0, 10); // "2026-03-24"
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (filterPeriod === "hoje") {
      if (createdDateStr !== todayStr) return false;
    } else if (filterPeriod === "ontem") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
      if (createdDateStr !== yStr) return false;
    } else if (filterPeriod === "7dias") {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      const sStr = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
      if (createdDateStr < sStr) return false;
    } else if (filterPeriod === "30dias") {
      const s = new Date(now); s.setDate(s.getDate() - 30);
      const sStr = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
      if (createdDateStr < sStr) return false;
    } else if (filterPeriod === "mes") {
      if (!createdDateStr.startsWith(todayStr.substring(0, 7))) return false;
    } else if (filterPeriod === "personalizado") {
      if (filterFrom && createdDateStr < filterFrom) return false;
      if (filterTo && createdDateStr > filterTo) return false;
    }

    return true;
  });

  const hasActiveFilter = filterPeriod !== "todos" || filterModelo !== "";

  const kpis = [
    { label: "Total simulações", value: total, color: "#E8740E", icon: "📊" },
    { label: "Fecharam pedido", value: gostei, color: "#2ECC71", icon: "✅" },
    { label: "Saíram sem fechar", value: saiu, color: "#E74C3C", icon: "🚪" },
    { label: "Conversão", value: `${conversao}%`, color: "#3498DB", icon: "📈" },
    { label: "Ticket médio PIX", value: fmt(ticketMedio), color: "#9B59B6", icon: "💵" },
    { label: "Valor em negociação", value: fmt(totalValor), color: "#F39C12", icon: "💰" },
  ];

  return (
    <div className="space-y-6">
      {/* Main tabs: Simulações / Funil */}
      <div className="flex gap-2 items-center flex-wrap">
        {(["simulacoes", "historico", "simulador", "followup", "funil", "perguntas"] as const).map((t) => (
          <button key={t} onClick={() => setMainTab(t)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mainTab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t === "simulacoes" ? "Simulacoes" : t === "historico" ? `📋 Histórico de Formulários (${historico.length})` : t === "simulador" ? "Simulador Interno" : t === "followup" ? `Follow-up (${data.filter(d => d.status === "SAIR" && !d.follow_up_enviado).length})` : t === "perguntas" ? "Perguntas Trade-In" : "Funil de Conversao"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
        >
          {refreshing ? "↻ Atualizando..." : "↻ Atualizar"}
        </button>
      </div>

      {/* Funil tab — rendered inline */}
      {mainTab === "funil" && <FunnelPanel />}

      {/* Histórico — clientes que completaram todo o funil */}
      {mainTab === "historico" && (() => {
        // Filtro por nome/whatsapp (digits-insensitive)
        const qRaw = historicoBusca.trim().toLowerCase();
        const qDigits = qRaw.replace(/\D/g, "");
        const filtrados = historico.filter(h => {
          if (!qRaw) return true;
          const nome = (h.cliente_nome || "").toLowerCase();
          const tel = (h.cliente_telefone || "").replace(/\D/g, "");
          if (nome.includes(qRaw)) return true;
          if (qDigits.length >= 3 && tel.includes(qDigits)) return true;
          return false;
        });
        // Ordena do mais recente pro mais antigo por data de preenchimento (ou criação)
        const ordenados = [...filtrados].sort((a, b) =>
          (b.cliente_preencheu_em || b.created_at).localeCompare(a.cliente_preencheu_em || a.created_at)
        );
        // Agrupa por dia (YYYY-MM-DD em America/Sao_Paulo)
        const dayKey = (iso: string) => {
          const d = new Date(iso);
          const saoPaulo = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
          const yyyy = saoPaulo.getFullYear();
          const mm = String(saoPaulo.getMonth() + 1).padStart(2, "0");
          const dd = String(saoPaulo.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        };
        const grupos = new Map<string, HistoricoItem[]>();
        for (const h of ordenados) {
          const k = dayKey(h.cliente_preencheu_em || h.created_at);
          const arr = grupos.get(k) || [];
          arr.push(h);
          grupos.set(k, arr);
        }
        const gruposOrdenados = Array.from(grupos.entries()).sort((a, b) => b[0].localeCompare(a[0]));
        const hojeKey = dayKey(new Date().toISOString());
        const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
        const ontemKey = dayKey(ontem.toISOString());
        const formatDiaHeader = (k: string) => {
          if (k === hojeKey) return "Hoje";
          if (k === ontemKey) return "Ontem";
          const [y, m, d] = k.split("-");
          return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        };
        return (
        <div className="space-y-4">
          <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-[#1D1D1F]">📋 Histórico de Formulários — Clientes que completaram o funil</h2>
              <button onClick={fetchHistorico} disabled={historicoLoading} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8740E] hover:text-white transition-colors disabled:opacity-50">
                {historicoLoading ? "Carregando..." : "↻ Atualizar"}
              </button>
            </div>
            <p className="px-5 pt-3 text-xs text-[#86868B]">
              Clientes que fizeram simulação → clicaram &quot;Gostei, fechar pedido&quot; → preencheram o formulário de compra → chegaram no WhatsApp
            </p>
            <div className="px-5 py-3 flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={historicoBusca}
                  onChange={(e) => setHistoricoBusca(e.target.value)}
                  placeholder="🔍 Buscar por nome ou WhatsApp..."
                  className="w-full pl-3 pr-8 py-2 text-sm border border-[#D2D2D7] rounded-lg focus:outline-none focus:border-[#E8740E]"
                />
                {historicoBusca && (
                  <button
                    onClick={() => setHistoricoBusca("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#E8740E] text-sm"
                    title="Limpar"
                  >✕</button>
                )}
              </div>
              <span className="text-xs text-[#86868B]">
                {filtrados.length === historico.length
                  ? `${historico.length} ${historico.length === 1 ? "registro" : "registros"}`
                  : `${filtrados.length} de ${historico.length}`}
              </span>
            </div>
          </div>
          {historicoLoading && historico.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#86868B] bg-white border border-[#D2D2D7] rounded-2xl">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#86868B] bg-white border border-[#D2D2D7] rounded-2xl">
              {historico.length === 0 ? "Nenhum cliente completou o funil ainda" : "Nenhum cliente encontrado para a busca"}
            </div>
          ) : (
            gruposOrdenados.map(([diaKey, itens]) => (
              <div key={diaKey} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-gradient-to-r from-[#FFF4EC] to-white border-b border-[#D2D2D7] flex items-center justify-between">
                  <h3 className="font-bold text-sm text-[#1D1D1F] capitalize">🗓️ {formatDiaHeader(diaKey)}</h3>
                  <span className="text-xs text-[#86868B]">{itens.length} {itens.length === 1 ? "cliente" : "clientes"}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                        {["Data", "Cliente", "WhatsApp", "Produto", "Valor", "Pagamento", "Troca", "Preencheu em", "Status", "Ações"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#86868B]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(h => {
                    const preencheuDate = h.cliente_preencheu_em ? new Date(h.cliente_preencheu_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
                    const criadoDate = new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
                    const valorFinal = Number(h.valor || 0) - Number(h.desconto || 0);
                    // Puxar dados de troca: 1) do link_compras, 2) da simulação por ID, 3) da simulação por telefone/nome
                    const hTel = (h.cliente_telefone || "").replace(/\D/g, "");
                    const hNome = (h.cliente_nome || "").toLowerCase().trim();
                    const sim = (h.simulacao_id ? data.find(s => s.id === h.simulacao_id) : null)
                      || (hTel.length >= 8 ? data.find(s => s.whatsapp && s.whatsapp.replace(/\D/g, "").includes(hTel.slice(-8))) : null)
                      || (hNome.length >= 3 ? data.find(s => s.nome && s.nome.toLowerCase().trim().includes(hNome.split(" ")[0])) : null)
                      || null;
                    const trocaNome = h.troca_produto || (sim ? `${sim.modelo_usado} ${sim.storage_usado}`.trim() : null);
                    const trocaValDisplay = Number(h.troca_valor || 0) || (sim?.avaliacao_usado || 0);
                    const trocaNome2 = h.troca_produto2 || (sim?.modelo_usado2 ? `${sim.modelo_usado2} ${sim.storage_usado2 || ""}`.trim() : null);
                    const trocaVal2Display = Number(h.troca_valor2 || 0) || (sim?.avaliacao_usado2 || 0);
                    const trocaTotalDisplay = trocaValDisplay + trocaVal2Display;
                    const statusLabel = h.entrega_id ? "🚚 Entrega criada" : h.pagamento_pago ? "✅ Pago" : h.status === "CONVERTIDO" || h.status === "ENCAMINHADO" ? "✅ Convertido" : h.status === "GOSTEI" ? "💚 Gostei" : "📝 Preenchido";
                    const statusColor = h.entrega_id || h.status === "ENCAMINHADO" ? "bg-green-100 text-green-700" : h.pagamento_pago || h.status === "CONVERTIDO" ? "bg-green-100 text-green-700" : h.status === "GOSTEI" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700";
                    return (
                      <tr key={h.id} className="border-b border-[#F5F5F7] hover:bg-[#FAFAFA] transition-colors">
                        <td className="px-3 py-3 text-xs text-[#86868B] whitespace-nowrap">{criadoDate}</td>
                        <td className="px-3 py-3 text-sm">
                          <button onClick={() => setHistoricoModal(h)} className="text-left hover:text-[#E8740E] transition-colors">
                            <p className="font-medium uppercase underline decoration-dotted underline-offset-2">{h.cliente_nome}</p>
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {h.cliente_telefone ? (
                            <a href={`https://wa.me/55${h.cliente_telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-800 text-xs font-mono">{h.cliente_telefone}</a>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs max-w-[200px]">
                          <p className="truncate font-medium">{h.produto}</p>
                          {h.cor && <p className="text-[10px] text-[#86868B]">{h.cor}</p>}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-[#E8740E] whitespace-nowrap">R$ {valorFinal.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-3 text-xs text-[#86868B]">
                          {h.forma_pagamento || "—"}
                          {h.parcelas && Number(h.parcelas) > 1 && <span className="block text-[10px]">{h.parcelas}x</span>}
                          {Number(h.entrada || 0) > 0 && <span className="block text-[10px] text-green-600">Entrada: R$ {Number(h.entrada).toLocaleString("pt-BR")}</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {trocaNome ? (
                            <div>
                              <p className="text-purple-600">🔄 {trocaNome}</p>
                              {trocaValDisplay > 0 && <p className="text-[10px] font-semibold text-purple-700">R$ {trocaValDisplay.toLocaleString("pt-BR")}</p>}
                              {trocaNome2 && (
                                <>
                                  <p className="text-purple-500 text-[10px] mt-0.5">🔄 {trocaNome2}</p>
                                  {trocaVal2Display > 0 && <p className="text-[10px] text-purple-600">R$ {trocaVal2Display.toLocaleString("pt-BR")}</p>}
                                </>
                              )}
                              {trocaTotalDisplay > 0 && trocaNome2 && <p className="text-[10px] font-bold text-purple-800 mt-0.5">Total: R$ {trocaTotalDisplay.toLocaleString("pt-BR")}</p>}
                            </div>
                          ) : <span className="text-[#C0C0C5]">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-[#86868B] whitespace-nowrap">{preencheuDate}</td>
                        <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${statusColor}`}>{statusLabel}</span></td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            {!h.entrega_id && h.status !== "ENCAMINHADO" && (
                              <button
                                disabled={encaminhando === h.id}
                                onClick={() => openGerarEntrega(h)}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                {encaminhando === h.id ? "Criando..." : "🚚 Gerar Entrega"}
                              </button>
                            )}
                            {h.entrega_id && <span className="text-[10px] text-green-600 font-semibold">✅ Entrega criada</span>}
                            <span className="text-[10px] text-[#C0C0C5]">{h.vendedor || h.operador || ""}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
        );
      })()}

      {/* Modal detalhado do Histórico */}
      {historicoModal && (() => {
        const h = historicoModal;
        const p = h.cliente_dados_preenchidos || {};
        const hTel = (h.cliente_telefone || "").replace(/\D/g, "");
        const hNome = (h.cliente_nome || "").toLowerCase().trim();
        const sim = (h.simulacao_id ? data.find(s => s.id === h.simulacao_id) : null)
          || (hTel.length >= 8 ? data.find(s => s.whatsapp && s.whatsapp.replace(/\D/g, "").includes(hTel.slice(-8))) : null)
          || (hNome.length >= 3 ? data.find(s => s.nome && s.nome.toLowerCase().trim().includes(hNome.split(" ")[0])) : null)
          || null;
        const trocaNome = h.troca_produto || (sim ? `${sim.modelo_usado} ${sim.storage_usado}`.trim() : null);
        const trocaVal = Number(h.troca_valor || 0) || (sim?.avaliacao_usado || 0);
        const trocaCor = h.troca_cor || sim?.cor_usado || null;
        const trocaCond = h.troca_condicao || (sim?.condicao_linhas ? sim.condicao_linhas.join(" | ") : null);
        const trocaNome2 = h.troca_produto2 || (sim?.modelo_usado2 ? `${sim.modelo_usado2} ${sim.storage_usado2 || ""}`.trim() : null);
        const trocaVal2 = Number(h.troca_valor2 || 0) || (sim?.avaliacao_usado2 || 0);
        const trocaCor2 = h.troca_cor2 || sim?.cor_usado2 || null;
        const trocaCond2 = h.troca_condicao2 || (sim?.condicao_linhas2 ? sim.condicao_linhas2.join(" | ") : null);
        const valorFinal = Number(h.valor || 0) - Number(h.desconto || 0);
        const formatDate = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
        const Row = ({ label, value, color }: { label: string; value: string | number | null | undefined; color?: string }) => (
          value ? <div className="flex justify-between py-1.5 border-b border-[#F5F5F7]"><span className="text-[#86868B] text-xs">{label}</span><span className={`text-sm font-medium ${color || "text-[#1D1D1F]"}`}>{value}</span></div> : null
        );
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoricoModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
                <h3 className="font-bold text-[#1D1D1F] text-lg">Detalhes do Cliente</h3>
                <button onClick={() => setHistoricoModal(null)} className="text-[#86868B] hover:text-[#1D1D1F] text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F7]">&times;</button>
              </div>
              <div className="p-5 space-y-4">
                {/* Dados do Cliente */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Cliente</h4>
                  <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                    <Row label="Nome" value={h.cliente_nome?.toUpperCase()} />
                    <Row label="CPF" value={h.cliente_cpf || p.cpf} />
                    {p.cnpj && <Row label="CNPJ" value={p.cnpj} />}
                    <Row label="Telefone" value={h.cliente_telefone} />
                    <Row label="Email" value={h.cliente_email || p.email} />
                    {p.instagram && <Row label="Instagram" value={p.instagram} />}
                  </div>
                </div>

                {/* Endereço */}
                {(p.endereco || p.cep) && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Endereço</h4>
                    <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                      <Row label="CEP" value={p.cep} />
                      <Row label="Endereço" value={[p.endereco, p.numero].filter(Boolean).join(", ")} />
                      {p.complemento && <Row label="Complemento" value={p.complemento} />}
                      <Row label="Bairro" value={p.bairro} />
                    </div>
                  </div>
                )}

                {/* Produto */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Produto Novo</h4>
                  <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                    <Row label="Produto" value={h.produto} />
                    {h.cor && <Row label="Cor" value={h.cor} />}
                    <Row label="Valor" value={`R$ ${valorFinal.toLocaleString("pt-BR")}`} color="text-[#E8740E] font-bold" />
                    {Number(h.desconto || 0) > 0 && <Row label="Desconto" value={`R$ ${Number(h.desconto).toLocaleString("pt-BR")}`} color="text-red-500" />}
                  </div>
                </div>

                {/* Pagamento */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Pagamento</h4>
                  <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                    <Row label="Forma" value={h.forma_pagamento || p.forma_pagamento} />
                    {(h.parcelas && Number(h.parcelas) > 1) && <Row label="Parcelas" value={`${h.parcelas}x`} />}
                    {Number(h.entrada || 0) > 0 && <Row label="Entrada" value={`R$ ${Number(h.entrada).toLocaleString("pt-BR")}`} color="text-green-600" />}
                    <Row label="Status" value={h.pagamento_pago ? "Pago" : "Pendente"} color={h.pagamento_pago ? "text-green-600" : "text-yellow-600"} />
                  </div>
                </div>

                {/* Troca */}
                {trocaNome && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Aparelho na Troca</h4>
                    <div className="bg-purple-50 rounded-xl p-3 space-y-0.5">
                      <Row label="Aparelho 1" value={trocaNome} color="text-purple-700" />
                      {trocaCor && <Row label="Cor" value={trocaCor} />}
                      {trocaVal > 0 && <Row label="Avaliação" value={`R$ ${trocaVal.toLocaleString("pt-BR")}`} color="text-purple-700 font-bold" />}
                      {trocaCond && <Row label="Condição" value={trocaCond} />}
                      {trocaNome2 && (
                        <>
                          <div className="border-t border-purple-200 my-2" />
                          <Row label="Aparelho 2" value={trocaNome2} color="text-purple-600" />
                          {trocaCor2 && <Row label="Cor" value={trocaCor2} />}
                          {trocaVal2 > 0 && <Row label="Avaliação" value={`R$ ${trocaVal2.toLocaleString("pt-BR")}`} color="text-purple-600 font-bold" />}
                          {trocaCond2 && <Row label="Condição" value={trocaCond2} />}
                        </>
                      )}
                      {(trocaVal + trocaVal2) > 0 && trocaNome2 && (
                        <div className="border-t border-purple-300 pt-1.5 mt-1">
                          <Row label="Total Troca" value={`R$ ${(trocaVal + trocaVal2).toLocaleString("pt-BR")}`} color="text-purple-800 font-bold" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Entrega */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Entrega / Logística</h4>
                  <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                    <Row label="Local" value={p.local} />
                    <Row label="Data Entrega" value={p.data_entrega} />
                    <Row label="Horário" value={p.horario} />
                    <Row label="Vendedor" value={h.vendedor || p.vendedor} />
                    <Row label="Operador" value={h.operador} />
                    <Row label="Entrega" value={h.entrega_id ? "Criada" : "Pendente"} color={h.entrega_id ? "text-green-600" : "text-yellow-600"} />
                  </div>
                </div>

                {/* Datas */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Datas</h4>
                  <div className="bg-[#F5F5F7] rounded-xl p-3 space-y-0.5">
                    <Row label="Link criado em" value={formatDate(h.created_at)} />
                    <Row label="Formulário preenchido em" value={formatDate(h.cliente_preencheu_em)} />
                  </div>
                </div>

                {/* Observação */}
                {h.observacao && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#86868B] mb-2 tracking-wider">Observação</h4>
                    <div className="bg-yellow-50 rounded-xl p-3 text-sm text-[#1D1D1F]">{h.observacao}</div>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  {h.cliente_telefone && (
                    <a href={`https://wa.me/55${h.cliente_telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold text-center transition-colors">
                      WhatsApp
                    </a>
                  )}
                  {!h.entrega_id && h.status !== "ENCAMINHADO" && (
                    <button
                      disabled={encaminhando === h.id}
                      onClick={() => openGerarEntrega(h)}
                      className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold text-center transition-colors disabled:opacity-50"
                    >
                      {encaminhando === h.id ? "Criando..." : "🚚 Gerar Entrega"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Gerar Entrega — pré-preenchido com dados do formulário */}
      {gerarEntregaItem && (() => {
        const h = gerarEntregaItem;
        const p = h.cliente_dados_preenchidos || {};
        const hTel = (h.cliente_telefone || "").replace(/\D/g, "");
        const hNome = (h.cliente_nome || "").toLowerCase().trim();
        const sim = (h.simulacao_id ? data.find(s => s.id === h.simulacao_id) : null)
          || (hTel.length >= 8 ? data.find(s => s.whatsapp && s.whatsapp.replace(/\D/g, "").includes(hTel.slice(-8))) : null)
          || (hNome.length >= 3 ? data.find(s => s.nome && s.nome.toLowerCase().trim().includes(hNome.split(" ")[0])) : null)
          || null;
        const trocaNome = h.troca_produto || (sim ? `${sim.modelo_usado} ${sim.storage_usado}`.trim() : null);
        const trocaVal = Number(h.troca_valor || 0) || (sim?.avaliacao_usado || 0);
        const trocaCor = h.troca_cor || sim?.cor_usado || null;
        const trocaCond = h.troca_condicao || (sim?.condicao_linhas ? sim.condicao_linhas.join(" | ") : null);
        const trocaNome2 = h.troca_produto2 || (sim?.modelo_usado2 ? `${sim.modelo_usado2} ${sim.storage_usado2 || ""}`.trim() : null);
        const trocaVal2 = Number(h.troca_valor2 || 0) || (sim?.avaliacao_usado2 || 0);
        const trocaCor2 = h.troca_cor2 || sim?.cor_usado2 || null;
        const trocaCond2 = h.troca_condicao2 || (sim?.condicao_linhas2 ? sim.condicao_linhas2.join(" | ") : null);
        const endLinha1 = [p.endereco, p.numero].filter(Boolean).join(", ")
          + (p.complemento ? ` - ${p.complemento}` : "");
        const valorFinal = Number(h.valor || 0) - Number(h.desconto || 0);
        const cpfCnpj = h.cliente_cpf || p.cpf || p.cnpj || null;
        const email = h.cliente_email || p.email || null;
        return (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setGerarEntregaItem(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
                <h3 className="font-bold text-[#1D1D1F] text-lg">🚚 Gerar Entrega</h3>
                <button onClick={() => setGerarEntregaItem(null)} className="text-[#86868B] hover:text-[#1D1D1F] text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F7]">&times;</button>
              </div>
              <div className="p-5 space-y-4">
                {/* Aviso quando o formulário completo não foi salvo no banco
                    (cliente preencheu via Trade-in e mandou direto pelo WhatsApp). */}
                {!h.cliente_dados_preenchidos && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 text-xs text-yellow-900">
                    <p className="font-bold mb-1">⚠️ Cliente fez simulação de Trade-in e enviou o formulário completo pelo WhatsApp.</p>
                    <p>Endereço, CEP, CPF e outros dados pessoais NÃO ficaram salvos no banco (fluxo antigo). Confira esses dados no WhatsApp dele antes de confirmar, ou crie a entrega manualmente em <b>Entregas</b>.</p>
                  </div>
                )}
                {/* Dados do formulário (read-only, só pra conferir) */}
                <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-3 text-xs">
                  <p className="font-bold text-[#1D1D1F] text-sm">📋 Dados do formulário enviado pelo cliente</p>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868B] mb-1">Cliente</p>
                    <div className="space-y-0.5">
                      <p><span className="text-[#86868B]">Nome:</span> <b>{(h.cliente_nome || "—").toUpperCase()}</b></p>
                      {cpfCnpj && <p><span className="text-[#86868B]">{p.cnpj ? "CNPJ" : "CPF"}:</span> {cpfCnpj}</p>}
                      {h.cliente_telefone && <p><span className="text-[#86868B]">WhatsApp:</span> {h.cliente_telefone}</p>}
                      {email && <p><span className="text-[#86868B]">Email:</span> {email}</p>}
                      {p.instagram && <p><span className="text-[#86868B]">Instagram:</span> {p.instagram}</p>}
                    </div>
                  </div>

                  {(p.cep || p.endereco || p.bairro) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868B] mb-1">Endereço da entrega</p>
                      <div className="space-y-0.5">
                        {p.cep && <p><span className="text-[#86868B]">CEP:</span> {p.cep}</p>}
                        {endLinha1 && <p><span className="text-[#86868B]">Endereço:</span> {endLinha1}</p>}
                        {p.bairro && <p><span className="text-[#86868B]">Bairro:</span> {p.bairro}</p>}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868B] mb-1">Compra</p>
                    <div className="space-y-0.5">
                      <p><span className="text-[#86868B]">Produto novo:</span> <b>{h.produto}</b>{h.cor ? ` (${h.cor})` : ""}</p>
                      {valorFinal > 0 && <p><span className="text-[#86868B]">Valor:</span> <b className="text-[#E8740E]">R$ {valorFinal.toLocaleString("pt-BR")}</b></p>}
                      {h.forma_pagamento && <p><span className="text-[#86868B]">Pagamento:</span> {h.forma_pagamento}{h.parcelas && Number(h.parcelas) > 1 ? ` em ${h.parcelas}x` : ""}{Number(h.entrada || 0) > 0 ? ` (entrada R$ ${Number(h.entrada).toLocaleString("pt-BR")})` : ""}</p>}
                    </div>
                  </div>

                  {(trocaNome || trocaNome2) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868B] mb-1">Aparelho(s) na troca</p>
                      <div className="space-y-1">
                        {trocaNome && (
                          <div>
                            <p><span className="text-purple-700">🔄 {trocaNome}</span>{trocaCor ? ` — ${trocaCor}` : ""}{trocaVal > 0 ? ` — R$ ${trocaVal.toLocaleString("pt-BR")}` : ""}</p>
                            {trocaCond && <p className="text-[10px] text-purple-600 pl-5">{trocaCond}</p>}
                          </div>
                        )}
                        {trocaNome2 && (
                          <div>
                            <p><span className="text-purple-600">🔄 {trocaNome2}</span>{trocaCor2 ? ` — ${trocaCor2}` : ""}{trocaVal2 > 0 ? ` — R$ ${trocaVal2.toLocaleString("pt-BR")}` : ""}</p>
                            {trocaCond2 && <p className="text-[10px] text-purple-600 pl-5">{trocaCond2}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(p.local || p.data_entrega || p.horario) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868B] mb-1">Entrega escolhida pelo cliente</p>
                      <div className="space-y-0.5">
                        {p.local && <p><span className="text-[#86868B]">Local:</span> {p.local}</p>}
                        {p.data_entrega && <p><span className="text-[#86868B]">Data:</span> {p.data_entrega}</p>}
                        {p.horario && <p><span className="text-[#86868B]">Horário:</span> {p.horario}</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Campos editáveis */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-[#1D1D1F] block mb-1">Data da entrega *</label>
                    <input type="date" value={gerarData} onChange={(e) => setGerarData(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]" />
                    {p.data_entrega && (
                      <p className="text-[10px] text-[#86868B] mt-1">Sugerido pelo cliente: {p.data_entrega}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#1D1D1F] block mb-1">Horário</label>
                    <input type="time" value={gerarHorario} onChange={(e) => setGerarHorario(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]" />
                    {p.horario && (
                      <p className="text-[10px] text-[#86868B] mt-1">Sugerido pelo cliente: {p.horario}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#1D1D1F] block mb-1">Entregador (opcional)</label>
                    <input type="text" value={gerarEntregador} onChange={(e) => setGerarEntregador(e.target.value)}
                      placeholder="Ex: Bia, João..."
                      className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#1D1D1F] block mb-1">Observação extra (opcional)</label>
                    <textarea value={gerarObs} onChange={(e) => setGerarObs(e.target.value)}
                      placeholder="Dados da troca são adicionados automaticamente."
                      rows={2}
                      className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]" />
                  </div>
                </div>

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setGerarEntregaItem(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5E7] text-[#1D1D1F] text-sm font-semibold transition-colors">
                    Cancelar
                  </button>
                  <button onClick={confirmarGerarEntrega}
                    disabled={encaminhando === h.id || !gerarData}
                    className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                    {encaminhando === h.id ? "Criando..." : "✅ Confirmar e criar entrega"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Perguntas Trade-In tab */}
      {mainTab === "perguntas" && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm p-5">
          <h2 className="font-bold text-[#1D1D1F] mb-4">Perguntas do Simulador de Troca</h2>
          <TradeInQuestionsAdmin password={password} />
        </div>
      )}

      {/* WhatsApp Config tab */}
      {/* WhatsApp config removido — centralizado em /admin/configuracoes */}

      {/* Simulador Interno tab */}
      {mainTab === "simulador" && <SimuladorInterno password={password} />}

      {/* Follow-up tab */}
      {mainTab === "followup" && (() => {
        const followUpRows = data.filter(d => d.status === "SAIR" && !d.follow_up_enviado);
        const sentRows = data.filter(d => d.status === "SAIR" && d.follow_up_enviado);

        const buildFollowUpMsg = (row: SimulacaoRow) => {
          const msg = [
            `Ola! Sou consultor da TIGRAO IMPORTS`,
            ``,
            `Vi que voce realizou uma avaliacao de troca em nosso site.`,
            ``,
            `Seu aparelho: ${row.modelo_usado} ${row.storage_usado}`,
            `Aparelho novo: ${row.modelo_novo} ${row.storage_novo}`,
            `Sua cotacao: ${fmt(row.diferenca)}`,
            ``,
            `Sua cotacao ainda esta valida! Quer garantir?`,
            ``,
            `Estou a disposicao para qualquer duvida`,
          ].join("\n");
          return msg;
        };

        const handleFollowUp = async (row: SimulacaoRow) => {
          setFollowUpLoading(row.id);
          const num = row.whatsapp.replace(/\D/g, "");
          const full = num.startsWith("55") ? num : `55${num}`;
          const msg = buildFollowUpMsg(row);
          window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");

          // Mark as follow_up_enviado
          await fetch("/api/admin/followup", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
            body: JSON.stringify({ id: row.id }),
          });

          setData(prev => prev ? prev.map(r => r.id === row.id ? { ...r, follow_up_enviado: true } : r) : prev);
          setFollowUpLoading(null);
        };

        return (
          <div className="space-y-6">
            {/* Pending follow-ups */}
            <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">Pendentes de Follow-up</h3>
                  <p className="text-xs text-[#86868B] mt-0.5">Clientes que sairam sem fechar pedido</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{followUpRows.length} pendente{followUpRows.length !== 1 ? "s" : ""}</span>
              </div>

              {followUpRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-[#86868B]">
                  <p className="text-sm">Nenhum follow-up pendente</p>
                  <p className="text-xs mt-1">Todos os clientes ja foram contatados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                        {["Data", "Nome", "WhatsApp", "Aparelho usado", "Produto novo", "Cotacao PIX", "Acao"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {followUpRows.map(row => (
                        <tr key={row.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                          <td className="px-4 py-3 text-[#86868B] whitespace-nowrap text-xs">{fmtDate(row.created_at)}</td>
                          <td className="px-4 py-3 text-[#1D1D1F] font-medium whitespace-nowrap">{row.nome}</td>
                          <td className="px-4 py-3">
                            <a href={(() => { const n = row.whatsapp.replace(/\D/g, ""); return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`; })()} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline whitespace-nowrap">{row.whatsapp}</a>
                          </td>
                          <td className="px-4 py-3 text-[#6E6E73] whitespace-nowrap">{row.modelo_usado} {row.storage_usado}</td>
                          <td className="px-4 py-3 text-[#1D1D1F] whitespace-nowrap">{row.modelo_novo} {row.storage_novo}</td>
                          <td className="px-4 py-3 text-[#E8740E] font-bold whitespace-nowrap">{fmt(row.diferenca)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              disabled={followUpLoading === row.id}
                              onClick={() => handleFollowUp(row)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {followUpLoading === row.id ? "Enviando..." : "Enviar Follow-up"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Already sent follow-ups */}
            {sentRows.length > 0 && (
              <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1D1D1F]">Follow-ups Enviados</h3>
                    <p className="text-xs text-[#86868B] mt-0.5">Clientes que ja receberam follow-up</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">{sentRows.length} enviado{sentRows.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                        {["Data", "Nome", "WhatsApp", "Aparelho usado", "Produto novo", "Cotacao PIX", "Status"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sentRows.map(row => (
                        <tr key={row.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                          <td className="px-4 py-3 text-[#86868B] whitespace-nowrap text-xs">{fmtDate(row.created_at)}</td>
                          <td className="px-4 py-3 text-[#1D1D1F] font-medium whitespace-nowrap">{row.nome}</td>
                          <td className="px-4 py-3">
                            <a href={(() => { const n = row.whatsapp.replace(/\D/g, ""); return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`; })()} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline whitespace-nowrap">{row.whatsapp}</a>
                          </td>
                          <td className="px-4 py-3 text-[#6E6E73] whitespace-nowrap">{row.modelo_usado} {row.storage_usado}</td>
                          <td className="px-4 py-3 text-[#1D1D1F] whitespace-nowrap">{row.modelo_novo} {row.storage_novo}</td>
                          <td className="px-4 py-3 text-[#E8740E] font-bold whitespace-nowrap">{fmt(row.diferenca)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-semibold">
                              Enviado
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Simulacoes tab — existing content */}
      {mainTab === "simulacoes" && (<>
      {/* Refresh button - moved to tabs row */}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm"
          >
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <p className="text-[#86868B] text-xs mb-1">{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main table */}
        <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="px-5 py-4 border-b border-[#D2D2D7] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(["todos", "GOSTEI", "SAIR", "PENDENTE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t
                      ? t === "GOSTEI"
                        ? "bg-green-100 text-green-700"
                        : t === "SAIR"
                        ? "bg-red-100 text-red-600"
                        : t === "PENDENTE"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-orange-100 text-[#E8740E]"
                      : "text-[#86868B] hover:text-[#1D1D1F]"
                  }`}
                >
                  {t === "todos"
                    ? `Todos (${total})`
                    : t === "GOSTEI"
                    ? `Fecharam (${gostei})`
                    : t === "SAIR"
                    ? `Saíram (${saiu})`
                    : `Pendente (${pendente})`}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Buscar nome, WhatsApp, produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] border border-[#D2D2D7] text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors w-full sm:w-64"
            />
          </div>

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-[#D2D2D7] bg-[#FAFAFA] flex flex-wrap gap-3 items-center">
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mr-1">Período:</span>
              {(["todos", "hoje", "ontem", "7dias", "30dias", "mes", "personalizado"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterPeriod === p
                      ? "bg-[#E8740E] text-white"
                      : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"
                  }`}
                >
                  {p === "todos" ? "Tudo" : p === "hoje" ? "Hoje" : p === "ontem" ? "Ontem" : p === "7dias" ? "7 dias" : p === "30dias" ? "30 dias" : p === "mes" ? "Este mês" : "Personalizado"}
                </button>
              ))}
            </div>

            {filterPeriod === "personalizado" && (
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-[11px] text-[#86868B]">De:</span>
                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors" />
                <span className="text-[11px] text-[#86868B]">até:</span>
                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors" />
              </div>
            )}

            <div className="flex gap-1.5 items-center">
              <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">Modelo:</span>
              <select value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors">
                <option value="">Todos</option>
                {uniqueModelos.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>

            {hasActiveFilter && (
              <button onClick={() => { setFilterPeriod("todos"); setFilterModelo(""); setFilterFrom(""); setFilterTo(""); }} className="px-2.5 py-1 rounded-lg text-xs text-[#E74C3C] border border-[#E74C3C]/30 hover:bg-red-50 transition-colors ml-auto">
                Limpar filtros
              </button>
            )}

            {selected.size > 0 && (
              <button
                disabled={bulkDeleting}
                onClick={async () => {
                  if (!confirm(`Excluir ${selected.size} simulação(ões) selecionada(s)?`)) return;
                  setBulkDeleting(true);
                  await Promise.all([...selected].map((id) =>
                    fetch("/api/admin/simulacoes", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                      body: JSON.stringify({ id }),
                    })
                  ));
                  setData((prev) => prev ? prev.filter((r) => !selected.has(r.id)) : prev);
                  setSelected(new Set());
                  setBulkDeleting(false);
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 ml-auto"
              >
                {bulkDeleting ? "Excluindo..." : `Excluir ${selected.size} selecionado${selected.size !== 1 ? "s" : ""}`}
              </button>
            )}

            <span className={`text-[11px] text-[#86868B] ${selected.size > 0 ? "" : "ml-auto"}`}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(filtered.map((r) => r.id)));
                        else setSelected(new Set());
                      }}
                      className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                    />
                  </th>
                  {["Contato", "Data", "Nome", "WhatsApp", "Vendedor", "Produto novo", "Aparelho na troca", "Avaliação", "Diferença PIX", "Pagamento", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-[#86868B]">Nenhuma simulação encontrada</td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} onClick={() => { setModalRow(row); setModalParcelasVisiveis(null); setEditMode(false); }} className={`border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors cursor-pointer ${selected.has(row.id) ? "bg-orange-50" : ""}`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            setSelected(next);
                          }}
                          className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            onClick={() => {
                              setData((prev) => prev ? prev.map((r) => r.id === row.id ? { ...r, contatado: true } : r) : prev);
                              fetch("/api/admin/contatar", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                body: JSON.stringify({ id: row.id }),
                              });
                              const num = row.whatsapp.replace(/\D/g, "");
                              const full = num.startsWith("55") ? num : `55${num}`;
                              const condicoes = row.condicao_linhas?.join("\n") ?? "";
                              const msg = [
                                `Ola ${row.nome}!`,
                                ``,
                                `Vi que voce fez uma simulacao de trade-in aqui na TigraoimportsImports`,
                                ``,
                                `Produto novo: ${row.modelo_novo} ${row.storage_novo} (R$ ${row.preco_novo.toLocaleString("pt-BR")})`,
                                `Seu aparelho: ${row.modelo_usado} ${row.storage_usado}`,
                                ...(condicoes ? [condicoes] : []),
                                `Avaliacao: R$ ${row.avaliacao_usado.toLocaleString("pt-BR")}`,
                                `Diferenca no PIX: R$ ${row.diferenca.toLocaleString("pt-BR")}`,
                                ``,
                                `Posso te fazer uma proposta especial?`,
                              ].join("\n");
                              window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                          >
                            WhatsApp
                          </button>
                          {row.contatado && (
                            <span className="text-[10px] text-green-600 font-medium">Contatado</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#86868B] whitespace-nowrap text-xs">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 text-[#1D1D1F] font-medium whitespace-nowrap">{row.nome}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <a href={(() => { const n = row.whatsapp.replace(/\D/g, ""); return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`; })()} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline whitespace-nowrap">{row.whatsapp}</a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.vendedor ? (
                          <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">{row.vendedor}</span>
                        ) : (
                          <span className="text-[#86868B] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#1D1D1F] whitespace-nowrap">
                        {row.modelo_novo} {row.storage_novo}
                        <span className="text-[#86868B] ml-1 text-xs">({fmt(row.preco_novo)})</span>
                      </td>
                      <td className="px-4 py-3 text-[#6E6E73] whitespace-nowrap">{row.modelo_usado} {row.storage_usado}</td>
                      <td className="px-4 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(row.avaliacao_usado)}</td>
                      <td className="px-4 py-3 text-[#E8740E] font-bold whitespace-nowrap">{fmt(row.diferenca)}</td>
                      <td className="px-4 py-3 text-[#6E6E73] text-xs max-w-[160px] truncate">{row.forma_pagamento || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${row.status === "GOSTEI" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {row.status === "GOSTEI" ? "Fechou" : "Saiu"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          disabled={deleting === row.id}
                          onClick={async () => {
                            if (!confirm(`Excluir simulação de ${row.nome}?`)) return;
                            setDeleting(row.id);
                            await fetch("/api/admin/simulacoes", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                              body: JSON.stringify({ id: row.id }),
                            });
                            setData((prev) => prev ? prev.filter((r) => r.id !== row.id) : prev);
                            setDeleting(null);
                          }}
                          className="p-1.5 rounded-lg text-[#86868B] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Excluir"
                        >
                          {deleting === row.id ? "..." : "X"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top modelos */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Modelos mais buscados</h3>
            <div className="space-y-3">
              {topModelos.length === 0 ? (
                <p className="text-[#86868B] text-sm">Nenhum dado ainda</p>
              ) : (
                topModelos.map(([modelo, count]) => (
                  <div key={modelo}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#1D1D1F] truncate flex-1">{modelo}</span>
                      <span className="text-[#E8740E] font-bold ml-2">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[#E8E8ED] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#E8740E] to-[#F5A623] rounded-full transition-all" style={{ width: `${(count / maxModeloCount) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Por vendedor */}
          {(() => {
            const vendedorCount: Record<string, { total: number; gostei: number }> = {};
            data.forEach((d) => {
              const v = d.vendedor || "direto";
              if (!vendedorCount[v]) vendedorCount[v] = { total: 0, gostei: 0 };
              vendedorCount[v].total++;
              if (d.status === "GOSTEI") vendedorCount[v].gostei++;
            });
            const entries = Object.entries(vendedorCount).sort((a, b) => b[1].total - a[1].total);
            if (entries.length === 0) return null;
            return (
              <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Por Origem / Vendedor</h3>
                <div className="space-y-2">
                  {entries.map(([v, s]) => (
                    <div key={v} className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 capitalize">{v}</span>
                      <div className="text-right">
                        <span className="text-[#1D1D1F] font-bold text-sm">{s.total}</span>
                        <span className="text-green-600 text-xs ml-2">({s.gostei})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Últimas 24h */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Ultimas 24 horas</h3>
            {(() => {
              const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const recentes = data.filter((d) => new Date(d.created_at) > ontem);
              const recGostei = recentes.filter((d) => d.status === "GOSTEI").length;
              const recSair = recentes.filter((d) => d.status === "SAIR").length;
              return (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Simulacoes</span>
                    <span className="text-[#1D1D1F] font-bold">{recentes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Fecharam</span>
                    <span className="text-green-600 font-bold">{recGostei}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Sairam</span>
                    <span className="text-red-500 font-bold">{recSair}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModalRow(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setModalRow(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors text-sm font-bold"
            >
              X
            </button>

            <div className="p-6 space-y-5">
              {/* Header */}
              <div>
                <h2 className="text-lg font-bold text-[#1D1D1F] pr-8">Detalhes da Simulacao</h2>
                <p className="text-xs text-[#86868B] mt-1">{fmtDate(modalRow.created_at)}</p>
              </div>

              {/* Status badge */}
              <div>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${modalRow.status === "GOSTEI" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {modalRow.status === "GOSTEI" ? "Fechou pedido" : "Saiu sem fechar"}
                </span>
                {modalRow.vendedor && (
                  <span className="ml-2 px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">{modalRow.vendedor}</span>
                )}
              </div>

              {/* Customer info */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Cliente</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#86868B]">Nome:</span>
                    <p className="text-[#1D1D1F] font-medium">{modalRow.nome}</p>
                  </div>
                  <div>
                    <span className="text-[#86868B]">WhatsApp:</span>
                    <p className="text-[#1D1D1F] font-medium">{modalRow.whatsapp}</p>
                  </div>
                  {modalRow.instagram && (
                    <div className="col-span-2">
                      <span className="text-[#86868B]">Instagram:</span>
                      <p className="text-[#1D1D1F] font-medium">{modalRow.instagram}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* New product */}
              <div className={`rounded-xl p-4 space-y-2 ${!modalRow.preco_novo ? "bg-yellow-50 border border-yellow-300" : "bg-[#F5F5F7]"}`}>
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto Novo</h3>
                <p className="text-[#1D1D1F] font-medium text-sm">{modalRow.modelo_novo} {modalRow.storage_novo}</p>
                {editMode ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#86868B]">Valor (R$):</span>
                    <input
                      type="number"
                      value={editData.preco_novo || ""}
                      onChange={(e) => setEditData(p => ({ ...p, preco_novo: e.target.value }))}
                      className="flex-1 px-2.5 py-1.5 text-sm font-bold text-[#E8740E] rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>
                ) : !modalRow.preco_novo ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-yellow-800">Aguardando precificacao</p>
                    <p className="text-xs text-yellow-700">Defina o valor de venda deste seminovo:</p>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-yellow-700 font-medium">R$</span>
                      <input
                        type="number"
                        placeholder="Ex: 7500"
                        id="modal-preco-seminovo"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-yellow-400 text-sm focus:border-[#E8740E] focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = parseFloat((e.target as HTMLInputElement).value);
                            if (v > 0) {
                              const aval = (modalRow.avaliacao_usado || 0) + (modalRow.avaliacao_usado2 || 0);
                              const dif = v - aval;
                              fetch("/api/admin/simulacoes", {
                                method: "PATCH",
                                headers: { "x-admin-password": password, "Content-Type": "application/json" },
                                body: JSON.stringify({ id: modalRow.id, preco_novo: v, diferenca: dif }),
                              }).then(() => {
                                setModalRow({ ...modalRow, preco_novo: v, diferenca: dif } as SimulacaoRow);
                                fetchData(password);
                              });
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById("modal-preco-seminovo") as HTMLInputElement;
                          const v = parseFloat(input?.value || "0");
                          if (v > 0) {
                            const aval = (modalRow.avaliacao_usado || 0) + (modalRow.avaliacao_usado2 || 0);
                            const dif = v - aval;
                            fetch("/api/admin/simulacoes", {
                              method: "PATCH",
                              headers: { "x-admin-password": password, "Content-Type": "application/json" },
                              body: JSON.stringify({ id: modalRow.id, preco_novo: v, diferenca: dif }),
                            }).then(() => {
                              setModalRow({ ...modalRow, preco_novo: v, diferenca: dif } as SimulacaoRow);
                              fetchData(password);
                            });
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition"
                      >
                        Salvar e recalcular
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[#E8740E] font-bold text-sm">{fmt(modalRow.preco_novo)}</p>
                )}
              </div>

              {/* Used device(s) */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">
                    {modalRow.modelo_usado2 ? "Aparelho na Troca (1º)" : "Aparelho na Troca"}
                  </h3>
                  <button onClick={() => {
                    if (editMode) { setEditMode(false); return; }
                    setEditData({
                      modelo_usado: modalRow.modelo_usado || "",
                      storage_usado: modalRow.storage_usado || "",
                      cor_usado: modalRow.cor_usado || "",
                      avaliacao_usado: String(modalRow.avaliacao_usado || 0),
                      condicao_linhas: (modalRow.condicao_linhas || []).join("\n"),
                      modelo_usado2: modalRow.modelo_usado2 || "",
                      storage_usado2: modalRow.storage_usado2 || "",
                      cor_usado2: modalRow.cor_usado2 || "",
                      avaliacao_usado2: String(modalRow.avaliacao_usado2 || 0),
                      condicao_linhas2: (modalRow.condicao_linhas2 || []).join("\n"),
                      preco_novo: String(modalRow.preco_novo || 0),
                    });
                    setEditMode(true);
                  }} className="text-[10px] text-[#0071E3] font-semibold hover:underline">
                    {editMode ? "Cancelar" : "Editar"}
                  </button>
                </div>
                {editMode ? (
                  <div className="space-y-4">
                    {/* 1º Aparelho */}
                    <div className="bg-white rounded-lg border border-[#E5E5EA] p-3 space-y-2.5">
                      <p className="text-xs font-bold text-[#1D1D1F]">{modalRow.modelo_usado2 ? "1º Aparelho" : "Aparelho na Troca"}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2"><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Modelo</p><input value={editData.modelo_usado || ""} onChange={e => setEditData(p => ({ ...p, modelo_usado: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                        <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Storage</p><input value={editData.storage_usado || ""} onChange={e => setEditData(p => ({ ...p, storage_usado: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Cor</p><input value={editData.cor_usado || ""} onChange={e => setEditData(p => ({ ...p, cor_usado: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                        <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Avaliacao (R$)</p><input value={editData.avaliacao_usado || ""} onChange={e => setEditData(p => ({ ...p, avaliacao_usado: e.target.value }))} type="number" className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                      </div>
                      <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Condicao do aparelho</p><textarea value={editData.condicao_linhas || ""} onChange={e => setEditData(p => ({ ...p, condicao_linhas: e.target.value }))} placeholder={"Saude bateria 89%\nSem marcas de uso\nSem pecas trocadas\nSem caixa original"} rows={4} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors resize-none font-mono" /></div>
                    </div>
                    {/* 2º Aparelho */}
                    {modalRow.modelo_usado2 && (
                      <div className="bg-white rounded-lg border border-[#E5E5EA] p-3 space-y-2.5">
                        <p className="text-xs font-bold text-[#1D1D1F]">2º Aparelho</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2"><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Modelo</p><input value={editData.modelo_usado2 || ""} onChange={e => setEditData(p => ({ ...p, modelo_usado2: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                          <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Storage</p><input value={editData.storage_usado2 || ""} onChange={e => setEditData(p => ({ ...p, storage_usado2: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Cor</p><input value={editData.cor_usado2 || ""} onChange={e => setEditData(p => ({ ...p, cor_usado2: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                          <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Avaliacao (R$)</p><input value={editData.avaliacao_usado2 || ""} onChange={e => setEditData(p => ({ ...p, avaliacao_usado2: e.target.value }))} type="number" className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors" /></div>
                        </div>
                        <div><p className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-0.5">Condicao do aparelho</p><textarea value={editData.condicao_linhas2 || ""} onChange={e => setEditData(p => ({ ...p, condicao_linhas2: e.target.value }))} placeholder={"Saude bateria 87%\nSem marcas de uso\nTem a caixa original"} rows={4} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#D2D2D7] focus:border-[#0071E3] focus:outline-none transition-colors resize-none font-mono" /></div>
                      </div>
                    )}
                    {/* Resumo em tempo real */}
                    <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-[#86868B]">Produto novo</span><span className="font-semibold">{fmt(Number(editData.preco_novo) || 0)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-[#86868B]">Avaliacao 1º</span><span className="font-semibold text-green-600">- {fmt(Number(editData.avaliacao_usado) || 0)}</span></div>
                      {(Number(editData.avaliacao_usado2) || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-[#86868B]">Avaliacao 2º</span><span className="font-semibold text-green-600">- {fmt(Number(editData.avaliacao_usado2) || 0)}</span></div>}
                      <div className="flex justify-between text-sm pt-1 border-t border-[#E5E5EA]"><span className="font-bold text-[#E8740E]">Diferenca PIX</span><span className="font-bold text-[#E8740E]">{fmt((Number(editData.preco_novo) || 0) - (Number(editData.avaliacao_usado) || 0) - (Number(editData.avaliacao_usado2) || 0))}</span></div>
                    </div>
                    <button
                      disabled={savingEdit}
                      onClick={async () => {
                        setSavingEdit(true);
                        try {
                          const aval1 = Number(editData.avaliacao_usado) || 0;
                          const aval2 = Number(editData.avaliacao_usado2) || 0;
                          const precoNovo = Number(editData.preco_novo) || modalRow.preco_novo;
                          const dif = precoNovo - aval1 - aval2;
                          const condLines1 = editData.condicao_linhas ? editData.condicao_linhas.split("\n").map((l: string) => l.trim()).filter(Boolean) : [];
                          const condLines2 = editData.condicao_linhas2 ? editData.condicao_linhas2.split("\n").map((l: string) => l.trim()).filter(Boolean) : null;
                          const res = await fetch("/api/admin/simulacoes", {
                            method: "PATCH",
                            headers: { "x-admin-password": password, "Content-Type": "application/json" },
                            body: JSON.stringify({ id: modalRow.id, modelo_usado: editData.modelo_usado, storage_usado: editData.storage_usado, cor_usado: editData.cor_usado || null, avaliacao_usado: aval1, condicao_linhas: condLines1, modelo_usado2: editData.modelo_usado2 || null, storage_usado2: editData.storage_usado2 || null, cor_usado2: editData.cor_usado2 || null, avaliacao_usado2: aval2 || null, condicao_linhas2: condLines2, diferenca: dif, preco_novo: precoNovo }),
                          });
                          if (res.ok) {
                            setModalRow({ ...modalRow, modelo_usado: editData.modelo_usado, storage_usado: editData.storage_usado, cor_usado: editData.cor_usado || null, condicao_linhas: condLines1, modelo_usado2: editData.modelo_usado2 || null, storage_usado2: editData.storage_usado2 || null, cor_usado2: editData.cor_usado2 || null, condicao_linhas2: condLines2, avaliacao_usado: aval1, avaliacao_usado2: aval2, diferenca: dif, preco_novo: precoNovo } as SimulacaoRow);
                            setEditMode(false);
                            fetchData(password);
                          } else { alert("Erro ao salvar"); }
                        } finally { setSavingEdit(false); }
                      }}
                      className="w-full py-2 bg-[#0071E3] text-white text-sm font-semibold rounded-xl hover:bg-[#0062C4] disabled:opacity-50 transition-colors"
                    >
                      {savingEdit ? "Salvando..." : "Salvar alteracoes"}
                    </button>
                  </div>
                ) : (
                  <>
                    {modalRow.modelo_usado ? (
                      <>
                        <p className="text-[#1D1D1F] font-medium text-sm">{modalRow.modelo_usado} {modalRow.storage_usado}{modalRow.cor_usado ? ` — ${corParaPT(modalRow.cor_usado)}` : ""}</p>
                        {modalRow.condicao_linhas && modalRow.condicao_linhas.length > 0 ? (
                          <div className="text-xs text-[#6E6E73] space-y-0.5">
                            {modalRow.condicao_linhas.map((linha, i) => <p key={i}>{linha}</p>)}
                          </div>
                        ) : (
                          <p className="text-xs text-yellow-600 italic">Condicao nao informada — clique Editar para adicionar</p>
                        )}
                        <p className="text-green-600 font-bold text-sm">Avaliacao: {fmt(modalRow.avaliacao_usado)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-[#86868B] italic">Nenhum aparelho na troca informado</p>
                    )}
                  </>
                )}
              </div>
              {/* 2nd used device */}
              {modalRow.modelo_usado2 && !editMode && (
                <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Aparelho na Troca (2º)</h3>
                  <p className="text-[#1D1D1F] font-medium text-sm">{modalRow.modelo_usado2} {modalRow.storage_usado2 || ""}{modalRow.cor_usado2 ? ` — ${corParaPT(modalRow.cor_usado2)}` : ""}</p>
                  {modalRow.condicao_linhas2 && modalRow.condicao_linhas2.length > 0 && (
                    <div className="text-xs text-[#6E6E73] space-y-0.5">
                      {modalRow.condicao_linhas2.map((linha, i) => <p key={i}>{linha}</p>)}
                    </div>
                  )}
                  {(modalRow.avaliacao_usado2 ?? 0) > 0 && (
                    <p className="text-green-600 font-bold text-sm">Avaliacao: {fmt(modalRow.avaliacao_usado2!)}</p>
                  )}
                </div>
              )}

              {/* Financial summary */}
              <div className={`rounded-xl overflow-hidden border ${!modalRow.preco_novo ? "border-yellow-300 bg-yellow-50" : "border-[#E8740E]/30 bg-gradient-to-b from-[#FFF8F2] to-white"}`}>
                <div className={`px-4 py-2.5 ${!modalRow.preco_novo ? "bg-yellow-100" : "bg-[#E8740E]"}`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${!modalRow.preco_novo ? "text-yellow-800" : "text-white"}`}>Resumo Financeiro</h3>
                </div>
                <div className="p-4 space-y-2">
                {!modalRow.preco_novo ? (
                  <p className="text-sm text-yellow-700 italic">Defina o valor do seminovo acima para ver o resumo</p>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#86868B]">Produto novo:</span>
                      <span className="text-[#1D1D1F] font-semibold">{fmt(modalRow.preco_novo)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#86868B]">Avaliacao troca:</span>
                      <span className="text-green-600 font-semibold">- {fmt((modalRow.avaliacao_usado || 0) + (modalRow.avaliacao_usado2 || 0))}</span>
                    </div>
                    <div className="flex justify-between text-base pt-2 mt-1 border-t-2 border-[#E8740E]/20">
                      <span className="text-[#E8740E] font-bold">No PIX:</span>
                      <span className="text-[#E8740E] font-bold text-lg">{fmt(modalRow.diferenca)}</span>
                    </div>
                    {modalRow.diferenca > 0 && (() => {
                      const TODAS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
                      const DEFAULT = [12, 18, 21];
                      const selecionadas = modalParcelasVisiveis || DEFAULT;
                      return (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-[#1D1D1F] uppercase tracking-wider">Parcelamento</p>
                            <button type="button" onClick={() => setModalParcelasVisiveis(selecionadas.length === TODAS.length ? DEFAULT : [...TODAS])} className="text-[10px] text-[#0071E3] font-semibold hover:underline">
                              {selecionadas.length === TODAS.length ? "Padrao" : "Todas"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-[3px]">
                            {TODAS.map(n => {
                              const ativo = selecionadas.includes(n);
                              return (
                                <button key={n} type="button"
                                  onClick={() => setModalParcelasVisiveis(ativo ? selecionadas.filter(x => x !== n) : [...selecionadas, n].sort((a,b) => a-b))}
                                  className={`w-8 h-7 rounded-md text-[11px] font-semibold transition-all ${ativo ? "bg-[#E8740E] text-white shadow-sm" : "bg-[#F0F0F5] text-[#86868B] hover:bg-[#E5E5EA]"}`}
                                >
                                  {n}x
                                </button>
                              );
                            })}
                          </div>
                          <div className="bg-[#F5F5F7] rounded-lg p-2.5 space-y-1">
                            {selecionadas.map(n => {
                              const parcela = (() => { const rate = INSTALLMENT_RATES.find(r => r[0] === n)?.[1] || 1; return Math.round((modalRow.diferenca * rate) / n); })();
                              return <div key={n} className="flex justify-between text-sm"><span className="text-[#86868B]">{n}x:</span><span className="font-bold text-[#1D1D1F]">{fmt(parcela)}</span></div>;
                            })}
                          </div>
                          <button type="button"
                            onClick={() => {
                              const lines: string[] = [];
                              lines.push("*TIGRAO IMPORTS — ORCAMENTO*");
                              lines.push("");
                              lines.push(`*${modalRow.modelo_novo} ${modalRow.storage_novo}*`);
                              lines.push(`Valor: *${fmt(modalRow.preco_novo)}*`);
                              lines.push("");
                              if (modalRow.modelo_usado) {
                                lines.push(`*Seu aparelho na troca:*`);
                                lines.push(`${modalRow.modelo_usado} ${modalRow.storage_usado}${modalRow.cor_usado ? ` (${modalRow.cor_usado})` : ""}`);
                                if (modalRow.condicao_linhas && modalRow.condicao_linhas.length > 0) {
                                  modalRow.condicao_linhas.forEach(l => lines.push(`  ${l}`));
                                }
                                lines.push(`Avaliacao: *${fmt(modalRow.avaliacao_usado)}*`);
                                if (modalRow.modelo_usado2) {
                                  lines.push("");
                                  lines.push(`*2o aparelho:*`);
                                  lines.push(`${modalRow.modelo_usado2} ${modalRow.storage_usado2 || ""}${modalRow.cor_usado2 ? ` (${modalRow.cor_usado2})` : ""}`);
                                  if (modalRow.condicao_linhas2 && modalRow.condicao_linhas2.length > 0) {
                                    modalRow.condicao_linhas2.forEach(l => lines.push(`  ${l}`));
                                  }
                                  lines.push(`Avaliacao: *${fmt(modalRow.avaliacao_usado2 || 0)}*`);
                                }
                                lines.push("");
                              }
                              lines.push(`*No PIX: ${fmt(modalRow.diferenca)}*`);
                              lines.push("");
                              if (selecionadas.length > 0) {
                                lines.push("*Parcelado:*");
                                selecionadas.forEach(n => {
                                  lines.push(`  ${n}x de ${fmt((() => { const rate = INSTALLMENT_RATES.find(r => r[0] === n)?.[1] || 1; return Math.round((modalRow.diferenca * rate) / n); })())}`);
                                });
                                lines.push("");
                              }
                              lines.push("_Orcamento valido por 24 horas._");
                              navigator.clipboard.writeText(lines.join("\n")).then(() => {
                                const btn = document.getElementById("btn-copiar-wpp");
                                if (btn) { btn.textContent = "✅ Copiado!"; setTimeout(() => { btn.textContent = "📋 Copiar para WhatsApp"; }, 2000); }
                              });
                            }}
                            id="btn-copiar-wpp"
                            className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#25D366] text-white hover:bg-[#1DA851] transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            📋 Copiar para WhatsApp
                          </button>
                        </div>
                      );
                    })()}
                    {modalRow.forma_pagamento && (
                      <div className="flex justify-between text-xs pt-1 border-t border-[#E5E5EA]">
                        <span className="text-[#86868B]">Forma:</span>
                        <span className="text-[#1D1D1F] font-medium">{modalRow.forma_pagamento}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-[#86868B] italic text-center pt-1">Orcamento valido por 24 horas</p>
                  </>
                )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => {
                    const num = modalRow.whatsapp.replace(/\D/g, "");
                    const full = num.startsWith("55") ? num : `55${num}`;
                    const msg = `Ola ${modalRow.nome}! Vi que voce fez uma simulacao de troca no nosso site. O ${modalRow.modelo_novo} ${modalRow.storage_novo} esta disponivel! Seu ${modalRow.modelo_usado} foi avaliado em ${fmt(modalRow.avaliacao_usado)}. Gostaria de continuar?`;
                    window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors text-center"
                >
                  Chamar no WhatsApp
                </button>
                <button
                  onClick={() => {
                    const selecionadas = modalParcelasVisiveis || [12, 18, 21];
                    const lines: string[] = [];
                    lines.push("*TIGRAO IMPORTS — ORCAMENTO*");
                    lines.push("");
                    lines.push(`*${modalRow.modelo_novo} ${modalRow.storage_novo}*`);
                    if (modalRow.preco_novo) lines.push(`Valor: *${fmt(modalRow.preco_novo)}*`);
                    lines.push("");
                    if (modalRow.modelo_usado) {
                      lines.push(`*Seu aparelho na troca:*`);
                      lines.push(`${modalRow.modelo_usado} ${modalRow.storage_usado}${modalRow.cor_usado ? ` (${modalRow.cor_usado})` : ""}`);
                      if (modalRow.condicao_linhas && modalRow.condicao_linhas.length > 0) {
                        modalRow.condicao_linhas.forEach(l => lines.push(`  ${l}`));
                      }
                      lines.push(`Avaliacao: *${fmt(modalRow.avaliacao_usado)}*`);
                      if (modalRow.modelo_usado2) {
                        lines.push("");
                        lines.push(`*2o aparelho:*`);
                        lines.push(`${modalRow.modelo_usado2} ${modalRow.storage_usado2 || ""}${modalRow.cor_usado2 ? ` (${modalRow.cor_usado2})` : ""}`);
                        if (modalRow.condicao_linhas2 && modalRow.condicao_linhas2.length > 0) {
                          modalRow.condicao_linhas2.forEach(l => lines.push(`  ${l}`));
                        }
                        lines.push(`Avaliacao: *${fmt(modalRow.avaliacao_usado2 || 0)}*`);
                      }
                      lines.push("");
                    }
                    if (modalRow.diferenca > 0) {
                      lines.push(`*No PIX: ${fmt(modalRow.diferenca)}*`);
                      lines.push("");
                      lines.push("*Parcelado:*");
                      selecionadas.forEach(n => {
                        lines.push(`  ${n}x de ${fmt((() => { const rate = INSTALLMENT_RATES.find(r => r[0] === n)?.[1] || 1; return Math.round((modalRow.diferenca * rate) / n); })())}`);
                      });
                      lines.push("");
                    }
                    lines.push("_Orcamento valido por 24 horas._");
                    const num = modalRow.whatsapp.replace(/\D/g, "");
                    const full = num.startsWith("55") ? num : `55${num}`;
                    window.open(`https://wa.me/${full}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
                  }}
                  className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-[#E8740E] hover:bg-[#D06A0C] text-white text-sm font-semibold transition-colors text-center"
                >
                  Enviar Orcamento
                </button>
                <button
                  onClick={() => {
                    const cond = parseCondicao(modalRow.condicao_linhas);
                    const obs = buildTrocaObs(modalRow.condicao_linhas);
                    const params = new URLSearchParams({
                      sim_id: modalRow.id || "",
                      produto: `${modalRow.modelo_novo} ${modalRow.storage_novo}`.trim(),
                      preco: String(modalRow.preco_novo || ""),
                      cliente_nome: modalRow.nome || "",
                      cliente_whatsapp: modalRow.whatsapp || "",
                      troca_produto: `${modalRow.modelo_usado} ${modalRow.storage_usado}`.trim(),
                      troca_valor: String(modalRow.avaliacao_usado || ""),
                      troca_cor: modalRow.cor_usado || "",
                      troca_condicao: Array.isArray(modalRow.condicao_linhas) ? modalRow.condicao_linhas.join(" | ") : "",
                      vendedor: modalRow.vendedor || "",
                    });
                    // Device 2
                    if (modalRow.modelo_usado2) {
                      params.set("troca_produto2", `${modalRow.modelo_usado2} ${modalRow.storage_usado2 || ""}`.trim());
                      if (modalRow.avaliacao_usado2) params.set("troca_valor2", String(modalRow.avaliacao_usado2));
                      if (modalRow.cor_usado2) params.set("troca_cor2", modalRow.cor_usado2);
                      if (Array.isArray(modalRow.condicao_linhas2) && modalRow.condicao_linhas2.length > 0) params.set("troca_condicao2", modalRow.condicao_linhas2.join(" | "));
                    }
                    // Limpa params vazios
                    for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k); }
                    window.open(`/admin/gerar-link?${params.toString()}`, "_blank");
                  }}
                  className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] text-white text-sm font-semibold transition-colors text-center"
                >
                  Gerar Link
                </button>
                <button
                  onClick={() => {
                    const cond = parseCondicao(modalRow.condicao_linhas);
                    const obs = buildTrocaObs(modalRow.condicao_linhas);
                    const params = new URLSearchParams({
                      cliente_nome: modalRow.nome || "",
                      cliente_telefone: modalRow.whatsapp || "",
                      produto: `${modalRow.modelo_novo} ${modalRow.storage_novo}`.trim(),
                      valor: String(modalRow.preco_novo || ""),
                      troca_produto: `${modalRow.modelo_usado} ${modalRow.storage_usado}`.trim(),
                      troca_valor: String(modalRow.avaliacao_usado || ""),
                      troca_cor: modalRow.cor_usado || "",
                      troca_bateria: cond.bateria,
                      troca_marcas_uso: cond.marcasUso,
                      troca_pecas_trocadas: cond.pecasTrocadas,
                      troca_caixa_original: cond.caixaOriginal,
                      troca_observacao: obs,
                      diferenca_pix: String(modalRow.diferenca || ""),
                    });
                    window.open(`/admin/entregas?${params.toString()}`, "_blank");
                  }}
                  className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors text-center"
                >
                  Agendar Entrega
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

/* WhatsApp Config Panel removido — ver /admin/configuracoes */

/* WhatsApp Config Panel removido — ver /admin/configuracoes */

// ──────────────────────────────────────────
// Simulador Interno — formulário simples
// ──────────────────────────────────────────

type UsadoCategoria = "iPhone" | "iPad" | "MacBook" | "Apple Watch";
const USADO_CATEGORIAS: UsadoCategoria[] = ["iPhone", "iPad", "MacBook", "Apple Watch"];

interface PrecosRow {
  modelo: string;
  armazenamento: string;
  preco_pix: number;
  categoria?: string;
  status?: string;
}

const inputCls = "w-full px-3 py-2 rounded-lg bg-[#F5F5F7] border border-[#D2D2D7] text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors";
const labelCls = "block text-xs font-semibold text-[#86868B] mb-1";
const checkCls = "w-4 h-4 accent-[#E8740E] rounded";

function SimuladorInterno({ password }: { password: string }) {
  // --- Data from APIs ---
  const [usedValues, setUsedValues] = useState<UsedDeviceValue[]>([]);
  const [excludedModels, setExcludedModels] = useState<string[]>([]);
  const [discountRules, setDiscountRules] = useState<{ condicao: string; detalhe: string; desconto: number }[]>([]);
  const [modelDiscounts, setModelDiscounts] = useState<Record<string, Partial<ModelDiscounts>>>({});
  const [precos, setPrecos] = useState<PrecosRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // --- Usado (trade-in) ---
  const [usadoCat, setUsadoCat] = useState<UsadoCategoria>("iPhone");
  const [usadoModelo, setUsadoModelo] = useState("");
  const [usadoStorage, setUsadoStorage] = useState("");
  const [valorBaseManual, setValorBaseManual] = useState<number | null>(null);
  const [salvandoValorBase, setSalvandoValorBase] = useState(false);
  const [bateria, setBateria] = useState(100);
  const [marcasUso, setMarcasUso] = useState(false);
  const [arranhoes, setArranhoes] = useState(false);
  const [trincado, setTrincado] = useState(false);
  const [defeito, setDefeito] = useState(false);
  const [manutencao, setManutencao] = useState<"no" | "apple" | "thirdParty">("no");
  const [garantiaApple, setGarantiaApple] = useState(false);
  const [garantiaMes, setGarantiaMes] = useState<number>(1);
  const [garantiaAno, setGarantiaAno] = useState<number>(new Date().getFullYear());
  const [caixaOriginal, setCaixaOriginal] = useState(false);
  // MacBook extras
  const [ciclosBateria, setCiclosBateria] = useState(0);
  const [tecladoCondition, setTecladoCondition] = useState<"perfect" | "sticky">("perfect");
  const [temCarregador, setTemCarregador] = useState(true);
  // iPad extras
  const [temPencil, setTemPencil] = useState(false);

  // --- Novo (compra) ---
  const [novoCat, setNovoCat] = useState("");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoSeminovo, setNovoSeminovo] = useState(false);
  const [novoPrecoManual, setNovoPrecoManual] = useState<number | null>(null);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usadosRes, precosRes] = await Promise.all([
          fetch("/api/usados"),
          fetch("/api/admin/precos", { headers: { "x-admin-password": password } }),
        ]);
        if (cancelled) return;
        const usadosJson = await usadosRes.json();
        const precosJson = await precosRes.json();
        setUsedValues(usadosJson.usedValues || []);
        setExcludedModels(usadosJson.excludedModels || []);
        setDiscountRules(usadosJson.discountRules || []);
        setModelDiscounts(usadosJson.modelDiscounts || {});
        setPrecos((precosJson.data || []).filter((p: PrecosRow) => p.status === "ativo"));
      } catch (err) {
        console.error("Erro ao carregar dados do simulador:", err);
      }
      if (!cancelled) setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [password]);

  // --- Derived: usado models/storages ---
  const usadoModelos = useMemo(() => {
    const prefix = usadoCat === "Apple Watch" ? "Apple Watch" : usadoCat;
    const models = [...new Set(
      usedValues
        .filter((v) => v.modelo.startsWith(prefix))
        .filter((v) => !excludedModels.includes(v.modelo))
        .map((v) => v.modelo)
    )].sort();
    return models;
  }, [usedValues, excludedModels, usadoCat]);

  const usadoStorages = useMemo(() => {
    if (!usadoModelo) return [];
    return [...new Set(usedValues.filter((v) => v.modelo === usadoModelo).map((v) => v.armazenamento))];
  }, [usedValues, usadoModelo]);

  // Reset selections on category change
  useEffect(() => { setUsadoModelo(""); setUsadoStorage(""); setValorBaseManual(null); }, [usadoCat]);
  useEffect(() => { setUsadoStorage(""); setValorBaseManual(null); }, [usadoModelo]);

  // --- Derived: novo categories/models ---
  const novoCategorias = useMemo(() => {
    return [...new Set(precos.map((p) => p.categoria || "IPHONE"))].sort();
  }, [precos]);

  const novoModelos = useMemo(() => {
    if (!novoCat) return [];
    return [...new Set(
      precos
        .filter((p) => (p.categoria || "IPHONE") === novoCat)
        .map((p) => `${p.modelo} ${p.armazenamento}`)
    )].sort();
  }, [precos, novoCat]);

  useEffect(() => { setNovoModelo(""); }, [novoCat]);

  // --- Calculate trade-in value ---
  const baseValue = useMemo(() => {
    if (!usadoModelo || !usadoStorage) return 0;
    const found = usedValues.find((v) => v.modelo === usadoModelo && v.armazenamento === usadoStorage);
    return found?.valorBase || 0;
  }, [usedValues, usadoModelo, usadoStorage]);

  // Valor efetivo: usa manual se definido, senão o do catálogo
  const effectiveBaseValue = useMemo(() => {
    if (valorBaseManual !== null && valorBaseManual > 0) return valorBaseManual;
    return baseValue;
  }, [baseValue, valorBaseManual]);

  // Flag: seminovo selecionado mas sem valor
  const semValorBase = usadoModelo && usadoStorage && baseValue === 0;

  const tradeInValue = useMemo(() => {
    if (!effectiveBaseValue) return 0;
    if (defeito) return 0;

    const isMac = usadoCat === "MacBook";
    const isIPad = usadoCat === "iPad";

    if (isMac) {
      const cond: MacBookConditionData = {
        screenScratch: arranhoes ? "multiple" : "none",
        bodyScratch: marcasUso ? "heavy" : "none",
        batteryCycles: ciclosBateria,
        keyboardCondition: tecladoCondition,
        hasCharger: temCarregador,
        hasDamage: trincado,
        hasWarranty: garantiaApple,
        warrantyMonth: garantiaApple ? garantiaMes : null,
        warrantyYear: garantiaApple ? garantiaAno : null,
        hasOriginalBox: caixaOriginal,
      };
      return calculateMacBookTradeInValue(effectiveBaseValue, cond);
    }

    if (isIPad) {
      const cond: IPadConditionData = {
        screenScratch: arranhoes ? "multiple" : "none",
        sideScratch: "none",
        peeling: marcasUso ? "heavy" : "none",
        battery: bateria,
        hasDamage: trincado,
        partsReplaced: manutencao,
        hasWarranty: garantiaApple,
        warrantyMonth: garantiaApple ? garantiaMes : null,
        warrantyYear: garantiaApple ? garantiaAno : null,
        hasOriginalBox: caixaOriginal,
        hasApplePencil: temPencil,
        hasWearMarks: undefined,
      };
      return calculateIPadTradeInValue(effectiveBaseValue, cond);
    }

    // iPhone / Apple Watch — use the same iPhone logic
    const md = getDiscountsForModel(usadoModelo, modelDiscounts);
    const cond: ConditionData = {
      screenScratch: arranhoes ? "multiple" : "none",
      sideScratch: "none",
      peeling: marcasUso ? "heavy" : "none",
      battery: bateria,
      hasDamage: trincado,
      partsReplaced: manutencao,
      hasWarranty: garantiaApple,
      warrantyMonth: garantiaApple ? garantiaMes : null,
      warrantyYear: garantiaApple ? garantiaAno : null,
      hasOriginalBox: caixaOriginal,
    };
    return calculateTradeInValue(effectiveBaseValue, cond, md);
  }, [effectiveBaseValue, usadoCat, usadoModelo, bateria, marcasUso, arranhoes, trincado, defeito, manutencao, garantiaApple, garantiaMes, garantiaAno, caixaOriginal, ciclosBateria, tecladoCondition, temCarregador, temPencil, modelDiscounts]);

  // --- New device price ---
  const newPriceCatalogo = useMemo(() => {
    if (!novoModelo) return 0;
    const found = precos.find((p) => `${p.modelo} ${p.armazenamento}` === novoModelo);
    return found?.preco_pix || 0;
  }, [precos, novoModelo]);

  const newPrice = novoSeminovo && novoPrecoManual !== null ? novoPrecoManual : newPriceCatalogo;

  // --- Quote ---
  const quote = useMemo(() => {
    if (!newPrice) return null;
    return calculateQuote(tradeInValue, newPrice);
  }, [tradeInValue, newPrice]);

  const catLabel: Record<string, string> = {
    IPHONE: "iPhone", IPHONES: "iPhone", IPAD: "iPad", IPADS: "iPad",
    MACBOOK: "MacBook", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods",
    ACESSORIOS: "Acessorios", MAC_MINI: "Mac Mini", MAC_STUDIO: "Mac Studio",
    OUTROS: "Outros",
  };

  if (loadingData) {
    return (
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-8 shadow-sm text-center">
        <p className="text-[#86868B]">Carregando dados do simulador...</p>
      </div>
    );
  }

  const months = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[#D2D2D7] bg-[#F5F5F7]">
        <h2 className="font-bold text-[#1D1D1F]">Simulador Interno</h2>
        <p className="text-sm text-[#86868B] mt-1">Calcule valores de troca internamente, sem gerar registro de cliente.</p>
      </div>

      <div className="p-5 space-y-6 max-w-3xl mx-auto">
        {/* ─── APARELHO USADO ─── */}
        <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-[#1D1D1F] text-sm">Aparelho Usado (trade-in)</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Categoria</label>
              <select className={inputCls} value={usadoCat} onChange={(e) => setUsadoCat(e.target.value as UsadoCategoria)}>
                {USADO_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Modelo</label>
              <select className={inputCls} value={usadoModelo} onChange={(e) => setUsadoModelo(e.target.value)}>
                <option value="">Selecione</option>
                {usadoModelos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Armazenamento</label>
              <select className={inputCls} value={usadoStorage} onChange={(e) => setUsadoStorage(e.target.value)}>
                <option value="">Selecione</option>
                {usadoStorages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Bateria / Ciclos */}
          {usadoCat === "MacBook" ? (
            <div>
              <label className={labelCls}>Ciclos de bateria</label>
              <input type="number" className={inputCls} value={ciclosBateria} min={0} max={9999}
                onChange={(e) => setCiclosBateria(Number(e.target.value))} placeholder="Ex: 250" />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Saude da bateria (%)</label>
              <input type="number" className={inputCls} value={bateria} min={0} max={100}
                onChange={(e) => setBateria(Math.min(100, Math.max(0, Number(e.target.value))))} />
            </div>
          )}

          {/* Checkboxes de condicao */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={marcasUso} onChange={(e) => setMarcasUso(e.target.checked)} />
              Marcas de uso
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={arranhoes} onChange={(e) => setArranhoes(e.target.checked)} />
              Arranhoes
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={trincado} onChange={(e) => setTrincado(e.target.checked)} />
              Trincado
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={defeito} onChange={(e) => setDefeito(e.target.checked)} />
              Defeito
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={caixaOriginal} onChange={(e) => setCaixaOriginal(e.target.checked)} />
              Caixa original
            </label>
            {usadoCat === "iPad" && (
              <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                <input type="checkbox" className={checkCls} checked={temPencil} onChange={(e) => setTemPencil(e.target.checked)} />
                Apple Pencil
              </label>
            )}
            {usadoCat === "MacBook" && (
              <>
                <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                  <input type="checkbox" className={checkCls} checked={temCarregador} onChange={(e) => setTemCarregador(e.target.checked)} />
                  Carregador
                </label>
                <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                  <input type="checkbox" className={checkCls} checked={tecladoCondition === "sticky"} onChange={(e) => setTecladoCondition(e.target.checked ? "sticky" : "perfect")} />
                  Teclado grudando
                </label>
              </>
            )}
          </div>

          {/* Manutencao */}
          {usadoCat !== "MacBook" && (
            <div>
              <label className={labelCls}>Manutencao / Pecas trocadas</label>
              <select className={inputCls} value={manutencao} onChange={(e) => setManutencao(e.target.value as "no" | "apple" | "thirdParty")}>
                <option value="no">Nenhuma peca trocada</option>
                <option value="apple">Trocada na Apple (autorizada)</option>
                <option value="thirdParty">Trocada fora da Apple (rejeita)</option>
              </select>
            </div>
          )}

          {/* Garantia Apple */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
              <input type="checkbox" className={checkCls} checked={garantiaApple} onChange={(e) => setGarantiaApple(e.target.checked)} />
              <span className="font-semibold text-xs text-[#86868B]">Garantia Apple</span>
            </label>
            {garantiaApple && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className={labelCls}>Mes vencimento</label>
                  <select className={inputCls} value={garantiaMes} onChange={(e) => setGarantiaMes(Number(e.target.value))}>
                    {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Ano</label>
                  <select className={inputCls} value={garantiaAno} onChange={(e) => setGarantiaAno(Number(e.target.value))}>
                    {[2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Seminovo sem valor base — aviso + campo manual */}
          {semValorBase && !valorBaseManual && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold text-yellow-800">Seminovo sem valor base cadastrado</p>
              <p className="text-xs text-yellow-700">Defina o valor manualmente para continuar a simulacao:</p>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-yellow-700 font-medium">Valor base: R$</span>
                <input
                  type="number"
                  placeholder="0"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-yellow-400 text-sm focus:border-[#E8740E] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) setValorBaseManual(v); } }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('input[placeholder="0"]');
                    const v = parseFloat(input?.value || "0");
                    if (v > 0) setValorBaseManual(v);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 text-white hover:bg-yellow-600 transition"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}

          {/* Valor avaliado */}
          {effectiveBaseValue > 0 && (
            <div className={`rounded-lg p-3 space-y-2 ${valorBaseManual ? "bg-blue-50 border border-blue-200" : "bg-[#F5F5F7]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#86868B]">
                  Valor base{valorBaseManual ? " (manual)" : ""}: <b className="text-[#1D1D1F]">{formatBRL(effectiveBaseValue)}</b>
                  {valorBaseManual ? (
                    <button onClick={() => setValorBaseManual(null)} className="ml-2 text-[10px] text-red-400 hover:text-red-600">limpar</button>
                  ) : (
                    <button onClick={() => setValorBaseManual(baseValue)} className="ml-2 text-[10px] text-blue-500 hover:text-blue-700">editar</button>
                  )}
                </span>
                <span className="text-sm font-bold" style={{ color: tradeInValue > 0 ? "#2ECC71" : "#E74C3C" }}>
                  Avaliado: {formatBRL(tradeInValue)}
                </span>
              </div>
              {/* Campo editável inline quando clicou "editar" */}
              {valorBaseManual !== null && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-blue-600 font-medium">R$</span>
                  <input
                    type="number"
                    value={valorBaseManual}
                    onChange={(e) => setValorBaseManual(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 rounded-lg border border-blue-300 text-sm focus:border-[#E8740E] focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Salvar valor base no catálogo */}
          {valorBaseManual && valorBaseManual > 0 && usadoModelo && usadoStorage && (
            <button
              disabled={salvandoValorBase}
              onClick={async () => {
                setSalvandoValorBase(true);
                try {
                  const res = await fetch("/api/admin/usados", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-password": password },
                    body: JSON.stringify({ action: "upsert_valor", modelo: usadoModelo, armazenamento: usadoStorage, valor_base: valorBaseManual }),
                  });
                  if (res.ok) {
                    // Atualizar lista local
                    setUsedValues(prev => {
                      const idx = prev.findIndex(v => v.modelo === usadoModelo && v.armazenamento === usadoStorage);
                      if (idx >= 0) { const updated = [...prev]; updated[idx] = { ...updated[idx], valorBase: valorBaseManual }; return updated; }
                      return [...prev, { modelo: usadoModelo, armazenamento: usadoStorage, valorBase: valorBaseManual }];
                    });
                    alert("Valor base salvo no catalogo de usados!");
                  } else {
                    alert("Erro ao salvar valor base");
                  }
                } catch { alert("Erro ao salvar"); }
                setSalvandoValorBase(false);
              }}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              {salvandoValorBase ? "Salvando..." : "Salvar como valor base no catalogo de usados"}
            </button>
          )}
        </div>

        {/* ─── APARELHO NOVO ─── */}
        <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#1D1D1F] text-sm">Aparelho Novo (compra)</h3>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={novoSeminovo}
                onChange={(e) => { setNovoSeminovo(e.target.checked); setNovoPrecoManual(null); }}
                className="w-4 h-4 accent-[#E8740E] rounded"
              />
              <span className="text-xs font-medium text-[#86868B]">Seminovo</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Categoria</label>
              <select className={inputCls} value={novoCat} onChange={(e) => setNovoCat(e.target.value)}>
                <option value="">Selecione</option>
                {novoCategorias.map((c) => <option key={c} value={c}>{catLabel[c] || c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Modelo + Armazenamento</label>
              <select className={inputCls} value={novoModelo} onChange={(e) => setNovoModelo(e.target.value)}>
                <option value="">Selecione</option>
                {novoModelos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Seminovo: valor manual */}
          {novoSeminovo && novoModelo && (
            <div className={`rounded-lg p-3 space-y-2 ${novoPrecoManual ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-300"}`}>
              {!novoPrecoManual ? (
                <>
                  <p className="text-sm font-semibold text-yellow-800">Aguardando precificacao do seminovo</p>
                  <p className="text-xs text-yellow-700">Defina o valor de venda manualmente:</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-yellow-700 font-medium">Valor: R$</span>
                    <input
                      type="number"
                      placeholder="Ex: 7500"
                      id="novo-preco-manual"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-yellow-400 text-sm focus:border-[#E8740E] focus:outline-none"
                      onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) setNovoPrecoManual(v); } }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById("novo-preco-manual") as HTMLInputElement;
                        const v = parseFloat(input?.value || "0");
                        if (v > 0) setNovoPrecoManual(v);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 text-white hover:bg-yellow-600 transition"
                    >
                      Aplicar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700">
                    Valor seminovo: <b>{formatBRL(novoPrecoManual)}</b>
                    <button onClick={() => setNovoPrecoManual(null)} className="ml-2 text-[10px] text-red-400 hover:text-red-600">alterar</button>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Preco do catálogo (produto novo) */}
          {!novoSeminovo && newPrice > 0 && (
            <div className="bg-[#F5F5F7] rounded-lg p-3">
              <span className="text-sm text-[#86868B]">Preco PIX: </span>
              <span className="text-sm font-bold text-[#1D1D1F]">{formatBRL(newPrice)}</span>
            </div>
          )}
        </div>

        {/* ─── RESULTADO ─── */}
        {quote && (
          <div className="border-2 border-[#E8740E] rounded-xl p-5 space-y-3 bg-[#FFF8F0]">
            <h3 className="font-bold text-[#E8740E] text-sm">Resultado da Simulacao</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-[#86868B]">Valor do usado avaliado:</span>
              <span className="text-right font-semibold text-[#2ECC71]">{formatBRL(quote.tradeInValue)}</span>
              <span className="text-[#86868B]">Preco do novo:</span>
              <span className="text-right font-semibold text-[#1D1D1F]">{formatBRL(quote.newPrice)}</span>
              <span className="text-[#86868B] font-bold">Diferenca a pagar (PIX):</span>
              <span className="text-right font-bold text-[#E8740E] text-base">{formatBRL(quote.difference)}</span>
            </div>
            {/* Referência rápida de parcelas */}
            <div className="border-t border-[#E8740E]/20 pt-3 mt-2">
              <p className="text-xs font-semibold text-[#86868B] mb-2">Referencia rapida:</p>
              <div className="grid grid-cols-3 gap-2">
                {[12, 18, 21].map((n) => {
                  const inst = quote.installments.find((i) => i.parcelas === n);
                  if (!inst) return null;
                  return (
                    <div key={n} className="bg-white border border-[#D2D2D7] rounded-lg p-2 text-center">
                      <p className="text-xs text-[#86868B]">{n}x</p>
                      <p className="font-bold text-sm text-[#1D1D1F]">{formatBRL(inst.valorParcela)}</p>
                      <p className="text-[10px] text-[#86868B]">Total: {formatBRL(inst.total)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Simulador de pagamento flexível */}
            <div className="border-t border-[#E8740E]/20 pt-4 mt-3">
              <p className="text-xs font-semibold text-[#86868B] mb-3">Montar pagamento personalizado:</p>
              <FlexiblePaymentSimulator totalAPagar={quote.difference} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
