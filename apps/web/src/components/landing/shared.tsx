"use client";

import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./landing.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.solstudio.fun";
export const EDITOR_HREF = "/auth/signin";
export const PRIMARY_LABEL = "Open the editor";

/** The landing's root: fonts and tokens for everything inside. Blocks marked `data-sl-reveal` rise in on scroll (CSS only). */
export function LandingRoot({ children }: { children: ReactNode }) {
  return <div className={`sl ${geist.variable} ${geistMono.variable}`}>{children}</div>;
}
