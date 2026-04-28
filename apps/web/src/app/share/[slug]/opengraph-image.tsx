import { ImageResponse } from "next/og";
import { prisma } from "@solflow/db";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

interface ImageProps {
  params: Promise<{ slug: string }>;
}

export default async function SharedGraphImage({ params }: ImageProps) {
  const { slug } = await params;
  const share = await prisma.projectShare.findFirst({
    where: { slug, revokedAt: null },
    select: {
      title: true,
      description: true,
      flowData: true,
      auditSummary: true,
    },
  });

  const flow = share?.flowData as { nodes?: unknown[]; edges?: unknown[] } | undefined;
  const audit = share?.auditSummary as { score?: number } | null | undefined;
  const title = share?.title ?? "SolStudio Shared Graph";
  const description =
    share?.description ?? "Read-only visual graph for a Solana program.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "#0b1020",
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
              "radial-gradient(circle at 18% 16%, rgba(59,130,246,0.36), transparent 28%), radial-gradient(circle at 82% 28%, rgba(20,184,166,0.28), transparent 26%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 64,
            right: 72,
            bottom: 64,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(148,163,184,0.28)",
            borderRadius: 32,
            padding: 48,
            background: "rgba(15,23,42,0.72)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "#4f46e5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 800,
                }}
              >
                S
              </div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>SolStudio</div>
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#67e8f9",
                border: "1px solid rgba(103,232,249,0.35)",
                borderRadius: 999,
                padding: "10px 18px",
              }}
            >
              Read-only graph
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                fontSize: 66,
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: 0,
                maxWidth: 900,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.35,
                color: "#cbd5e1",
                maxWidth: 820,
              }}
            >
              {description}
            </div>
          </div>

          <div style={{ display: "flex", gap: 18 }}>
            <Metric label="Nodes" value={String(flow?.nodes?.length ?? 0)} />
            <Metric label="Edges" value={String(flow?.edges?.length ?? 0)} />
            <Metric
              label="Audit score"
              value={typeof audit?.score === "number" ? `${audit.score}/100` : "Not run"}
            />
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 160,
        border: "1px solid rgba(148,163,184,0.24)",
        borderRadius: 18,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "rgba(2,6,23,0.38)",
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 18 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 30, fontWeight: 800 }}>
        {value}
      </div>
    </div>
  );
}
