import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TigraoImports - Formulario de Compra",
  description: "Preencha seus dados para finalizar sua compra na TigraoImports. Entrega rapida no Rio de Janeiro.",
  openGraph: {
    title: "TigraoImports - Formulario de Compra 🐯",
    description: "Preencha seus dados para finalizar sua compra. Entrega rapida no Rio de Janeiro!",
    siteName: "TigraoImports",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function CompraLayout({ children }: { children: React.ReactNode }) {
  return children;
}
