"use client";

import Link from "next/link";
import SiteConfigEditor from "@/components/admin/SiteConfigEditor";

// Editor visual da landing /troca — gerencia logo (avatar do dono) e secao
// influencers (foto + @ + ordem + on/off). Acessivel pra Andre + Nicolas.
//
// Salva no campo labels JSONB de tradein_config (chaves _site_*) — sem
// migration nova. Upload via Supabase Storage (bucket product-images com
// prefix site-).
//
// Vide /api/admin/site-upload (upload), /api/admin/tradein-config (read/write
// das chaves) e components/admin/SiteConfigEditor.tsx (UI).
export default function ConfiguracoesSitePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="space-y-2">
        <Link href="/admin/configuracoes" className="text-[12px] text-[#86868B] hover:text-[#1D1D1F] transition-colors">
          ← Voltar para Configurações
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-bold text-[#1D1D1F]">Configuração do Site</h1>
            <p className="text-[14px] text-[#86868B] mt-1">
              Personalize a landing inicial do simulador de trade-in (/troca) sem precisar de código.
            </p>
          </div>
          <a href="/troca" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-medium border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors">
            Ver landing ao vivo →
          </a>
        </div>
      </div>

      <SiteConfigEditor />

      {/* Pointer pra editor de perguntas — TradeInQuestionsAdmin vive em
          /admin/simulacoes desde antes do CMS, mantemos la (compativel com
          quem ja conhecia). Aqui so apontamos pra usuario achar. */}
      <section className="bg-[#FFF5EB] rounded-xl p-5 border border-[#E8740E]/30">
        <h2 className="text-[16px] font-semibold text-[#1D1D1F] mb-2">
          🔧 Editar perguntas do simulador (modelo, GB, cor, bateria, etc)
        </h2>
        <p className="text-[13px] text-[#86868B] mb-3">
          As perguntas do simulador (etapa 2 — &ldquo;Qual iPhone você tem?&rdquo;) são editadas em outra
          tela. Você pode <strong>arrastar e soltar pra reordenar</strong>, criar novas perguntas,
          ativar/desativar e mudar opções.
        </p>
        <Link href="/admin/simulacoes"
          className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
          style={{ backgroundColor: "#E8740E" }}>
          Ir para Editor de Perguntas →
        </Link>
      </section>
    </main>
  );
}
