"use client";

import { LandingRoot } from "./shared";
import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { Statement } from "./sections/Statement";
import { Frameworks } from "./sections/Frameworks";
import { BrowserCompile } from "./sections/BrowserCompile";
import { Audit } from "./sections/Audit";
import { Cli } from "./sections/Cli";
import { Cloud } from "./sections/Cloud";
import { Templates } from "./sections/Templates";
import { Community } from "./sections/Community";
import { Questions } from "./sections/Questions";
import { Closing } from "./sections/Closing";
import { Footer } from "./sections/Footer";

export function Landing() {
  return (
    <LandingRoot>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Frameworks />
        <BrowserCompile />
        <Audit />
        <Cli />
        <Cloud />
        <Templates />
        <Community />
        <Questions />
        <Closing />
      </main>
      <Footer />
    </LandingRoot>
  );
}
