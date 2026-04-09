"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";
import { hojeBR } from "@/lib/date-utils";
import ProdutoSpecFields, {
  createEmptyProdutoRow,
  type ProdutoRowState,
} from "@/components/admin/ProdutoSpecFields";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Encomenda {
  id: string;
  created_at: string;
  cliente: string;
  whatsapp: string | null;
  cpf: string | null;
  email: string | null;
  data: string;
  produto: string;
  cor: string | null;
  categoria: string | null;
  armazenamento: string | null;
  valor_venda: number;
  sinal_recebido: number;
  banco_sinal: string | null;
  custo: number;
  fornecedor: string | null;
  forma_pagamento: string | null;
  obs_financeira: string | null;
  previsao_chegada: string | null;
  status: string;
  observacao: string | null;
  estoque_id: string | null;
  venda_id: string | null;
  // Troca 1
  troca_produto: string | null;
  troca_cor: string | null;
  troca_categoria: string | null;
  troca_valor: number;
  troca_bateria: string | null;
  troca_grade: string | null;
  troca_caixa: string | null;
  troca_cabo: string | null;
  troca_fonte: string | null;
  troca_pulseira: string | null;
  troca_ciclos: string | null;
  troca_obs: string | null;
  troca_serial: string | null;
  troca_imei: string | null;
  troca_garantia: string | null;
  // Troca 2
  troca_produto2: string | null;
  troca_cor2: string | null;
  troca_categoria2: string | null;
  troca_valor2: number;
  troca_bateria2: string | null;
  troca_grade2: string | null;
  troca_caixa2: string | null;
  troca_cabo2: string | null;
  troca_fonte2: string | null;
  troca_obs2: string | null;
  troca_serial2: string | null;
  troca_imei2: string | null;
  troca_garantia2: string | null;
}

interface Fornecedor {
  id: string;
  nome: string;
}

interface EstoqueItem {
  id: string;
  produto: string;
  cor: string | null;
  categoria: string | null;
  status: string;
  custo_unitario: number | null;
  fornecedor: string | null;
  data_compra: string | null;
  origem_compra: string | null;
  encomenda_id: string | null;
}

// ─── Status system ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  "PENDENTE",
  "COMPRADO",
  "A CAMINHO",
  "CHEGOU",
  "PRONTO_ENTREGA",
  "FINALIZADO",
  "CANCELADA",
] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-700",
  COMPRADO: "bg-blue-100 text-blue-700",
  "A CAMINHO": "bg-purple-100 text-purple-700",
  CHEGOU: "bg-teal-100 text-teal-700",
  PRONTO_ENTREGA: "bg-green-100 text-green-700",
  FINALIZADO: "bg-green-200 text-green-800",
  CANCELADA: "bg-red-100 text-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  COMPRADO: "Comprado",
  "A CAMINHO": "A Caminho",
  CHEGOU: "Chegou",
  PRONTO_ENTREGA: "Pronto p/ Entrega",
  FINALIZADO: "Finalizado",
  CANCELADA: "Cancelada",
};

const CATEGORIA_OPTIONS = [
  "IPHONES",
  "IPADS",
  "MACBOOK",
  "APPLE_WATCH",
  "MAC_MINI",
  "AIRPODS",
  "ACESSORIOS",
] as const;

const FORMA_PAGAMENTO_OPTIONS = [
  "PIX",
  "Cartão Crédito",
  "Cartão Débito",
  "Espécie",
  "PIX + Cartão",
  "Link de Pagamento",
] as const;

const BANCO_OPTIONS = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"] as const;

const fmt = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

// ─── Component ───────────────────────────────────────────────────────────────

export default function EncomendasPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [encomendas, setEncomendas] = useState<Encomenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lista" | "nova">("lista");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Vincular modal
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const [estoqueACaminho, setEstoqueACaminho] = useState<EstoqueItem[]>([]);
  const [estoqueLoading, setEstoqueLoading] = useState(false);

  // Form
  const [form, setForm] = useState({
    // cliente
    cliente: "",
    whatsapp: "",
    cpf: "",
    email: "",
    data: hojeBR(),
    observacao: "",
    // produto
    produto: "",
    cor: "",
    categoria: "",
    armazenamento: "",
    valor_venda: "",
    custo: "",
    fornecedor: "",
    previsao_chegada: "",
    // financeiro
    sinal_recebido: "",
    banco_sinal: "",
    forma_pagamento: "",
    obs_financeira: "",
    // troca 1
    troca_produto: "",
    troca_cor: "",
    troca_categoria: "",
    troca_bateria: "",
    troca_grade: "",
    troca_caixa: "",
    troca_cabo: "",
    troca_fonte: "",
    troca_pulseira: "",
    troca_ciclos: "",
    troca_obs: "",
    troca_valor: "",
    troca_serial: "",
    troca_imei: "",
    troca_garantia: "",
    // troca 2
    troca_produto2: "",
    troca_cor2: "",
    troca_categoria2: "",
    troca_bateria2: "",
    troca_grade2: "",
    troca_caixa2: "",
    troca_cabo2: "",
    troca_fonte2: "",
    troca_obs2: "",
    troca_valor2: "",
    troca_serial2: "",
    troca_imei2: "",
    troca_garantia2: "",
  });

  const [temTroca, setTemTroca] = useState(false);
  const [temSegundaTroca, setTemSegundaTroca] = useState(false);
  const [trocaRow, setTrocaRow] = useState<ProdutoRowState>(() =>
    createEmptyProdutoRow()
  );
  const [trocaRow2, setTrocaRow2] = useState<ProdutoRowState>(() =>
    createEmptyProdutoRow()
  );

  // Sync trocaRow -> form
  useEffect(() => {
    setForm((f) => ({
      ...f,
      troca_produto: trocaRow.produto || f.troca_produto,
      troca_cor: trocaRow.cor || f.troca_cor,
      troca_categoria: trocaRow.categoria || f.troca_categoria,
    }));
  }, [trocaRow.produto, trocaRow.cor, trocaRow.categoria]);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      troca_produto2: trocaRow2.produto || f.troca_produto2,
      troca_cor2: trocaRow2.cor || f.troca_cor2,
      troca_categoria2: trocaRow2.categoria || f.troca_categoria2,
    }));
  }, [trocaRow2.produto, trocaRow2.cor, trocaRow2.categoria]);

  // Fornecedores
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  useEffect(() => {
    fetch("/api/fornecedores", { headers: { "x-admin-password": password } })
      .then((r) => r.json())
      .then((j) => setFornecedores(j.data ?? []))
      .catch(() => {});
  }, [password]);

  // Estoque A Caminho para vincular no formulário
  const [produtosACaminho, setProdutosACaminho] = useState<EstoqueItem[]>([]);
  const [selectedEstoqueId, setSelectedEstoqueId] = useState("");
  useEffect(() => {
    if (tab !== "nova" || !password) return;
    fetch("/api/estoque?status=A%20CAMINHO", { headers: { "x-admin-password": password } })
      .then((r) => r.json())
      .then((j) => setProdutosACaminho((j.data ?? []).filter((p: EstoqueItem) => !p.encomenda_id)))
      .catch(() => {});
  }, [tab, password]);

  // Headers helper
  const hdrs = useCallback(
    () => ({
      "x-admin-password": password,
      "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
    }),
    [password, user?.nome]
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/encomendas", { headers: hdrs() });
      if (res.ok) {
        const json = await res.json();
        setEncomendas(json.data ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [hdrs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useAutoRefetch(fetchData);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.cliente || !form.produto) {
      setMsg("Preencha cliente e produto");
      return;
    }
    setSaving(true);
    setMsg("");
    const body: Record<string, unknown> = {
      cliente: form.cliente,
      whatsapp: form.whatsapp || null,
      cpf: form.cpf || null,
      email: form.email || null,
      data: form.data,
      produto: form.produto,
      cor: form.cor || null,
      categoria: form.categoria || null,
      armazenamento: form.armazenamento || null,
      valor_venda: parseFloat(form.valor_venda) || 0,
      sinal_recebido: parseFloat(form.sinal_recebido) || 0,
      banco_sinal: form.banco_sinal || null,
      custo: parseFloat(form.custo) || 0,
      fornecedor: form.fornecedor || null,
      forma_pagamento: form.forma_pagamento || null,
      obs_financeira: form.obs_financeira || null,
      previsao_chegada: form.previsao_chegada || null,
      observacao: form.observacao || null,
    };
    // Vincular com produto A Caminho se selecionado
    if (selectedEstoqueId) {
      body.estoque_id = selectedEstoqueId;
      body.status = "A CAMINHO";
    }
    if (temTroca) {
      body.troca_produto = trocaRow.produto || form.troca_produto || null;
      body.troca_cor = trocaRow.cor || form.troca_cor || null;
      body.troca_categoria = trocaRow.categoria || form.troca_categoria || null;
      body.troca_valor = parseFloat(form.troca_valor) || 0;
      body.troca_bateria = form.troca_bateria || null;
      body.troca_grade = trocaRow.grade || form.troca_grade || null;
      body.troca_caixa = trocaRow.caixa ? "SIM" : form.troca_caixa || null;
      body.troca_cabo = form.troca_cabo || null;
      body.troca_fonte = form.troca_fonte || null;
      body.troca_pulseira = form.troca_pulseira || null;
      body.troca_ciclos = form.troca_ciclos || null;
      body.troca_obs = form.troca_obs || null;
      body.troca_serial = trocaRow.serial_no || form.troca_serial || null;
      body.troca_imei = trocaRow.imei || form.troca_imei || null;
      body.troca_garantia = form.troca_garantia || null;
    }
    if (temSegundaTroca) {
      body.troca_produto2 = trocaRow2.produto || form.troca_produto2 || null;
      body.troca_cor2 = trocaRow2.cor || form.troca_cor2 || null;
      body.troca_categoria2 =
        trocaRow2.categoria || form.troca_categoria2 || null;
      body.troca_valor2 = parseFloat(form.troca_valor2) || 0;
      body.troca_bateria2 = form.troca_bateria2 || null;
      body.troca_grade2 = form.troca_grade2 || null;
      body.troca_caixa2 = form.troca_caixa2 || null;
      body.troca_cabo2 = form.troca_cabo2 || null;
      body.troca_fonte2 = form.troca_fonte2 || null;
      body.troca_obs2 = form.troca_obs2 || null;
      body.troca_serial2 =
        trocaRow2.serial_no || form.troca_serial2 || null;
      body.troca_imei2 = trocaRow2.imei || form.troca_imei2 || null;
      body.troca_garantia2 = form.troca_garantia2 || null;
    }

    const res = await fetch("/api/encomendas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...hdrs(),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Encomenda registrada!");
      setSelectedEstoqueId("");
      setForm({
        cliente: "",
        whatsapp: "",
        cpf: "",
        email: "",
        data: hojeBR(),
        observacao: "",
        produto: "",
        cor: "",
        categoria: "",
        armazenamento: "",
        valor_venda: "",
        custo: "",
        fornecedor: "",
        previsao_chegada: "",
        sinal_recebido: "",
        banco_sinal: "",
        forma_pagamento: "",
        obs_financeira: "",
        troca_produto: "",
        troca_cor: "",
        troca_categoria: "",
        troca_bateria: "",
        troca_grade: "",
        troca_caixa: "",
        troca_cabo: "",
        troca_fonte: "",
        troca_pulseira: "",
        troca_ciclos: "",
        troca_obs: "",
        troca_valor: "",
        troca_serial: "",
        troca_imei: "",
        troca_garantia: "",
        troca_produto2: "",
        troca_cor2: "",
        troca_categoria2: "",
        troca_bateria2: "",
        troca_grade2: "",
        troca_caixa2: "",
        troca_cabo2: "",
        troca_fonte2: "",
        troca_obs2: "",
        troca_valor2: "",
        troca_serial2: "",
        troca_imei2: "",
        troca_garantia2: "",
      });
      setTemTroca(false);
      setTemSegundaTroca(false);
      setTrocaRow(createEmptyProdutoRow());
      setTrocaRow2(createEmptyProdutoRow());
      fetchData();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  // ─── Status change ─────────────────────────────────────────────────────────

  const handleStatusChange = async (enc: Encomenda, newStatus: string) => {
    await fetch("/api/encomendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...hdrs() },
      body: JSON.stringify({ id: enc.id, status: newStatus }),
    });
    setEncomendas((prev) =>
      prev.map((e) => (e.id === enc.id ? { ...e, status: newStatus } : e))
    );
  };

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (enc: Encomenda) => {
    if (!confirm(`Excluir encomenda de ${enc.cliente}?`)) return;
    await fetch("/api/encomendas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...hdrs() },
      body: JSON.stringify({ id: enc.id }),
    });
    setEncomendas((prev) => prev.filter((e) => e.id !== enc.id));
  };

  // ─── Vincular A Caminho ────────────────────────────────────────────────────

  const handleVincular = async (encId: string) => {
    setVinculandoId(encId);
    setEstoqueLoading(true);
    try {
      const res = await fetch("/api/estoque?status=A%20CAMINHO", {
        headers: hdrs(),
      });
      if (res.ok) {
        const json = await res.json();
        setEstoqueACaminho(json.data ?? []);
      }
    } catch {
      /* ignore */
    }
    setEstoqueLoading(false);
  };

  const confirmVincular = async (estoqueId: string) => {
    if (!vinculandoId) return;
    await fetch("/api/encomendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...hdrs() },
      body: JSON.stringify({
        id: vinculandoId,
        estoque_id: estoqueId,
        status: "A CAMINHO",
      }),
    });
    setEncomendas((prev) =>
      prev.map((e) =>
        e.id === vinculandoId
          ? { ...e, estoque_id: estoqueId, status: "A CAMINHO" }
          : e
      )
    );
    setVinculandoId(null);
  };

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const filtered = encomendas.filter((e) => {
    if (filterStatus && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [
        e.cliente,
        e.produto,
        e.fornecedor,
        e.whatsapp,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const active = encomendas.filter(
    (e) => e.status !== "FINALIZADO" && e.status !== "CANCELADA"
  );
  const pendentes = encomendas.filter((e) => e.status === "PENDENTE").length;
  const aCaminho = encomendas.filter(
    (e) => e.status === "A CAMINHO" || e.status === "COMPRADO"
  ).length;
  const totalSinais = active.reduce(
    (s, e) => s + (e.sinal_recebido || 0),
    0
  );
  const totalTrocas = active.reduce(
    (s, e) => s + (e.troca_valor || 0) + (e.troca_valor2 || 0),
    0
  );
  const totalPendente = active.reduce(
    (s, e) =>
      s +
      (e.valor_venda -
        (e.sinal_recebido || 0) -
        (e.troca_valor || 0) -
        (e.troca_valor2 || 0)),
    0
  );

  // ─── Falta receber (form) ──────────────────────────────────────────────────

  const faltaReceber =
    (parseFloat(form.valor_venda) || 0) -
    (parseFloat(form.sinal_recebido) || 0) -
    (parseFloat(form.troca_valor) || 0) -
    (parseFloat(form.troca_valor2) || 0);

  // ─── Style classes ─────────────────────────────────────────────────────────

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${
    dm
      ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]"
      : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"
  }`;
  const selectCls = `${inputCls} appearance-none`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${
    dm ? "text-[#98989D]" : "text-[#86868B]"
  }`;
  const cardCls = `${
    dm
      ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]"
      : "bg-white border-[#D2D2D7] text-[#1D1D1F]"
  } border rounded-2xl p-6 shadow-sm`;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`px-4 py-3 rounded-xl text-sm ${
            msg.includes("Erro")
              ? dm
                ? "bg-red-900/40 text-red-300"
                : "bg-red-50 text-red-700"
              : dm
                ? "bg-green-900/40 text-green-300"
                : "bg-green-50 text-green-700"
          }`}
        >
          {msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pendentes", value: pendentes, color: "#F39C12" },
          { label: "Comprado / A Caminho", value: aCaminho, color: "#3498DB" },
          { label: "Sinais recebidos", value: fmt(totalSinais), color: "#2ECC71" },
          { label: "Falta receber", value: fmt(totalPendente), color: "#E8740E" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`${
              dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"
            } border rounded-2xl p-4 shadow-sm`}
          >
            <p
              className={`text-xs mb-1 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              {kpi.label}
            </p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2">
          {(["lista", "nova"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-[#E8740E] text-white"
                  : `${
                      dm
                        ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]"
                        : "bg-white border border-[#D2D2D7] text-[#86868B]"
                    } hover:border-[#E8740E]`
              }`}
            >
              {t === "lista"
                ? `Encomendas (${encomendas.length})`
                : "Nova Encomenda"}
            </button>
          ))}
        </div>
      </div>

      {/* ────────────────────────── NOVA ENCOMENDA ────────────────────────── */}
      {tab === "nova" ? (
        <div className="space-y-6">
          {/* Block 1: Dados do Cliente */}
          <div className={cardCls}>
            <h3
              className={`text-sm font-bold uppercase tracking-wider mb-4 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Dados do Cliente
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <p className={labelCls}>Cliente *</p>
                <input
                  value={form.cliente}
                  onChange={(e) => set("cliente", e.target.value)}
                  className={inputCls}
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <p className={labelCls}>WhatsApp</p>
                <input
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  className={inputCls}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <p className={labelCls}>CPF</p>
                <input
                  value={form.cpf}
                  onChange={(e) => set("cpf", e.target.value)}
                  className={inputCls}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputCls}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <p className={labelCls}>Data</p>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => set("data", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <p className={labelCls}>Observacao</p>
                <input
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  className={inputCls}
                  placeholder="Obs gerais da encomenda..."
                />
              </div>
            </div>
          </div>

          {/* Block 2: Produto Encomendado */}
          <div className={cardCls}>
            <h3
              className={`text-sm font-bold uppercase tracking-wider mb-4 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Produto Encomendado
            </h3>
            {/* Vincular com produto A Caminho */}
            {produtosACaminho.length > 0 && (
              <div className="mb-4">
                <p className={labelCls}>Vincular a produto A Caminho</p>
                <select
                  value={selectedEstoqueId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedEstoqueId(id);
                    if (id) {
                      const item = produtosACaminho.find((p) => p.id === id);
                      if (item) {
                        set("produto", item.produto);
                        set("cor", item.cor || "");
                        set("categoria", item.categoria || "");
                        set("custo", String(item.custo_unitario || ""));
                        set("fornecedor", item.fornecedor || "");
                      }
                    }
                  }}
                  className={selectCls}
                >
                  <option value="">-- Digitar manualmente --</option>
                  {produtosACaminho.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.produto}{item.cor ? ` (${item.cor})` : ""} — {item.fornecedor || "sem fornecedor"}{item.custo_unitario ? ` — R$ ${Math.round(item.custo_unitario).toLocaleString("pt-BR")}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <p className={labelCls}>Produto *</p>
                <input
                  value={form.produto}
                  onChange={(e) => set("produto", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: iPhone 16 Pro Max 256GB"
                />
              </div>
              <div>
                <p className={labelCls}>Cor</p>
                <input
                  value={form.cor}
                  onChange={(e) => set("cor", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: Titanio Natural"
                />
              </div>
              <div>
                <p className={labelCls}>Categoria</p>
                <select
                  value={form.categoria}
                  onChange={(e) => set("categoria", e.target.value)}
                  className={selectCls}
                >
                  <option value="">--</option>
                  {CATEGORIA_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Armazenamento</p>
                <input
                  value={form.armazenamento}
                  onChange={(e) => set("armazenamento", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: 256GB"
                />
              </div>
              <div>
                <p className={labelCls}>Valor de Venda (R$)</p>
                <input
                  type="number"
                  value={form.valor_venda}
                  onChange={(e) => set("valor_venda", e.target.value)}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
              <div>
                <p className={labelCls}>Custo (R$)</p>
                <input
                  type="number"
                  value={form.custo}
                  onChange={(e) => set("custo", e.target.value)}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
              <div>
                <p className={labelCls}>Fornecedor</p>
                <input
                  value={form.fornecedor}
                  onChange={(e) => set("fornecedor", e.target.value)}
                  className={inputCls}
                  placeholder="Nome do fornecedor"
                />
              </div>
              <div>
                <p className={labelCls}>Previsao de Chegada</p>
                <input
                  type="date"
                  value={form.previsao_chegada}
                  onChange={(e) => set("previsao_chegada", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Block 3: Dados Financeiros */}
          <div className={cardCls}>
            <h3
              className={`text-sm font-bold uppercase tracking-wider mb-4 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Dados Financeiros
            </h3>
            <label className={`flex items-center gap-2 mb-3 cursor-pointer`}>
              <input
                type="checkbox"
                checked={parseFloat(form.sinal_recebido) > 0 && parseFloat(form.sinal_recebido) === parseFloat(form.valor_venda)}
                onChange={(e) => {
                  if (e.target.checked) {
                    set("sinal_recebido", form.valor_venda || "0");
                  } else {
                    set("sinal_recebido", "0");
                  }
                }}
                className="accent-[#2ECC71] w-4 h-4"
              />
              <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Pago integralmente (cliente ja pagou tudo)</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className={labelCls}>Sinal Recebido (R$)</p>
                <input
                  type="number"
                  value={form.sinal_recebido}
                  onChange={(e) => set("sinal_recebido", e.target.value)}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
              <div>
                <p className={labelCls}>Banco do Sinal</p>
                <select
                  value={form.banco_sinal}
                  onChange={(e) => set("banco_sinal", e.target.value)}
                  className={selectCls}
                >
                  <option value="">--</option>
                  {BANCO_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Forma de Pagamento</p>
                <select
                  value={form.forma_pagamento}
                  onChange={(e) => set("forma_pagamento", e.target.value)}
                  className={selectCls}
                >
                  <option value="">--</option>
                  {FORMA_PAGAMENTO_OPTIONS.map((fp) => (
                    <option key={fp} value={fp}>
                      {fp}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Falta Receber</p>
                <div
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    dm
                      ? "bg-[#2C2C2E] border-[#3A3A3C]"
                      : "bg-[#F5F5F7] border-[#D2D2D7]"
                  }`}
                  style={{ color: "#E8740E" }}
                >
                  {fmt(Math.max(0, faltaReceber))}
                </div>
              </div>
              <div className="col-span-2 md:col-span-4">
                <p className={labelCls}>Obs Financeira</p>
                <textarea
                  value={form.obs_financeira}
                  onChange={(e) => set("obs_financeira", e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Observacoes sobre pagamento, parcelas, etc."
                />
              </div>
            </div>
          </div>

          {/* Block 4: Produto na Troca */}
          <div className={cardCls}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={temTroca}
                onChange={(e) => {
                  setTemTroca(e.target.checked);
                  if (!e.target.checked) {
                    setTemSegundaTroca(false);
                    setTrocaRow(createEmptyProdutoRow());
                    setTrocaRow2(createEmptyProdutoRow());
                    setForm((f) => ({
                      ...f,
                      troca_produto: "",
                      troca_cor: "",
                      troca_categoria: "",
                      troca_bateria: "",
                      troca_grade: "",
                      troca_caixa: "",
                      troca_cabo: "",
                      troca_fonte: "",
                      troca_pulseira: "",
                      troca_ciclos: "",
                      troca_obs: "",
                      troca_valor: "",
                      troca_serial: "",
                      troca_imei: "",
                      troca_garantia: "",
                      troca_produto2: "",
                      troca_cor2: "",
                      troca_categoria2: "",
                      troca_bateria2: "",
                      troca_grade2: "",
                      troca_caixa2: "",
                      troca_cabo2: "",
                      troca_fonte2: "",
                      troca_obs2: "",
                      troca_valor2: "",
                      troca_serial2: "",
                      troca_imei2: "",
                      troca_garantia2: "",
                    }));
                  }
                }}
                className="accent-[#E8740E]"
              />
              <span
                className={`text-sm font-bold uppercase tracking-wider ${
                  dm ? "text-[#98989D]" : "text-[#86868B]"
                }`}
              >
                Produto na Troca
              </span>
            </label>

            {temTroca && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className={labelCls}>Valor da Troca (R$)</p>
                    <input
                      type="number"
                      value={form.troca_valor}
                      onChange={(e) => set("troca_valor", e.target.value)}
                      className={inputCls}
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <ProdutoSpecFields
                      row={trocaRow}
                      onChange={setTrocaRow}
                      onRemove={() => {}}
                      fornecedores={fornecedores}
                      inputCls={inputCls}
                      labelCls={labelCls}
                      darkMode={dm}
                      index={0}
                      compactMode
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Bateria (%)</p>
                    <input
                      type="number"
                      value={form.troca_bateria}
                      onChange={(e) => set("troca_bateria", e.target.value)}
                      placeholder="Ex: 87"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Garantia</p>
                    <input
                      value={form.troca_garantia}
                      onChange={(e) => set("troca_garantia", e.target.value)}
                      placeholder="DD/MM/AAAA ou MM/AAAA"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Grade</p>
                    <select
                      value={form.troca_grade}
                      onChange={(e) => set("troca_grade", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Selecionar</option>
                      <option value="A+">A+ (Impecavel)</option>
                      <option value="A">A (Otimo)</option>
                      <option value="AB">AB (Muito bom)</option>
                      <option value="B">B (Bom)</option>
                      <option value="C">C (Marcas visiveis)</option>
                    </select>
                  </div>
                  {/* Conditional checkboxes */}
                  {(() => {
                    const tCat =
                      form.troca_categoria || trocaRow.categoria || "";
                    const tShowCabo = [
                      "IPHONES",
                      "MACBOOK",
                      "IPADS",
                      "APPLE_WATCH",
                    ].includes(tCat);
                    const tShowFonte = ["MACBOOK", "IPADS"].includes(tCat);
                    const tShowPulseira = tCat === "APPLE_WATCH";
                    const tShowCiclos = tCat === "MACBOOK";
                    return (
                      <>
                        <div className="flex gap-3 items-center flex-wrap">
                          <label className="flex items-center gap-1 text-xs text-[#86868B]">
                            <input
                              type="checkbox"
                              checked={form.troca_caixa === "SIM"}
                              onChange={(e) =>
                                set(
                                  "troca_caixa",
                                  e.target.checked ? "SIM" : ""
                                )
                              }
                              className="accent-[#E8740E]"
                            />{" "}
                            Caixa
                          </label>
                          {tShowCabo && (
                            <label className="flex items-center gap-1 text-xs text-[#86868B]">
                              <input
                                type="checkbox"
                                checked={form.troca_cabo === "SIM"}
                                onChange={(e) =>
                                  set(
                                    "troca_cabo",
                                    e.target.checked ? "SIM" : ""
                                  )
                                }
                                className="accent-[#E8740E]"
                              />{" "}
                              Cabo
                            </label>
                          )}
                          {tShowFonte && (
                            <label className="flex items-center gap-1 text-xs text-[#86868B]">
                              <input
                                type="checkbox"
                                checked={form.troca_fonte === "SIM"}
                                onChange={(e) =>
                                  set(
                                    "troca_fonte",
                                    e.target.checked ? "SIM" : ""
                                  )
                                }
                                className="accent-[#E8740E]"
                              />{" "}
                              Fonte
                            </label>
                          )}
                          {tShowPulseira && (
                            <label className="flex items-center gap-1 text-xs text-[#86868B]">
                              <input
                                type="checkbox"
                                checked={form.troca_pulseira === "SIM"}
                                onChange={(e) =>
                                  set(
                                    "troca_pulseira",
                                    e.target.checked ? "SIM" : ""
                                  )
                                }
                                className="accent-[#E8740E]"
                              />{" "}
                              Pulseira
                            </label>
                          )}
                        </div>
                        {tShowCiclos && (
                          <div>
                            <p className={labelCls}>Ciclos</p>
                            <input
                              type="number"
                              value={form.troca_ciclos}
                              onChange={(e) =>
                                set("troca_ciclos", e.target.value)
                              }
                              placeholder="Ex: 120"
                              className={inputCls}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="col-span-2 md:col-span-3">
                    <p className={labelCls}>Obs do seminovo</p>
                    <input
                      value={form.troca_obs}
                      onChange={(e) => set("troca_obs", e.target.value)}
                      placeholder="Detalhes adicionais..."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Serial</p>
                    <input
                      value={form.troca_serial}
                      onChange={(e) =>
                        set("troca_serial", e.target.value.toUpperCase())
                      }
                      placeholder="Ex: F2LX..."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <p className={labelCls}>IMEI</p>
                    <input
                      value={form.troca_imei}
                      onChange={(e) =>
                        set(
                          "troca_imei",
                          e.target.value.replace(/\D/g, "").slice(0, 15)
                        )
                      }
                      placeholder="Ex: 35938..."
                      className={inputCls}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                {/* Button 2nd trade */}
                {!temSegundaTroca && (
                  <button
                    type="button"
                    onClick={() => setTemSegundaTroca(true)}
                    className={`w-full py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      dm
                        ? "text-orange-400 border-orange-700 hover:bg-orange-900/30"
                        : "text-orange-600 border-orange-300 hover:bg-orange-50"
                    }`}
                  >
                    + Adicionar 2o produto na troca
                  </button>
                )}

                {/* 2nd trade product */}
                {temSegundaTroca && (
                  <div
                    className={`mt-4 pt-4 border-t border-dashed ${
                      dm ? "border-orange-700" : "border-orange-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p
                        className={`text-sm font-bold ${
                          dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"
                        }`}
                      >
                        2o Produto na troca
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setTemSegundaTroca(false);
                          setTrocaRow2(createEmptyProdutoRow());
                          setForm((f) => ({
                            ...f,
                            troca_produto2: "",
                            troca_cor2: "",
                            troca_categoria2: "",
                            troca_bateria2: "",
                            troca_grade2: "",
                            troca_caixa2: "",
                            troca_cabo2: "",
                            troca_fonte2: "",
                            troca_obs2: "",
                            troca_valor2: "",
                            troca_serial2: "",
                            troca_imei2: "",
                            troca_garantia2: "",
                          }));
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Remover
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className={labelCls}>Valor da 2a Troca (R$)</p>
                        <input
                          type="number"
                          value={form.troca_valor2}
                          onChange={(e) =>
                            set("troca_valor2", e.target.value)
                          }
                          className={inputCls}
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <ProdutoSpecFields
                          row={trocaRow2}
                          onChange={setTrocaRow2}
                          onRemove={() => {}}
                          fornecedores={fornecedores}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          darkMode={dm}
                          index={1}
                          compactMode
                        />
                      </div>
                      <div>
                        <p className={labelCls}>Bateria (%)</p>
                        <input
                          type="number"
                          value={form.troca_bateria2}
                          onChange={(e) =>
                            set("troca_bateria2", e.target.value)
                          }
                          placeholder="Ex: 85"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <p className={labelCls}>Garantia</p>
                        <input
                          value={form.troca_garantia2}
                          onChange={(e) =>
                            set("troca_garantia2", e.target.value)
                          }
                          placeholder="DD/MM/AAAA ou MM/AAAA"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <p className={labelCls}>Grade</p>
                        <select
                          value={form.troca_grade2}
                          onChange={(e) =>
                            set("troca_grade2", e.target.value)
                          }
                          className={selectCls}
                        >
                          <option value="">Selecionar</option>
                          <option value="A+">A+ (Impecavel)</option>
                          <option value="A">A (Otimo)</option>
                          <option value="AB">AB (Muito bom)</option>
                          <option value="B">B (Bom)</option>
                          <option value="C">C (Marcas visiveis)</option>
                        </select>
                      </div>
                      {(() => {
                        const tCat2 =
                          form.troca_categoria2 || trocaRow2.categoria || "";
                        const tShowCabo2 = [
                          "IPHONES",
                          "MACBOOK",
                          "IPADS",
                          "APPLE_WATCH",
                        ].includes(tCat2);
                        const tShowFonte2 = ["MACBOOK", "IPADS"].includes(
                          tCat2
                        );
                        return (
                          <>
                            <div className="flex gap-3 items-center flex-wrap">
                              <label className="flex items-center gap-1 text-xs text-[#86868B]">
                                <input
                                  type="checkbox"
                                  checked={form.troca_caixa2 === "SIM"}
                                  onChange={(e) =>
                                    set(
                                      "troca_caixa2",
                                      e.target.checked ? "SIM" : ""
                                    )
                                  }
                                  className="accent-[#E8740E]"
                                />{" "}
                                Caixa
                              </label>
                              {tShowCabo2 && (
                                <label className="flex items-center gap-1 text-xs text-[#86868B]">
                                  <input
                                    type="checkbox"
                                    checked={form.troca_cabo2 === "SIM"}
                                    onChange={(e) =>
                                      set(
                                        "troca_cabo2",
                                        e.target.checked ? "SIM" : ""
                                      )
                                    }
                                    className="accent-[#E8740E]"
                                  />{" "}
                                  Cabo
                                </label>
                              )}
                              {tShowFonte2 && (
                                <label className="flex items-center gap-1 text-xs text-[#86868B]">
                                  <input
                                    type="checkbox"
                                    checked={form.troca_fonte2 === "SIM"}
                                    onChange={(e) =>
                                      set(
                                        "troca_fonte2",
                                        e.target.checked ? "SIM" : ""
                                      )
                                    }
                                    className="accent-[#E8740E]"
                                  />{" "}
                                  Fonte
                                </label>
                              )}
                            </div>
                          </>
                        );
                      })()}
                      <div className="col-span-2 md:col-span-3">
                        <p className={labelCls}>Obs do seminovo</p>
                        <input
                          value={form.troca_obs2}
                          onChange={(e) => set("troca_obs2", e.target.value)}
                          placeholder="Detalhes adicionais..."
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <p className={labelCls}>Serial</p>
                        <input
                          value={form.troca_serial2}
                          onChange={(e) =>
                            set(
                              "troca_serial2",
                              e.target.value.toUpperCase()
                            )
                          }
                          placeholder="Ex: F2LX..."
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <p className={labelCls}>IMEI</p>
                        <input
                          value={form.troca_imei2}
                          onChange={(e) =>
                            set(
                              "troca_imei2",
                              e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 15)
                            )
                          }
                          placeholder="Ex: 35938..."
                          className={inputCls}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Registrar Encomenda"}
          </button>
        </div>
      ) : (
        /* ────────────────────────── LISTA ────────────────────────── */
        <div className="space-y-4">
          {/* Status filter chips + search */}
          <div className="flex flex-wrap gap-2 items-center">
            {[
              { label: "Todas", value: "" },
              { label: "Pendentes", value: "PENDENTE" },
              { label: "Comprado", value: "COMPRADO" },
              { label: "A Caminho", value: "A CAMINHO" },
              { label: "Chegou", value: "CHEGOU" },
              { label: "Pronto p/ Entrega", value: "PRONTO_ENTREGA" },
              { label: "Finalizados", value: "FINALIZADO" },
              { label: "Canceladas", value: "CANCELADA" },
            ].map((chip) => (
              <button
                key={chip.value}
                onClick={() => setFilterStatus(chip.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === chip.value
                    ? "bg-[#E8740E] text-white"
                    : `${
                        dm
                          ? "bg-[#2C2C2E] text-[#98989D] border border-[#3A3A3C]"
                          : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7]"
                      } hover:border-[#E8740E]`
                }`}
              >
                {chip.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, produto, fornecedor..."
              className={`${inputCls} max-w-xs ml-auto`}
            />
          </div>

          {/* Cards */}
          {loading ? (
            <div
              className={`text-center py-12 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div
              className={`text-center py-12 ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Nenhuma encomenda encontrada
            </div>
          ) : (
            filtered.map((enc) => {
              const isExpanded = expandedId === enc.id;
              const resta =
                enc.valor_venda -
                (enc.sinal_recebido || 0) -
                (enc.troca_valor || 0) -
                (enc.troca_valor2 || 0);
              const hasTroca =
                !!enc.troca_produto || (enc.troca_valor || 0) > 0;
              const hasTroca2 =
                !!enc.troca_produto2 || (enc.troca_valor2 || 0) > 0;

              return (
                <div
                  key={enc.id}
                  className={`${
                    dm
                      ? "bg-[#1C1C1E] border-[#3A3A3C]"
                      : "bg-white border-[#D2D2D7]"
                  } border rounded-2xl shadow-sm overflow-hidden transition-all`}
                >
                  {/* Collapsed row */}
                  <div
                    className="px-4 py-3 flex items-center gap-3 flex-wrap cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : enc.id)
                    }
                  >
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        STATUS_COLORS[enc.status] || "bg-gray-100"
                      }`}
                    >
                      {STATUS_LABELS[enc.status] || enc.status}
                    </span>
                    <span
                      className={`font-medium text-sm ${
                        dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"
                      }`}
                    >
                      {enc.cliente}
                    </span>
                    <span
                      className={`text-sm ${
                        dm ? "text-[#98989D]" : "text-[#86868B]"
                      }`}
                    >
                      {enc.produto}
                      {enc.cor ? ` ${corParaPT(enc.cor)}` : ""}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#E8740E" }}>
                      {fmt(enc.valor_venda)}
                    </span>
                    {(enc.sinal_recebido || 0) > 0 && (
                      <span className="text-xs text-green-600">
                        Sinal: {fmt(enc.sinal_recebido)}
                      </span>
                    )}
                    <span className="text-xs font-bold" style={{ color: "#E8740E" }}>
                      Resta: {fmt(Math.max(0, resta))}
                    </span>
                    {enc.fornecedor && (
                      <span
                        className={`text-xs ${
                          dm ? "text-[#98989D]" : "text-[#86868B]"
                        }`}
                      >
                        {enc.fornecedor}
                      </span>
                    )}
                    <span
                      className={`ml-auto text-xs ${
                        dm ? "text-[#98989D]" : "text-[#86868B]"
                      }`}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div
                      className={`px-4 pb-4 pt-2 border-t ${
                        dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"
                      } space-y-4`}
                    >
                      {/* Dados do Cliente */}
                      <div>
                        <p
                          className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                            dm ? "text-[#98989D]" : "text-[#86868B]"
                          }`}
                        >
                          Dados do Cliente
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Nome: </span>
                            <span className="font-medium">{enc.cliente}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>WhatsApp: </span>
                            {enc.whatsapp ? (
                              <a
                                href={`https://wa.me/${enc.whatsapp.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-500 underline"
                              >
                                {enc.whatsapp}
                              </a>
                            ) : (
                              <span>--</span>
                            )}
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>CPF: </span>
                            <span>{enc.cpf || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Email: </span>
                            <span>{enc.email || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Data: </span>
                            <span>{enc.data}</span>
                          </div>
                          {enc.observacao && (
                            <div className="col-span-2">
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Obs: </span>
                              <span>{enc.observacao}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Produto */}
                      <div>
                        <p
                          className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                            dm ? "text-[#98989D]" : "text-[#86868B]"
                          }`}
                        >
                          Produto
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Produto: </span>
                            <span className="font-medium">{enc.produto}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cor: </span>
                            <span>{enc.cor ? corParaPT(enc.cor) : "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Categoria: </span>
                            <span>{enc.categoria || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Armazenamento: </span>
                            <span>{enc.armazenamento || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Custo: </span>
                            <span>{fmt(enc.custo)}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Valor Venda: </span>
                            <span className="font-bold">{fmt(enc.valor_venda)}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Fornecedor: </span>
                            <span>{enc.fornecedor || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Previsao: </span>
                            <span>{enc.previsao_chegada || "--"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Financeiro */}
                      <div>
                        <p
                          className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                            dm ? "text-[#98989D]" : "text-[#86868B]"
                          }`}
                        >
                          Financeiro
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Sinal: </span>
                            <span className="text-green-600 font-medium">
                              {enc.sinal_recebido ? fmt(enc.sinal_recebido) : "--"}
                            </span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Banco: </span>
                            <span>{enc.banco_sinal || "--"}</span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Falta Receber: </span>
                            <span className="font-bold" style={{ color: "#E8740E" }}>
                              {fmt(Math.max(0, resta))}
                            </span>
                          </div>
                          <div>
                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Forma: </span>
                            <span>{enc.forma_pagamento || "--"}</span>
                          </div>
                          {enc.obs_financeira && (
                            <div className="col-span-2">
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Obs: </span>
                              <span>{enc.obs_financeira}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Troca 1 */}
                      {hasTroca && (
                        <div>
                          <p
                            className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                              dm ? "text-[#98989D]" : "text-[#86868B]"
                            }`}
                          >
                            Troca
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Produto: </span>
                              <span>{enc.troca_produto || "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cor: </span>
                              <span>{enc.troca_cor ? corParaPT(enc.troca_cor) : "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Bateria: </span>
                              <span>{enc.troca_bateria ? `${enc.troca_bateria}%` : "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Grade: </span>
                              <span>{enc.troca_grade || "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Valor: </span>
                              <span className="text-green-600 font-medium">
                                {fmt(enc.troca_valor || 0)}
                              </span>
                            </div>
                            {enc.troca_obs && (
                              <div className="col-span-2">
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Obs: </span>
                                <span>{enc.troca_obs}</span>
                              </div>
                            )}
                            {enc.troca_serial && (
                              <div>
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Serial: </span>
                                <span className="font-mono text-xs">{enc.troca_serial}</span>
                              </div>
                            )}
                            {enc.troca_imei && (
                              <div>
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>IMEI: </span>
                                <span className="font-mono text-xs">{enc.troca_imei}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Troca 2 */}
                      {hasTroca2 && (
                        <div>
                          <p
                            className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                              dm ? "text-[#98989D]" : "text-[#86868B]"
                            }`}
                          >
                            2a Troca
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Produto: </span>
                              <span>{enc.troca_produto2 || "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cor: </span>
                              <span>{enc.troca_cor2 ? corParaPT(enc.troca_cor2) : "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Bateria: </span>
                              <span>{enc.troca_bateria2 ? `${enc.troca_bateria2}%` : "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Grade: </span>
                              <span>{enc.troca_grade2 || "--"}</span>
                            </div>
                            <div>
                              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Valor: </span>
                              <span className="text-green-600 font-medium">
                                {fmt(enc.troca_valor2 || 0)}
                              </span>
                            </div>
                            {enc.troca_obs2 && (
                              <div className="col-span-2">
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Obs: </span>
                                <span>{enc.troca_obs2}</span>
                              </div>
                            )}
                            {enc.troca_serial2 && (
                              <div>
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Serial: </span>
                                <span className="font-mono text-xs">{enc.troca_serial2}</span>
                              </div>
                            )}
                            {enc.troca_imei2 && (
                              <div>
                                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>IMEI: </span>
                                <span className="font-mono text-xs">{enc.troca_imei2}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Vinculo */}
                      {(enc.estoque_id || enc.venda_id) && (
                        <div>
                          <p
                            className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                              dm ? "text-[#98989D]" : "text-[#86868B]"
                            }`}
                          >
                            Vinculo
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {enc.estoque_id && (
                              <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-100 text-blue-700">
                                Estoque: {enc.estoque_id.slice(0, 8)}...
                              </span>
                            )}
                            {enc.venda_id && (
                              <span className="px-2 py-0.5 rounded-lg text-xs bg-green-100 text-green-700">
                                Venda: {enc.venda_id.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div
                        className={`flex items-center gap-3 flex-wrap pt-3 border-t ${
                          dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs ${
                              dm ? "text-[#98989D]" : "text-[#86868B]"
                            }`}
                          >
                            Status:
                          </span>
                          <select
                            value={enc.status}
                            onChange={(e) =>
                              handleStatusChange(enc, e.target.value)
                            }
                            className={`px-2 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${
                              STATUS_COLORS[enc.status] || "bg-gray-100"
                            }`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s] || s}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => handleVincular(enc.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            dm
                              ? "bg-purple-900/40 text-purple-300 hover:bg-purple-900/60"
                              : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                          }`}
                        >
                          Vincular Produto A Caminho
                        </button>

                        <button
                          onClick={() => handleDelete(enc)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors ml-auto"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Vincular modal */}
      {vinculandoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className={`${
              dm ? "bg-[#1C1C1E] text-[#F5F5F7]" : "bg-white text-[#1D1D1F]"
            } rounded-2xl p-6 shadow-xl max-w-md w-full mx-4 space-y-4`}
          >
            <h3 className="text-lg font-bold">Vincular Produto do Estoque</h3>
            <p
              className={`text-sm ${
                dm ? "text-[#98989D]" : "text-[#86868B]"
              }`}
            >
              Selecione um produto com status &quot;A Caminho&quot; para vincular a esta
              encomenda.
            </p>
            {estoqueLoading ? (
              <p className="text-sm text-center py-4">Carregando...</p>
            ) : estoqueACaminho.length === 0 ? (
              <p className="text-sm text-center py-4 text-[#86868B]">
                Nenhum produto &quot;A Caminho&quot; no estoque
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {estoqueACaminho.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => confirmVincular(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors ${
                      dm
                        ? "border-[#3A3A3C] hover:border-[#E8740E] hover:bg-[#2C2C2E]"
                        : "border-[#D2D2D7] hover:border-[#E8740E] hover:bg-[#F5F5F7]"
                    }`}
                  >
                    <span className="font-medium">{item.produto}</span>
                    {item.cor && (
                      <span className="ml-1 text-xs">
                        ({corParaPT(item.cor)})
                      </span>
                    )}
                    <span
                      className={`ml-2 text-xs ${
                        dm ? "text-[#98989D]" : "text-[#86868B]"
                      }`}
                    >
                      {item.id.slice(0, 8)}...
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setVinculandoId(null)}
              className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
                dm
                  ? "bg-[#2C2C2E] text-[#98989D] hover:text-[#F5F5F7]"
                  : "bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
              }`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
