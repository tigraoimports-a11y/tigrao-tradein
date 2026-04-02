"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularLiquido } from "@/lib/taxas";

interface EstoqueItem { id: string; produto: string; categoria: string; tipo: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string; serial_no: string | null; imei: string | null; }

interface Entrega {
  id: string;
  created_at: string;
  venda_id: string | null;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  data_entrega: string;
  horario: string | null;
  status: "PENDENTE" | "SAIU" | "ENTREGUE" | "CANCELADA";
  entregador: string | null;
  observacao: string | null;
  updated_at: string | null;
  produto: string | null;
  tipo: string | null;
  detalhes_upgrade: string | null;
  forma_pagamento: string | null;
  valor: number | null;
  vendedor: string | null;
  regiao: string | null;
}

type EntregaStatus = Entrega["status"];

const STATUS_CONFIG: Record<EntregaStatus, { label: string; color: string; colorDark: string; bg: string; bgDark: string; border: string; borderDark: string; icon: string }> = {
  PENDENTE: { label: "Pendente", color: "text-yellow-700", colorDark: "text-yellow-300", bg: "bg-yellow-100", bgDark: "bg-yellow-900/30", border: "border-yellow-300", borderDark: "border-yellow-600", icon: "🟡" },
  SAIU: { label: "Saiu p/ Entrega", color: "text-blue-700", colorDark: "text-blue-300", bg: "bg-blue-100", bgDark: "bg-blue-900/30", border: "border-blue-300", borderDark: "border-blue-600", icon: "🔵" },
  ENTREGUE: { label: "Entregue", color: "text-green-700", colorDark: "text-green-300", bg: "bg-green-100", bgDark: "bg-green-900/30", border: "border-green-300", borderDark: "border-green-600", icon: "🟢" },
  CANCELADA: { label: "Cancelada", color: "text-red-600", colorDark: "text-red-400", bg: "bg-red-100", bgDark: "bg-red-900/30", border: "border-red-300", borderDark: "border-red-600", icon: "🔴" },
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getWeekRange(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 6; i++) { // Mon-Sat
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const from = days[0].toISOString().split("T")[0];
  const to = days[days.length - 1].toISOString().split("T")[0];
  return { days, from, to };
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export default function EntregasPage() {
  const { password, apiHeaders, darkMode: dm } = useAdmin();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { days, from, to } = getWeekRange(weekOffset);

  const [copied, setCopied] = useState(false);
  const [editingEntregaId, setEditingEntregaId] = useState<string | null>(null);

  const emptyForm = {
    cliente: "",
    telefone: "",
    endereco: "",
    bairro: "",
    data_entrega: hojeBR(),
    horario: "",
    entregador: "",
    observacao: "",
    tipo: "",
    forma_pagamento: "",
    valor: "",
    parcelas: "",
    maquina: "",
    forma_pagamento_2: "",
    valor_2: "",
    vendedor: "",
    regiao: "",
    local_entrega: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [produtos, setProdutos] = useState<string[]>([""]);
  const [trocas, setTrocas] = useState<string[]>([]);
  const [showPagAlt, setShowPagAlt] = useState(false);

  // Estoque picker states
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [serialBusca, setSerialBusca] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);
  const [desconto, setDesconto] = useState("");
  const [trocaAtiva, setTrocaAtiva] = useState(false);
  const [trocaValor, setTrocaValor] = useState("");
  const [trocaProduto, setTrocaProduto] = useState("");
  const [trocaCor, setTrocaCor] = useState("");
  const [trocaBateria, setTrocaBateria] = useState("");
  const [trocaObs, setTrocaObs] = useState("");

  // Fetch estoque
  useEffect(() => {
    if (!password) return;
    fetch("/api/estoque", { headers: apiHeaders() })
      .then(r => r.json())
      .then(j => setEstoque(j.data?.filter((p: EstoqueItem) => p.qnt > 0 && p.status === "EM ESTOQUE") || []))
      .catch(() => {});
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorias dinâmicas do estoque
  const categorias = useMemo(() => {
    const cats = new Map<string, string>();
    estoque.forEach(p => {
      const key = p.tipo === "SEMINOVO" ? `${p.categoria}_SEMI` : p.categoria;
      const label = p.tipo === "SEMINOVO" ? `${p.categoria} (Seminovo)` : p.categoria;
      if (!cats.has(key)) cats.set(key, label);
    });
    return [...cats.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [estoque]);

  // Produtos filtrados por categoria selecionada
  const produtosFiltrados = useMemo(() => {
    if (!catSel) return [];
    const isSemi = catSel.endsWith("_SEMI");
    const baseCat = isSemi ? catSel.replace("_SEMI", "") : catSel;
    return estoque.filter(p => p.categoria === baseCat && (isSemi ? p.tipo === "SEMINOVO" : p.tipo !== "SEMINOVO"));
  }, [estoque, catSel]);

  // Valor base e final
  const valorBase = parseFloat(form.valor) || 0;
  const descontoNum = parseFloat(desconto) || 0;
  const trocaNum = parseFloat(trocaValor) || 0;
  const valorFinal = Math.max(0, valorBase - descontoNum);
  const valorAPagar = Math.max(0, valorFinal - trocaNum);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const fetchEntregas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/entregas?${params}`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setEntregas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, from, to]);

  useEffect(() => {
    if (password) fetchEntregas();
  }, [password, fetchEntregas]);

  const handleSubmit = async () => {
    if (!form.cliente || !form.data_entrega) {
      setMsg("Preencha cliente e data da entrega");
      return;
    }
    setSaving(true);
    setMsg("");

    const produtosStr = produtos.filter(Boolean).join(" | ");
    const trocasStr = trocaAtiva ? [trocaProduto, trocaCor ? `Cor: ${trocaCor}` : "", trocaBateria ? `Bateria: ${trocaBateria}%` : "", trocaObs, trocaValor ? `Avaliação: R$ ${trocaValor}` : ""].filter(Boolean).join("\n") : "";
    const isEdit = !!editingEntregaId;
    const res = await fetch("/api/admin/entregas", {
      method: isEdit ? "PATCH" : "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...(isEdit ? { id: editingEntregaId } : {}),
        ...form,
        telefone: form.telefone || null,
        endereco: form.endereco || null,
        bairro: form.bairro || null,
        horario: form.horario || null,
        entregador: form.entregador || null,
        observacao: form.observacao ? `${form.observacao}${descontoNum > 0 ? ` | Desconto: R$ ${descontoNum}` : ""}` : (descontoNum > 0 ? `Desconto: R$ ${descontoNum}` : null),
        produto: produtosStr || null,
        tipo: trocaAtiva ? "UPGRADE" : (form.tipo || null),
        detalhes_upgrade: trocasStr || null,
        forma_pagamento: form.forma_pagamento || null,
        valor: valorAPagar > 0 ? valorAPagar : (form.valor ? parseFloat(form.valor) : null),
        vendedor: form.vendedor || null,
        regiao: form.regiao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(isEdit ? "Entrega atualizada!" : "Entrega agendada!");
      setForm({ ...emptyForm, data_entrega: hojeBR() });
      setProdutos([""]); setTrocas([]); setShowPagAlt(false);
      setCatSel(""); setEstoqueId(""); setDesconto(""); setTrocaAtiva(false); setTrocaValor(""); setTrocaProduto(""); setTrocaCor(""); setTrocaBateria(""); setTrocaObs(""); setProdutoManual(false); setSerialBusca("");
      setEditingEntregaId(null);
      setShowForm(false);
      fetchEntregas();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const handleStatusChange = async (entrega: Entrega, newStatus: EntregaStatus) => {
    const res = await fetch("/api/admin/entregas", {
      method: "PATCH",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: entrega.id, status: newStatus }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.map((e) => (e.id === entrega.id ? { ...e, status: newStatus } : e)));
      setSelectedEntrega(null);
    }
  };

  const buildWhatsAppText = () => {
    const prods = produtos.filter(Boolean);
    const produtoText = prods.length > 1
      ? prods.map((p, i) => `${i + 1}. ${p}`).join("\n   ")
      : prods[0] || "—";

    // Pagamento principal
    let pagText = `${form.forma_pagamento || "—"}`;
    if (form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") {
      if (form.parcelas) pagText += ` ${form.parcelas}x`;
      if (form.maquina) pagText += ` (${form.maquina})`;
    }
    pagText += ` R$${form.valor || "0"}`;

    // Pagamento alternativo
    let pagAlt = "";
    if (form.forma_pagamento_2 && form.valor_2) {
      pagAlt = `\n💵 *Pagamento 2:* ${form.forma_pagamento_2} R$${form.valor_2}`;
    }

    const tipoLabel = form.tipo === "UPGRADE" ? "UPGRADE (Troca)" : form.tipo || "Compra";

    // Trocas formatadas
    const trocasText = trocas.filter(Boolean).map((t, i) => {
      return trocas.length > 1 ? `${i + 1}. ${t.replace(/\n/g, " / ")}` : t.replace(/\n/g, " / ");
    }).join("\n   ");

    const lines = [
      `🛵 *ENTREGA ${(form.bairro || "—").toUpperCase()}* 🛵`,
      `🛵`,
      `⏰ *HORÁRIO:* ${form.horario || "—"}`,
      `📍 *LOCAL:* ${form.endereco || "—"} - ${form.bairro || ""}`,
      `🍎 *PRODUTO:* ${produtoText}`,
      `‼️ *TIPO:* ${tipoLabel}`,
      ...(form.tipo === "UPGRADE" && trocas.filter(Boolean).length > 0 ? [`🔄 *PRODUTO NA TROCA:*\n   ${trocasText}`] : []),
      `💵 *PAGAMENTO:* ${pagText}${pagAlt}`,
      ...(form.local_entrega === "RESIDÊNCIA" ? [`⚠️ PAGAMENTO ANTECIPADO`] : form.local_entrega === "SHOPPING" ? [`✅ PAGAR NA ENTREGA`] : []),
      `🧑 *CLIENTE:* ${form.cliente || "—"}`,
      `📞 *CONTATO:* ${form.telefone || "—"}`,
      form.observacao ? `OBS: ${form.observacao}` : "",
      `💼 Vendedor: ${form.vendedor || "—"}`,
    ].filter(Boolean);
    return lines.join("\n");
  };

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = buildWhatsAppText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta entrega?")) return;
    const res = await fetch("/api/admin/entregas", {
      method: "DELETE",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.filter((e) => e.id !== id));
      setSelectedEntrega(null);
    }
  };

  const today = hojeBR();

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-[#1D1D1F]">Agenda de Entregas</h1>
        <button
          onClick={() => { setShowForm(!showForm); setMsg(""); }}
          className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
        >
          {showForm ? "Fechar" : "+ Nova Entrega"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      {/* Formulário Nova Entrega */}
      {showForm && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-[#1D1D1F]">{editingEntregaId ? "✏️ Editar Entrega" : "Agendar Nova Entrega"}</h2>
              {editingEntregaId && <button onClick={() => { setEditingEntregaId(null); setForm({ ...emptyForm, data_entrega: hojeBR() }); setProdutos([""]); setTrocaAtiva(false); setTrocaValor(""); setTrocaProduto(""); setDesconto(""); }} className="text-xs text-red-500 hover:underline">Cancelar edição</button>}
            </div>
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (!text || text.length < 10) { setMsg("Nada no clipboard. Copie a mensagem do WhatsApp primeiro."); return; }
                  const lines = text.split("\n").map(l => l.trim());
                  const extract = (line: string) => line.replace(/^[✅⚠️📌🤔🔄💰📋🏷️🎯]*\s*/g, "").replace(/^[^:：]+[:：]\s*/, "").trim();
                  const r: Record<string, string> = {};
                  const produtos: string[] = [];
                  const trocas: string[] = [];
                  let section = ""; // track current section
                  let currentTroca = "";

                  for (let i = 0; i < lines.length; i++) {
                    // Limpa asteriscos e emojis pra versão "clean" mas mantém original pra extract
                    const lineClean = lines[i].replace(/\*/g, "").trim();
                    const low = lineClean.toLowerCase().replace(/[✅⚠️📌🤔🎯🔄💰📋🏷️🖥️💳📦🍎📱💻⌚🎧·•]/g, "").trim();
                    if (!low || low.length < 2) continue;

                    // Extract: pega valor depois do primeiro ":"
                    const extr = (l: string) => { const idx = l.indexOf(":"); return idx >= 0 ? l.slice(idx + 1).trim() : l.trim(); };

                    // Detect sections (multi-product format)
                    if (low.includes("modelo escolhido")) { section = "produtos"; continue; }
                    if (low.includes("trocas inclu")) { section = "trocas"; continue; }
                    if (low.includes("desconto adicional")) { section = "desconto"; continue; }
                    if (low.match(/^valor\s*[:：]/) || low.includes("valor total")) { section = "valor"; }
                    if (low.includes("dados da compra")) { continue; } // skip header

                    // "Produto:" inline — captura o valor na mesma linha
                    if ((low.match(/^produto\s*[:：]/) || (low.includes("produto:") && !low.includes("troca"))) && !low.includes("na troca")) {
                      let val = extr(lineClean);
                      const precoMatch = val.match(/\s*[—–-]\s*R?\$?\s*([\d.,]+)\s*$/);
                      if (precoMatch) {
                        if (!r.valor) r.valor = precoMatch[1].replace(/\./g, "").replace(",", ".");
                        val = val.replace(/\s*[—–-]\s*R?\$?\s*[\d.,]+\s*$/, "").trim();
                      }
                      if (val && val.length > 2) { produtos.push(val); section = ""; }
                      continue;
                    }

                    // Produto sem label — detectar por nome de produto Apple (com emoji 🖥️📱 etc)
                    if (!produtos.length && (
                      low.match(/^(iphone|ipad|mac|macbook|apple watch|airpods|air tag)/i) ||
                      low.match(/^(mac mini|mac pro)/i) ||
                      lineClean.match(/^[🖥️📱💻⌚🎧📦]\s*.{3,}/u)
                    )) {
                      const val = lineClean.replace(/^[🖥️📱💻⌚🎧📦]\s*/u, "").trim();
                      if (val.length > 3 && !val.includes("vista") && !val.includes("restante")) {
                        produtos.push(val);
                        continue;
                      }
                    }

                    // "Produto na troca:" — entra seção trocas
                    if (low.includes("produto na troca") || low.includes("aparelho na troca")) {
                      section = "trocas";
                      const val = extr(lineClean).replace(/seu aparelho na troca\s*[:：]?\s*/i, "").trim();
                      if (val && val.length > 3) currentTroca = val + "\n";
                      continue;
                    }

                    // === Campos com label ===
                    if (low.includes("nome completo") || low.match(/^nome\s*[:：]/)) { r.cliente = extr(lineClean); section = ""; }
                    else if (low.includes("telefone") || low.includes("celular") || low.match(/^whatsapp\s*[:：]/)) {
                      const m = lineClean.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
                      if (m) r.telefone = m[0]; section = "";
                    }
                    else if (low.match(/^bairro\s*[:：]/)) { r.bairro = extr(lineClean); section = ""; }
                    else if (low.includes("endereco") || low.includes("endereço") || low.match(/^end[\s.:]/)) { r.endereco = extr(lineClean); section = ""; }
                    else if (low.match(/^cep\s*[:：]/)) { const m = lineClean.match(/\d{5}[-.\s]?\d{3}/); if (m) r.cep = m[0]; section = ""; }

                    // Forma de pagamento (com label)
                    else if (low.includes("forma de pagamento") || low.includes("forma pagamento")) {
                      r.forma_pagamento = extr(lineClean); section = "";
                    }

                    // Valor: "💰 R$ 8.000,00 à vista no PIX de entrada" (sem label "Valor:")
                    else if (low.includes("vista") && low.includes("pix")) {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.entrada_pix = m[1].replace(/\./g, "").replace(",", "."); section = "pagamento"; }
                    }
                    // Parcelas: "• 10x de R$ 178,00"
                    else if (low.match(/^\d+x\s+de\s+r/) || low.match(/•\s*\d+x/)) {
                      const m = lineClean.match(/(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/);
                      if (m) { r.parcelas = `${m[1]}x de R$${m[2]}`; }
                      section = "";
                    }
                    // "O restante parcelado ficaria:" — skip
                    else if (low.includes("restante parcelado")) { section = "pagamento"; }

                    else if (low.match(/^horario\s*[:：]/) || low.includes("horário") || low.includes("horario:")) { r.horario = extr(lineClean); section = ""; }
                    else if (low.match(/^vendedor\s*[:：]/)) { r.vendedor = extr(lineClean); section = ""; }
                    else if (low.includes("como conheceu")) { section = ""; }

                    // Local: "Local: Entrega - Shopping: VillageMall" ou "Local: Entrega - Av. das Americas..."
                    else if (low.match(/^local\s*[:：]/)) {
                      const val = extr(lineClean);
                      const lowVal = val.toLowerCase();
                      if (lowVal.includes("entrega")) { r.local_entrega = "OUTRO"; } // default entrega
                      if (lowVal.includes("shopping") || lowVal.includes("village") || lowVal.includes("mall") || lowVal.includes("barra")) { r.local_entrega = "SHOPPING"; }
                      else if (lowVal.includes("residencia") || lowVal.includes("residência")) { r.local_entrega = "RESIDÊNCIA"; }
                      else if (lowVal.includes("loja") || lowVal.includes("retirada")) { r.local_entrega = ""; }
                      section = "";
                    }

                    else if (low.includes("antecipado")) { r.tipo_pagamento = "ANTECIPADO"; }
                    else if (low.includes("pagar na entrega")) { r.tipo_pagamento = "NA ENTREGA"; }

                    // Valor section
                    else if (section === "valor") {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.valor = m[1].replace(/\./g, "").replace(",", "."); section = ""; }
                    }
                    // Desconto
                    else if (section === "desconto") {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.desconto = m[1].replace(/\./g, "").replace(",", "."); section = ""; }
                    }
                    // Products section — each line is a product (multi-product format)
                    else if (section === "produtos" && low.length > 3) {
                      produtos.push(lineClean.replace(/^[✅⚠️📌🤔·•]\s*/g, "").trim());
                    }
                    // Trocas section
                    else if (section === "trocas") {
                      if (low.match(/^iphone|^apple|^ipad|^macbook|^airpods/) || lineClean.startsWith("·") || lineClean.startsWith("•")) {
                        if (currentTroca) trocas.push(currentTroca.trim());
                        currentTroca = lineClean.replace(/^[·•]\s*/, "") + "\n";
                      } else if (low.includes("avaliado")) {
                        currentTroca += lineClean + "\n";
                        trocas.push(currentTroca.trim());
                        currentTroca = "";
                      } else if (low.includes("seu aparelho")) {
                        // skip header
                      } else if (currentTroca || low.length > 3) {
                        currentTroca += lineClean + "\n";
                      }
                    }
                  }
                  if (currentTroca) trocas.push(currentTroca.trim());

                  // Montar forma_pagamento e valor quando veio entrada PIX + parcelas (formato sem label)
                  if (r.entrada_pix && !r.forma_pagamento) {
                    r.forma_pagamento = r.parcelas
                      ? `Entrada PIX R$${Number(r.entrada_pix).toLocaleString("pt-BR")} + ${r.parcelas} no cartao`
                      : `PIX R$${Number(r.entrada_pix).toLocaleString("pt-BR")}`;
                  }
                  if (r.entrada_pix && !r.valor) {
                    r.valor = r.entrada_pix;
                  }

                  // Apply to form
                  if (r.cliente) set("cliente", r.cliente);
                  if (r.telefone) set("telefone", r.telefone);
                  if (r.bairro) set("bairro", r.bairro);
                  if (r.endereco) set("endereco", r.endereco);
                  if (r.horario) set("horario", r.horario);
                  if (r.vendedor) set("vendedor", r.vendedor);
                  if (r.local_entrega) set("local_entrega", r.local_entrega);

                  // Products — populate dynamic array
                  if (produtos.length > 0) {
                    setProdutos(produtos);
                  }

                  // Trocas → tipo UPGRADE + array de trocas
                  if (trocas.length > 0) {
                    set("tipo", "UPGRADE");
                    setTrocas(trocas);
                  }

                  // Payment
                  if (r.forma_pagamento) set("forma_pagamento", r.forma_pagamento);
                  if (r.valor) set("valor", r.valor);

                  const totalFields = Object.keys(r).length + produtos.length + trocas.length;
                  setMsg(`✅ Dados colados! ${totalFields} campos preenchidos. ${produtos.length} produto(s), ${trocas.length} troca(s).`);
                } catch { setMsg("Erro ao ler clipboard. Permita o acesso."); }
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              📋 Colar dados do cliente
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Cliente</p>
              <input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nome do cliente" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Telefone</p>
              <input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(21) 99999-9999" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Bairro</p>
              <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Ex: Barra da Tijuca" className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Endereco</p>
              <input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Endereco completo" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Local de Entrega</p>
              <select value={form.local_entrega} onChange={(e) => set("local_entrega", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="RETIRADA">Retirada em Loja</option>
                <option value="RESIDÊNCIA">Residência</option>
                <option value="SHOPPING">Shopping</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            {/* Produto — seleção do estoque ou manual */}
            <div className="col-span-2 md:col-span-3 space-y-3 border-t border-[#E5E5EA] pt-3 mt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto</p>
                <button onClick={() => { setProdutoManual(!produtoManual); if (!produtoManual) { setCatSel(""); setEstoqueId(""); } }} className="text-xs text-[#E8740E] font-medium hover:underline">
                  {produtoManual ? "📋 Selecionar do estoque" : "✏️ Digitar manual"}
                </button>
              </div>

              {produtoManual ? (
                /* Modo manual — texto livre */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {produtos.map((prod, idx) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <input value={prod} onChange={(e) => { const np = [...produtos]; np[idx] = e.target.value; setProdutos(np); }} placeholder="Ex: iPhone 17 256GB Lavanda" className={inputCls} />
                      </div>
                      {idx > 0 && <button onClick={() => setProdutos(produtos.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-lg">✕</button>}
                    </div>
                  ))}
                  <button onClick={() => setProdutos([...produtos, ""])} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto</button>
                </div>
              ) : (
                /* Modo simplificado — modelo + preço (sem cor/serial/origem) */
                <div className="space-y-3">
                  <div>
                    <p className={labelCls}>Categoria</p>
                    <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setEstoqueId(""); setProdutos([""]); set("valor", ""); }} className={inputCls}>
                      <option value="">-- Selecionar --</option>
                      {categorias.filter(([k]) => !k.endsWith("_SEMI")).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>

                  {catSel && (() => {
                    // Agrupar por modelo base (sem cor, sem origem) e pegar preço médio
                    const stripDetails = (nome: string) => nome
                      .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?/gi, "")
                      .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
                      .replace(/-\s*E-?SIM/gi, "")
                      .replace(/\s+(PRETO|BRANCO|PRATA|DOURADO|AZUL|VERDE|ROSA|ROXO|VERMELHO|AMARELO|ESTELAR|MEIA-NOITE|TEAL|ULTRAMARINO|LAVANDA|SAGE|MIDNIGHT|TITANIO\s*\w*|LARANJA\s*\w*|AZUL\s*\w*|PRETO\s*\w*|CINZA\s*\w*|DOURADO\s*\w*|BRANCO\s*\w*)\s*$/gi, "")
                      .replace(/\s*-\s*$/, "")
                      .replace(/\s{2,}/g, " ").trim();
                    const byModel: Record<string, { totalQnt: number; avgCost: number; items: EstoqueItem[] }> = {};
                    produtosFiltrados.forEach(p => {
                      const model = stripDetails(p.produto);
                      if (!byModel[model]) byModel[model] = { totalQnt: 0, avgCost: 0, items: [] };
                      byModel[model].totalQnt += p.qnt;
                      byModel[model].items.push(p);
                    });
                    // Calcular preço médio por modelo
                    Object.values(byModel).forEach(g => {
                      const totalVal = g.items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
                      g.avgCost = g.totalQnt > 0 ? Math.round(totalVal / g.totalQnt) : 0;
                    });
                    const modelEntries = Object.entries(byModel).sort(([a], [b]) => a.localeCompare(b));
                    return (
                      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[#D2D2D7] divide-y divide-[#E5E5EA]">
                        {modelEntries.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto disponível</p>}
                        {modelEntries.map(([model, { totalQnt, avgCost }]) => {
                          const sel = produtos[0] === model;
                          return (
                            <button key={model} onClick={() => {
                              if (sel) { setProdutos([""]); set("valor", ""); return; }
                              setProdutos([model]);
                              set("valor", String(avgCost));
                            }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? "bg-[#FFF5EB] border-l-4 border-[#E8740E]" : "hover:bg-[#F9F9FB]"}`}>
                              <div>
                                <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{model}</p>
                                <p className="text-[10px] text-[#86868B]">{totalQnt} un. disponíveis</p>
                              </div>
                              <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>R$ {avgCost.toLocaleString("pt-BR")}</p>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Desconto */}
            <div>
              <p className={labelCls}>Desconto (R$)</p>
              <input type="number" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0" className={inputCls} />
            </div>
            {(descontoNum > 0 || trocaNum > 0) && valorBase > 0 && (
              <div className="col-span-2 md:col-span-3 p-3 rounded-xl bg-[#FFF8F0] border border-[#F5D5B0]">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>Valor Base: <b>R$ {valorBase.toLocaleString("pt-BR")}</b></span>
                  {descontoNum > 0 && <span className="text-red-500">Desconto: <b>-R$ {descontoNum.toLocaleString("pt-BR")}</b></span>}
                  {trocaNum > 0 && <span className="text-green-600">Troca: <b>-R$ {trocaNum.toLocaleString("pt-BR")}</b></span>}
                  <span className="text-[#E8740E] font-bold">A pagar: R$ {valorAPagar.toLocaleString("pt-BR")}</span>
                </div>
              </div>
            )}
            <div>
              <p className={labelCls}>Tipo</p>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="VENDA NORMAL">Venda Normal</option>
                <option value="UPGRADE">Upgrade</option>
              </select>
            </div>
            {/* Produto na Troca */}
            <div className="col-span-2 md:col-span-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={trocaAtiva} onChange={(e) => { setTrocaAtiva(e.target.checked); if (!e.target.checked) { setTrocaValor(""); setTrocaProduto(""); setTrocaCor(""); setTrocaBateria(""); setTrocaObs(""); set("tipo", "VENDA NORMAL"); } else { set("tipo", "UPGRADE"); } }} className="w-4 h-4 accent-[#E8740E]" />
                <span className="text-sm font-semibold">🔄 Produto na troca?</span>
              </label>
            </div>
            {trocaAtiva && (
              <div className="col-span-2 md:col-span-3 p-3 rounded-xl border border-green-200 bg-green-50 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <p className={labelCls}>Produto do cliente</p>
                    <input value={trocaProduto} onChange={(e) => setTrocaProduto(e.target.value)} placeholder="Ex: iPhone 15 Pro Max 256GB" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Valor Avaliação (R$)</p>
                    <input type="number" value={trocaValor} onChange={(e) => setTrocaValor(e.target.value)} placeholder="0" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Cor</p>
                    <input value={trocaCor} onChange={(e) => setTrocaCor(e.target.value)} placeholder="Ex: Preto" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Bateria (%)</p>
                    <input type="number" value={trocaBateria} onChange={(e) => setTrocaBateria(e.target.value)} placeholder="Ex: 92" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Observação</p>
                    <input value={trocaObs} onChange={(e) => setTrocaObs(e.target.value)} placeholder="Ex: Sem marcas, com caixa" className={inputCls} />
                  </div>
                </div>
                {trocaNum > 0 && valorBase > 0 && (
                  <p className="text-sm font-bold text-[#E8740E]">Diferença a pagar: R$ {valorAPagar.toLocaleString("pt-BR")}</p>
                )}
              </div>
            )}
            <div>
              <p className={labelCls}>Forma de Pagamento</p>
              <select value={form.forma_pagamento} onChange={(e) => set("forma_pagamento", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="Pix">Pix</option>
                <option value="Cartao Credito">Cartão Crédito</option>
                <option value="Cartao Debito">Cartão Débito</option>
                <option value="Especie">Espécie</option>
                <option value="Link de Pagamento">Link de Pagamento</option>
                <option value="Transferencia">Transferência</option>
                <option value="Definir depois">Definir depois</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Valor Base (R$)</p>
              <input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} placeholder="0" className={inputCls} />
            </div>
            {(form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") && (<>
              <div>
                <p className={labelCls}>Parcelas</p>
                <select value={form.parcelas} onChange={(e) => set("parcelas", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {[1,2,3,4,5,6,7,8,9,10,11,12,18,21].map(n => <option key={n} value={String(n)}>{n}x</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>Máquina</p>
                <select value={form.maquina} onChange={(e) => set("maquina", e.target.value)} className={inputCls}>
                  <option value="">-- Selecionar --</option>
                  <option value="ITAU">Itaú</option>
                  <option value="INFINITE">Infinite</option>
                </select>
              </div>
            </>)}
            {/* Pagamento alternativo */}
            {showPagAlt ? (
              <div className="col-span-2 md:col-span-3 border-t border-[#E5E5EA] pt-3 mt-1">
                <p className="text-xs font-semibold text-[#86868B] mb-2">Pagamento alternativo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <select value={form.forma_pagamento_2} onChange={(e) => set("forma_pagamento_2", e.target.value)} className={inputCls}>
                      <option value="">— 2ª forma —</option>
                      <option value="Pix">Pix</option>
                      <option value="Cartao Credito">Cartão Crédito</option>
                      <option value="Especie">Espécie</option>
                      <option value="Link de Pagamento">Link</option>
                      <option value="Transferencia">Transferência</option>
                    </select>
                  </div>
                  <div>
                    <input type="number" value={form.valor_2} onChange={(e) => set("valor_2", e.target.value)} placeholder="Valor R$" className={inputCls} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="col-span-2 md:col-span-3">
                <button onClick={() => setShowPagAlt(true)} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar pagamento alternativo</button>
              </div>
            )}
            <div>
              <p className={labelCls}>Vendedor</p>
              <select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="Andre">Andre</option>
                <option value="Bianca">Bianca</option>
                <option value="Nicolas">Nicolas</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Data da Entrega</p>
              <input type="date" value={form.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Horario</p>
              <select value={form.horario} onChange={(e) => set("horario", e.target.value)} className={inputCls}>
                <option value="">-- Definir --</option>
                <option value="MANHA">Manha (ate 12h)</option>
                <option value="TARDE">Tarde (12h-18h)</option>
                <option value="NOITE">Noite (apos 18h)</option>
                <option value="09:00">09:00</option>
                <option value="10:00">10:00</option>
                <option value="11:00">11:00</option>
                <option value="12:00">12:00</option>
                <option value="13:00">13:00</option>
                <option value="14:00">14:00</option>
                <option value="15:00">15:00</option>
                <option value="16:00">16:00</option>
                <option value="17:00">17:00</option>
                <option value="18:00">18:00</option>
                <option value="19:00">19:00</option>
                <option value="20:00">20:00</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Entregador</p>
              <input value={form.entregador} onChange={(e) => set("entregador", e.target.value)} placeholder="Nome (opcional)" className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Observacao</p>
              <input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Detalhes, instrucoes..." className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyWhatsApp}
              className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors text-sm"
            >
              {copied ? "Copiado!" : "📋 Copiar para WhatsApp"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingEntregaId ? "Salvar Alterações" : "Agendar Entrega"}
            </button>
          </div>
        </div>
      )}

      {/* Navegacao de semana */}
      <div className="flex items-center justify-between bg-white border border-[#D2D2D7] rounded-xl px-4 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          ← Anterior
        </button>
        <div className="text-center">
          <button
            onClick={() => setWeekOffset(0)}
            className={`text-sm font-bold transition-colors ${weekOffset === 0 ? "text-[#E8740E]" : "text-[#1D1D1F] hover:text-[#E8740E] cursor-pointer"}`}
          >
            {weekOffset === 0 ? "Semana Atual" : `Semana ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
          </button>
          <p className="text-[10px] text-[#86868B]">
            {formatDateBR(from)} a {formatDateBR(to)}
          </p>
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          Proxima →
        </button>
      </div>

      {/* Calendario semanal */}
      {loading ? (
        <div className="p-8 text-center text-[#86868B]">Carregando...</div>
      ) : (
        <>
          {/* Desktop: grid de 6 colunas */}
          <div className="hidden md:grid grid-cols-6 gap-2">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr);
              // Sort by horario
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden min-h-[200px] ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  {/* Day header */}
                  <div className={`px-3 py-2 text-center border-b ${isToday ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-[#F5F5F7] border-[#D2D2D7]"}`}>
                    <p className="text-[10px] font-bold uppercase">{DIAS_SEMANA[idx]}</p>
                    <p className="text-sm font-bold">{day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</p>
                  </div>

                  {/* Entregas */}
                  <div className="p-1.5 space-y-1.5">
                    {dayEntregas.length === 0 && (
                      <p className="text-[10px] text-[#B0B0B0] text-center py-4">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntrega(e)}
                          className={`w-full text-left p-2 rounded-lg border transition-all hover:shadow-sm ${dm ? sc.borderDark : sc.border} ${dm ? sc.bgDark : sc.bg}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px]">{sc.icon}</span>
                            {e.horario && <span className={`text-[10px] font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.horario}</span>}
                          </div>
                          <p className={`text-xs font-semibold truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</p>
                          {e.bairro && <p className={`text-[10px] truncate ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.bairro}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: lista vertical por dia */}
          <div className="md:hidden space-y-3">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr);
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              if (dayEntregas.length === 0 && !isToday) return null;

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  <div className={`px-4 py-2 flex items-center justify-between ${isToday ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7]"}`}>
                    <span className="text-sm font-bold">{DIAS_SEMANA[idx]} {day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</span>
                    <span className={`text-xs ${isToday ? "text-white/80" : "text-[#86868B]"}`}>{dayEntregas.length} entrega{dayEntregas.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="p-2 space-y-2">
                    {dayEntregas.length === 0 && (
                      <p className="text-xs text-[#B0B0B0] text-center py-3">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntrega(e)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${dm ? sc.borderDark : sc.border} ${dm ? sc.bgDark : sc.bg}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span>{sc.icon}</span>
                              <span className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</span>
                            </div>
                            {e.horario && <span className="text-xs font-bold text-[#1D1D1F]">{e.horario}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#86868B]">
                            {e.bairro && <span>{e.bairro}</span>}
                            {e.entregador && <span>- {e.entregador}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Resumo da semana */}
      {!loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
              const count = entregas.filter((e) => e.status === status).length;
              const sc = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-2">
                  <span>{sc.icon}</span>
                  <span className={`text-sm font-semibold ${sc.color}`}>{count} {sc.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1D1D1F]">Total: {entregas.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhes da entrega */}
      {selectedEntrega && (() => {
        const e = selectedEntrega;
        const sc = STATUS_CONFIG[e.status];
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntrega(null)}>
            <div className={`rounded-2xl w-full max-w-md shadow-xl ${dm ? "bg-[#1C1C1E]" : "bg-white"}`} onClick={(ev) => ev.stopPropagation()}>
              {/* Header */}
              <div className={`px-5 py-4 rounded-t-2xl border-b ${dm ? `${sc.bgDark} ${sc.borderDark}` : `${sc.bg} ${sc.border}`}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{sc.icon}</span>
                    <div>
                      <h3 className={`text-base font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</h3>
                      <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{formatDateBR(e.data_entrega)} {e.horario ? `- ${e.horario}` : ""}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedEntrega(null)} className={`text-lg ${dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}>X</button>
                </div>
              </div>

              {/* Detalhes */}
              <div className="px-5 py-4 space-y-3">
                {e.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#86868B]">Tel:</span>
                    <a href={`tel:${e.telefone}`} className="text-blue-600 font-medium">{e.telefone}</a>
                  </div>
                )}
                {e.endereco && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Endereco: </span>
                    <span className="text-[#1D1D1F]">{e.endereco}</span>
                  </div>
                )}
                {e.bairro && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Bairro: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.bairro}</span>
                  </div>
                )}
                {e.entregador && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Entregador: </span>
                    <span className="text-[#1D1D1F]">{e.entregador}</span>
                  </div>
                )}
                {e.produto && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Produto: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.produto}</span>
                  </div>
                )}
                {e.tipo && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Tipo: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.tipo}</span>
                    {e.detalhes_upgrade && <span className="text-[#86868B]"> — {e.detalhes_upgrade}</span>}
                  </div>
                )}
                {e.forma_pagamento && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Pagamento: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.forma_pagamento}</span>
                    {e.valor != null && <span className="text-[#1D1D1F]"> R${e.valor}</span>}
                  </div>
                )}
                {e.vendedor && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Vendedor: </span>
                    <span className="text-[#1D1D1F]">{e.vendedor}</span>
                  </div>
                )}
                {e.observacao && (
                  <div className="text-sm p-3 bg-[#F5F5F7] rounded-lg">
                    <span className="text-[#86868B]">Obs: </span>
                    <span className="text-[#1D1D1F]">{e.observacao}</span>
                  </div>
                )}

                {/* Status badge */}
                <div className="pt-2">
                  <p className="text-xs font-bold text-[#86868B] uppercase mb-2">Alterar Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
                      const c = STATUS_CONFIG[status];
                      const isActive = e.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(e, status)}
                          disabled={isActive}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isActive
                              ? `${c.bg} ${c.color} border-2 ${c.border} opacity-100`
                              : `bg-white border border-[#D2D2D7] text-[#86868B] hover:${c.bg} hover:${c.color} hover:${c.border}`
                          }`}
                        >
                          {c.icon} {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copiar formulário motoboy */}
                <div className="pt-2 border-t border-[#D2D2D7]">
                  <button
                    onClick={() => {
                      const regiao = e.regiao || e.bairro || "";
                      const isUpgrade = e.tipo === "UPGRADE" || !!e.detalhes_upgrade;
                      const tipoLabel = isUpgrade ? "UPGRADE (Troca)" : "Compra";
                      const msg = [
                        `🛵 *ENTREGA ${regiao.toUpperCase()}* 🛵`,
                        `🛵`,
                        `⏰ *HORÁRIO:* ${e.horario || "A combinar"}`,
                        `📍 *LOCAL:* ${e.endereco || "A definir"} - ${e.bairro || ""}`,
                        `🍎 *PRODUTO:* ${e.produto || ""}`,
                        `‼️ *TIPO:* ${tipoLabel}`,
                        ...(isUpgrade && e.detalhes_upgrade ? [`🔄 *PRODUTO NA TROCA:* ${e.detalhes_upgrade}`] : []),
                        `💵 *PAGAMENTO:* ${e.forma_pagamento || ""} R$${Number(e.valor || 0).toLocaleString("pt-BR")}`,
                        `🧑 *CLIENTE:* ${e.cliente || ""}`,
                        `📞 *CONTATO:* ${e.telefone || ""}`,
                        e.observacao ? `OBS: ${e.observacao}` : "",
                        `💼 Vendedor: ${e.vendedor || ""}`,
                        "________________________________",
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(msg);
                      alert("Formulário copiado! Cole no WhatsApp do motoboy.");
                    }}
                    className="w-full py-2.5 rounded-xl text-center text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors mb-2"
                  >
                    📋 Copiar Formulário Motoboy
                  </button>
                </div>

                {/* Acoes */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Carregar dados da entrega no formulário pra editar
                      setForm({
                        cliente: e.cliente || "",
                        telefone: e.telefone || "",
                        endereco: e.endereco || "",
                        bairro: e.bairro || "",
                        data_entrega: e.data_entrega || hojeBR(),
                        horario: e.horario || "",
                        entregador: e.entregador || "",
                        observacao: e.observacao || "",
                        tipo: e.tipo || "",
                        forma_pagamento: e.forma_pagamento || "",
                        valor: e.valor != null ? String(e.valor) : "",
                        parcelas: "",
                        maquina: "",
                        forma_pagamento_2: "",
                        valor_2: "",
                        vendedor: e.vendedor || "",
                        regiao: e.regiao || "",
                        local_entrega: "",
                      });
                      if (e.produto) setProdutos(e.produto.split(" | ").filter(Boolean));
                      if (e.detalhes_upgrade) {
                        setTrocaAtiva(true);
                        const lines = e.detalhes_upgrade.split("\n");
                        setTrocaProduto(lines[0] || "");
                        const corLine = lines.find(l => l.startsWith("Cor:"));
                        if (corLine) setTrocaCor(corLine.replace("Cor:", "").trim());
                        const batLine = lines.find(l => l.startsWith("Bateria:"));
                        if (batLine) setTrocaBateria(batLine.replace("Bateria:", "").replace("%", "").trim());
                        const valLine = lines.find(l => l.startsWith("Avaliação:"));
                        if (valLine) { const m = valLine.match(/[\d.]+/); if (m) setTrocaValor(m[0]); }
                        const obsLine = lines.find(l => !l.startsWith("Cor:") && !l.startsWith("Bateria:") && !l.startsWith("Avaliação:") && lines.indexOf(l) > 0);
                        if (obsLine) setTrocaObs(obsLine);
                      }
                      setProdutoManual(true);
                      setEditingEntregaId(e.id);
                      setShowForm(true);
                      setSelectedEntrega(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl text-center text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  {e.telefone && (
                    <a
                      href={`https://wa.me/55${e.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl text-center text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
