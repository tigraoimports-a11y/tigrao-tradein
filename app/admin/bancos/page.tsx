"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAdmin } from "@/components/admin/AdminShell";

// Item #28 — gerenciar conexoes Pluggy/Open Finance pra puxar saldos
// automaticos de Itau, Inter, MP, Nubank, etc.
//
// Pluggy Connect Widget via SDK oficial React (em vez de script tag CDN
// que estava com problema de loading). Lazy import porque carrega ~100KB
// e so e usado quando admin clica "Conectar banco".
const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((m) => m.PluggyConnect),
  { ssr: false }
);

interface Conta {
  accountId: string;
  accountName: string | null;
  accountType: string | null;
  accountSubtype: string | null;
  saldo: number;
  creditLimite: number | null;
  consultadoEm: string;
}

interface Conexao {
  id: number;
  pluggy_item_id: string;
  banco_alias: string;
  banco_nome: string;
  status: string;
  connector_id: number | null;
  connector_image_url: string | null;
  connector_primary_color: string | null;
  ultimo_sync_em: string | null;
  ultimo_sync_status: string | null;
  ultimo_sync_erro: string | null;
  contas: Conta[];
  saldoTotal: number;
}

interface ConexoesResp {
  conexoes: Conexao[];
  saldoTotal: number;
}

const fmtBRL = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtData = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 16);
  }
};

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  UPDATED: { txt: "✓ Atualizado", cls: "bg-green-50 text-green-700 border-green-300" },
  OUTDATED: { txt: "⏰ Desatualizado", cls: "bg-yellow-50 text-yellow-700 border-yellow-300" },
  LOGIN_ERROR: { txt: "🔐 Erro de login", cls: "bg-red-50 text-red-700 border-red-400" },
  WAITING_USER_INPUT: { txt: "⏳ Aguardando voce", cls: "bg-blue-50 text-blue-700 border-blue-300" },
  UPDATING: { txt: "🔄 Atualizando...", cls: "bg-blue-50 text-blue-700 border-blue-300" },
  CREATED: { txt: "📝 Criado", cls: "bg-gray-50 text-gray-700 border-gray-300" },
  ERROR: { txt: "❌ Erro", cls: "bg-red-50 text-red-700 border-red-400" },
};

export default function BancosPage() {
  const { password, apiHeaders } = useAdmin();
  const [data, setData] = useState<ConexoesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  // Pluggy Connect Widget — armazena o connect token quando admin clica
  // "Conectar banco". Quando setado, o componente <PluggyConnect/> e
  // renderizado e abre o modal nativo. itemIdParaAtualizar e usado quando
  // estamos reconectando (status LOGIN_ERROR).
  const [pluggyToken, setPluggyToken] = useState<string | null>(null);
  const [itemIdParaAtualizar, setItemIdParaAtualizar] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bancos/connections", { headers: apiHeaders() });
      const j = await res.json();
      if (res.ok) {
        setData(j);
      } else {
        setMsg({ tipo: "erro", texto: j.error || "Erro ao carregar" });
      }
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro de rede" });
    }
    setLoading(false);
  }, [apiHeaders]);

  useEffect(() => {
    if (password) load();
  }, [password, load]);

  // Abre o Pluggy Connect Widget pra adicionar nova conexao.
  // 1. Backend gera connect token efemero
  // 2. Setamos pluggyToken → componente <PluggyConnect/> e renderizado
  //    e abre modal nativo automatico
  // 3. Callbacks (onSuccess/onError/onClose) tratam o resultado
  const conectarBanco = async (itemId?: string) => {
    setConnecting(true);
    setMsg(null);
    try {
      const tokenRes = await fetch("/api/admin/bancos/connect-token", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(itemId ? { itemId } : {}),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        setMsg({ tipo: "erro", texto: tokenJson.error || "Falha ao gerar token" });
        setConnecting(false);
        return;
      }
      setItemIdParaAtualizar(itemId);
      setPluggyToken(tokenJson.accessToken);
      // setConnecting fica true ate o widget fechar (onClose ou onSuccess)
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro" });
      setConnecting(false);
    }
  };

  // Handler quando o widget Pluggy retorna sucesso
  const onPluggySuccess = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (itemData: any) => {
      const itemId = itemData?.item?.id;
      if (!itemId) {
        setMsg({ tipo: "erro", texto: "Pluggy nao retornou itemId" });
        setPluggyToken(null);
        setConnecting(false);
        return;
      }
      try {
        const regRes = await fetch("/api/admin/bancos/connections", {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ itemId }),
        });
        const regJson = await regRes.json();
        if (regRes.ok) {
          setMsg({ tipo: "ok", texto: `Conectado! ${regJson.contasSync || 0} contas sincronizadas.` });
          load();
        } else {
          setMsg({ tipo: "erro", texto: regJson.error || "Erro ao registrar" });
        }
      } catch (e) {
        setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro de rede" });
      }
      setPluggyToken(null);
      setConnecting(false);
    },
    [apiHeaders, load]
  );

  // Handler quando widget fecha sem completar (admin clicou X ou ESC)
  const onPluggyClose = useCallback(() => {
    setPluggyToken(null);
    setConnecting(false);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPluggyError = useCallback((err: any) => {
    setMsg({ tipo: "erro", texto: err?.message || "Erro no widget Pluggy" });
    setPluggyToken(null);
    setConnecting(false);
  }, []);

  // Sync manual: atualiza saldos de todas conexoes (ou de uma especifica)
  const syncAll = async (conexao_id?: number) => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/bancos/sync", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(conexao_id ? { conexao_id } : {}),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg({
          tipo: j.erros > 0 ? "erro" : "ok",
          texto: `${j.atualizadas} conexao(s) atualizada(s)${j.erros > 0 ? ` · ${j.erros} erro(s)` : ""}`,
        });
        load();
      } else {
        setMsg({ tipo: "erro", texto: j.error || "Erro" });
      }
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro" });
    }
    setSyncing(false);
  };

  const desconectar = async (id: number, banco: string) => {
    if (!confirm(`Desconectar ${banco}? (a conexao fica salva no Pluggy mas pare de aparecer aqui)`)) return;
    const res = await fetch(`/api/admin/bancos/connections?id=${id}`, {
      method: "DELETE",
      headers: apiHeaders(),
    });
    if (res.ok) {
      setMsg({ tipo: "ok", texto: `${banco} desconectado` });
      load();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ tipo: "erro", texto: j.error || "Erro ao desconectar" });
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Pluggy Connect Widget — renderiza so quando tem token (clica em
          conectar). Componente abre modal nativo e dispara callbacks.
          includeSandbox=true permite testar com bancos simulados (Pluggy
          Bank) enquanto a aplicacao Pluggy ainda nao foi aprovada pra
          producao. Quando production for habilitado, sandbox + production
          aparecem juntos — admin escolhe. */}
      {pluggyToken && (
        <PluggyConnect
          connectToken={pluggyToken}
          includeSandbox={true}
          updateItem={itemIdParaAtualizar}
          onSuccess={onPluggySuccess}
          onError={onPluggyError}
          onClose={onPluggyClose}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[#1D1D1F]">🔗 Bancos (Open Finance)</h1>
          <p className="text-xs text-[#86868B] mt-0.5">
            Conexoes ativas via Pluggy. Saldos atualizados sob demanda — sem digitacao manual.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncAll()}
            disabled={syncing || loading || (data?.conexoes.length || 0) === 0}
            className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-xs font-semibold text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50 transition-colors"
          >
            {syncing ? "🔄 Atualizando..." : "🔄 Atualizar saldos"}
          </button>
          <button
            onClick={() => conectarBanco()}
            disabled={connecting}
            className="px-4 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#F5A623] disabled:opacity-50 transition-colors"
          >
            {connecting ? "Aguardando..." : "+ Conectar banco"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm ${msg.tipo === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.texto}
        </div>
      )}

      {/* KPI total */}
      {data && data.conexoes.length > 0 && (
        <div className="bg-gradient-to-br from-[#FFF5EB] to-white border border-[#E8740E]/30 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#86868B] font-medium">Saldo total disponivel</p>
          <p className="text-3xl font-bold text-[#E8740E] mt-1">{fmtBRL(data.saldoTotal)}</p>
          <p className="text-[11px] text-[#86868B] mt-0.5">Soma das contas correntes (cartao de credito nao entra)</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || data.conexoes.length === 0 ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-8 text-center">
          <p className="text-base font-semibold text-[#1D1D1F] mb-2">Nenhum banco conectado ainda</p>
          <p className="text-sm text-[#86868B] mb-4">
            Clique em <strong>+ Conectar banco</strong> pra adicionar Itau, Inter, MercadoPago, Nubank, etc.
            <br />
            Voce vai logar no app/site do banco e autorizar acesso aos saldos via Open Finance.
          </p>
          <p className="text-[11px] text-[#86868B]">
            ⚠️ Requer Pluggy configurado no Vercel (PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET)
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.conexoes.map((c) => (
            <BankCard
              key={c.id}
              conexao={c}
              onSync={() => syncAll(c.id)}
              onReconnect={() => conectarBanco(c.pluggy_item_id)}
              onDisconnect={() => desconectar(c.id, c.banco_nome)}
              syncing={syncing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BankCard({
  conexao,
  onSync,
  onReconnect,
  onDisconnect,
  syncing,
}: {
  conexao: Conexao;
  onSync: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  syncing: boolean;
}) {
  const statusInfo = STATUS_LABEL[conexao.status] || { txt: conexao.status, cls: "bg-gray-50 text-gray-700 border-gray-300" };
  const precisaReconectar = conexao.status === "LOGIN_ERROR" || conexao.status === "WAITING_USER_INPUT";

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-3">
          {conexao.connector_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conexao.connector_image_url}
              alt={conexao.banco_nome}
              className="w-10 h-10 rounded-lg object-contain"
              style={{ background: conexao.connector_primary_color || "#F5F5F7" }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[#F5F5F7] flex items-center justify-center text-lg">🏦</div>
          )}
          <div>
            <p className="font-semibold text-[#1D1D1F]">{conexao.banco_nome}</p>
            <p className="text-[11px] text-[#86868B]">{conexao.banco_alias}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${statusInfo.cls}`}>
            {statusInfo.txt}
          </span>
          <span className="text-[11px] text-[#86868B]">
            Sync: {fmtData(conexao.ultimo_sync_em)}
          </span>
        </div>
      </div>

      {conexao.ultimo_sync_erro && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700">
          ⚠️ Ultimo erro: {conexao.ultimo_sync_erro}
        </div>
      )}

      {/* Contas dessa conexao */}
      <div className="space-y-2 mb-3">
        {conexao.contas.length === 0 ? (
          <p className="text-xs text-[#86868B] italic">Nenhuma conta — clique em sincronizar</p>
        ) : (
          conexao.contas.map((conta) => {
            const isCredit = conta.accountType === "CREDIT";
            return (
              <div key={conta.accountId} className="flex items-center justify-between p-2 bg-[#F5F5F7] rounded">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1D1D1F] truncate">{conta.accountName || "Conta"}</p>
                  <p className="text-[10px] text-[#86868B]">{conta.accountSubtype}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${isCredit ? "text-red-600" : "text-[#1D1D1F]"}`}>
                    {isCredit ? "-" : ""}{fmtBRL(conta.saldo)}
                  </p>
                  {conta.creditLimite && (
                    <p className="text-[10px] text-[#86868B]">Limite: {fmtBRL(conta.creditLimite)}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-[#1D1D1F]">
          Subtotal: <span className="text-[#E8740E]">{fmtBRL(conexao.saldoTotal)}</span>
        </p>
        <div className="flex gap-2">
          {precisaReconectar && (
            <button
              onClick={onReconnect}
              className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              🔐 Reconectar
            </button>
          )}
          <button
            onClick={onSync}
            disabled={syncing}
            className="text-[11px] px-2 py-1 rounded border border-[#D2D2D7] text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50"
          >
            🔄 Sincronizar
          </button>
          <button
            onClick={onDisconnect}
            className="text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
          >
            Desconectar
          </button>
        </div>
      </div>
    </div>
  );
}
