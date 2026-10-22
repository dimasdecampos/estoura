import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "800"], variable: "--nf-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Estoura — Estoure a sua bolha. Ache a sua turma.", template: "%s · Estoura" },
  description: "Estoure as bolhas dos seus interesses e encontre gente, grupos e rolês perto de você que curtem o mesmo.",
  applicationName: "Estoura",
  appleWebApp: { capable: true, title: "Estoura", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b1322",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
