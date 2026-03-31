import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TigraoImports - Formulario de Compra",
  description: "Preencha seus dados para finalizar sua compra na TigraoImports. Entrega rapida no Rio de Janeiro.",
  openGraph: {
    title: "TigraoImports - Formulario de Compra 🐯",
    description: "Preencha seus dados para finalizar sua compra. Entrega rapida no Rio de Janeiro!",
    siteName: "TigraoImports",
    type: "website",
  },
};

export default function ShortLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
