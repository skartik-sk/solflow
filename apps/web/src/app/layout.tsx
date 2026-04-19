import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { ClientWalletProvider } from "@/components/providers/ClientWalletProvider";
import { MonitoringProvider } from "@/components/providers/MonitoringProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "SolStudio — Visual Solana Contract Builder",
    template: "%s | SolStudio",
  },
  description:
    "Build production-ready Solana smart contracts visually. Drag, drop, connect nodes and generate Anchor, Pinocchio, or Quasar Rust code in real-time.",
  keywords: [
    "Solana",
    "smart contracts",
    "Anchor",
    "Pinocchio",
    "Quasar",
    "no-code",
    "visual builder",
    "blockchain",
  ],
  authors: [{ name: "SolStudio" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SolStudio — Visual Solana Contract Builder",
    description:
      "Build production-ready Solana smart contracts visually. No Rust required.",
    siteName: "SolStudio",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolStudio — Visual Solana Contract Builder",
    description:
      "Build production-ready Solana smart contracts visually. No Rust required.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${bricolage.variable} dark`}
      suppressHydrationWarning
    >
      <body className="font-bricolage min-h-screen antialiased bg-background text-foreground">
        <TRPCProvider>
          <ClientWalletProvider>
            <MonitoringProvider>
              {children}
              <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                  style: {
                    background: "oklch(0.12 0.012 240)",
                    border: "1px solid oklch(0.22 0.015 240)",
                    color: "oklch(0.96 0.005 240)",
                  },
                }}
              />
            </MonitoringProvider>
          </ClientWalletProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
