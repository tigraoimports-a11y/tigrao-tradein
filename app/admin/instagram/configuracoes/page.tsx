"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";

interface Config {
  id: number;
  foto_perfil_url: string | null;
  nome_display: string | null;
}

export default function InstagramConfigPage() {
  const { password, apiHeaders } = useAdmin();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState("");

  const fetchConfig = useCallback(async () => {
    if (!password) return;
    try {
      const res = await fetch("/api/admin/instagram-config", { headers: apiHeaders() });
      if (res.ok) {
        const j = await res.json();
        setConfig(j.data);
        setNome(j.data?.nome_display ?? "tigraoimports");
      }
    } finally {
      setLoading(false);
    }
  }, [password, apiHeaders]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMsg("Formato inválido. Use JPG, PNG ou WEBP.");
      return;
    }
    setUploading(true);
    setMsg("Enviando foto...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "perfil");
      const up = await fetch("/api/admin/instagram-upload", {
        method: "POST",
        headers: apiHeaders(),
        body: form,
      });
      const uj = await up.json();
      if (!up.ok || !uj.ok) {
        setMsg("Erro no upload: " + (uj.error || "falha"));
        return;
      }
      const patch = await fetch("/api/admin/instagram-config", {
        method: "PATCH",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ foto_perfil_url: uj.url }),
      });
      const pj = await patch.json();
      if (!patch.ok || !pj.ok) {
        setMsg("Upload ok, mas falhou ao salvar: " + (pj.error || ""));
        return;
      }
      setMsg("Foto atualizada!");
      fetchConfig();
    } finally {
      setUploading(false);
    }
  };

  const salvarNome = async () => {
    setSavingName(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/instagram-config", {
        method: "PATCH",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nome_display: nome.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro: " + (j.error || "falha"));
        return;
      }
      setMsg("Nome atualizado.");
      fetchConfig();
    } finally {
      setSavingName(false);
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto p-6 text-[#86868B]">Carregando...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href="/admin/instagram" className="text-sm text-[#E8740E] hover:underline">← Voltar</Link>
      </div>

      <h1 className="text-2xl font-bold text-[#1D1D1F] mb-2">Configurações do Instagram</h1>
      <p className="text-sm text-[#86868B] mb-6">Foto de perfil e handle que aparecem no rodapé dos slides.</p>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${
          msg.startsWith("Erro") ? "bg-[#FFF0F0] text-[#E74C3C] border border-[#E74C3C]/20" : "bg-[#F0FFF4] text-[#2ECC71] border border-[#2ECC71]/20"
        }`}>
          {msg}
        </div>
      )}

      {/* Foto de perfil */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">Foto de perfil</h2>
        <p className="text-xs text-[#86868B] mb-4">
          Aparece circular no rodapé de cada slide. Use uma foto quadrada (será cortada em círculo). Sem marca d&apos;água.
        </p>

        <div className="flex items-center gap-6 flex-wrap">
          <div className="w-32 h-32 rounded-full border-2 border-[#E8E8ED] overflow-hidden bg-[#F5F5F7] flex items-center justify-center shrink-0">
            {config?.foto_perfil_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.foto_perfil_url} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🐯</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <label className="inline-block cursor-pointer px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors">
              {uploading ? "Enviando..." : config?.foto_perfil_url ? "Trocar foto" : "Escolher foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFile}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-[#86868B] mt-2">PNG, JPG ou WEBP. Máximo 10 MB.</p>
            {config?.foto_perfil_url && (
              <p className="text-xs text-[#86868B] mt-1 break-all">
                <a href={config.foto_perfil_url} target="_blank" rel="noreferrer" className="text-[#E8740E] hover:underline">
                  Ver original ↗
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nome display */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">Handle do Instagram</h2>
        <p className="text-xs text-[#86868B] mb-4">Aparece junto à foto de perfil. Sem o &quot;@&quot; — o template adiciona.</p>
        <div className="flex gap-2">
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="tigraoimports"
            className="flex-1 px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
          />
          <button
            onClick={salvarNome}
            disabled={savingName || !nome.trim()}
            className="px-4 py-2 rounded-xl bg-[#1D1D1F] text-white text-sm font-semibold hover:bg-[#333] disabled:opacity-50"
          >
            {savingName ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
