import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolStudio Cloud - Solana Workflow Automation",
  description: "Automate your Solana operations with visual workflows. DeFi, tokens, monitoring - no code required.",
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
