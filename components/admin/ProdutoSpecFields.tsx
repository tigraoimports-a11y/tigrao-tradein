"use client";

import React from "react";
import {
  CATEGORIAS,
  CAT_LABELS,
  STRUCTURED_CATS,
  getIphoneStorages,
  MACBOOK_CHIPS,
  MACBOOK_NUCLEOS,
  MACBOOK_RAMS,
  MACBOOK_STORAGES,
  MAC_MINI_CHIPS,
  MAC_MINI_RAMS,
  MAC_MINI_STORAGES,
  IPAD_TELAS,
  IPAD_STORAGES,
  AIRPODS_MODELOS,
  CORES_POR_CATEGORIA,
  COR_OBRIGATORIA,
  IPHONE_ORIGENS,
  WATCH_PULSEIRAS,
  getIphoneCores,
  type ProdutoSpec,
  DEFAULT_SPEC,
  buildProdutoName,
} from "@/lib/produto-specs";

// Modelos atualizados (iguais ao estoque)
const IPHONE_MODELOS_FULL = [
  "11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX",
  "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX",
  "15", "15 PLUS", "15 PRO", "15 PRO MAX",
  "16", "16 PLUS", "16 PRO", "16 PRO MAX", "16E",
  "17", "17 AIR", "17 PRO", "17 PRO MAX",
];
const MACBOOK_CHIPS_FULL = ["A18 PRO", "M1", "M2", "M2 PRO", "M3", "M3 PRO", "M3 MAX", "M4", "M4 PRO", "M4 MAX", "M5", "M5 PRO", "M5 MAX"];
const WATCH_MODELOS_FULL = ["SE 2", "SE 3", "SERIES 11", "ULTRA 3", "ULTRA 3 MILANES"];
const WATCH_TAMANHOS = ["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"];

export interface ProdutoRowState {
  categoria: string;
  spec: ProdutoSpec;
  produto: string; // nome gerado ou livre
  cor: string;
  qnt: string;
  custo_unitario: string;
  fornecedor: string;
  imei: string;
  serial_no: string;
}

export function createEmptyProdutoRow(): ProdutoRowState {
  return {
    categoria: "IPHONES",
    spec: { ...DEFAULT_SPEC },
    produto: "",
    cor: "",
    qnt: "1",
    custo_unitario: "",
    fornecedor: "",
    imei: "",
    serial_no: "",
  };
}

interface ProdutoSpecFieldsProps {
  row: ProdutoRowState;
  onChange: (updated: ProdutoRowState) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  fornecedores: { id: string; nome: string }[];
  inputCls: string;
  labelCls: string;
  darkMode: boolean;
  index: number;
}

export default function ProdutoSpecFields({
  row,
  onChange,
  onRemove,
  onDuplicate,
  fornecedores,
  inputCls,
  labelCls,
  darkMode: dm,
  index,
}: ProdutoSpecFieldsProps) {
  const bgSection = dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]";

  const set = (field: keyof ProdutoRowState, value: string) => {
    const updated = { ...row, [field]: value };
    // Quando mudar categoria, resetar spec e produto
    if (field === "categoria") {
      updated.spec = { ...DEFAULT_SPEC };
      updated.produto = "";
      updated.cor = "";
    }
    // Quando mudar cor, regenerar nome
    if (field === "cor" && STRUCTURED_CATS.includes(row.categoria)) {
      updated.produto = buildProdutoName(row.categoria, row.spec, value);
    }
    onChange(updated);
  };

  const setSpec = (field: keyof ProdutoSpec, value: string) => {
    const newSpec = { ...row.spec, [field]: value };
    const updated = { ...row, spec: newSpec };
    // Limpar cor ao trocar modelo de iPhone
    if (field === "ip_modelo") {
      updated.cor = "";
    }
    // Auto-gerar nome do produto com cor
    if (STRUCTURED_CATS.includes(row.categoria)) {
      updated.produto = buildProdutoName(row.categoria, newSpec, field === "ip_modelo" ? "" : row.cor);
    }
    onChange(updated);
  };

  const hasStructured = STRUCTURED_CATS.includes(row.categoria);
  const coresEfetivas = row.categoria === "IPHONES" ? getIphoneCores(row.spec.ip_modelo) : CORES_POR_CATEGORIA[row.categoria];

  return (
    <div className={`p-4 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]"} space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
          Produto {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${dm ? "text-[#E8740E] hover:bg-[#E8740E]/20" : "text-[#E8740E] hover:bg-[#E8740E]/10"}`}
              title="Duplicar produto (limpa IMEI e Serial)"
            >
              Duplicar
            </button>
          )}
          <button
            onClick={onRemove}
            className="text-red-400 hover:text-red-600 text-sm font-bold transition-colors"
            title="Remover produto"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Categoria + Cor */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <p className={labelCls}>Categoria</p>
          <select value={row.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{CAT_LABELS[c] || c}</option>
            ))}
          </select>
        </div>
        <div>
          <p className={labelCls}>Cor</p>
          {coresEfetivas ? (
            <select value={row.cor} onChange={(e) => set("cor", e.target.value)} className={inputCls}>
              {COR_OBRIGATORIA.includes(row.categoria) ? <option value="" disabled>— Selecionar —</option> : <option value="">— Opcional —</option>}
              {coresEfetivas.map((c) => <option key={c}>{c}</option>)}
            </select>
          ) : row.categoria === "MAC_MINI" ? null : (
            <input value={row.cor} onChange={(e) => set("cor", e.target.value)} placeholder="Ex: Silver, Azul..." className={inputCls} />
          )}
        </div>
        <div>
          <p className={labelCls}>Fornecedor</p>
          <select value={row.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls}>
            <option value="">— Selecionar —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome}>{f.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Spec fields por categoria */}
      {row.categoria === "IPHONES" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Modelo</p>
            <select value={row.spec.ip_modelo} onChange={(e) => { setSpec("ip_modelo", e.target.value); const validStorages = getIphoneStorages(e.target.value); if (!validStorages.includes(row.spec.ip_storage)) setSpec("ip_storage", validStorages[0]); }} className={inputCls}>
              {IPHONE_MODELOS_FULL.map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.ip_storage} onChange={(e) => setSpec("ip_storage", e.target.value)} className={inputCls}>
              {getIphoneStorages(row.spec.ip_modelo).map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Origem</p>
            <select value={row.spec.ip_origem} onChange={(e) => setSpec("ip_origem", e.target.value)} className={inputCls}>
              <option value="">— Opcional —</option>
              {IPHONE_ORIGENS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {row.categoria === "MACBOOK" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Modelo</p>
            <select value={row.spec.mb_modelo} onChange={(e) => setSpec("mb_modelo", e.target.value)} className={inputCls}>
              <option value="AIR">MacBook Air</option>
              <option value="PRO">MacBook Pro</option>
              <option value="NEO">MacBook Neo</option>
            </select>
          </div>
          <div>
            <p className={labelCls}>Tela</p>
            <select value={row.spec.mb_tela} onChange={(e) => setSpec("mb_tela", e.target.value)} className={inputCls}>
              {(row.spec.mb_modelo === "AIR" ? ['13"', '15"'] : row.spec.mb_modelo === "NEO" ? ['13"'] : ['14"', '16"']).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <p className={labelCls}>Chip</p>
            <select value={row.spec.mb_chip} onChange={(e) => setSpec("mb_chip", e.target.value)} className={inputCls}>
              {MACBOOK_CHIPS_FULL.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Núcleos</p>
            <select value={row.spec.mb_nucleos} onChange={(e) => setSpec("mb_nucleos", e.target.value)} className={inputCls}>
              <option value="" disabled>— Selecionar —</option>
              {MACBOOK_NUCLEOS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>RAM</p>
            <select value={row.spec.mb_ram} onChange={(e) => setSpec("mb_ram", e.target.value)} className={inputCls}>
              {MACBOOK_RAMS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.mb_storage} onChange={(e) => setSpec("mb_storage", e.target.value)} className={inputCls}>
              {MACBOOK_STORAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {row.categoria === "MAC_MINI" && (
        <div className={`grid grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Chip</p>
            <select value={row.spec.mm_chip} onChange={(e) => setSpec("mm_chip", e.target.value)} className={inputCls}>
              {MAC_MINI_CHIPS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>RAM</p>
            <select value={row.spec.mm_ram} onChange={(e) => setSpec("mm_ram", e.target.value)} className={inputCls}>
              {MAC_MINI_RAMS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.mm_storage} onChange={(e) => setSpec("mm_storage", e.target.value)} className={inputCls}>
              {MAC_MINI_STORAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {row.categoria === "IPADS" && (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Modelo</p>
            <select value={row.spec.ipad_modelo} onChange={(e) => setSpec("ipad_modelo", e.target.value)} className={inputCls}>
              <option value="IPAD">iPad</option>
              <option value="MINI">iPad Mini</option>
              <option value="AIR">iPad Air</option>
              <option value="PRO">iPad Pro</option>
            </select>
          </div>
          <div>
            <p className={labelCls}>Tela</p>
            <select value={row.spec.ipad_tela} onChange={(e) => setSpec("ipad_tela", e.target.value)} className={inputCls}>
              {IPAD_TELAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.ipad_storage} onChange={(e) => setSpec("ipad_storage", e.target.value)} className={inputCls}>
              {IPAD_STORAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Conectividade</p>
            <select value={row.spec.ipad_conn} onChange={(e) => setSpec("ipad_conn", e.target.value)} className={inputCls}>
              <option value="WIFI">WiFi</option>
              <option value="WIFI+CELL">WiFi + Cellular</option>
            </select>
          </div>
        </div>
      )}

      {row.categoria === "APPLE_WATCH" && (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Modelo</p>
            <select value={row.spec.aw_modelo} onChange={(e) => setSpec("aw_modelo", e.target.value)} className={inputCls}>
              {WATCH_MODELOS_FULL.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Tamanho</p>
            <select value={row.spec.aw_tamanho} onChange={(e) => setSpec("aw_tamanho", e.target.value)} className={inputCls}>
              {WATCH_TAMANHOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Conectividade</p>
            <select value={row.spec.aw_conn} onChange={(e) => setSpec("aw_conn", e.target.value)} className={inputCls}>
              <option value="GPS">GPS</option>
              <option value="GPS+CELL">GPS + Cellular</option>
            </select>
          </div>
          <div>
            <p className={labelCls}>Pulseira</p>
            <select value={row.spec.aw_pulseira} onChange={(e) => setSpec("aw_pulseira", e.target.value)} className={inputCls}>
              <option value="" disabled>— Selecionar —</option>
              {WATCH_PULSEIRAS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      )}

      {row.categoria === "AIRPODS" && (
        <div className={`grid grid-cols-2 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Modelo</p>
            <select value={row.spec.air_modelo} onChange={(e) => setSpec("air_modelo", e.target.value)} className={inputCls}>
              {AIRPODS_MODELOS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Nome do produto (livre para categorias sem spec, auto-gerado para outras) */}
      <div>
        <p className={labelCls}>Nome do Produto</p>
        <input
          value={row.produto || (hasStructured ? buildProdutoName(row.categoria, row.spec, row.cor) : "")}
          onChange={(e) => set("produto", e.target.value)}
          placeholder={hasStructured ? "Auto-gerado pelos specs" : "Ex: Cabo USB-C Lightning 1m"}
          className={inputCls}
        />
      </div>

      {/* Qtd + Custo + IMEI + Serial */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <p className={labelCls}>Quantidade</p>
          <input type="number" value={row.qnt} onChange={(e) => set("qnt", e.target.value)} min="1" className={inputCls} />
        </div>
        <div>
          <p className={labelCls}>Custo unitário (R$)</p>
          <input type="number" value={row.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className={labelCls}>IMEI</p>
          <input value={row.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
        <div>
          <p className={labelCls}>Serial</p>
          <input value={row.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>
    </div>
  );
}
