"use client";

import TradeInCalculatorMulti from "@/components/TradeInCalculatorMulti";

/**
 * Ambiente de teste do simulador de troca — acessivel apenas via /admin/*
 * (autenticacao herdada do AdminShell). Diferenca pro simulador publico em
 * /troca:
 *   - previewMode=true → bypass do filtro `ativo=false` nas categorias
 *     (admin ve iPad/MacBook/Watch mesmo com modo desligado pro cliente)
 *   - Banner no topo pra deixar claro que esta em modo teste
 *   - Categorias, perguntas e precos vem do mesmo DB de producao — edite
 *     em /admin/simulacoes e /admin/precos e veja o resultado aqui na hora
 */
export default function SimuladorTestePage() {
  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <div className="bg-[#FFF7ED] border-b-2 border-[#E8740E] px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3 flex-wrap">
          <span className="text-xl">🧪</span>
          <div className="flex-1 min-w-[200px]">
            <p className="font-bold text-sm text-[#1D1D1F]">Modo de Teste — só admin</p>
            <p className="text-xs text-[#86868B]">
              Mostra todas as categorias (inclusive as <b>desativadas</b> pro cliente).
              Edita as perguntas em <a href="/admin/simulacoes" className="underline text-[#E8740E]">/admin/simulacoes</a> e
              os preços em <a href="/admin/precos" className="underline text-[#E8740E]">/admin/precos</a>.
            </p>
          </div>
          <a
            href="/troca"
            className="text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] underline whitespace-nowrap"
            target="_blank"
            rel="noreferrer"
          >
            Abrir /troca (produção)
          </a>
        </div>
      </div>
      <TradeInCalculatorMulti previewMode={true} />
    </div>
  );
}
