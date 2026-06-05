import "./globals.css";
import type { Metadata } from "next";
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
SOCIAL_DESCRIPTION
} from "./social-metadata";
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
      className="dark"
      suppressHydrationWarning
    >
      <body className="font-bricolage min-h-screen antialiased bg-background text-foreground">

              {children}
             
      </body>
    </html>
  );
}