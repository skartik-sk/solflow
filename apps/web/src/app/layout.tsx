import "@/app/globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { ClientWalletProvider } from "@/components/providers/ClientWalletProvider";
import { MonitoringProvider } from "@/components/providers/MonitoringProvider";
import { FloatingBrowser } from "@/components/FloatingBrowser";
import {
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_IMAGE_HEIGHT,
  DEFAULT_OG_IMAGE_TYPE,
  DEFAULT_OG_IMAGE_URL,
  DEFAULT_OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_TITLE,
  SITE_URL,
  SOCIAL_DESCRIPTION,
} from "@/lib/social-metadata";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_TITLE,
    template: "%s | SolStudio",
  },
  description: SITE_DESCRIPTION,
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
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SOCIAL_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        secureUrl: DEFAULT_OG_IMAGE_URL,
        width: DEFAULT_OG_IMAGE_WIDTH,
        height: DEFAULT_OG_IMAGE_HEIGHT,
        alt: DEFAULT_OG_IMAGE_ALT,
        type: DEFAULT_OG_IMAGE_TYPE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@solstudio",
    creator: "@solstudio",
    title: SITE_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE_URL, alt: DEFAULT_OG_IMAGE_ALT }],
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
      className={`dark ${geist.variable} ${geistMono.variable}`}
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
                    background: "oklch(0.19 0.006 265)",
                    border: "1px solid oklch(0.255 0.006 265)",
                    color: "oklch(0.94 0.004 265)",
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
