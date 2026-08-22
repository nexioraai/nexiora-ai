import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { LanguageProvider } from "@/lib/translations";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Referencee par les themes storefront (Editorial/Vif/Noir) via
// var(--font-fraunces) sans jamais avoir ete declaree -- les 3 thèmes
// rendaient donc en serif generique du navigateur. Declaree ici, au meme
// niveau que Geist, pour etre disponible sur toutes les routes (aucun
// layout dedie aux routes storefront n'existe aujourd'hui).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deribfy — Create Your Dropshipping, Store, or Website with AI in 60 Seconds",
  description: "Generate your dropshipping, store, or showcase website with AI in 60 seconds. Describe your business, get a complete professional site instantly.",
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          {children}
          <CookieConsent />
        </LanguageProvider>
      </body>
    </html>
  );
}
