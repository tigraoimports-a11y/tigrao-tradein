// Layout para compor multiplas imagens de produtos lado a lado em uma unica
// imagem. Usado em slides comparativos (ex: iPad 11 / iPad Air / iPad Pro).
// Renderiza via next/og (Satori). Fundo branco, objectFit contain pra nao cortar.

import type { ReactElement } from "react";

export const COMPOSICAO_W = 1080;
export const COMPOSICAO_H = 540;

export function composicaoJSX(imagensDataUrls: string[]): ReactElement {
  const n = imagensDataUrls.length;
  const paddingLateral = 30;
  const gap = n === 2 ? 20 : 14;
  const disponivel = COMPOSICAO_W - paddingLateral * 2 - gap * (n - 1);
  const larguraCada = Math.floor(disponivel / n);
  const alturaCada = COMPOSICAO_H - 60;

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
