"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Suspense } from "react";
import { Github } from "lucide-react";
import { SolMark } from "@/components/ui-kit/cloud-mark";
import { LandingRoot } from "@/components/landing/LandingRoot";
import { CloudStage } from "@/components/landing/CloudScene";

export default function CloudSignInPage() {
  return (
    <Suspense fallback={<SignInShell callbackUrl="/dashboard" />}>
      <CloudSignInContent />
    </Suspense>
  );
}

function CloudSignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  return <SignInShell callbackUrl={callbackUrl} />;
}

function SignInShell({ callbackUrl }: { callbackUrl: string }) {
  const getProviderCallbackUrl = () => {
    if (callbackUrl.startsWith("/")) {
      return `${window.location.origin}${callbackUrl}`;
    }

    return callbackUrl;
  };

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Form side */}
      <div className="flex min-h-screen flex-col px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-md text-[14px] font-semibold tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <SolMark size={22} />
          <span>
            SolStudio <span className="font-normal text-muted-foreground">Cloud</span>
          </span>
        </Link>

        <div className="mx-auto flex w-full max-w-[340px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.025em]">Sign in to SolStudio Cloud</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Use your SolStudio account. Workflows, wallets and runs come with it.</p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: getProviderCallbackUrl() })}
              className={providerButton}
            >
              <Github className="h-4 w-4" aria-hidden />
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: getProviderCallbackUrl() })}
              className={providerButton}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          <p className="mt-6 text-[11.5px] leading-relaxed text-muted-foreground">
            The same account as solstudio.fun. Credentials and wallet keys are encrypted on the server and never sent back to the browser.
          </p>
        </div>
      </div>

      {/* Product side: a workflow run, cropped by the panel's right and bottom edges */}
      <div className="relative hidden overflow-hidden border-l border-white/[0.07] bg-card lg:block" aria-hidden>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1.2px)] bg-[length:22px_22px]" />
        <div className="relative px-12 pt-14">
          <p className="max-w-[26ch] text-[20px] font-semibold leading-snug tracking-[-0.025em]">
            A cron fires, a price is read, a swap goes out.{" "}
            <span className="text-muted-foreground">Every run is logged and can be replayed.</span>
          </p>
        </div>
        <div className="absolute bottom-0 left-12 top-[180px] w-[max(900px,100%)]">
          <LandingRoot className="sl-cloud !bg-transparent">
            <div className="overflow-hidden rounded-tl-[18px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_40px_120px_-40px_rgba(0,0,0,0.9)]">
              <CloudStage />
            </div>
          </LandingRoot>
        </div>
      </div>
    </div>
  );
}

const providerButton =
  "flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] border border-white/[0.08] bg-card text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,transform] duration-150 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
