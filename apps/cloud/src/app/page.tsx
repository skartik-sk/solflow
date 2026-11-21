"use client";

import { LandingRoot } from "@/components/landing/LandingRoot";
import { Nav } from "@/components/landing/sections/Nav";
import { Hero } from "@/components/landing/sections/Hero";
import { Triggers } from "@/components/landing/sections/Triggers";
import { Integrations } from "@/components/landing/sections/Integrations";
import { Safety } from "@/components/landing/sections/Safety";
import { Runs } from "@/components/landing/sections/Runs";
import { Templates } from "@/components/landing/sections/Templates";
import { Closing } from "@/components/landing/sections/Closing";
import { Footer } from "@/components/landing/sections/Footer";

/*
 * Cloud landing. Tokens and buttons come from landing.css (copied from the web
 * landing, scoped under .sl); each section lives in components/landing/sections
 * with its own CSS. Every node and template named is real (packages/cloud-nodes,
 * packages/db/prisma/cloud-seed.ts).
 */

export default function CloudLandingPage() {
  return (
    <LandingRoot className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Triggers />
        <Integrations />
        <Safety />
        <Runs />
        <Templates />
        <Closing />
      </main>
      <Footer />
    </LandingRoot>
  );
}
