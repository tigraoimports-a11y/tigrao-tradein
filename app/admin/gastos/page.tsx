"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS_GASTO } from "@/lib/admin-types";
import { useTabParam } from "@/lib/useTabParam";
import type { Gasto, Banco } from "@/lib/admin-types";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import { STRUCTURED_CATS, buildProdutoName } from "@/lib/produto-specs";

// Formata número com separador de milhares: 31434 → "31.434"
const fmtNum = (v: string) => {
  const clean = v.replace(/[^\d,.-]/g, "").replace(/\./g, "");
  const num = parseFloat(clean.replace(",", "."));
  if (isNaN(num)) return v;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
const parseNum = (v: string) => v.replace(/\./g, "").replace(",", ".");

const BANCOS: Banco[] = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"];
const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

type BancoValores = Record<Banco, string>;
const emptyBancoValores = (): BancoValores => ({ ITAU: "", INFINITE: "", MERCADO_PAGO: "", ESPECIE: "" });

interface GastoGrupo {
  key: string;
  grupo_id: string | null;
  pedido_fornecedor_id: string | null;
  items: Gasto[];
  totalValor: number;
  data: string;
  categoria: string;
  descricao: string | null;
  observacao: string | null;
  hora: string | null;
  is_dep_esp: boolean;
  bancos: string;
}

function agruparGastos(gastos: Gasto[]): GastoGrupo[] {
  const grupoMap = new Map<string, Gasto[]>();
  const avulsos: Gasto[] = [];

  for (const g of gastos) {
    if (g.grupo_id) {
      const arr = grupoMap.get(g.grupo_id) || [];
      arr.push(g);
      grupoMap.set(g.grupo_id, arr);
    } else {
      avulsos.push(g);
    }
  }

  const result: GastoGrupo[] = [];

  for (const [grupoId, items] of grupoMap) {
    const first = items[0];
    result.push({
      key: grupoId,
      grupo_id: grupoId,
      pedido_fornecedor_id: first.pedido_fornecedor_id || null,
      items,
      totalValor: items.reduce((s, i) => s + Number(i.valor), 0),
      data: first.data,
      categoria: first.categoria,
      descricao: first.descricao,
      observacao: first.observacao,
      hora: first.hora,
      is_dep_esp: first.is_dep_esp,
      bancos: items.map((i) => `${i.banco}: ${fmt(i.valor)}`).join(" | "),
    });
  }

  for (const g of avulsos) {
    result.push({
      key: g.id,
      grupo_id: null,
      pedido_fornecedor_id: g.pedido_fornecedor_id || null,
      items: [g],
      totalValor: Number(g.valor),
      data: g.data,
      categoria: g.categoria,
      descricao: g.descricao,
      observacao: g.observacao,
      hora: g.hora,
      is_dep_esp: g.is_dep_esp,
      bancos: g.banco || "—",
    });
  }

  result.sort((a, b) => b.data.localeCompare(a.data));
  return result;
}

// Componente para mostrar produtos vinculados no histórico
function ProdutosVinculados({ pedidoFornecedorId, password, dm }: { pedidoFornecedorId: string; password: string; dm: boolean }) {
  const [produtos, setProdutos] = useState<{ id: string; produto: string; cor: string; qnt: number; custo_unitario: number; status: string; fornecedor: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/estoque?pedido_fornecedor_id=${pedidoFornecedorId}`, {
          headers: { "x-admin-password": password },
        });
        if (res.ok) {
          const json = await res.json();
          setProdutos(json.data ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [pedidoFornecedorId, password]);

  if (loading) return <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Carregando produtos...</p>;
  if (produtos.length === 0) return null;

  return (
    <div className="col-span-2 md:col-span-3 mt-2">
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
        Produtos do pedido ({produtos.length})
      </p>
      <div className="space-y-1.5">
        {produtos.map((p) => (
          <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#3A3A3C]" : "bg-[#F0F0F5]"}`}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "A CAMINHO" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                {p.status}
              </span>
              <span className={`font-medium truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                {p.produto}{p.cor ? ` — ${p.cor}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>x{p.qnt}</span>
              <span className="font-bold text-[#E8740E]">{fmt(p.custo_unitario)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GastosPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const GASTOS_TABS = ["novo", "historico"] as const;
  const [tab, setTab] = useTabParam<"novo" | "historico">("novo", GASTOS_TABS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  // Fornecedores
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);

  // Form state
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    horario: new Date().toTimeString().slice(0, 5),
    categoria: "OUTROS",
    descricao: "",
    observacao: "",
    is_dep_esp: false,
  });
  const [bancoValores, setBancoValores] = useState<BancoValores>(emptyBancoValores());

  // Produtos do pedido fornecedor
  const [pedidoProdutos, setPedidoProdutos] = useState<ProdutoRowState[]>([]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    data: "",
    hora: "",
    categoria: "",
    descricao: "",
    observacao: "",
    is_dep_esp: false,
  });
  const [editBancoValores, setEditBancoValores] = useState<BancoValores>(emptyBancoValores());

  const grupos = useMemo(() => agruparGastos(gastos), [gastos]);

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gastos", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setGastos(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  // Buscar fornecedores
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setFornecedores(json.data ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [password]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));
  const setBanco = (banco: Banco, value: string) => setBancoValores((bv) => ({ ...bv, [banco]: value }));

  const totalForm = BANCOS.reduce((s, b) => s + (parseFloat(bancoValores[b]) || 0), 0);
  const totalProdutos = pedidoProdutos.reduce((s, p) => s + (parseFloat(p.custo_unitario) || 0) * (parseInt(p.qnt) || 0), 0);

  const isFornecedor = form.categoria === "FORNECEDOR";

  const handleSubmit = async () => {
    const filled = BANCOS.filter((b) => parseFloat(bancoValores[b]) > 0);
    if (filled.length === 0) {
      setMsg("Preencha o valor em pelo menos um banco");
      return;
    }
    if (!form.categoria) {
      setMsg("Preencha a categoria");
      return;
    }
    setSaving(true);
    setMsg("");

    const base = {
      data: form.data,
      hora: form.horario || null,
      tipo: "SAIDA",
      categoria: form.categoria,
      descricao: form.descricao || null,
      observacao: form.observacao || null,
      is_dep_esp: form.is_dep_esp,
    };

    // Montar gastos (single ou multi-banco)
    let gastoItems;
    if (filled.length === 1) {
      gastoItems = { ...base, valor: parseFloat(bancoValores[filled[0]]), banco: filled[0] };
    } else {
      const grupoId = crypto.randomUUID();
      gastoItems = filled.map((b) => ({
        ...base,
        valor: parseFloat(bancoValores[b]),
        banco: b,
        grupo_id: grupoId,
      }));
    }

    // Se tem produtos de fornecedor, enviar no formato especial
    let payload;
    if (isFornecedor && pedidoProdutos.length > 0) {
      const produtos = pedidoProdutos.map((p) => {
        const nome = p.produto || (STRUCTURED_CATS.includes(p.categoria) ? buildProdutoName(p.categoria, p.spec) : "");
        return {
          produto: nome,
          categoria: p.categoria,
          qnt: parseInt(p.qnt) || 1,
          custo_unitario: parseFloat(p.custo_unitario) || 0,
          cor: p.cor || null,
          fornecedor: p.fornecedor || null,
          imei: p.imei || null,
          serial_no: p.serial_no || null,
        };
      });
      payload = { gastos: gastoItems, produtos };
    } else {
      payload = gastoItems;
    }

    const res = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      const prodMsg = isFornecedor && pedidoProdutos.length > 0
        ? ` + ${pedidoProdutos.length} produto(s) adicionados como A Caminho`
        : "";
      setMsg(`Gasto registrado!${prodMsg}`);
      setForm((f) => ({ ...f, descricao: "", observacao: "", is_dep_esp: false, horario: new Date().toTimeString().slice(0, 5) }));
      setBancoValores(emptyBancoValores());
      setPedidoProdutos([]);
      fetchGastos();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const startEdit = (g: GastoGrupo) => {
    setViewingKey(null);
    setEditingKey(g.key);
    setEditForm({
      data: g.data,
      hora: g.hora || "",
      descricao: g.descricao || "",
      categoria: g.categoria,
      observacao: g.observacao || "",
      is_dep_esp: g.is_dep_esp,
    });
    const bv = emptyBancoValores();
    for (const item of g.items) {
      if (item.banco) bv[item.banco as Banco] = String(item.valor);
    }
    setEditBancoValores(bv);
  };

  const editSet = (field: string, value: string | boolean) => setEditForm((f) => ({ ...f, [field]: value }));
  const editSetBanco = (banco: Banco, value: string) => setEditBancoValores((bv) => ({ ...bv, [banco]: value }));

  const handleEditSave = async () => {
    if (!editingKey) return;
    setEditSaving(true);

    const grupo = grupos.find((g) => g.key === editingKey);
    if (!grupo) { setEditSaving(false); return; }

    const filled = BANCOS.filter((b) => parseFloat(editBancoValores[b]) > 0);
    if (filled.length === 0) { alert("Preencha o valor em pelo menos um banco"); setEditSaving(false); return; }

    const base = {
      data: editForm.data,
      hora: editForm.hora || null,
      tipo: "SAIDA",
      categoria: editForm.categoria,
      descricao: editForm.descricao || null,
      observacao: editForm.observacao || null,
      is_dep_esp: editForm.is_dep_esp,
    };

    let payload;

    if (grupo.grupo_id) {
      if (filled.length === 1) {
        payload = {
          grupo_id: grupo.grupo_id,
          items: [{ ...base, valor: parseFloat(editBancoValores[filled[0]]), banco: filled[0] }],
        };
      } else {
        const novoGrupoId = crypto.randomUUID();
        payload = {
          grupo_id: grupo.grupo_id,
          items: filled.map((b) => ({
            ...base,
            valor: parseFloat(editBancoValores[b]),
            banco: b,
            grupo_id: novoGrupoId,
          })),
        };
      }
    } else {
      if (filled.length === 1) {
        payload = {
          id: grupo.items[0].id,
          ...base,
          valor: parseFloat(editBancoValores[filled[0]]),
          banco: filled[0],
        };
      } else {
        await fetch("/api/gastos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
          body: JSON.stringify({ id: grupo.items[0].id }),
        });
        const novoGrupoId = crypto.randomUUID();
        const items = filled.map((b) => ({
          ...base,
          valor: parseFloat(editBancoValores[b]),
          banco: b,
          grupo_id: novoGrupoId,
        }));
        const res = await fetch("/api/gastos", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
          body: JSON.stringify(items),
        });
        const json = await res.json();
        if (json.ok) {
          setEditingKey(null);
          fetchGastos();
        } else {
          alert("Erro: " + json.error);
        }
        setEditSaving(false);
        return;
      }
    }

    const res = await fetch("/api/gastos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      setEditingKey(null);
      fetchGastos();
    } else {
      alert("Erro: " + json.error);
    }
    setEditSaving(false);
  };

  const handleDelete = async (g: GastoGrupo) => {
    const hasProdutos = !!g.pedido_fornecedor_id;
    const confirmMsg = hasProdutos
      ? "Excluir este gasto e os produtos A CAMINHO vinculados?"
      : "Excluir este gasto?";
    if (!confirm(confirmMsg)) return;

    const body: Record<string, string> = {};
    if (g.grupo_id) body.grupo_id = g.grupo_id;
    else body.id = g.items[0].id;
    if (g.pedido_fornecedor_id) body.pedido_fornecedor_id = g.pedido_fornecedor_id;

    await fetch("/api/gastos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify(body),
    });
    fetchGastos();
  };

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  const totalSaida = gastos.reduce((s, g) => s + Number(g.valor), 0);

  const bancoInputGrid = (valores: BancoValores, onChange: (b: Banco, v: string) => void, cls: string) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {BANCOS.map((b) => (
        <div key={b}>
          <p className={labelCls}>{b.replace("_", " ")}</p>
          <input type="text" inputMode="decimal" placeholder="0" value={valores[b] ? fmtNum(valores[b]) : ""} onChange={(e) => onChange(b, parseNum(e.target.value))} className={cls} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["novo", "historico"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
            {t === "novo" ? "Novo Gasto" : "Historico"}
          </button>
        ))}
      </div>

      {tab === "novo" ? (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-6 shadow-sm space-y-6`}>
          <h2 className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Registrar Saída</h2>

          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Horario</p><input type="time" value={form.horario} onChange={(e) => set("horario", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
              {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <div><p className={labelCls}>Descricao</p><input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          </div>

          {/* Distribuição por banco */}
          <div className={`p-4 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-semibold uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor por banco</p>
              {totalForm > 0 && (
                <span className="text-sm font-bold text-[#E8740E]">Total: {fmt(totalForm)}</span>
              )}
            </div>
            {bancoInputGrid(bancoValores, setBanco, inputCls)}
            <p className={`text-xs mt-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
              Preencha o valor em cada banco utilizado. Deixe em branco os que não foram usados.
            </p>
          </div>

          {/* Seção de produtos do pedido — só aparece para FORNECEDOR */}
          {isFornecedor && (
            <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-[#E8740E]/40 bg-[#E8740E]/5" : "border-[#E8740E]/30 bg-[#FFF8F0]"} space-y-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Produtos do Pedido</p>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    Cadastre os produtos comprados. Eles entram no estoque como &quot;A Caminho&quot;.
                  </p>
                </div>
                {pedidoProdutos.length > 0 && totalProdutos > 0 && (
                  <div className="text-right">
                    <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Custo total produtos</p>
                    <p className="text-sm font-bold text-[#E8740E]">{fmt(totalProdutos)}</p>
                  </div>
                )}
              </div>

              {pedidoProdutos.map((row, i) => (
                <ProdutoSpecFields
                  key={i}
                  row={row}
                  onChange={(updated) => {
                    const next = [...pedidoProdutos];
                    next[i] = updated;
                    setPedidoProdutos(next);
                  }}
                  onRemove={() => setPedidoProdutos(pedidoProdutos.filter((_, j) => j !== i))}
                  onDuplicate={() => {
                    const clone = { ...row, spec: { ...row.spec }, imei: "", serial_no: "" };
                    const next = [...pedidoProdutos];
                    next.splice(i + 1, 0, clone);
                    setPedidoProdutos(next);
                  }}
                  fornecedores={fornecedores}
                  inputCls={inputCls}
                  labelCls={labelCls}
                  darkMode={dm}
                  index={i}
                />
              ))}

              <button
                type="button"
                onClick={() => setPedidoProdutos([...pedidoProdutos, createEmptyProdutoRow()])}
                className={`w-full py-3 rounded-xl border-2 border-dashed font-semibold text-sm transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`}
              >
                + Adicionar Produto
              </button>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-[#86868B]">
            <input type="checkbox" checked={form.is_dep_esp} onChange={(e) => set("is_dep_esp", e.target.checked)} className="accent-[#E8740E]" />
            Deposito de especie (sai do caixa, entra no banco)
          </label>

          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : isFornecedor && pedidoProdutos.length > 0 ? `Registrar Gasto + ${pedidoProdutos.length} Produto(s)` : "Registrar"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 shadow-sm inline-block`}>
            <p className="text-xs text-[#86868B]">Total Saidas</p>
            <p className="text-xl font-bold text-red-500">{fmt(totalSaida)}</p>
          </div>

          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                    {["Data", "Categoria", "Descricao", "Valor", "Banco(s)", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
                  ) : grupos.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#86868B]">Nenhum gasto registrado</td></tr>
                  ) : grupos.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr
                        className={`border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors cursor-pointer ${viewingKey === g.key ? (dm ? "bg-[#2C2C2E]" : "bg-[#F0F0F5]") : ""}`}
                        onClick={() => {
                          if (editingKey === g.key) return;
                          setViewingKey(viewingKey === g.key ? null : g.key);
                        }}
                      >
                        <td className="px-4 py-3 text-xs text-[#86868B]">{g.data}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="flex items-center gap-1">
                            {g.categoria}
                            {g.pedido_fornecedor_id && (
                              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="Pedido com produtos" />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate">{g.descricao || "—"}</td>
                        <td className="px-4 py-3 font-bold text-red-500">{fmt(g.totalValor)}</td>
                        <td className="px-4 py-3 text-xs">
                          {g.items.length > 1 ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-[#E8740E]" />
                              {g.items.length} bancos
                            </span>
                          ) : (
                            g.items[0]?.banco || "—"
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(g)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${dm ? "bg-[#3A3A3C] text-[#F5A623] hover:bg-[#E8740E] hover:text-white" : "bg-[#FFF3E0] text-[#E8740E] hover:bg-[#E8740E] hover:text-white"} hover:shadow-sm`}
                              title="Editar"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(g)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${dm ? "bg-[#3A3A3C] text-red-400 hover:bg-red-500 hover:text-white" : "bg-red-50 text-red-400 hover:bg-red-500 hover:text-white"} hover:shadow-sm`}
                              title="Excluir"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                      {viewingKey === g.key && editingKey !== g.key && (
                        <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Data</p>
                                <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.data}</p>
                              </div>
                              {g.hora && (
                                <div>
                                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Horário</p>
                                  <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.hora}</p>
                                </div>
                              )}
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Categoria</p>
                                <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.categoria}</p>
                              </div>
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor Total</p>
                                <p className="font-bold text-red-500">{fmt(g.totalValor)}</p>
                              </div>
                              <div className={g.items.length > 1 ? "col-span-2" : ""}>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                                  {g.items.length > 1 ? "Distribuição por banco" : "Banco"}
                                </p>
                                {g.items.length > 1 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {g.items.map((item) => (
                                      <span key={item.id} className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${dm ? "bg-[#3A3A3C] text-[#F5F5F7]" : "bg-[#E8E8ED] text-[#1D1D1F]"}`}>
                                        {item.banco}: {fmt(item.valor)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.items[0]?.banco || "—"}</p>
                                )}
                              </div>
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Descrição</p>
                                <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.descricao || "—"}</p>
                              </div>
                              <div className="col-span-2 md:col-span-3">
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Observação</p>
                                <p className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{g.observacao || "—"}</p>
                              </div>
                              {g.is_dep_esp && (
                                <div className="col-span-2 md:col-span-3">
                                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E]">
                                    Depósito de espécie
                                  </span>
                                </div>
                              )}
                              {/* Produtos vinculados */}
                              {g.pedido_fornecedor_id && (
                                <ProdutosVinculados pedidoFornecedorId={g.pedido_fornecedor_id} password={password} dm={dm} />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {editingKey === g.key && (
                        <tr className="border-b border-[#E8740E] bg-[#FFF8F0]">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div><p className={labelCls}>Data</p><input type="date" value={editForm.data} onChange={(e) => editSet("data", e.target.value)} className={inputCls} /></div>
                                <div><p className={labelCls}>Horario</p><input type="time" value={editForm.hora} onChange={(e) => editSet("hora", e.target.value)} className={inputCls} /></div>
                                <div><p className={labelCls}>Categoria</p><select value={editForm.categoria} onChange={(e) => editSet("categoria", e.target.value)} className={inputCls}>
                                  {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
                                </select></div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div><p className={labelCls}>Descricao</p><input value={editForm.descricao} onChange={(e) => editSet("descricao", e.target.value)} className={inputCls} /></div>
                                <div><p className={labelCls}>Observacao</p><input value={editForm.observacao} onChange={(e) => editSet("observacao", e.target.value)} className={inputCls} /></div>
                              </div>
                              <div className={`p-3 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor por banco</p>
                                {bancoInputGrid(editBancoValores, editSetBanco, inputCls)}
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-sm text-[#86868B]">
                                  <input type="checkbox" checked={editForm.is_dep_esp} onChange={(e) => editSet("is_dep_esp", e.target.checked)} className="accent-[#E8740E]" />
                                  Deposito de especie
                                </label>
                                <div className="flex-1" />
                                <button onClick={() => setEditingKey(null)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED] transition-colors">Cancelar</button>
                                <button onClick={handleEditSave} disabled={editSaving} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50">{editSaving ? "Salvando..." : "Salvar"}</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
