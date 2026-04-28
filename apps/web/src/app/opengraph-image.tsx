import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "#070b16",
          color: "#f8fafc",
          fontFamily: "Inter, Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 15% 20%, rgba(79,70,229,0.38), transparent 30%), radial-gradient(circle at 80% 26%, rgba(20,184,166,0.28), transparent 28%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 64,
            bottom: 64,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(148,163,184,0.28)",
            borderRadius: 34,
            padding: 52,
            background: "rgba(15,23,42,0.72)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 900,
              }}
            >
              S
            </div>
            <div style={{ fontSize: 30, fontWeight: 850 }}>SolStudio</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                fontSize: 72,
                lineHeight: 1,
                fontWeight: 950,
                letterSpacing: 0,
                maxWidth: 900,
              }}
            >
              Build, audit, test, and automate Solana programs visually.
            </div>
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.35,
                color: "#cbd5e1",
                maxWidth: 880,
              }}
            >
              Visual Builder, CLI, and Cloud workflows for serious Solana teams.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, fontSize: 22 }}>
            <Pill>Visual Builder</Pill>
            <Pill>CLI</Pill>
            <Pill>Cloud</Pill>
            <Pill>Audit</Pill>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(103,232,249,0.32)",
        borderRadius: 999,
        padding: "10px 18px",
        color: "#a5f3fc",
        background: "rgba(8,145,178,0.14)",
      }}
    >
      {children}
    </div>
  );
}
