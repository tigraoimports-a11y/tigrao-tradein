import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TigraoImports - Trade-In",
  description: "Simule o valor do seu iPhone usado na troca por um novo. Cotação instantânea.",
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
