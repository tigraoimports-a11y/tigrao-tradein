"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface Grupo {
  id: string;
  nome: string;
  ultimaMensagem: string | null;
}

export default function ZapiGruposPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [totalChats, setTotalChats] = useState(0);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    if (!password) return;
    setLoading(true);
    setErro("");
    fetch("/api/admin/zapi-groups", { headers: { "x-admin-password": password } })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Erro ao buscar grupos");
        setGrupos(json.groups || []);
        setTotalChats(json.totalChats || 0);
      })
      .catch((err) => setErro(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, [password]);

  const copiar = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // fallback
      const t = document.createElement("textarea");
      t.value = id;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    }
  };

  const fmtData = (iso: string | null) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "—";
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F]">Grupos do WhatsApp (Z-API)</h1>
        <p className="text-sm text-[#86868B] mt-1">
          Lista de grupos conectados na instância Z-API principal. Use o botão
          <strong> Copiar ID </strong> para configurar a variável{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">ZAPI_GRUPO_PAGAMENTOS</code>
          {" "}no Vercel.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        <strong>Dica:</strong> se o grupo desejado não aparecer, mande alguma
        mensagem nele pelo WhatsApp (qualquer coisa tipo &ldquo;teste&rdquo;) e recarregue
        esta página — a Z-API só mostra conversas com atividade recente.
      </div>

      {loading && (
        <div className="text-center py-8 text-[#86868B]">Carregando grupos...</div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {!loading && !erro && grupos.length === 0 && (
        <div className="text-center py-8 text-[#86868B]">
          Nenhum grupo encontrado. {totalChats > 0 ? `(${totalChats} conversas recentes, nenhuma é grupo)` : ""}
        </div>
      )}

      {!loading && !erro && grupos.length > 0 && (
        <div className="space-y-2">
          {grupos.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[#1D1D1F] truncate">{g.nome}</div>
                <div className="text-xs text-[#86868B] mt-0.5 font-mono break-all">{g.id}</div>
                <div className="text-xs text-[#86868B] mt-0.5">
                  Última mensagem: {fmtData(g.ultimaMensagem)}
                </div>
              </div>
              <button
                onClick={() => copiar(g.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  copiado === g.id
                    ? "bg-green-500 text-white"
                    : "bg-[#0071E3] text-white hover:bg-[#0077ED]"
                }`}
              >
                {copiado === g.id ? "✓ Copiado!" : "Copiar ID"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-gray-50 rounded-lg p-4 text-sm text-[#1D1D1F]">
        <h2 className="font-bold mb-2">Próximos passos</h2>
        <ol className="list-decimal list-inside space-y-1 text-[#52525b]">
          <li>Clique em <strong>Copiar ID</strong> do grupo desejado</li>
          <li>Acesse <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-[#0071E3] underline">vercel.com</a> → projeto <strong>tigrao-tradein</strong></li>
          <li>Menu <strong>Settings → Environment Variables</strong></li>
          <li>Adicione uma nova variável: <code className="bg-white px-1.5 py-0.5 rounded border text-xs">ZAPI_GRUPO_PAGAMENTOS</code> = (cole o ID copiado)</li>
          <li>Marque <strong>Production</strong>, <strong>Preview</strong> e <strong>Development</strong></li>
          <li>Salve e faça um redeploy (menu <strong>Deployments → ... → Redeploy</strong>)</li>
        </ol>
      </div>
    </div>
  );
}
