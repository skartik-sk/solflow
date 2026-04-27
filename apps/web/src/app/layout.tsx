import "@/app/globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { ClientWalletProvider } from "@/components/providers/ClientWalletProvider";
import { MonitoringProvider } from "@/components/providers/MonitoringProvider";
import { FloatingBrowser } from "@/components/FloatingBrowser";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://solstudio.fun"),
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
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SolStudio — Visual Solana Contract Builder",
    description:
      "Build production-ready Solana smart contracts visually. No Rust required.",
    siteName: "SolStudio",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SolStudio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SolStudio — Visual Solana Contract Builder",
    description:
      "Build production-ready Solana smart contracts visually. No Rust required.",
    images: ["/og.png"],
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
      className="dark"
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
              <FloatingBrowser />
            </MonitoringProvider>
          </ClientWalletProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
