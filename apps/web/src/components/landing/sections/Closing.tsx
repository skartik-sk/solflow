"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { STATE_FILES, type Framework, type TemplateKey } from "./closing-code";
import "./Closing.css";

/*
 * #12 Final call: the product's own "New project" dialog, working. Pick a
 * template and a framework and the preview shows the real state account the
 * generator writes for that pair (closing-code.ts), with where it compiles.
 */

const TEMPLATES: { key: TemplateKey; name: string; ix: string[] }[] = [
  { key: "vault", name: "Simple Vault", ix: ["initialize", "deposit", "withdraw", "close_vault"] },
  { key: "escrow", name: "Token Escrow", ix: ["make", "take", "refund"] },
  { key: "nft", name: "NFT Collection", ix: ["create_collection", "mint_nft", "verify_collection"] },
];

const FRAMEWORKS: { key: Framework; name: string; build: string; where: "browser" | "server" }[] = [
  { key: "anchor", name: "Anchor", build: "Compiles on the server · about 8 s", where: "server" },
  { key: "pinocchio", name: "Pinocchio", build: "Compiles in your browser · about 0.4 s warm", where: "browser" },
  { key: "quasar", name: "Quasar", build: "Compiles in your browser · about 0.9 s warm", where: "browser" },
];

export function Closing() {
  const [tpl, setTpl] = useState<TemplateKey>("vault");
  const [fw, setFw] = useState<Framework>("pinocchio");
  const id = useId();
  const file = STATE_FILES[tpl][fw];
  const fwIndex = FRAMEWORKS.findIndex((f) => f.key === fw);
  const framework = FRAMEWORKS[fwIndex]!;
  const template = TEMPLATES.find((t) => t.key === tpl)!;

  return (
    <section className="sl-closing sl-section" aria-labelledby="sl-closing-title">
      <div className="sl-wrap sl-closing__grid">
        <div className="sl-closing__copy" data-sl-reveal>
          <h2 id="sl-closing-title" className="sl-h2">
            Pick a template, then make it yours.
          </h2>
          <p className="sl-lead">
            Every template builds in Anchor, Pinocchio and Quasar. Pick one to see the account it writes, then open it in the editor and change
            anything.
          </p>
          <p className="sl-label sl-closing__more">
            More in <Link href="/marketplace">the marketplace</Link>, from a staking pool to DAO voting.
          </p>
        </div>

        <div className="sl-closing__dialog" role="group" aria-labelledby={`${id}-title`} data-sl-reveal>
          <div className="sl-closing__head">
            <p id={`${id}-title`} className="sl-closing__title">
              New project
            </p>
            <p className="sl-closing__sub">Choose a template and a framework.</p>
          </div>

          <fieldset className="sl-closing__field">
            <legend>Template</legend>
            <div className="sl-closing__templates">
              {TEMPLATES.map((t) => (
                <label key={t.key} className="sl-closing__tpl" data-on={tpl === t.key || undefined}>
                  <input type="radio" name={`${id}-tpl`} value={t.key} checked={tpl === t.key} onChange={() => setTpl(t.key)} />
                  <span className="sl-closing__radio" aria-hidden />
                  <span className="sl-closing__tpl-name">{t.name}</span>
                  <span className="sl-closing__tpl-ix">{t.ix.join(" · ")}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="sl-closing__field">
            <legend>Framework</legend>
            <div className="sl-closing__seg" style={{ "--i": fwIndex } as CSSProperties}>
              <span className="sl-closing__seg-thumb" aria-hidden />
              {FRAMEWORKS.map((f) => (
                <label key={f.key} data-on={fw === f.key || undefined}>
                  <input type="radio" name={`${id}-fw`} value={f.key} checked={fw === f.key} onChange={() => setFw(f.key)} />
                  {f.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="sl-closing__preview" aria-live="polite" aria-atomic="true">
            <div className="sl-closing__file">
              <span className="sl-closing__path">{file.path.replace(/^programs\//, "")}</span>
              <span className="sl-closing__count">{file.files} Rust files</span>
            </div>
            <pre className="sl-closing__code" key={`${tpl}-${fw}`} tabIndex={0} aria-label={`${file.path}, ${framework.name}`}>
              {file.lines.map((line, i) => (
                <span key={i} className="sl-closing__line">
                  <span className="sl-closing__ln" aria-hidden>
                    {i + 1}
                  </span>
                  <Rust line={line} />
                </span>
              ))}
            </pre>
            <p className="sl-closing__build" data-where={framework.where}>
              <span className="sl-closing__build-dot" aria-hidden />
              <span key={fw} className="sl-closing__build-text">
                {framework.build}
              </span>
            </p>
          </div>

          <div className="sl-closing__foot">
            <p className="sl-closing__note">Free. Sign in with GitHub or Google.</p>
            <Link href={`/marketplace?q=${encodeURIComponent(template.name)}`} className="sl-btn sl-btn-primary">
              Use {template.name}
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Quiet Rust colouring: comments, attributes, keywords. Nothing else. */
function Rust({ line }: { line: string }) {
  const c = line.indexOf("//");
  const code = c === -1 ? line : line.slice(0, c);
  const comment = c === -1 ? "" : line.slice(c);
  const parts = code.split(/(\b(?:pub|use|struct|impl|const|fn|unsafe|self|Self)\b|#\[[^\]]*\]?)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={p.startsWith("#") ? "sl-closing__attr" : "sl-closing__kw"}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
      {comment && <span className="sl-closing__cmt">{comment}</span>}
    </>
  );
}
