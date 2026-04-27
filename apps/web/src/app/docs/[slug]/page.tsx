import fs from "fs";
import path from "path";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Play } from "lucide-react";
import { notFound } from "next/navigation";

const DOCS_DIR = fs.existsSync(path.join(process.cwd(), "src/app/docs"))
  ? path.join(process.cwd(), "src/app/docs")
  : path.join(process.cwd(), "apps/web/src/app/docs");

const DOC_SLUGS = [
  "visual-editor",
  "getting-started",
  "node-reference",
  "connection-rules",
  "codegen-guide",
  "flags-and-constraints",
  "cli",
  "cloud",
];

const DOC_META: Record<
  string,
  { title: string; prev?: string; next?: string }
> = {
  "visual-editor": {
    title: "Visual Builder Reference",
    next: "getting-started",
  },
  "getting-started": {
    title: "Getting Started",
    prev: "visual-editor",
    next: "node-reference",
  },
  "node-reference": {
    title: "Node Reference",
    prev: "getting-started",
    next: "connection-rules",
  },
  "connection-rules": {
    title: "Connection Rules",
    prev: "node-reference",
    next: "codegen-guide",
  },
  "codegen-guide": {
    title: "Code Generation Guide",
    prev: "connection-rules",
    next: "flags-and-constraints",
  },
  "flags-and-constraints": {
    title: "Flags & Constraints",
    prev: "codegen-guide",
    next: "cli",
  },
  cli: { title: "CLI Reference", prev: "flags-and-constraints", next: "cloud" },
  cloud: { title: "Cloud Platform Reference", prev: "cli" },
};

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = DOC_META[slug];
  return { title: `${meta?.title ?? slug} — SolStudio Docs` };
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  let inCodeBlock = false;
  let codeBlock: string[] = [];
  let codeLang = "";

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div
            key={key++}
            className="relative group my-6 overflow-hidden rounded-lg border border-border/60 bg-card"
          >
            {codeLang && (
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {codeLang}
                </span>
              </div>
            )}
            <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-foreground/90 font-mono">
              <code>{codeBlock.join("\n")}</code>
            </pre>
          </div>,
        );
        codeBlock = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeBlock = [];
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlock.push(line);
      i++;
      continue;
    }

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      elements.push(<hr key={key++} className="my-10 border-border/40" />);
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("#### ")) {
      elements.push(
        <h4
          key={key++}
          className="text-base font-semibold mt-8 mb-3 text-foreground"
        >
          {renderInline(line.slice(5))}
        </h4>,
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={key++}
          className="text-lg font-semibold mt-10 mb-3 text-foreground"
        >
          {renderInline(line.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={key++}
          className="text-xl font-bold mt-14 mb-5 text-foreground scroll-mt-20"
          id={slugify(line.slice(3))}
        >
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={key++}
          className="text-3xl font-extrabold tracking-tight mb-2 text-foreground"
        >
          {renderInline(line.slice(2))}
        </h1>,
      );
      i++;
      continue;
    }

    // Table rows
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[-:\s|]+\|$/))
        .map((l) => l.split("|").filter((c) => c.trim() !== ""));

      if (rows.length === 0) continue;

      const headerRow = rows[0];
      const bodyRows = rows.slice(1);

      elements.push(
        <div
          key={key++}
          className="my-6 overflow-x-auto rounded-lg border border-border/60"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60">
                {headerRow.map((cell, ci) => (
                  <th
                    key={ci}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-foreground/80 tracking-wide"
                  >
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((cells, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-border/30 last:border-0 ${ri % 2 === 1 ? "bg-muted/20" : ""}`}
                >
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2.5 text-sm text-muted-foreground leading-relaxed"
                    >
                      {renderInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list items
    if (line.match(/^- /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^- /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-4 space-y-2 ml-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="mt-2 h-1 w-1 rounded-full bg-primary/60 shrink-0" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list items
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="my-4 space-y-2 ml-1 counter-reset-list">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {idx + 1}
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={key++}
        className="text-sm leading-relaxed text-muted-foreground my-3"
      >
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={partKey++}>{codeMatch[1]}</span>);
      parts.push(
        <code
          key={partKey++}
          className="rounded-md bg-muted/80 border border-border/50 px-1.5 py-0.5 text-[12px] font-mono text-foreground/90"
        >
          {codeMatch[2]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={partKey++}>{boldMatch[1]}</span>);
      parts.push(
        <strong key={partKey++} className="font-semibold text-foreground">
          {boldMatch[2]}
        </strong>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*/);
    if (italicMatch) {
      if (italicMatch[1])
        parts.push(<span key={partKey++}>{italicMatch[1]}</span>);
      parts.push(<em key={partKey++}>{italicMatch[2]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Links [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(<span key={partKey++}>{linkMatch[1]}</span>);
      parts.push(
        <a
          key={partKey++}
          href={linkMatch[3]}
          className="text-primary hover:underline font-medium"
        >
          {linkMatch[2]}
        </a>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    parts.push(<span key={partKey++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Side nav items ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    slug: "learn-visual-builder",
    title: "Visual Builder Path",
    href: "/docs/learn/visual-builder",
  },
  { slug: "learn-cli", title: "CLI Path", href: "/docs/learn/cli" },
  { slug: "learn-cloud", title: "Cloud Path", href: "/docs/learn/cloud" },
  ...DOC_SLUGS.map((slug) => ({
    slug,
    title: DOC_META[slug]?.title ?? slug,
    href: `/docs/${slug}`,
  })),
];

const PRACTICE_CTA: Record<
  string,
  { title: string; body: string; label: string; href: string }
> = {
  "visual-editor": {
    title: "Start the Visual Builder learning path",
    body: "Connect nodes for a vault or escrow graph, run a check, and learn why each Program, Instruction, Account, State, Constraint, and Logic node belongs there.",
    label: "Open Visual Builder path",
    href: "/docs/learn/visual-builder",
  },
  cli: {
    title: "Start the CLI learning path",
    body: "Use short command quizzes to remember when to run init, view, parse, and idl without reading a long reference first.",
    label: "Open CLI path",
    href: "/docs/learn/cli",
  },
  cloud: {
    title: "Start the Cloud learning path",
    body: "Build tiny Cloud workflows by ordering triggers, actions, logic, and outputs, then run a check to see the right sequence.",
    label: "Open Cloud path",
    href: "/docs/learn/cloud",
  },
  "getting-started": {
    title: "New here? Start with the guided paths",
    body: "Use the guided lessons to learn the three SolStudio surfaces before going deeper into the reference docs.",
    label: "Open learning paths",
    href: "/docs/learn",
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!DOC_SLUGS.includes(slug)) {
    notFound();
  }

  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            Documentation file not found: {slug}.md
          </p>
          <Link
            href="/docs"
            className="text-primary hover:underline mt-4 inline-block text-sm"
          >
            Back to docs
          </Link>
        </div>
      </div>
    );
  }

  const meta = DOC_META[slug];
  const title =
    meta?.title ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Extract h2 headings for TOC
  const headings = content
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => ({ id: slugify(l.slice(3)), text: l.slice(3) }));

  return (
    <div className="min-h-screen bg-background text-foreground font-bricolage">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link
                href="/docs"
                className="hover:text-foreground transition-colors"
              >
                Docs
              </Link>
              <ChevronRight size={12} className="text-muted-foreground/40" />
              <span className="text-foreground font-medium">{title}</span>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            SolStudio
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 flex gap-12">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 py-10 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border/40 pr-6">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.slug}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  item.slug === slug
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {item.title}
              </Link>
            ))}
          </nav>

          {/* Page TOC */}
          {headings.length > 2 && (
            <div className="mt-8 pt-6 border-t border-border/40">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 px-3">
                On this page
              </p>
              <nav className="space-y-1">
                {headings.map((h) => (
                  <a
                    key={h.id}
                    href={`#${h.id}`}
                    className="block px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors truncate"
                  >
                    {h.text}
                  </a>
                ))}
              </nav>
            </div>
          )}
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 py-10 pb-24">
          <article className="max-w-3xl">
            {PRACTICE_CTA[slug] && (
              <div className="mb-8 rounded-xl border border-primary/20 bg-primary/10 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Play size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-foreground">
                      {PRACTICE_CTA[slug].title}
                    </h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {PRACTICE_CTA[slug].body}
                    </p>
                    <Link
                      href={PRACTICE_CTA[slug].href}
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      {PRACTICE_CTA[slug].label}
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            )}
            <MarkdownContent content={content} />
          </article>

          {/* Prev / Next */}
          <div className="mt-16 flex items-center justify-between border-t border-border/40 pt-6 max-w-3xl">
            {meta?.prev ? (
              <Link
                href={`/docs/${meta.prev}`}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft
                  size={14}
                  className="group-hover:-translate-x-0.5 transition-transform"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    Previous
                  </p>
                  <p className="font-medium">{DOC_META[meta.prev]?.title}</p>
                </div>
              </Link>
            ) : (
              <div />
            )}
            {meta?.next ? (
              <Link
                href={`/docs/${meta.next}`}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors text-right"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    Next
                  </p>
                  <p className="font-medium">{DOC_META[meta.next]?.title}</p>
                </div>
                <ChevronRight
                  size={14}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </Link>
            ) : (
              <div />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
