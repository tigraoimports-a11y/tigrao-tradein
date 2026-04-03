import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const produto = searchParams.get("produto") || "";
  const preco = searchParams.get("preco") || "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: "linear-gradient(135deg, #E8740E 0%, #D06A0D 50%, #B85E0B 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Background pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "400px",
            height: "630px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.12,
          }}
        >
          <div style={{ fontSize: "300px", display: "flex" }}>🐯</div>
        </div>

        {/* Logo / Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
            }}
          >
            🐯
          </div>
          <span
            style={{
              fontSize: "36px",
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.5px",
            }}
          >
            TigraoImports
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            width: "80px",
            height: "4px",
            background: "rgba(255,255,255,0.5)",
            borderRadius: "2px",
            marginBottom: "28px",
            display: "flex",
          }}
        />

        {/* Main title */}
        <div
          style={{
            fontSize: produto ? "42px" : "52px",
            fontWeight: 800,
            color: "#FFFFFF",
            lineHeight: 1.2,
            marginBottom: "16px",
            maxWidth: "700px",
            display: "flex",
          }}
        >
          {produto || "Formulario de Compra"}
        </div>

        {/* Price if available */}
        {preco && (
          <div
            style={{
              fontSize: "48px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.95)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "28px", opacity: 0.8, display: "flex" }}>R$</span>
            {preco}
          </div>
        )}

        {/* Subtitle */}
        <div
          style={{
            fontSize: "22px",
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.5,
            maxWidth: "600px",
            display: "flex",
          }}
        >
          Preencha seus dados para finalizar a compra
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            left: "80px",
            right: "80px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "18px",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <span style={{ display: "flex" }}>📍</span> Rio de Janeiro
            <span style={{ margin: "0 8px", display: "flex" }}>•</span>
            <span style={{ display: "flex" }}>🚚</span> Entrega rapida
          </div>
          <div
            style={{
              fontSize: "16px",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
            }}
          >
            tigrao-tradein.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
