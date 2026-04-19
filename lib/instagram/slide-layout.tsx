// Layout dos slides do carrossel do Instagram.
// Mesma funcao e usada pela rota que renderiza via next/og (Satori).
// Dimensoes: 1080 x 1350 (ratio 4:5).

import type { ReactElement } from "react";

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

export interface LayoutMeta {
  index: number;
  total: number;
  tipo: "DICA" | "COMPARATIVO" | "NOTICIA";
}

const COR = {
  fundo: "#FFFFFF",
  titulo: "#1D1D1F",
  corpo: "#3A3A3C",
  secundario: "#86868B",
  accent: "#E8740E",
  footer: "#6E6E73",
  borda: "#E8E8ED",
};

const TIPO_LABEL: Record<LayoutMeta["tipo"], string> = {
  DICA: "DICA",
  COMPARATIVO: "COMPARATIVO",
  NOTICIA: "NOTICIA",
};

// Header fixo no topo de todos os slides: foto do Andre + handle + origem.
// Tamanho aumentado (~20%): foto 64x64, handle 26, subtitulo 19.
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
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: COR.titulo, fontSize: 26, fontWeight: 700 }}>@{handle}</span>
          <span style={{ color: COR.secundario, fontSize: 19, marginTop: 2 }}>Apple no Rio de Janeiro</span>
        </div>
      </div>
      <div style={{ display: "flex", color: COR.secundario, fontSize: 20, fontWeight: 500 }}>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </div>
  );
}

function Imagem({ url }: { url: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 520,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "#F5F5F7",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
            fontSize: 22,
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
              fontSize: 28,
              fontWeight: 400,
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

      <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
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
            fontSize: 28,
            fontWeight: 400,
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

      <div style={{ flex: 1 }} />
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
            fontSize: 22,
            fontWeight: 600,
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
            fontSize: 28,
            fontWeight: 400,
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
            fontSize: 24,
            fontWeight: 500,
          }}
        >
          📲 Siga @{config.nome_display || "tigraoimports"} pra mais
        </div>
      </div>
    </div>
  );
}

export function renderSlideJSX(slide: SlideData, config: Config, meta: LayoutMeta): ReactElement {
  if (meta.index === 0) return <LayoutCapa slide={slide} config={config} meta={meta} />;
  if (meta.index === meta.total - 1) return <LayoutCTA slide={slide} config={config} meta={meta} />;
  return <LayoutMeio slide={slide} config={config} meta={meta} />;
}
