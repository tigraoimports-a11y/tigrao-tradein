// Layout dos slides do carrossel do Instagram.
// Mesma funcao e usada pela rota que renderiza via next/og (Satori).
// Dimensoes: 1080 x 1350 (ratio 4:5).

import type { ReactElement, ReactNode } from "react";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export interface SlideData {
  titulo: string;
  texto: string;
  destaque?: string;
  imagem_url?: string | null;
}

export interface Config {
  foto_perfil_url?: string | null;
  nome_display?: string | null;
}

export type EstiloLayout = "PADRAO" | "EMANUEL_PESSOA";

export interface LayoutMeta {
  index: number;
  total: number;
  tipo: "DICA" | "COMPARATIVO" | "NOTICIA" | "ANALISE_PROFUNDA";
  estilo?: EstiloLayout;
}

const COR = {
  fundo: "#FFFFFF",
  titulo: "#1D1D1F",
  corpo: "#1D1D1F",
  secundario: "#86868B",
  accent: "#E8740E",
  footer: "#6E6E73",
  borda: "#E8E8ED",
  verified: "#3897F0",
};

const TIPO_LABEL: Record<LayoutMeta["tipo"], string> = {
  DICA: "DICA",
  COMPARATIVO: "COMPARATIVO",
  NOTICIA: "NOTICIA",
  ANALISE_PROFUNDA: "ANALISE",
};

// Parser simples de negrito estilo markdown: **texto** vira <span bold>.
// Retorna array de nodes pra renderizar dentro de um <div>.
// Usado principalmente no layout Emanuel Pessoa pra dar enfase em frases-chave.
function parseBold(texto: string): ReactNode[] {
  if (!texto) return [];
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes
    .filter(p => p.length > 0)
    .map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return (
          <span key={i} style={{ fontWeight: 700 }}>
            {p.slice(2, -2)}
          </span>
        );
      }
      return <span key={i}>{p}</span>;
    });
}

// Separa texto em blocos de paragrafo (separados por linha em branco).
// Emanuel Pessoa usa muito ar entre frases — cada bloco vira 1 div.
function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Selo azul de perfil verificado (estilo Instagram/Twitter).
// SVG inline pra o Satori conseguir rasterizar.
function SeloVerificado({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ marginLeft: 10 }}
    >
      <path
        d="M12 1l2.4 2.4 3.4-.4.8 3.3 3 1.7-1.3 3.1 1.3 3.1-3 1.7-.8 3.3-3.4-.4L12 22l-2.4-2.4-3.4.4-.8-3.3-3-1.7 1.3-3.1-1.3-3.1 3-1.7.8-3.3 3.4.4L12 1z"
        fill={COR.verified}
      />
      <path
        d="M8 12.2l2.8 2.8L16.4 9.4"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Header no topo: foto do Andre + handle + selo verificado. Sem subtítulo (mais limpo).
function Header({ config, index, total }: { config: Config; index: number; total: number }) {
  const handle = config.nome_display || "tigraoimports";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingBottom: 24,
        borderBottom: `1px solid ${COR.borda}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {config.foto_perfil_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.foto_perfil_url}
            alt=""
            width={64}
            height={64}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              objectFit: "cover",
              marginRight: 18,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#FFF5EB",
              marginRight: 18,
              fontSize: 34,
            }}
          >
            🐯
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ color: COR.titulo, fontSize: 30, fontWeight: 700 }}>@{handle}</span>
          <SeloVerificado />
        </div>
      </div>
      <div style={{ display: "flex", color: COR.secundario, fontSize: 20, fontWeight: 500 }}>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </div>
  );
}

function Imagem({ url }: { url: string }) {
  // objectFit: contain — NUNCA corta a imagem. Composicoes (multi-produto
  // lado a lado) e fotos oficiais Apple com fundo branco ficam centralizadas
  // preservando toda a informacao visual. Fundo cinza claro ocupa o espaco
  // residual quando o ratio da imagem e mais largo/estreito que o container.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: 620,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "#F5F5F7",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
      />
    </div>
  );
}

function LayoutCapa({ slide, config, meta }: { slide: SlideData; config: Config; meta: LayoutMeta }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COR.fundo,
        padding: 60,
      }}
    >
      <Header config={config} index={meta.index} total={meta.total} />

      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <div
          style={{
            display: "flex",
            color: COR.accent,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 3,
            marginBottom: 20,
          }}
        >
          {TIPO_LABEL[meta.tipo]}
        </div>
        <div
          style={{
            display: "flex",
            color: COR.titulo,
            fontSize: slide.titulo.length > 40 ? 66 : 80,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            marginBottom: 20,
          }}
        >
          {slide.titulo}
        </div>
        {slide.texto && (
          <div
            style={{
              display: "flex",
              color: COR.corpo,
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {slide.texto}
          </div>
        )}
      </div>

      {slide.imagem_url && (
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", marginTop: 32 }}>
          <Imagem url={slide.imagem_url} />
        </div>
      )}
      {!slide.imagem_url && <div style={{ flex: 1 }} />}
    </div>
  );
}

function LayoutMeio({ slide, config, meta }: { slide: SlideData; config: Config; meta: LayoutMeta }) {
  const destaqueGigante = slide.destaque && slide.destaque.length <= 10 ? slide.destaque : null;
  const textoLongo = slide.texto.length > 220;
  // Fonte adapta ao volume de texto: texto curto fica GIGANTE, longo fica confortavel.
  const tamanhoTexto = textoLongo ? 32 : 38;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COR.fundo,
        padding: 60,
      }}
    >
      <Header config={config} index={meta.index} total={meta.total} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          paddingTop: 24,
          paddingBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            color: COR.titulo,
            fontSize: slide.titulo.length > 30 ? 56 : 64,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            marginBottom: 22,
          }}
        >
          {slide.titulo}
        </div>

        {slide.imagem_url && (
          <div style={{ display: "flex", marginBottom: 24 }}>
            <Imagem url={slide.imagem_url} />
          </div>
        )}

        <div
          style={{
            display: "flex",
            color: COR.corpo,
            fontSize: tamanhoTexto,
            fontWeight: 500,
            lineHeight: 1.35,
          }}
        >
          {slide.texto}
        </div>

        {destaqueGigante && (
          <div
            style={{
              display: "flex",
              color: COR.accent,
              fontSize: 160,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -5,
              marginTop: 20,
            }}
          >
            {destaqueGigante}
          </div>
        )}
      </div>
    </div>
  );
}

function LayoutCTA({ slide, config, meta }: { slide: SlideData; config: Config; meta: LayoutMeta }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COR.fundo,
        padding: 60,
      }}
    >
      <Header config={config} index={meta.index} total={meta.total} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            color: COR.accent,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 3,
            marginBottom: 20,
          }}
        >
          CHEGOU NO FIM
        </div>
        <div
          style={{
            display: "flex",
            color: COR.titulo,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            marginBottom: 24,
          }}
        >
          {slide.titulo}
        </div>
        <div
          style={{
            display: "flex",
            color: COR.corpo,
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.3,
            marginBottom: 40,
          }}
        >
          {slide.texto}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: COR.footer,
            fontSize: 26,
            fontWeight: 500,
          }}
        >
          📲 Siga @{config.nome_display || "tigraoimports"} pra mais
        </div>
      </div>
    </div>
  );
}

// =============================================================
// LAYOUT EMANUEL PESSOA — estilo X/Twitter-like com imagem grande
// Inspirado no carrossel de analise didatica do @emanuel.pessoa.
// Caracteristicas:
// - Header com avatar, nome bold e @handle cinza (tipo tweet)
// - Numeracao N/total no canto direito
// - Texto com paragrafos generosos e **negrito** em frases-chave
// - Imagem real grande ocupando ~45% do rodape
// - Watermark circular do autor no canto da imagem
// =============================================================

function HeaderEmanuel({ config, index, total }: { config: Config; index: number; total: number }) {
  const handle = config.nome_display || "tigraoimports";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        width: "100%",
        marginBottom: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {config.foto_perfil_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.foto_perfil_url}
            alt=""
            width={82}
            height={82}
            style={{
              width: 82,
              height: 82,
              borderRadius: 41,
              objectFit: "cover",
              marginRight: 22,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 82,
              height: 82,
              borderRadius: 41,
              backgroundColor: "#FFF5EB",
              marginRight: 22,
              fontSize: 44,
            }}
          >
            🐯
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ color: COR.titulo, fontSize: 38, fontWeight: 700 }}>
              Tigrão Imports
            </span>
            <SeloVerificado size={28} />
          </div>
          <span style={{ color: COR.secundario, fontSize: 26, fontWeight: 400, marginTop: 2 }}>
            @{handle}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F0F0F2",
          color: COR.secundario,
          fontSize: 22,
          fontWeight: 600,
          borderRadius: 20,
          padding: "8px 16px",
          marginTop: 8,
        }}
      >
        {index + 1}/{total}
      </div>
    </div>
  );
}

function WatermarkAutor({ config }: { config: Config }) {
  if (!config.foto_perfil_url) return null;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: 16,
        left: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={config.foto_perfil_url}
        alt=""
        width={68}
        height={68}
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          objectFit: "cover",
          border: "3px solid #FFFFFF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

// Bloco de texto estilo Emanuel Pessoa: paragrafos separados com ar generoso,
// tamanho grande, negrito para frases chave via **markdown**.
function TextoEmanuel({ texto }: { texto: string }) {
  const blocos = paragrafos(texto);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {blocos.map((bloco, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexWrap: "wrap",
            color: COR.corpo,
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: i < blocos.length - 1 ? 22 : 0,
          }}
        >
          {parseBold(bloco)}
        </div>
      ))}
    </div>
  );
}

function LayoutEmanuelPessoa({ slide, config, meta }: { slide: SlideData; config: Config; meta: LayoutMeta }) {
  // Monta texto completo: titulo (geralmente hook curto) + texto (paragrafos).
  // Se titulo e diferente do comeco do texto, mostra titulo como abertura em bold.
  const tituloComoAbertura = slide.titulo && !slide.texto.toLowerCase().startsWith(slide.titulo.slice(0, 20).toLowerCase());
  const textoFinal = tituloComoAbertura && slide.titulo ? `**${slide.titulo}**\n\n${slide.texto}` : slide.texto;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COR.fundo,
        padding: 56,
      }}
    >
      <HeaderEmanuel config={config} index={meta.index} total={meta.total} />

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <TextoEmanuel texto={textoFinal} />

        {slide.imagem_url && (
          <div
            style={{
              display: "flex",
              position: "relative",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: 560,
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: "#F5F5F7",
              marginTop: "auto",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.imagem_url}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
            <WatermarkAutor config={config} />
          </div>
        )}
      </div>
    </div>
  );
}

export function renderSlideJSX(slide: SlideData, config: Config, meta: LayoutMeta): ReactElement {
  if (meta.estilo === "EMANUEL_PESSOA") {
    return <LayoutEmanuelPessoa slide={slide} config={config} meta={meta} />;
  }
  if (meta.index === 0) return <LayoutCapa slide={slide} config={config} meta={meta} />;
  if (meta.index === meta.total - 1) return <LayoutCTA slide={slide} config={config} meta={meta} />;
  return <LayoutMeio slide={slide} config={config} meta={meta} />;
}
