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
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="pt-BR">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E8740E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Google Analytics */}
        {gaId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');` }} />
          </>
        )}
        {/* Meta Pixel */}
        {metaPixelId && (
          <script dangerouslySetInnerHTML={{ __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');` }} />
        )}
      </head>
      <body className="antialiased">
        {metaPixelId && (
          <noscript><img height="1" width="1" style={{ display: "none" }} src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`} alt="" /></noscript>
        )}
        {children}
      </body>
    </html>
  );
}
