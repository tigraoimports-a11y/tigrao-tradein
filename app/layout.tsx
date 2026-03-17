import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TigraoImports - Trade-In",
  description: "Simule o valor do seu iPhone usado na troca por um novo. Cotação instantânea.",
  openGraph: {
    title: "TigraoImports - Trade-In 🐯",
    description: "Simule o valor do seu iPhone usado na troca por um novo. Cotação instantânea.",
    url: "https://tigrao-tradein.vercel.app",
    siteName: "TigraoImports Trade-In",
    type: "website",
    images: [
      {
        url: "https://tigrao-tradein.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "TigraoImports Trade-In - Simule sua troca de iPhone",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TigraoImports - Trade-In 🐯",
    description: "Simule o valor do seu iPhone usado na troca por um novo. Cotação instantânea.",
    images: ["https://tigrao-tradein.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
