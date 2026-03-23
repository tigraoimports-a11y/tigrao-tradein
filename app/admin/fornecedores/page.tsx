"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
  created_at: string;
}

export default function FornecedoresPage() {
  const { password } = useAdmin();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nome: "", contato: "", observacao: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
      if (res.ok) { const json = await res.json(); setFornecedores(json.data ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.nome.trim()) { setMsg("Nome obrigatorio"); return; }
    const res = await fetch("/api/fornecedores", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Fornecedor cadastrado!");
      setForm({ nome: "", contato: "", observacao: "" });
      fetchData();
    } else {
      setMsg("Erro: " + (json.error || "Falha"));
    }
  };

  const handleDelete = async (f: Fornecedor) => {
    if (!confirm(`Excluir fornecedor "${f.nome}"?`)) return;
    const res = await fetch("/api/fornecedores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      body: JSON.stringify({ id: f.id }),
    });
    const json = await res.json();
    if (json.ok) {
      setFornecedores((prev) => prev.filter((x) => x.id !== f.id));
      setMsg("Fornecedor removido");
    } else {
      setMsg("Erro: " + (json.error || "Falha"));
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

      {/* Formulário */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Cadastrar Fornecedor</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className={labelCls}>Nome *</p>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Ex: DISTRIBUIDORA APPLE SP"
              className={inputCls}
            />
          </div>
          <div>
            <p className={labelCls}>Contato (WhatsApp/Tel)</p>
            <input
              value={form.contato}
              onChange={(e) => setForm({ ...form, contato: e.target.value })}
              placeholder="Ex: 21 99999-9999"
              className={inputCls}
            />
          </div>
          <div>
            <p className={labelCls}>Observacao</p>
            <input
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Notas, prazo entrega, etc."
              className={inputCls}
            />
          </div>
        </div>
        <button onClick={handleSubmit} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors">
          Cadastrar
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#D2D2D7] bg-[#F5F5F7]">
          <h2 className="font-semibold text-[#1D1D1F]">Fornecedores Cadastrados ({fornecedores.length})</h2>
        </div>
        {loading ? (
          <div className="py-12 text-center text-[#86868B]">Carregando...</div>
        ) : fornecedores.length === 0 ? (
          <div className="py-12 text-center text-[#86868B]">Nenhum fornecedor cadastrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D2D2D7] text-[#86868B] text-xs uppercase">
                <th className="px-5 py-3 text-left">Nome</th>
                <th className="px-5 py-3 text-left">Contato</th>
                <th className="px-5 py-3 text-left">Observacao</th>
                <th className="px-5 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {fornecedores.map((f) => (
                <tr key={f.id} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                  <td className="px-5 py-3 font-semibold text-[#1D1D1F]">{f.nome}</td>
                  <td className="px-5 py-3 text-[#86868B]">{f.contato || "—"}</td>
                  <td className="px-5 py-3 text-[#86868B]">{f.observacao || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(f)}
                      className="text-[#86868B] hover:text-red-500 text-xs px-2 py-1 rounded-lg border border-[#D2D2D7] hover:border-red-300 transition-colors"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
