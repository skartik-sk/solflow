import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

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
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${bricolageGrotesque.variable} font-sans antialiased`}
      >
        <TRPCProvider>
          {children}
        </TRPCProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
