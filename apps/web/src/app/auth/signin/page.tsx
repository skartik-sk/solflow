"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Github } from "lucide-react";
import Link from "next/link";
import { WalletSignIn } from "@/components/auth/WalletSignIn";
import { SolMark } from "@/components/ui-kit/dashboard-mark";
import { GraphToCode } from "@/components/ui-kit/dashboard-graph-to-code";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInShell callbackUrl="/dashboard" />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  return <SignInShell callbackUrl={callbackUrl} />;
}

function SignInShell({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Form side */}
      <div className="flex min-h-screen flex-col px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-md text-[14px] font-semibold tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <SolMark size={22} />
          SolStudio
        </Link>

        <div className="mx-auto flex w-full max-w-[340px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.025em]">
            Sign in to SolStudio
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Draw a Solana program. Ship it to devnet.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            {/* GitHub */}
            <button
              onClick={() => signIn("github", { callbackUrl })}
              className={providerButton}
            >
              <Github className="h-4 w-4" />
              Continue with GitHub
            </button>

            {/* Google */}
            <button
              onClick={() => signIn("google", { callbackUrl })}
              className={providerButton}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          {/* Wallet */}
          <WalletSignIn callbackUrl={callbackUrl} />

          <p className="mt-6 text-[11.5px] leading-relaxed text-muted-foreground">
            By signing in you agree to our{" "}
            <Link href="/terms" className="text-foreground/90 underline decoration-white/20 underline-offset-2 transition-colors hover:decoration-primary">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-foreground/90 underline decoration-white/20 underline-offset-2 transition-colors hover:decoration-primary">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Product side: the editor, running off the panel's right and bottom edges */}
      <div className="relative hidden overflow-hidden border-l border-white/[0.07] bg-card lg:block">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1.2px)] bg-[length:22px_22px]"
        />
        <div className="relative px-12 pt-14">
          <p className="max-w-[24ch] text-[20px] font-semibold leading-snug tracking-[-0.025em]">
            Every node writes its own Rust.{" "}
            <span className="text-muted-foreground">Anchor, Pinocchio and Quasar from the same graph.</span>
          </p>
        </div>
        <div className="absolute bottom-0 left-12 top-[180px] w-[max(860px,100%)]">
          <GraphToCode tall />
        </div>
      </div>
    </div>
  );
}

const providerButton =
  "flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] border border-white/[0.08] bg-card text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,transform] duration-150 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]";

// ─── Google SVG Icon ─────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
