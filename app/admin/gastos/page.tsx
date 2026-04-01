"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS_GASTO } from "@/lib/admin-types";
import { useTabParam } from "@/lib/useTabParam";
import type { Gasto, Banco } from "@/lib/admin-types";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import { STRUCTURED_CATS, buildProdutoName, IPHONE_ORIGENS } from "@/lib/produto-specs";

/** Converte string BR (ex: "12.250,89" ou "128,89") para número */
const parseBR = (v: string): number => {
  if (!v) return 0;
  const clean = v.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};

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

  result.sort((a, b) => {
    const cmpData = b.data.localeCompare(a.data);
    if (cmpData !== 0) return cmpData;
    return (b.hora || "00:00:00").localeCompare(a.hora || "00:00:00");
  });
  return result;
}

// Componente para mostrar produtos vinculados no histórico
function ProdutosVinculados({ pedidoFornecedorId, password, dm }: { pedidoFornecedorId: string; password: string; dm: boolean }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const res = await fetch(`/api/estoque?pedido_fornecedor_id=${pedidoFornecedorId}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setProdutos(json.data ?? []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    reload().then(() => setLoading(false));
  }, [pedidoFornecedorId, password]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (p: any) => {
    setEditId(p.id);
    setEditFields({ serial_no: p.serial_no || "", imei: p.imei || "", produto: p.produto || "", observacao: p.observacao || "", cor: p.cor || "", custo_unitario: String(p.custo_unitario || ""), qnt: String(p.qnt || 1) });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const original = produtos.find((p: any) => p.id === editId);
      if (editFields.serial_no !== (original?.serial_no || "")) updates.serial_no = editFields.serial_no.toUpperCase() || null;
      if (editFields.imei !== (original?.imei || "")) updates.imei = editFields.imei || null;
      if (editFields.cor !== (original?.cor || "")) updates.cor = editFields.cor || null;
      if (editFields.custo_unitario !== String(original?.custo_unitario || "")) updates.custo_unitario = parseFloat(editFields.custo_unitario) || 0;
      if (editFields.qnt !== String(original?.qnt || 1)) updates.qnt = parseInt(editFields.qnt) || 1;
      // Atualizar origem no nome do produto automaticamente
      const origemMudou = editFields.observacao !== (original?.observacao || "");
      if (origemMudou) {
        updates.observacao = editFields.observacao || null;
        // Trocar código de origem no nome: remover origem antiga e adicionar nova
        let nome = editFields.produto || original?.produto || "";
        // Remover origem antiga do nome (ex: " VC (CAN)", " LL (EUA)")
        nome = nome.replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?/gi, "").trim();
        // Adicionar nova origem
        const novaOrigem = editFields.observacao ? editFields.observacao.split(" ")[0] : "";
        const origemPais = editFields.observacao?.match(/\(([^)]+)\)/)?.[1] || "";
        if (novaOrigem) nome = `${nome} ${novaOrigem}${origemPais ? ` (${origemPais})` : ""}`;
        updates.produto = nome.toUpperCase();
      } else if (editFields.produto !== (original?.produto || "")) {
        updates.produto = editFields.produto.toUpperCase() || null;
      }
      if (Object.keys(updates).length > 0) {
        await fetch("/api/estoque", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({ id: editId, ...updates }),
        });
        await reload();
      }
    } catch { /* ignore */ }
    setSaving(false);
    setEditId(null);
  };

  const inputCls = `w-full px-2 py-1 rounded border text-xs ${dm ? "bg-[#2C2C2E] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:outline-none focus:border-[#E8740E]`;

  if (loading) return <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Carregando produtos...</p>;
  if (produtos.length === 0) return null;

  return (
    <div className="col-span-2 md:col-span-3 mt-2">
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
        Produtos do pedido ({produtos.length})
      </p>
      <div className="space-y-1.5">
        {produtos.map((p: any) => (
          <div key={p.id} className={`px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#3A3A3C]" : "bg-[#F0F0F5]"}`}>
            {editId === p.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-2">
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Produto</p>
                    <input value={editFields.produto} onChange={(e) => setEditFields(f => ({ ...f, produto: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Cor</p>
                    <input value={editFields.cor} onChange={(e) => setEditFields(f => ({ ...f, cor: e.target.value }))} placeholder="Ex: Silver" className={inputCls} />
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Serial No.</p>
                    <input value={editFields.serial_no} onChange={(e) => setEditFields(f => ({ ...f, serial_no: e.target.value }))} placeholder="Ex: C39XXXXX..." className={inputCls} />
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>IMEI</p>
                    <input value={editFields.imei} onChange={(e) => setEditFields(f => ({ ...f, imei: e.target.value }))} placeholder="Ex: 35XXXXXXXXXXXXX" className={inputCls} />
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Origem</p>
                    <select value={editFields.observacao} onChange={(e) => setEditFields(f => ({ ...f, observacao: e.target.value }))} className={inputCls}>
                      <option value="">— Sem origem —</option>
                      {IPHONE_ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Custo (R$)</p>
                    <input type="number" value={editFields.custo_unitario} onChange={(e) => setEditFields(f => ({ ...f, custo_unitario: e.target.value }))} placeholder="0" className={inputCls} />
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Qtd</p>
                    <input type="number" value={editFields.qnt} onChange={(e) => setEditFields(f => ({ ...f, qnt: e.target.value }))} placeholder="1" className={inputCls} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving} className="px-3 py-1 rounded bg-[#E8740E] text-white text-[10px] font-semibold hover:bg-[#D06A0D]">
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button onClick={() => setEditId(null)} className={`px-3 py-1 rounded text-[10px] font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "A CAMINHO" ? "bg-yellow-100 text-yellow-700" : p.status === "PENDENTE" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                      {p.status}
                    </span>
                    <span className={`font-medium truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                      {p.produto}{p.cor ? ` — ${p.cor}` : ""}{p.observacao ? ` · ${p.observacao.split(" ")[0]}${p.observacao.includes("(") ? " " + p.observacao.match(/\([^)]+\)/)?.[0] : ""}` : ""}
                    </span>
                  </div>
                  <div className={`mt-1 flex items-center gap-3 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    {p.serial_no ? <span className="font-mono text-purple-500">SN: {p.serial_no}</span> : <span className="font-mono opacity-50">S/N</span>}
                    {p.imei && <span className="font-mono text-blue-500">IMEI: {p.imei}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>x{p.qnt}</span>
                  <span className="font-bold text-[#E8740E]">{fmt(p.custo_unitario)}</span>
                  <button onClick={() => startEdit(p)} className={`text-[10px] font-semibold ${dm ? "text-[#F5A623]" : "text-[#E8740E]"} hover:underline`}>
                    Editar
                  </button>
                </div>
              </div>
            )}
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
    data: hojeBR(),
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
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [categoriasExcluidas, setCategoriasExcluidas] = useState<Set<string>>(new Set());
  const toggleCategoria = (cat: string) => setCategoriasExcluidas(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const gruposFiltrados = useMemo(() => {
    let result = grupos;
    if (filtroCategoria) result = result.filter(g => g.categoria === filtroCategoria);
    if (categoriasExcluidas.size > 0) result = result.filter(g => !categoriasExcluidas.has(g.categoria));
    return result;
  }, [grupos, filtroCategoria, categoriasExcluidas]);
  const categoriasUsadas = useMemo(() => [...new Set(grupos.map(g => g.categoria))].sort(), [grupos]);
  // Agrupar por data
  const gruposPorData = useMemo(() => {
    const map: Record<string, typeof gruposFiltrados> = {};
    for (const g of gruposFiltrados) { if (!map[g.data]) map[g.data] = []; map[g.data].push(g); }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [gruposFiltrados]);

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

  const totalForm = BANCOS.reduce((s, b) => s + (parseBR(bancoValores[b]) || 0), 0);
  const totalProdutos = pedidoProdutos.reduce((s, p) => s + (parseFloat(p.custo_unitario) || 0) * (parseInt(p.qnt) || 0), 0);

  const isFornecedor = form.categoria === "FORNECEDOR";

  const handleSubmit = async () => {
    const filled = BANCOS.filter((b) => parseBR(bancoValores[b]) > 0);
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
      gastoItems = { ...base, valor: parseBR(bancoValores[filled[0]]), banco: filled[0] };
    } else {
      const grupoId = crypto.randomUUID();
      gastoItems = filled.map((b) => ({
        ...base,
        valor: parseBR(bancoValores[b]),
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

    const filled = BANCOS.filter((b) => parseBR(editBancoValores[b]) > 0);
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
          items: [{ ...base, valor: parseBR(editBancoValores[filled[0]]), banco: filled[0] }],
        };
      } else {
        const novoGrupoId = crypto.randomUUID();
        payload = {
          grupo_id: grupo.grupo_id,
          items: filled.map((b) => ({
            ...base,
            valor: parseBR(editBancoValores[b]),
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
          valor: parseBR(editBancoValores[filled[0]]),
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
          valor: parseBR(editBancoValores[b]),
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

  const totalSaida = gastos.filter(g => !g.is_dep_esp).reduce((s, g) => s + Number(g.valor), 0);

  const bancoInputGrid = (valores: BancoValores, onChange: (b: Banco, v: string) => void, cls: string) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {BANCOS.map((b) => (
        <div key={b}>
          <p className={labelCls}>{b.replace("_", " ")}</p>
          <input type="text" inputMode="decimal" placeholder="0" value={valores[b]} onChange={(e) => onChange(b, e.target.value)} className={cls} />
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
            <div><p className={labelCls}>Descricao</p><input value={form.descricao} onChange={(e) => set("descricao", e.target.value.toUpperCase())} className={`${inputCls} uppercase`} /></div>
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value.toUpperCase())} className={`${inputCls} uppercase`} /></div>
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

          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : isFornecedor && pedidoProdutos.length > 0 ? `Registrar Gasto + ${pedidoProdutos.length} Produto(s)` : "Registrar"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* KPI + Filtros */}
          <div className="flex flex-wrap items-center gap-4">
            <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 shadow-sm`}>
              <p className="text-xs text-[#86868B]">Total Saidas</p>
              <p className="text-xl font-bold text-red-500">{fmt(gruposFiltrados.filter(g => !g.is_dep_esp).reduce((s, g) => s + g.totalValor, 0))}</p>
              <p className="text-[10px] text-[#86868B]">{gruposFiltrados.filter(g => !g.is_dep_esp).length} registros</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setFiltroCategoria(""); setCategoriasExcluidas(new Set()); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!filtroCategoria && categoriasExcluidas.size === 0 ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
                Todas
              </button>
              {categoriasUsadas.map(c => (
                <button key={c} onClick={() => { setCategoriasExcluidas(new Set()); setFiltroCategoria(filtroCategoria === c ? "" : c); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtroCategoria === c ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
                  {c}
                </button>
              ))}
            </div>
            {/* Checkbox: excluir categorias */}
            {!filtroCategoria && (
              <div className={`w-full border rounded-xl p-3 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
                <p className="text-[10px] text-[#86868B] uppercase tracking-wider font-semibold mb-2">Excluir categorias:</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {categoriasUsadas.map(c => (
                    <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={categoriasExcluidas.has(c)} onChange={() => toggleCategoria(c)}
                        className="w-3.5 h-3.5 rounded accent-[#E8740E]" />
                      <span className={`text-xs ${categoriasExcluidas.has(c) ? "line-through text-[#86868B]" : dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{c}</span>
                    </label>
                  ))}
                  {categoriasExcluidas.size > 0 && (
                    <button onClick={() => setCategoriasExcluidas(new Set())} className="text-[10px] text-[#E8740E] underline ml-2">Limpar</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Gastos agrupados por data */}
          {loading ? (
            <p className="text-center text-[#86868B] py-8">Carregando...</p>
          ) : gruposPorData.length === 0 ? (
            <p className="text-center text-[#86868B] py-8">Nenhum gasto encontrado</p>
          ) : gruposPorData.map(([data, gastosData]) => {
            const totalDia = gastosData.filter(g => !g.is_dep_esp).reduce((s, g) => s + g.totalValor, 0);
            const diasSemana = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
            const d = new Date(data + "T12:00:00");
            const diaSemana = diasSemana[d.getDay()];
            return (
              <div key={data} className="space-y-2">
                {/* Header do dia */}
                <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-[#E8740E] text-white">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{data.split("-").reverse().join("/")}</span>
                    <span className="text-xs opacity-80">{diaSemana}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span>{gastosData.length} gastos</span>
                    <span className="font-bold">R$ {totalDia.toLocaleString("pt-BR")}</span>
                  </div>
                </div>

                {/* Gastos do dia */}
                <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
                  <table className="w-full text-sm">
                    <tbody>
                      {gastosData.map((g) => (
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
                                <div><p className={labelCls}>Descricao</p><input value={editForm.descricao} onChange={(e) => editSet("descricao", e.target.value.toUpperCase())} className={`${inputCls} uppercase`} /></div>
                                <div><p className={labelCls}>Observacao</p><input value={editForm.observacao} onChange={(e) => editSet("observacao", e.target.value.toUpperCase())} className={`${inputCls} uppercase`} /></div>
                              </div>
                              <div className={`p-3 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor por banco</p>
                                {bancoInputGrid(editBancoValores, editSetBanco, inputCls)}
                              </div>
                              {/* Produtos vinculados ao gasto (editáveis) */}
                              {g.pedido_fornecedor_id && (
                                <ProdutosVinculados pedidoFornecedorId={g.pedido_fornecedor_id} password={password} dm={dm} />
                              )}
                              <div className="flex items-center gap-3">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
