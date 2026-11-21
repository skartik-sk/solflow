import fs from "fs";
import path from "path";
import Link from "next/link";
import { Play } from "lucide-react";
import { notFound } from "next/navigation";
import { DocsCallout, DocsPager, DocsShell } from "@/components/ui-kit/docs-shell";
import { CopyBlock } from "../copy-block";

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

type Heading = { id: string; text: string; level: 2 | 3 };

/** h2/h3 headings outside code fences, with ids made unique in document order. */
function collectHeadings(content: string): Heading[] {
  const out: Heading[] = [];
  const seen = new Map<string, number>();
  let fence = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^(##|###) (.+)$/);
    if (!m) continue;
    const text = m[2];
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ id: n ? `${base}-${n}` : base, text, level: m[1] === "##" ? 2 : 3 });
  }
  return out;
}

const PLAIN_LINE = /^(?!#|\||- |\d+\. |```|> |---$)\S/;

function MarkdownContent({
  content,
  afterTitle,
}: {
  content: string;
  afterTitle?: React.ReactNode;
}) {
  const lines = content.split("\n");
  const headingIds = collectHeadings(content).map((h) => h.id);
  let headingIndex = 0;
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
          <CopyBlock key={key++} code={codeBlock.join("\n")} lang={codeLang || undefined} />,
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
      elements.push(<hr key={key++} className="my-10 border-white/[0.07]" />);
      i++;
      continue;
    }

    // Callouts (blockquotes)
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const text = quote.join(" ").trim();
      const warn = /^\*\*(warning|caution|important)/i.test(text);
      elements.push(
        <DocsCallout key={key++} tone={warn ? "warn" : "note"}>
          {renderInline(text)}
        </DocsCallout>,
      );
      continue;
    }

    // Headers
    if (line.startsWith("#### ")) {
      elements.push(
        <h4
          key={key++}
          className="mt-8 mb-2 text-[15px] font-semibold tracking-[-0.01em] text-foreground"
        >
          {renderInline(line.slice(5))}
        </h4>,
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      const id = headingIds[headingIndex++];
      elements.push(
        <h3
          key={key++}
          id={id}
          className="group mt-10 mb-3 scroll-mt-20 text-[17px] font-semibold tracking-[-0.015em] text-foreground"
        >
          <a href={`#${id}`} className="outline-none focus-visible:underline">
            {renderInline(line.slice(4))}
          </a>
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      const id = headingIds[headingIndex++];
      elements.push(
        <h2
          key={key++}
          id={id}
          className="mt-12 mb-4 scroll-mt-20 text-[22px] font-semibold tracking-[-0.025em] text-foreground first:mt-0"
        >
          <a href={`#${id}`} className="outline-none focus-visible:underline">
            {renderInline(line.slice(3))}
          </a>
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={key++}
          className="text-[30px] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground md:text-[34px]"
        >
          {renderInline(line.slice(2))}
        </h1>,
      );
      i++;
      // The first paragraph under the title is the lead
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i < lines.length && PLAIN_LINE.test(lines[i])) {
        elements.push(
          <p key={key++} className="mt-3 text-[16px] leading-[1.65] text-muted-foreground">
            {renderInline(lines[i])}
          </p>,
        );
        i++;
      }
      if (afterTitle) elements.push(<div key={key++}>{afterTitle}</div>);
      elements.push(<div key={key++} className="h-6" aria-hidden />);
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
          className="my-6 overflow-x-auto rounded-xl border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {headerRow.map((cell, ci) => (
                  <th
                    key={ci}
                    className="px-4 py-2.5 text-left text-[12.5px] font-medium whitespace-nowrap text-foreground"
                  >
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((cells, ri) => (
                <tr key={ri} className="border-b border-white/[0.05] last:border-0">
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2.5 align-top leading-[1.6] text-muted-foreground"
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

    // Lists (with indented sub-items kept under their parent)
    const ordered = /^\d+\. /.test(line);
    if (ordered || line.startsWith("- ")) {
      const items: { text: string; num: string; sub: string[] }[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const top = ordered ? l.match(/^(\d+)\. (.*)$/) : l.match(/^()- (.*)$/);
        if (top) {
          items.push({ num: top[1], text: top[2], sub: [] });
          i++;
          continue;
        }
        const sub = l.match(/^\s{2,}(?:-|\d+\.) (.*)$/);
        if (sub && items.length) {
          items[items.length - 1].sub.push(sub[1]);
          i++;
          continue;
        }
        break;
      }
      const Tag = ordered ? "ol" : "ul";
      elements.push(
        <Tag key={key++} className="my-4 space-y-2">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 text-[15px] leading-[1.7] text-muted-foreground"
            >
              {ordered ? (
                <span className="mt-[3px] flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-card font-mono text-[11px] text-foreground tabular-nums">
                  {item.num || idx + 1}
                </span>
              ) : (
                <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              )}
              <div className="min-w-0 flex-1">
                <span>{renderInline(item.text)}</span>
                {item.sub.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-white/[0.07] pl-4">
                    {item.sub.map((s, si) => (
                      <li key={si} className="text-[14.5px] leading-[1.65]">
                        {renderInline(s)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="my-4 text-[15px] leading-[1.75] text-muted-foreground">
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
          className="rounded-[5px] border border-white/[0.08] bg-white/[0.04] px-[5px] py-px font-mono text-[0.86em] text-foreground"
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
          className="font-medium text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors duration-150 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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


function PracticeCta({ cta }: { cta: (typeof PRACTICE_CTA)[string] }) {
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:flex-row sm:items-center sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-foreground">{cta.title}</p>
        <p className="mt-1 text-[13.5px] leading-[1.6] text-muted-foreground">{cta.body}</p>
      </div>
      <Link
        href={cta.href}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-center"
      >
        <Play size={13} className="fill-current" aria-hidden />
        {cta.label}
      </Link>
    </div>
  );
}

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
      <DocsShell>
        <div className="py-20 text-center">
          <p className="text-[14px] text-muted-foreground">
            Documentation file not found: {slug}.md
          </p>
          <Link
            href="/docs"
            className="mt-4 inline-block text-[14px] text-primary hover:underline"
          >
            Back to docs
          </Link>
        </div>
      </DocsShell>
    );
  }

  const meta = DOC_META[slug];

  // h2s for the outline, plus h3s when the page is short enough to list them
  const all = collectHeadings(content);
  const headings = all.length <= 24 ? all : all.filter((h) => h.level === 2);

  return (
    <DocsShell toc={headings.map((h) => ({ id: h.id, text: h.text.replace(/`/g, ""), level: h.level }))}>
      <article>
        <MarkdownContent
          content={content}
          afterTitle={PRACTICE_CTA[slug] ? <PracticeCta cta={PRACTICE_CTA[slug]} /> : undefined}
        />
      </article>

      <DocsPager
        prev={meta?.prev ? { href: `/docs/${meta.prev}`, title: DOC_META[meta.prev]?.title ?? meta.prev } : undefined}
        next={meta?.next ? { href: `/docs/${meta.next}`, title: DOC_META[meta.next]?.title ?? meta.next } : undefined}
      />
    </DocsShell>
  );
}
