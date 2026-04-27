import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.solstudio.fun"),
  title: "SolStudio Cloud - Solana Workflow Automation",
  description: "Automate your Solana operations with visual workflows. DeFi, tokens, monitoring - no code required.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    title: "SolStudio Cloud - Solana Workflow Automation",
    description: "Automate your Solana operations with visual workflows. DeFi, tokens, monitoring - no code required.",
    siteName: "SolStudio Cloud",
    images: [{ url: "https://solstudio.fun/og.png", width: 1200, height: 630, alt: "SolStudio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SolStudio Cloud - Solana Workflow Automation",
    description: "Automate your Solana operations with visual workflows. DeFi, tokens, monitoring - no code required.",
    images: ["https://solstudio.fun/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <TRPCProvider>
          {children}
        </TRPCProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
