import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { WalletProvider } from "@/components/providers/WalletProvider";
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

export const metadata: Metadata = {
  title: {
    default: "SolFlow — Visual Solana Contract Builder",
    template: "%s | SolFlow",
  },
  description:
    "Build production-ready Solana smart contracts visually. Drag, drop, connect nodes and generate Anchor or Pinocchio Rust code in real-time.",
  keywords: [
    "Solana",
    "smart contracts",
    "Anchor",
    "Pinocchio",
    "no-code",
    "visual builder",
    "blockchain",
  ],
  authors: [{ name: "SolFlow" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SolFlow — Visual Solana Contract Builder",
    description:
      "Build production-ready Solana smart contracts visually. No Rust required.",
    siteName: "SolFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolFlow — Visual Solana Contract Builder",
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
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <TRPCProvider>
          <WalletProvider>
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
          </WalletProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
