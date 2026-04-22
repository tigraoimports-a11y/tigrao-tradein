"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS_GASTO } from "@/lib/admin-types";
import { useTabParam } from "@/lib/useTabParam";
import type { Gasto, Banco } from "@/lib/admin-types";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import { STRUCTURED_CATS, buildProdutoName, IPHONE_ORIGENS, DEFAULT_SPEC, type ProdutoSpec } from "@/lib/produto-specs";
import { corParaPT, corParaEN, normalizarCoresNoTexto } from "@/lib/cor-pt";
import { formatProdutoDisplay } from "@/lib/produto-display";

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
  tipo: string;
  categoria: string;
  descricao: string | null;
  observacao: string | null;
  hora: string | null;
  is_dep_esp: boolean;
  bancos: string;
  funcionario_id: string | null;
  contato_nome: string | null;
  contato_tipo: string | null;
  venda_id: string | null;
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
      tipo: first.tipo,
      categoria: first.categoria,
      descricao: first.descricao,
      observacao: first.observacao,
      hora: first.hora,
      is_dep_esp: first.is_dep_esp,
      bancos: items.map((i) => `${i.banco}: ${fmt(i.valor)}`).join(" | "),
      funcionario_id: first.funcionario_id || null,
      contato_nome: first.contato_nome || null,
      contato_tipo: first.contato_tipo || null,
      venda_id: first.venda_id || null,
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
      tipo: g.tipo,
      categoria: g.categoria,
      descricao: g.descricao,
      observacao: g.observacao,
      hora: g.hora,
      is_dep_esp: g.is_dep_esp,
      bancos: g.banco || "—",
      funcionario_id: g.funcionario_id || null,
      contato_nome: g.contato_nome || null,
      contato_tipo: g.contato_tipo || null,
      venda_id: g.venda_id || null,
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
// Infere ProdutoSpec a partir do nome do produto em estoque
function inferSpecFromProduto(produto: string, categoria: string): ProdutoSpec {
  const spec = { ...DEFAULT_SPEC };
  if (!produto) return spec;
  const n = produto.toUpperCase();
  const storageMatch = n.match(/\b(\d+[GT]B)\b/);
  if (storageMatch) {
    if (categoria === "IPHONES") spec.ip_storage = storageMatch[1];
    else if (categoria === "MACBOOK" || categoria === "MACBOOK_NEO" || categoria === "MACBOOK_AIR" || categoria === "MACBOOK_PRO") spec.mb_storage = storageMatch[1];
    else if (categoria === "MAC_MINI") spec.mm_storage = storageMatch[1];
  }
  if (categoria === "IPHONES") {
    // Captura número + opcional E (ex.: 16E) ou número + AIR (ex.: 17 AIR)
    const numMatch = n.match(/IPHONE\s*(\d+E?|\d+\s+AIR)/);
    spec.ip_modelo = numMatch ? numMatch[1].trim().toUpperCase() : "17";
    spec.ip_linha = n.includes(" PRO MAX") ? "PRO MAX" : n.includes(" PRO") ? "PRO" : n.includes(" PLUS") ? "PLUS" : n.includes(" AIR") ? "AIR" : "";
    const ORIGIN_CODES = ["AA","BE","BR","BZ","CH","E","HN","J","LL","LZ","N","QL","VC","ZD","ZP","ZA","IN"];
    const originMatch = n.match(new RegExp("\\b(" + ORIGIN_CODES.join("|") + ")\\b"));
    if (originMatch) {
      // Mapear código curto para a string completa de IPHONE_ORIGENS (ex: "J" → "J (JPA) - E-sim")
      const code = originMatch[1];
      const fullOrigem = IPHONE_ORIGENS.find(o => o.startsWith(code + " ") || o === code) || code;
      spec.ip_origem = fullOrigem;
    }
  } else if (categoria === "MACBOOK" || categoria === "MACBOOK_NEO" || categoria === "MACBOOK_AIR" || categoria === "MACBOOK_PRO") {
    spec.mb_modelo = /NEO/i.test(n) ? "NEO" : /PRO/i.test(n) ? "PRO" : "AIR";
    const chip = n.match(/\b(A18\s*Pro|M\d+(?:\s+(?:PRO|MAX))?)\b/i);
    if (chip) spec.mb_chip = chip[1];
    const nucleosMatch = n.match(/\((\d+C\s*CPU\/\d+C\s*GPU)\)/i);
    if (nucleosMatch) spec.mb_nucleos = nucleosMatch[1].toUpperCase();
    const ram = n.match(/\b(\d+GB)\b.*(?:RAM|GB)/);
    if (ram) spec.mb_ram = ram[1];
  } else if (categoria === "MAC_MINI") {
    const chip = n.match(/\b(M\d+(?:\s+(?:PRO|MAX))?)\b/);
    if (chip) spec.mm_chip = chip[1];
  } else if (categoria === "APPLE_WATCH") {
    const modeloM = n.match(/(SERIES\s*\d+|SE|ULTRA\s*\d*)/i);
    if (modeloM) spec.aw_modelo = modeloM[1].toUpperCase();
    const tamM = n.match(/(\d+mm)/i);
    if (tamM) spec.aw_tamanho = tamM[1].toLowerCase();
  }
  return spec;
}

function produtoToRowState(p: any, fornecedoresList: { id: string; nome: string }[], condicaoInicial: string, origemInicial: string): ProdutoRowState {
  const cat = p.categoria || "IPHONES";
  const spec = inferSpecFromProduto(p.produto || "", cat);
  // Origem de região do iPhone (LL, VC, etc.) vai pro spec.ip_origem
  // Validar que é um código de origem real antes de setar (evita "CLIENTE" no nome)
  const VALID_ORIGIN_CODES = ["AA","BE","BR","BZ","CH","E","HN","J","LL","LZ","N","QL","VC","ZD","ZP"];
  const origemCode = origemInicial.split(" ")[0].toUpperCase();
  if (origemInicial && VALID_ORIGIN_CODES.includes(origemCode)) {
    const fullOrigem = IPHONE_ORIGENS.find(o => o.startsWith(origemCode + " ") || o === origemCode) || origemCode;
    spec.ip_origem = fullOrigem;
  }
  // Tela de acessorio: ler da observacao [TELA:X"]
  if (cat === "ACESSORIOS") {
    const telaMatch = p.observacao?.match(/\[TELA:([^\]]+)\]/);
    if (telaMatch) spec.ac_tela = telaMatch[1].trim();
  }
  const caixaInicial = !!(p.observacao && p.observacao.includes("[COM_CAIXA]"));
  const GRADE_TAG_MAP: Record<string, string> = { "A+": "A+", A: "A", AB: "AB", B: "B" };
  const gradeTagKey = p.observacao?.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
  const gradeInicial = gradeTagKey ? GRADE_TAG_MAP[gradeTagKey] : "";
  const fornNome = p.fornecedor || "";
  const isFornCadastrado = fornecedoresList.some(f => f.nome === fornNome);
  return {
    categoria: cat,
    catalogo_modelo_id: "",
    catalogo_modelo_nome: "",
    spec,
    produto: p.produto || "",
    cor: p.cor || "",
    qnt: String(p.qnt || 1),
    custo_unitario: String(p.custo_unitario || ""),
    fornecedor: isFornCadastrado ? fornNome : "",
    cliente: isFornCadastrado ? "" : fornNome,
    imei: p.imei || "",
    serial_no: p.serial_no || "",
    condicao: condicaoInicial,
    caixa: caixaInicial,
    cabo: !!(p.observacao && p.observacao.includes("[COM_CABO]")),
    fonte: !!(p.observacao && p.observacao.includes("[COM_FONTE]")),
    grade: gradeInicial,
    bateria: p.bateria ? String(p.bateria) : "",
    garantia: p.garantia || "",
    observacao: (p.observacao || "").replace(/\[GRADE_[^\]]+\]|\[COM_CAIXA\]|\[COM_CABO\]|\[COM_FONTE\]|\[NAO_ATIVADO\]|\[SEMINOVO\]|\[TELA:[^\]]+\]/g, "").trim(),
  };
}

function ProdutosVinculados({ pedidoFornecedorId, password, dm, fornecedores }: { pedidoFornecedorId: string; password: string; dm: boolean; fornecedores: { id: string; nome: string }[] }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRowState, setEditRowState] = useState<ProdutoRowState | null>(null);
  // Keep editFields for non-spec fields (origem, custo, qnt) that ProdutoSpecFields doesn't cover
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Extra serial/IMEI pairs for qnt > 1 (index 0 = unit 2, index 1 = unit 3, etc.)
  const [multiSerials, setMultiSerials] = useState<Array<{serial_no: string; imei: string}>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newRowState, setNewRowState] = useState<ProdutoRowState | null>(null);
  const [savingNew, setSavingNew] = useState(false);

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

  // Helpers para condição no prefixo do observacao
  const getCondicaoFromObs = (obs: string | null): string => {
    if (!obs) return "NOVO";
    const m = obs.match(/^\[(NAO_ATIVADO|SEMINOVO)\]/);
    return m ? m[1] : "NOVO";
  };
  const getOrigemFromObs = (obs: string | null): string => {
    if (!obs) return "";
    return obs.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  };
  const getCaixaFromObs = (obs: string | null): boolean => {
    return !!(obs && obs.includes("[COM_CAIXA]"));
  };
  const getGradeFromObs = (obs: string | null): string => {
    const GRADE_TAG: Record<string, string> = { "A+": "A+", A: "A", AB: "AB", B: "B" };
    const key = obs?.match(/\[GRADE_(A\+|AB|A|B)\]/)?.[1];
    return key ? GRADE_TAG[key] : "";
  };
  const buildObs = (condicao: string, origem: string, caixa?: boolean, grade?: string, acTela?: string): string | null => {
    const prefix = condicao && condicao !== "NOVO" ? `[${condicao}]` : "";
    const caixaTag = caixa ? "[COM_CAIXA]" : "";
    const gradeKey = grade ? (grade) : "";
    const gradeTag = gradeKey ? `[GRADE_${gradeKey}]` : "";
    const telaTag = acTela ? `[TELA:${acTela}]` : "";
    const tags = `${prefix}${caixaTag}${gradeTag}${telaTag}`;
    const combined = tags ? (origem ? `${tags} ${origem}` : tags) : origem;
    return combined || null;
  };

  const deleteProduct = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" deste pedido?\n\nO valor do gasto NÃO será alterado.`)) return;
    setDeletingId(id);
    try {
      await fetch("/api/estoque", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id }),
      });
      await reload();
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const saveNewProduct = async () => {
    if (!newRowState) return;
    setSavingNew(true);
    try {
      const acTela = newRowState.categoria === "ACESSORIOS" ? (newRowState.spec?.ac_tela || "") : "";
      const obs = buildObs(newRowState.condicao, "", newRowState.caixa, newRowState.grade, acTela);
      // Copiar data_compra, data_entrada, origem_compra, origem de outro produto
      // do mesmo pedido — senão o novo fica orfao (sem data/origem) e aparece
      // em grupo separado "SEM ORIGEM DEFINIDA" na listagem a caminho.
      const ref: Record<string, unknown> | undefined = produtos[0] as Record<string, unknown> | undefined;
      const row = {
        produto: newRowState.produto,
        categoria: newRowState.categoria,
        qnt: parseInt(newRowState.qnt) || 1,
        custo_unitario: parseFloat(newRowState.custo_unitario) || 0,
        custo_compra: parseFloat(newRowState.custo_unitario) || 0,
        cor: newRowState.cor || null,
        fornecedor: newRowState.fornecedor || null,
        serial_no: newRowState.serial_no ? newRowState.serial_no.toUpperCase() : null,
        imei: newRowState.imei ? newRowState.imei.toUpperCase() : null,
        observacao: obs,
        status: "A CAMINHO",
        tipo: "A_CAMINHO",
        pedido_fornecedor_id: pedidoFornecedorId,
        data_compra: ref?.data_compra ?? null,
        data_entrada: ref?.data_entrada ?? null,
        origem_compra: ref?.origem_compra ?? null,
        origem: ref?.origem ?? null,
      };
      const res = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ action: "add_to_pedido", row }),
      });
      const json = await res.json();
      if (json.ok || json.data) {
        setAddingNew(false);
        setNewRowState(null);
        await reload();
      } else {
        alert("Erro: " + (json.error || "falha ao salvar"));
      }
    } catch (err) { alert("Erro de conexão: " + err); }
    setSavingNew(false);
  };

  const startEdit = (p: any) => {
    setEditId(p.id);
    const fornNome = p.fornecedor || "";
    const isFornecedorCadastrado = fornecedores.some(f => f.nome === fornNome);

    // Para produtos já em estoque (não A_CAMINHO), a condição real vem do tipo no DB
    // Para A_CAMINHO, a condição esperada vem do observacao
    const currentTipo = p.tipo || "A_CAMINHO";
    let condicaoInicial: string;
    if (currentTipo === "A_CAMINHO") {
      condicaoInicial = getCondicaoFromObs(p.observacao);
    } else if (currentTipo === "SEMINOVO" || currentTipo === "PENDENCIA") {
      condicaoInicial = "SEMINOVO";
    } else if (currentTipo === "NAO_ATIVADO") {
      condicaoInicial = "NAO_ATIVADO";
    } else {
      // NOVO ou outro — pode ter observacao com condição
      condicaoInicial = getCondicaoFromObs(p.observacao);
    }

    const origemInicial = getOrigemFromObs(p.observacao);
    // editFields guarda apenas o tipo original (para lógica de saveEdit)
    setEditFields({ tipo: currentTipo });
    // editRowState alimenta o ProdutoSpecFields com todos os campos incluindo spec.ip_origem
    setEditRowState(produtoToRowState(p, fornecedores, condicaoInicial, origemInicial));
    // Inicializar multiSerials baseado na quantidade
    const qnt = parseInt(p.qnt || 1);
    setMultiSerials(qnt > 1 ? Array.from({ length: qnt - 1 }, () => ({ serial_no: "", imei: "" })) : []);
  };

  const saveEdit = async () => {
    if (!editId || !editRowState) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const original = produtos.find((p: any) => p.id === editId);

      // Produto: nome do catálogo ou texto livre
      const isStructured = STRUCTURED_CATS.includes(editRowState.categoria);
      const newProduto = isStructured
        ? buildProdutoName(editRowState.categoria, editRowState.spec, editRowState.cor)
        : editRowState.produto;

      // Origem agora é campo próprio (estoque.origem), não vai mais no nome nem na obs.
      const originalObs = original?.observacao || null;
      const origemNova = editRowState.spec.ip_origem || "";
      // Limpar qualquer resíduo de origem que ainda esteja no nome (para rows antigas)
      const nomeFinal = newProduto
        .toUpperCase()
        .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?(\s*-\s*[A-Z\s+]+)?$/i, "")
        .trim();
      if (nomeFinal !== (original?.produto || "")) updates.produto = nomeFinal;
      // Persistir origem no campo próprio (apenas iPhones)
      if (editRowState.categoria === "IPHONES") {
        const origemAtual = original?.origem || "";
        if (origemNova !== origemAtual) updates.origem = origemNova || null;
      }
      if (editRowState.cor !== (original?.cor || "")) updates.cor = editRowState.cor || null;
      if (editRowState.categoria !== (original?.categoria || "")) updates.categoria = editRowState.categoria;
      if (editRowState.serial_no !== (original?.serial_no || "")) updates.serial_no = editRowState.serial_no.toUpperCase() || null;
      if (editRowState.imei !== (original?.imei || "")) updates.imei = editRowState.imei || null;
      if (editRowState.custo_unitario !== String(original?.custo_unitario || "")) updates.custo_unitario = parseFloat(editRowState.custo_unitario) || 0;
      if (editRowState.qnt !== String(original?.qnt || 1)) updates.qnt = parseInt(editRowState.qnt) || 1;

      // Fornecedor: cliente tem prioridade sobre fornecedor
      const novoFornecedor = editRowState.cliente?.trim() || editRowState.fornecedor || null;
      if (novoFornecedor !== (original?.fornecedor || null)) updates.fornecedor = novoFornecedor;

      // Observacao: condição + caixa + grade + tela_acessorio (origem vai no campo próprio)
      const acTela = editRowState.categoria === "ACESSORIOS" ? (editRowState.spec?.ac_tela || "") : "";
      const newObs = buildObs(editRowState.condicao || "NOVO", "", editRowState.caixa, editRowState.grade, acTela);
      if (newObs !== originalObs) updates.observacao = newObs;

      // Tipo: SEMPRE atualizado conforme condição para produtos já em estoque
      const currentTipo = original?.tipo || "A_CAMINHO";
      if (currentTipo !== "A_CAMINHO") {
        const targetTipo =
          editRowState.condicao === "SEMINOVO" ? "SEMINOVO" :
          editRowState.condicao === "NAO_ATIVADO" ? "NAO_ATIVADO" : "NOVO";
        if (targetTipo !== currentTipo) {
          updates.tipo = targetTipo;
          if (currentTipo === "PENDENCIA") updates.status = "EM ESTOQUE";
        }
      }

      // Multi-serial: se alguma unidade extra tem serial/IMEI, dividir em registros individuais
      const filledExtras = multiSerials.filter(s => s.serial_no || s.imei);
      if (filledExtras.length > 0) {
        // Unidade 1: atualizar o registro existente com qnt=1 e serial/imei da unidade 1
        updates.qnt = 1;
        updates.serial_no = editRowState.serial_no.toUpperCase() || null;
        updates.imei = editRowState.imei || null;
        await fetch("/api/estoque", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({ id: editId, ...updates }),
        });
        // Unidades extras: criar novos registros (copiando todos os campos do original)
        const basePayload: Record<string, any> = {
          produto: updates.produto ?? original?.produto,
          categoria: updates.categoria ?? original?.categoria,
          cor: updates.cor !== undefined ? updates.cor : (original?.cor || null),
          custo_unitario: updates.custo_unitario ?? original?.custo_unitario,
          custo_compra: original?.custo_compra ?? (updates.custo_unitario ?? original?.custo_unitario),
          fornecedor: updates.fornecedor !== undefined ? updates.fornecedor : (original?.fornecedor || null),
          cliente: original?.cliente || null,
          observacao: updates.observacao !== undefined ? updates.observacao : original?.observacao,
          tipo: updates.tipo ?? original?.tipo,
          status: updates.status ?? original?.status,
          origem_compra: original?.origem_compra || null,
          origem: original?.origem || null,
          pedido_fornecedor_id: original?.pedido_fornecedor_id,
          data_compra: original?.data_compra,
          data_entrada: original?.data_entrada,
          bateria: original?.bateria || null,
          garantia: original?.garantia || null,
          qnt: 1,
        };
        for (const s of filledExtras) {
          await fetch("/api/estoque", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify({ ...basePayload, serial_no: s.serial_no.toUpperCase() || null, imei: s.imei || null }),
          });
        }
        // Se sobrou qnt sem serial (mais unidades do que seriais preenchidos), criar 1 registro com o restante
        const totalQnt = parseInt(editRowState.qnt) || 1;
        const remaining = totalQnt - 1 - filledExtras.length;
        if (remaining > 0) {
          await fetch("/api/estoque", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify({ ...basePayload, qnt: remaining, serial_no: null, imei: null }),
          });
        }
        await reload();
      } else if (Object.keys(updates).length > 0) {
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
    setEditRowState(null);
    setMultiSerials([]);
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
        {produtos.length === 0 && !addingNew && (
          <p className={`text-xs italic ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Nenhum produto vinculado</p>
        )}
        {produtos.map((p: any) => (
          <div key={p.id} className={`px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#3A3A3C]" : "bg-[#F0F0F5]"}`}>
            {editId === p.id && editRowState ? (
              <div className="space-y-3">
                {/* ProdutoSpecFields: catálogo, modelo, cor, condição, fornecedor/cliente, serial, imei, qtd, custo */}
                <ProdutoSpecFields
                  row={editRowState}
                  onChange={(newRow) => {
                    const newQnt = parseInt(newRow.qnt) || 1;
                    const oldQnt = parseInt(editRowState.qnt) || 1;
                    if (newQnt !== oldQnt) {
                      setMultiSerials(newQnt > 1 ? Array.from({ length: newQnt - 1 }, (_, i) => multiSerials[i] || { serial_no: "", imei: "" }) : []);
                    }
                    setEditRowState(newRow);
                  }}
                  onRemove={() => { setEditId(null); setEditRowState(null); setMultiSerials([]); }}
                  fornecedores={fornecedores}
                  inputCls={inputCls}
                  labelCls={`text-[10px] font-semibold uppercase tracking-wider mb-1 block ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}
                  darkMode={dm}
                  index={0}
                />
                {/* Seriais/IMEIs adicionais para qnt > 1 */}
                {multiSerials.length > 0 && (
                  <div className="space-y-2">
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Seriais / IMEIs por unidade</p>
                    <p className={`text-[10px] italic ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Unidade 1 — use os campos Serial e IMEI acima</p>
                    {multiSerials.map((s, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2">
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Serial — Unidade {i + 2}</p>
                          <input
                            value={s.serial_no}
                            onChange={(e) => {
                              const next = [...multiSerials];
                              next[i] = { ...next[i], serial_no: e.target.value };
                              setMultiSerials(next);
                            }}
                            placeholder="Opcional"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>IMEI — Unidade {i + 2}</p>
                          <input
                            value={s.imei}
                            onChange={(e) => {
                              const next = [...multiSerials];
                              next[i] = { ...next[i], imei: e.target.value };
                              setMultiSerials(next);
                            }}
                            placeholder="Opcional"
                            className={inputCls}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving} className="px-3 py-1 rounded bg-[#E8740E] text-white text-[10px] font-semibold hover:bg-[#D06A0D]">
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button onClick={() => { setEditId(null); setEditRowState(null); setMultiSerials([]); }} className={`px-3 py-1 rounded text-[10px] font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "A CAMINHO" ? "bg-yellow-100 text-yellow-700" : p.status === "PENDENTE" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                      {p.status}
                    </span>
                    {(() => {
                      const cond = getCondicaoFromObs(p.observacao);
                      if (cond === "SEMINOVO") return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Seminovo</span>;
                      if (cond === "NAO_ATIVADO") return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Não Ativado</span>;
                      return null;
                    })()}
                    <span className={`font-medium truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                      {formatProdutoDisplay({ produto: p.produto, categoria: p.categoria, cor: p.cor, observacao: p.observacao })}
                      {(() => {
                        const en = p.cor ? corParaEN(p.cor) : null;
                        const pt = p.cor ? corParaPT(p.cor) : "";
                        if (!en || !pt || en.toLowerCase() === pt.toLowerCase()) return null;
                        return <span className={`ml-1 text-[11px] font-normal ${dm ? "text-[#8E8E93]" : "text-[#86868B]"}`}>{en}</span>;
                      })()}
                      {(() => {
                        const origem = getOrigemFromObs(p.observacao);
                        if (!origem) return "";
                        const code = origem.split(" ")[0];
                        const pais = origem.match(/\(([^)]+)\)/)?.[1];
                        return ` · ${code}${pais ? ` (${pais})` : ""}`;
                      })()}
                    </span>
                  </div>
                  <div className={`mt-1 flex items-center gap-3 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    {p.serial_no ? <span className="font-mono text-purple-500">SN: {p.serial_no}</span> : <span className="font-mono opacity-50">S/N</span>}
                    {p.imei && <span className="font-mono text-blue-500">IMEI: {p.imei}</span>}
                    {p.fornecedor && <span className="text-[10px] opacity-60">📦 {p.fornecedor}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>x{p.qnt}</span>
                  <span className="font-bold text-[#E8740E]">{fmt(p.custo_unitario)}</span>
                  <button onClick={() => startEdit(p)} className={`text-[10px] font-semibold ${dm ? "text-[#F5A623]" : "text-[#E8740E]"} hover:underline`}>
                    Editar
                  </button>
                  <button
                    onClick={() => deleteProduct(p.id, p.produto)}
                    disabled={deletingId === p.id}
                    className={`text-[10px] font-semibold text-red-500 hover:underline disabled:opacity-50`}
                  >
                    {deletingId === p.id ? "..." : "Excluir"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Form para adicionar novo produto */}
      {addingNew && newRowState && (
        <div className={`mt-2 px-3 py-3 rounded-lg space-y-3 ${dm ? "bg-[#3A3A3C]" : "bg-[#F0F0F5]"}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Novo produto</p>
          <ProdutoSpecFields
            row={newRowState}
            onChange={setNewRowState}
            onRemove={() => { setAddingNew(false); setNewRowState(null); }}
            fornecedores={fornecedores}
            inputCls={inputCls}
            labelCls={`text-[10px] font-semibold uppercase tracking-wider mb-1 block ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}
            darkMode={dm}
            index={0}
          />
          <div className="flex gap-2">
            <button onClick={saveNewProduct} disabled={savingNew || !newRowState.produto} className="px-3 py-1 rounded bg-[#E8740E] text-white text-[10px] font-semibold hover:bg-[#D06A0D] disabled:opacity-50">
              {savingNew ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => { setAddingNew(false); setNewRowState(null); }} className={`px-3 py-1 rounded text-[10px] font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setAddingNew(true); setNewRowState(createEmptyProdutoRow()); }}
        className={`mt-2 w-full py-2 rounded-lg border-2 border-dashed text-xs font-semibold transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`}
      >
        + Adicionar Produto
      </button>
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
  // Funcionarios (para SALARIO)
  const [funcionariosLista, setFuncionariosLista] = useState<{ id: string; nome: string; cargo: string; tag: string }[]>([]);

  // Form state
  const [form, setForm] = useState({
    data: hojeBR(),
    horario: new Date().toTimeString().slice(0, 5),
    categoria: "OUTROS",
    descricao: "",
    observacao: "",
    is_dep_esp: false,
    funcionario_id: "",
    // Estorno
    contato_tipo: "cliente" as "cliente" | "fornecedor" | "atacado",
    contato_nome: "",
    venda_id: "",
  });
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [atacados, setAtacados] = useState<{ id: string; nome: string }[]>([]);
  const [vendasDoContato, setVendasDoContato] = useState<{ id: string; data: string; produto: string; preco_vendido: number }[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);
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
    funcionario_id: "",
  });
  const [editBancoValores, setEditBancoValores] = useState<BancoValores>(emptyBancoValores());

  const grupos = useMemo(() => agruparGastos(gastos), [gastos]);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [categoriasExcluidas, setCategoriasExcluidas] = useState<Set<string>>(new Set());
  // Filtro de mês (YYYY-MM). Default = mês atual.
  const [filtroMes, setFiltroMes] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const toggleCategoria = (cat: string) => setCategoriasExcluidas(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const gruposFiltrados = useMemo(() => {
    // Exclui transferências de depósito (aparecem na tela de Saldos, não em Gastos)
    let result = grupos.filter(g => g.tipo !== "TRANSFERENCIA" && !g.is_dep_esp);
    if (filtroMes) result = result.filter(g => (g.data || "").startsWith(filtroMes));
    if (filtroCategoria) result = result.filter(g => g.categoria === filtroCategoria);
    if (categoriasExcluidas.size > 0) result = result.filter(g => !categoriasExcluidas.has(g.categoria));
    return result;
  }, [grupos, filtroMes, filtroCategoria, categoriasExcluidas]);
  const shiftMes = (delta: number) => setFiltroMes(prev => {
    // Se não tem filtro (Todos), começa do mês atual
    const hoje = new Date();
    let y: number, m: number;
    if (prev && /^\d{4}-\d{2}$/.test(prev)) {
      [y, m] = prev.split("-").map(Number);
    } else {
      y = hoje.getFullYear();
      m = hoje.getMonth() + 1;
    }
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const mesLabel = useMemo(() => {
    if (!filtroMes || !/^\d{4}-\d{2}$/.test(filtroMes)) return "Todos";
    const [y, m] = filtroMes.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return "Todos";
    const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${nomes[m - 1]} ${y}`;
  }, [filtroMes]);
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

  // Buscar fornecedores e clientes
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setFornecedores(json.data ?? []);
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch("/api/admin/clientes?tab=clientes", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setClientes(json.clientes ?? json.data ?? []);
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch("/api/admin/clientes?tab=lojistas", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setAtacados(json.clientes ?? json.data ?? []);
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch("/api/admin/funcionarios?tag=TIGRAO&ativo=true", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          setFuncionariosLista(json.data ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [password]);

  // Fetch inicial + auto-refetch ao focar (desabilitado no historico para evitar reset)
  useEffect(() => { fetchGastos(); }, [fetchGastos]);
  useAutoRefetch(fetchGastos, false); // desabilitar completamente — fetch manual apenas

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));
  const setBanco = (banco: Banco, value: string) => setBancoValores((bv) => ({ ...bv, [banco]: value }));

  const totalForm = BANCOS.reduce((s, b) => s + (parseBR(bancoValores[b]) || 0), 0);
  const totalProdutos = pedidoProdutos.reduce((s, p) => s + (parseFloat(p.custo_unitario) || 0) * (parseInt(p.qnt) || 0), 0);

  const isFornecedor = form.categoria === "FORNECEDOR";
  const isEstorno = form.categoria === "ESTORNO";
  const isReembolso = form.categoria === "REEMBOLSO";
  const isSalario = form.categoria === "SALARIO";

  // Carrega vendas do contato selecionado para popular o dropdown de venda relacionada
  useEffect(() => {
    if (!isEstorno || !form.contato_nome.trim()) {
      setVendasDoContato([]);
      return;
    }
    const nome = form.contato_nome.trim().toUpperCase();
    const param = form.contato_tipo === "cliente" ? "cliente" : "fornecedor";
    let cancelled = false;
    setLoadingVendas(true);
    fetch(`/api/vendas?${param}=${encodeURIComponent(nome)}&limit=100`, { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(j => { if (!cancelled) setVendasDoContato(j.data || []); })
      .catch(() => { if (!cancelled) setVendasDoContato([]); })
      .finally(() => { if (!cancelled) setLoadingVendas(false); });
    return () => { cancelled = true; };
  }, [isEstorno, form.contato_nome, form.contato_tipo, password]);

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

    if (isEstorno) {
      const nome = form.contato_nome.trim().toUpperCase();
      if (!nome) {
        setMsg("Informe o contato (cliente, fornecedor ou atacado) do estorno");
        setSaving(false);
        return;
      }
    }

    if (isSalario && !form.funcionario_id) {
      setMsg("Selecione o funcionário");
      setSaving(false);
      return;
    }

    const base = {
      data: form.data,
      hora: form.horario || null,
      tipo: isReembolso ? "ENTRADA" : "SAIDA",
      categoria: form.categoria,
      descricao: form.descricao || null,
      observacao: form.observacao || null,
      is_dep_esp: form.is_dep_esp,
      funcionario_id: isSalario ? form.funcionario_id : null,
      contato_nome: isEstorno ? form.contato_nome.trim().toUpperCase() : null,
      contato_tipo: isEstorno ? form.contato_tipo : null,
      venda_id: isEstorno && form.venda_id.trim() ? form.venda_id.trim() : null,
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
        // Para categorias estruturadas, SEMPRE usar buildProdutoName (ignora nome livre)
        const isStructured = STRUCTURED_CATS.includes(p.categoria);
        const nome = isStructured ? buildProdutoName(p.categoria, p.spec, p.cor) : (p.produto || "");
        // Condição + caixa + grade + tela acessório → prefixo no observacao
        const _cond = p.condicao || "NOVO";
        const _prefix = _cond !== "NOVO" ? `[${_cond}]` : "";
        const _caixaTag = p.caixa ? "[COM_CAIXA]" : "";
        const _gradeKey = p.grade ? (p.grade) : "";
        const _gradeTag = _gradeKey ? `[GRADE_${_gradeKey}]` : "";
        const _telaTag = p.categoria === "ACESSORIOS" && p.spec.ac_tela ? `[TELA:${p.spec.ac_tela}]` : "";
        const _tags = `${_prefix}${_caixaTag}${_gradeTag}${_telaTag}`;
        const obsCondicao = _tags || null;
        // Cliente registrado sobrescreve fornecedor
        const fornecedorFinal = p.cliente?.trim() || p.fornecedor || null;
        return {
          produto: nome,
          categoria: p.categoria,
          qnt: parseInt(p.qnt) || 1,
          custo_unitario: parseFloat(p.custo_unitario) || 0,
          cor: p.cor || null,
          fornecedor: fornecedorFinal,
          cliente_origem: p.cliente?.trim() || null,
          imei: p.imei || null,
          serial_no: p.serial_no || null,
          observacao: obsCondicao,
          condicao: p.condicao || "NOVO",
          // Origem do iPhone (LL/J/HN/...) vai para o campo próprio na row, não no nome nem na obs.
          origem: p.categoria === "IPHONES" ? (p.spec.ip_origem || null) : null,
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
      setForm((f) => ({ ...f, descricao: "", observacao: "", is_dep_esp: false, horario: new Date().toTimeString().slice(0, 5), contato_nome: "", venda_id: "", funcionario_id: "" }));
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
      funcionario_id: g.funcionario_id || "",
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
      funcionario_id: editForm.categoria === "SALARIO" ? (editForm.funcionario_id || null) : null,
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

  const totalSaida = gastos.filter(g => !g.is_dep_esp && g.tipo === "SAIDA").reduce((s, g) => s + Number(g.valor), 0);
  void totalSaida;

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
          <h2 className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{isReembolso ? "Registrar Entrada (Reembolso)" : "Registrar Saída"}</h2>

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

          {/* Bloco SALARIO — vincula ao funcionário */}
          {isSalario && (
            <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-[#E8740E]/40 bg-[#E8740E]/5" : "border-[#E8740E]/30 bg-[#FFF8F0]"} space-y-2`}>
              <div>
                <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>👤 Salário — vincular ao funcionário</p>
                <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                  O gasto fica vinculado ao funcionário selecionado. Use a observação pra registrar o motivo.
                </p>
              </div>
              <div>
                <p className={labelCls}>Funcionário <span className="text-red-500">*</span></p>
                <select
                  value={form.funcionario_id}
                  onChange={(e) => set("funcionario_id", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Selecionar —</option>
                  {funcionariosLista.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome.toUpperCase()} · {f.cargo} [{f.tag}]</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Bloco de Estorno — vínculo com contato */}
          {isEstorno && (
            <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-red-500/40 bg-red-500/5" : "border-red-400/30 bg-red-50"} space-y-3`}>
              <div>
                <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>↩️ Estorno — vincular ao contato</p>
                <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                  A venda original permanece. Este registro contabiliza a saída de caixa do valor estornado.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className={labelCls}>Tipo</p>
                  <select
                    value={form.contato_tipo}
                    onChange={(e) => set("contato_tipo", e.target.value)}
                    className={inputCls}
                  >
                    <option value="cliente">Cliente</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="atacado">Atacado</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <p className={labelCls}>Nome do contato</p>
                  <input
                    list="estorno-contatos"
                    value={form.contato_nome}
                    onChange={(e) => set("contato_nome", e.target.value.toUpperCase())}
                    placeholder="Comece a digitar para buscar"
                    className={`${inputCls} uppercase`}
                  />
                  <datalist id="estorno-contatos">
                    {(form.contato_tipo === "fornecedor" ? fornecedores : form.contato_tipo === "atacado" ? atacados : clientes).map((c) => (
                      <option key={c.id} value={c.nome} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <p className={labelCls}>Venda relacionada (opcional)</p>
                {!form.contato_nome.trim() ? (
                  <p className={`text-xs italic ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Selecione um contato primeiro</p>
                ) : loadingVendas ? (
                  <p className={`text-xs italic ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Carregando vendas…</p>
                ) : vendasDoContato.length === 0 ? (
                  <p className={`text-xs italic ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Nenhuma venda encontrada para este contato</p>
                ) : (
                  <select
                    value={form.venda_id}
                    onChange={(e) => set("venda_id", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Sem venda específica —</option>
                    {vendasDoContato.map((v) => {
                      const [y, m, d] = (v.data || "").split("-");
                      const dataFmt = y ? `${d}/${m}/${y}` : "—";
                      const valor = `R$ ${Math.round(v.preco_vendido || 0).toLocaleString("pt-BR")}`;
                      return (
                        <option key={v.id} value={v.id}>
                          {dataFmt} · {v.produto} · {valor}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Bloco Reembolso — entrada de caixa */}
          {isReembolso && (
            <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-green-500/40 bg-green-500/5" : "border-green-400/30 bg-green-50"} space-y-1`}>
              <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>💰 Reembolso — entrada de caixa</p>
              <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                Esse valor <strong>entra</strong> no banco selecionado (Itaú, Infinite ou Mercado Pago).
                É somado ao saldo do dia, não conta como gasto.
              </p>
            </div>
          )}

          {/* Distribuição por banco */}
          <div className={`p-4 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-semibold uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                {isReembolso ? "Valor recebido por banco" : "Valor por banco"}
              </p>
              {totalForm > 0 && (
                <span className={`text-sm font-bold ${isReembolso ? "text-green-600" : "text-[#E8740E]"}`}>Total: {fmt(totalForm)}</span>
              )}
            </div>
            {bancoInputGrid(bancoValores, setBanco, inputCls)}
            <p className={`text-xs mt-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
              {isReembolso
                ? "Selecione o(s) banco(s) onde o reembolso entrou (Itaú, Infinite, Mercado Pago ou Espécie)."
                : "Preencha o valor em cada banco utilizado. Deixe em branco os que não foram usados."}
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
            {/* Filtro de mês */}
            <div className={`flex items-center gap-1 border rounded-xl px-2 py-1.5 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
              <button onClick={() => shiftMes(-1)} className={`px-2 py-1 rounded-lg text-sm font-bold ${dm ? "hover:bg-[#2C2C2E] text-[#F5F5F7]" : "hover:bg-[#F5F5F7] text-[#1D1D1F]"}`} title="Mês anterior">‹</button>
              <input
                type="month"
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 outline-none ${dm ? "bg-[#1C1C1E] text-[#F5F5F7]" : "bg-white text-[#1D1D1F]"}`}
              />
              <span className={`text-xs font-bold px-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{mesLabel}</span>
              <button onClick={() => shiftMes(1)} className={`px-2 py-1 rounded-lg text-sm font-bold ${dm ? "hover:bg-[#2C2C2E] text-[#F5F5F7]" : "hover:bg-[#F5F5F7] text-[#1D1D1F]"}`} title="Próximo mês">›</button>
              {filtroMes && <button onClick={() => setFiltroMes("")} className="text-[10px] text-[#E8740E] underline ml-1">Todos</button>}
            </div>
            {/* Filtro de categorias — chip com 3 estados: neutro, incluir, excluir */}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={() => { setFiltroCategoria(""); setCategoriasExcluidas(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!filtroCategoria && categoriasExcluidas.size === 0 ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
                Todas
              </button>
              {categoriasUsadas.map(c => {
                const isIncluded = filtroCategoria === c;
                const isExcluded = categoriasExcluidas.has(c);
                // Click cycles: neutro → incluir (só essa) → excluir (esconder) → neutro
                const cycleFilter = () => {
                  if (isIncluded) {
                    // incluir → excluir
                    setFiltroCategoria("");
                    setCategoriasExcluidas(new Set([c]));
                  } else if (isExcluded) {
                    // excluir → neutro
                    const novo = new Set(categoriasExcluidas);
                    novo.delete(c);
                    setCategoriasExcluidas(novo);
                  } else {
                    // neutro → incluir
                    setCategoriasExcluidas(new Set());
                    setFiltroCategoria(c);
                  }
                };
                let cls = dm ? "bg-[#2C2C2E] text-[#98989D] border border-[#3A3A3C]" : "bg-white border border-[#D2D2D7] text-[#86868B]";
                let icon = "";
                if (isIncluded) { cls = "bg-[#E8740E] text-white border border-[#E8740E]"; icon = "✓ "; }
                else if (isExcluded) { cls = "bg-red-100 text-red-700 border border-red-300 line-through"; icon = "✕ "; }
                return (
                  <button key={c} onClick={cycleFilter}
                    title="Clique: só essa · 2x: esconder · 3x: limpar"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:border-[#E8740E] ${cls}`}>
                    {icon}{c}
                  </button>
                );
              })}
              {(filtroCategoria || categoriasExcluidas.size > 0) && (
                <button onClick={() => { setFiltroCategoria(""); setCategoriasExcluidas(new Set()); }}
                  className="text-[10px] text-[#E8740E] underline ml-1">Limpar filtros</button>
              )}
            </div>
            <p className="text-[10px] text-[#86868B] -mt-1">Clique 1x pra ver só essa · 2x pra esconder · 3x pra limpar</p>
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
                              {g.categoria === "SALARIO" && g.funcionario_id && (() => {
                                const f = funcionariosLista.find((x) => x.id === g.funcionario_id);
                                return (
                                  <div className="col-span-2 md:col-span-3">
                                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Funcionário</p>
                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E]">
                                      👤 {f ? `${f.nome.toUpperCase()} · ${f.cargo}` : g.funcionario_id}
                                      <span className="text-[9px] bg-[#E8740E] text-white px-1.5 py-0.5 rounded">{f?.tag || "TIGRAO"}</span>
                                    </span>
                                  </div>
                                );
                              })()}
                              {/* ESTORNO: mostra contato + tipo + venda vinculada (se houver) */}
                              {g.categoria === "ESTORNO" && g.contato_nome && (
                                <div className="col-span-2 md:col-span-3 flex flex-wrap gap-4">
                                  <div>
                                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Contato</p>
                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E]">
                                      {g.contato_tipo === "fornecedor" ? "🏭" : g.contato_tipo === "atacado" ? "🏬" : "👤"} {g.contato_nome}
                                      {g.contato_tipo && <span className="text-[9px] bg-[#E8740E] text-white px-1.5 py-0.5 rounded">{g.contato_tipo.toUpperCase()}</span>}
                                    </span>
                                  </div>
                                  {g.venda_id && (
                                    <div>
                                      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Venda vinculada</p>
                                      <span className="inline-block px-3 py-1 rounded-full text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                        {g.venda_id.slice(0, 8)}…
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {g.is_dep_esp && (
                                <div className="col-span-2 md:col-span-3">
                                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E]">
                                    Depósito de espécie
                                  </span>
                                </div>
                              )}
                              {/* Produtos vinculados */}
                              {g.pedido_fornecedor_id && (
                                <ProdutosVinculados pedidoFornecedorId={g.pedido_fornecedor_id} password={password} dm={dm} fornecedores={fornecedores} />
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
                              {editForm.categoria === "SALARIO" && (
                                <div>
                                  <p className={labelCls}>Funcionário</p>
                                  <select
                                    value={editForm.funcionario_id}
                                    onChange={(e) => editSet("funcionario_id", e.target.value)}
                                    className={inputCls}
                                  >
                                    <option value="">— Selecionar —</option>
                                    {funcionariosLista.map((f) => (
                                      <option key={f.id} value={f.id}>{f.nome.toUpperCase()} · {f.cargo} [{f.tag}]</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className={`p-3 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor por banco</p>
                                {bancoInputGrid(editBancoValores, editSetBanco, inputCls)}
                              </div>
                              {/* Produtos vinculados ao gasto (editáveis) */}
                              {g.pedido_fornecedor_id && (
                                <ProdutosVinculados pedidoFornecedorId={g.pedido_fornecedor_id} password={password} dm={dm} fornecedores={fornecedores} />
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
