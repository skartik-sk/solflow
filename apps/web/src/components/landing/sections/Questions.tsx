"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import "./Questions.css";

/*
 * #11 Questions: a docs-style search over an open list. Every answer is on
 * the page at once (no accordion); typing filters the list and marks the
 * words that matched. "/" focuses the search, Escape clears it.
 */

type QA = { id: string; topic: string; q: string; a: ReactNode; text: string; keys?: string };

const Code = ({ children }: { children: ReactNode }) => <code className="sl-questions__code">{children}</code>;

// `text` is the plain answer, used for matching. Keep it in step with `a`.
const QAS: QA[] = [
  {
    id: "free",
    topic: "Pricing",
    q: "Is it free?",
    a: (
      <>
        Yes. The editor, the templates, the browser compiler and the CLI cost nothing. Sign in with GitHub or Google to save projects and
        deploy.
      </>
    ),
    text: "Yes. The editor, the templates, the browser compiler and the CLI cost nothing. Sign in with GitHub or Google to save projects and deploy.",
  },
  {
    id: "local",
    topic: "Privacy",
    q: "Does my code leave my machine?",
    a: (
      <>
        Not with the CLI. <Code>parse</Code>, <Code>audit</Code>, <Code>test</Code> and <Code>view</Code> run on your machine, and{" "}
        <Code>view</Code> serves the visualizer from a local server. Only <Code>solstudio cloud</Code> talks to SolStudio Cloud, after you log
        in. In the web editor your project is saved to your account; Pinocchio and Quasar compile in your browser, Anchor on our build
        server.
      </>
    ),
    text: "Not with the CLI. parse, audit, test and view run on your machine, and view serves the visualizer from a local server. Only solstudio cloud talks to SolStudio Cloud, after you log in. In the web editor your project is saved to your account; Pinocchio and Quasar compile in your browser, Anchor on our build server.",
  },
  {
    id: "frameworks",
    topic: "Frameworks",
    q: "Which frameworks does it write?",
    a: (
      <>
        Anchor, Pinocchio and Quasar, all from the same graph. Switching is one click. Pinocchio and Quasar compile in your browser (about 0.4 s
        and 0.9 s once warm); Anchor compiles on the server in about 8 s.
      </>
    ),
    text: "Anchor, Pinocchio and Quasar, all from the same graph. Switching is one click. Pinocchio and Quasar compile in your browser (about 0.4 s and 0.9 s once warm); Anchor compiles on the server in about 8 s.",
  },
  {
    id: "import",
    topic: "CLI",
    q: "Can I bring my existing Anchor repo?",
    a: (
      <>
        Yes, through the CLI. Run <Code>bunx @solstudio/cli view</Code> in the repo: it parses Anchor, Pinocchio or Quasar source into the same
        graph and opens it locally. <Code>solstudio parse</Code> prints the graph without the UI.
      </>
    ),
    text: "Yes, through the CLI. Run bunx @solstudio/cli view in the repo: it parses Anchor, Pinocchio or Quasar source into the same graph and opens it locally. solstudio parse prints the graph without the UI.",
    keys: "import existing project",
  },
  {
    id: "production",
    topic: "Security",
    q: "Is the generated code production ready?",
    a: (
      <>
        Treat it as a strong first draft. The built-in audit checks it against 27 rules and scores it out of 100, and you can run your tests
        from the editor. Read the code and get a review before real funds depend on it.
      </>
    ),
    text: "Treat it as a strong first draft. The built-in audit checks it against 27 rules and scores it out of 100, and you can run your tests from the editor. Read the code and get a review before real funds depend on it.",
    keys: "audit safe",
  },
  {
    id: "network",
    topic: "Deploy",
    q: "Devnet or mainnet?",
    a: (
      <>
        Devnet is the default, and you deploy to it from the browser. The network picker also lists Mainnet and Localnet. Go to mainnet only
        after the audit, your tests and a review.
      </>
    ),
    text: "Devnet is the default, and you deploy to it from the browser. The network picker also lists Mainnet and Localnet. Go to mainnet only after the audit, your tests and a review.",
    keys: "deploy",
  },
  {
    id: "download",
    topic: "Compiler",
    q: "What does the browser build download?",
    a: <>About 30 MB, once: rustc compiled to WebAssembly and the framework crates. After that it is cached, so later builds skip the download.</>,
    text: "About 30 MB, once: rustc compiled to WebAssembly and the framework crates. After that it is cached, so later builds skip the download.",
    keys: "wasm size",
  },
];

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9@./-]/g, ""))
    .filter(Boolean);

/** Wraps every match of the query words in a mark. Plain strings only. */
function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

export function Questions() {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const terms = useMemo(() => words(query), [query]);
  const shown = useMemo(
    () => (terms.length ? QAS.filter((x) => terms.every((t) => `${x.q} ${x.topic} ${x.text} ${x.keys ?? ""}`.toLowerCase().includes(t))) : QAS),
    [terms],
  );

  // "/" jumps to the search from anywhere on the page, unless you are typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="sl-questions sl-section" aria-labelledby="sl-questions-title">
      <div className="sl-wrap sl-questions__grid">
        <div className="sl-questions__side" data-sl-reveal>
          <h2 id="sl-questions-title" className="sl-h2">
            Questions, answered plainly
          </h2>
          <p className="sl-body sl-questions__intro">The things people ask before they open the editor.</p>

          <div className="sl-questions__search" role="search">
            <label htmlFor={`${id}-q`} className="sl-questions__sr">
              Search questions
            </label>
            <Search size={16} strokeWidth={1.75} className="sl-questions__icon" aria-hidden />
            <input
              ref={input}
              id={`${id}-q`}
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search, e.g. mainnet"
              value={query}
              aria-controls={`${id}-list`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className="sl-questions__clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            ) : (
              <kbd className="sl-questions__kbd" aria-hidden>
                /
              </kbd>
            )}
          </div>
          <p className="sl-label sl-questions__count" aria-live="polite">
            {terms.length ? `${shown.length} of ${QAS.length} answers` : `${QAS.length} answers`}
          </p>

          <p className="sl-label sl-questions__more">
            Not here? Read the <a href="/docs">docs</a> or open an issue on{" "}
            <a href="https://github.com/skartik-sk/solflow/issues" target="_blank" rel="noreferrer">
              GitHub
            </a>
            .
          </p>
        </div>

        <div id={`${id}-list`} className="sl-questions__list" data-sl-reveal>
          {shown.map((x) => (
            <article key={x.id} className="sl-questions__item">
              <p className="sl-questions__topic">{x.topic}</p>
              <h3 className="sl-h3">{highlight(x.q, terms)}</h3>
              <p className="sl-body">{terms.length ? highlight(x.text, terms) : x.a}</p>
            </article>
          ))}
          {shown.length === 0 && (
            <div className="sl-questions__empty">
              <p className="sl-h3">No answer mentions “{query.trim()}”.</p>
              <p className="sl-body">
                Try a shorter word, or{" "}
                <button type="button" onClick={() => setQuery("")}>
                  show every question
                </button>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
