import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { SolMark } from "@/components/ui-kit/cloud-mark";

const errorMessages: Record<string, string> = {
  Configuration: "There is a server configuration error. Please contact support.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The verification link may have expired. Please try again.",
  Default: "An unexpected authentication error occurred. Please try again.",
};

const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export default async function CloudAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error && Object.hasOwn(errorMessages, error) ? errorMessages[error] : errorMessages.Default;

  return (
    <div className="flex min-h-screen flex-col bg-background px-5 py-5 text-foreground sm:px-8">
      <Link href="/" className={`inline-flex items-center gap-2 self-start rounded-md text-[14px] font-semibold tracking-[-0.01em] ${focusRing}`}>
        <SolMark size={22} />
        <span>
          SolStudio <span className="font-normal text-muted-foreground">Cloud</span>
        </span>
      </Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-10">
        <div className="rounded-[14px] border border-white/[0.07] bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-red-500/10 text-red-400">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="text-[16px] font-semibold tracking-[-0.02em]">Sign-in failed</h1>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{message}</p>
          {/* Only known codes are echoed, so the query string can't put arbitrary text on the page */}
          {error && Object.hasOwn(errorMessages, error) && (
            <p className="mt-3 inline-flex rounded-md border border-white/[0.07] bg-background px-2 py-1 font-mono text-[11.5px] text-muted-foreground">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Link
              href="/auth/signin"
              className={`inline-flex h-9 items-center justify-center rounded-[10px] bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] ${focusRing}`}
            >
              Try again
            </Link>
            <Link
              href="/"
              className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground ${focusRing}`}
            >
              Back to Cloud
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
