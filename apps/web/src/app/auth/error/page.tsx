import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { SolMark } from "@/components/ui-kit/dashboard-mark";

const errorMessages: Record<string, string> = {
  Configuration: "There is a server configuration error. Please contact support.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The verification link may have expired. Please try again.",
  Default: "An unexpected error occurred. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = errorMessages[error ?? "Default"] ?? errorMessages.Default;

  return (
    <div className="flex min-h-screen flex-col bg-background px-5 py-5 text-foreground sm:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 self-start rounded-md text-[14px] font-semibold tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <SolMark size={22} />
        SolStudio
      </Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-10">
        <div className="rounded-[16px] border border-white/[0.07] bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-destructive/12 text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">Sign-in failed</h1>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{message}</p>
              {error && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">Code: {error}</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2 border-t border-white/[0.07] pt-4">
            <Link
              href="/auth/signin"
              className="inline-flex h-9 items-center justify-center rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
            >
              Try again
            </Link>
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-white/[0.08] px-3.5 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
