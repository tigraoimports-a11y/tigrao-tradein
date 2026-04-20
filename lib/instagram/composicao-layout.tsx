// Layout para compor multiplas imagens de produtos lado a lado em uma unica
// imagem. Usado em slides comparativos (ex: iPad 11 / iPad Air / iPad Pro).
// Renderiza via next/og (Satori). Fundo branco, objectFit contain pra nao cortar.

import type { ReactElement } from "react";

export const COMPOSICAO_W = 1080;
// Altura maior (antes 540) pra cada imagem individual aparecer maior dentro da
// composicao — evita o efeito de "miniaturas" quando tem 2-3 produtos lado a lado.
// Com 720, o ratio fica 3:2, mais proximo do container do slide (~1.85:1).
export const COMPOSICAO_H = 720;

export function composicaoJSX(imagensDataUrls: string[]): ReactElement {
  const n = imagensDataUrls.length;
  const paddingLateral = 24;
  const gap = n === 2 ? 24 : 18;
  const disponivel = COMPOSICAO_W - paddingLateral * 2 - gap * (n - 1);
  const larguraCada = Math.floor(disponivel / n);
  const alturaCada = COMPOSICAO_H - 40;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#FFFFFF",
        padding: paddingLateral,
        gap,
      }}
    >
      {imagensDataUrls.map((url, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: larguraCada,
            height: alturaCada,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      ))}
    </div>
  );
}
