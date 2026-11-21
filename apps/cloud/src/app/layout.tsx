import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import {
  CLOUD_DESCRIPTION,
  CLOUD_OG_IMAGE_ALT,
  CLOUD_OG_IMAGE_HEIGHT,
  CLOUD_OG_IMAGE_TYPE,
  CLOUD_OG_IMAGE_URL,
  CLOUD_OG_IMAGE_WIDTH,
  CLOUD_ORIGIN,
  CLOUD_SITE_NAME,
  CLOUD_SOCIAL_DESCRIPTION,
  CLOUD_TITLE,
  CLOUD_URL,
} from "@/lib/social-metadata";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(CLOUD_ORIGIN),
  title: CLOUD_TITLE,
  description: CLOUD_DESCRIPTION,
  alternates: {
    canonical: CLOUD_URL,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: CLOUD_URL,
    title: CLOUD_TITLE,
    description: CLOUD_SOCIAL_DESCRIPTION,
    siteName: CLOUD_SITE_NAME,
    images: [
      {
        url: CLOUD_OG_IMAGE_URL,
        secureUrl: CLOUD_OG_IMAGE_URL,
        width: CLOUD_OG_IMAGE_WIDTH,
        height: CLOUD_OG_IMAGE_HEIGHT,
        alt: CLOUD_OG_IMAGE_ALT,
        type: CLOUD_OG_IMAGE_TYPE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: CLOUD_TITLE,
    description: CLOUD_SOCIAL_DESCRIPTION,
    images: [{ url: CLOUD_OG_IMAGE_URL, alt: CLOUD_OG_IMAGE_ALT }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <TRPCProvider>
          {children}
        </TRPCProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
