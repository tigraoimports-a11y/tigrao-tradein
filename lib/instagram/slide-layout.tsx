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

function Footer({ config, index, total }: { config: Config; index: number; total: number }) {
  const handle = config.nome_display || "tigraoimports";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingTop: 20,
        borderTop: `1px solid ${COR.borda}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {config.foto_perfil_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.foto_perfil_url}
            alt=""
            width={52}
            height={52}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              objectFit: "cover",
              marginRight: 14,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: "#FFF5EB",
              marginRight: 14,
              fontSize: 28,
            }}
          >
            🐯
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: COR.titulo, fontSize: 22, fontWeight: 600 }}>@{handle}</span>
          <span style={{ color: COR.secundario, fontSize: 16, marginTop: 2 }}>Apple no Rio de Janeiro</span>
        </div>
      </div>
      <div style={{ display: "flex", color: COR.secundario, fontSize: 18, fontWeight: 500 }}>
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
        height: 540,
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
        padding: 72,
      }}
    >
      <div
        style={{
          display: "flex",
          color: COR.accent,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 3,
          marginBottom: 24,
        }}
      >
        {TIPO_LABEL[meta.tipo]}
      </div>

      <div
        style={{
          display: "flex",
          color: COR.titulo,
          fontSize: slide.titulo.length > 40 ? 68 : 84,
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
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: 32,
          }}
        >
          {slide.texto}
        </div>
      )}

      {slide.imagem_url && (
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", marginBottom: 24 }}>
          <Imagem url={slide.imagem_url} />
        </div>
      )}

      {!slide.imagem_url && <div style={{ flex: 1 }} />}

      <Footer config={config} index={meta.index} total={meta.total} />
    </div>
  );
}

function LayoutMeio({ slide, config, meta }: { slide: SlideData; config: Config; meta: LayoutMeta }) {
  // Se tem destaque curto (<8 chars), vira tipografia gigante (ex: "48MP", "R$ 6.999").
  const destaqueGigante = slide.destaque && slide.destaque.length <= 10 ? slide.destaque : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COR.fundo,
        padding: 72,
      }}
    >
      <div
        style={{
          display: "flex",
          color: COR.secundario,
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: 2,
          marginBottom: 20,
        }}
      >
        {String(meta.index + 1).padStart(2, "0")} {TIPO_LABEL[meta.tipo]}
      </div>

      <div
        style={{
          display: "flex",
          color: COR.titulo,
          fontSize: slide.titulo.length > 30 ? 56 : 64,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -1,
          marginBottom: 24,
        }}
      >
        {slide.titulo}
      </div>

      {slide.imagem_url && (
        <div style={{ display: "flex", marginBottom: 28 }}>
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
          marginBottom: 20,
        }}
      >
        {slide.texto}
      </div>

      {destaqueGigante && (
        <div
          style={{
            display: "flex",
            color: COR.accent,
            fontSize: 180,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -5,
            marginTop: 12,
          }}
        >
          {destaqueGigante}
        </div>
      )}

      <div style={{ flex: 1 }} />
      <Footer config={config} index={meta.index} total={meta.total} />
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
        padding: 72,
      }}
    >
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
            fontSize: 72,
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
            fontSize: 30,
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
      <Footer config={config} index={meta.index} total={meta.total} />
    </div>
  );
}

export function renderSlideJSX(slide: SlideData, config: Config, meta: LayoutMeta): ReactElement {
  if (meta.index === 0) return <LayoutCapa slide={slide} config={config} meta={meta} />;
  if (meta.index === meta.total - 1) return <LayoutCTA slide={slide} config={config} meta={meta} />;
  return <LayoutMeio slide={slide} config={config} meta={meta} />;
}
