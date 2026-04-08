import Link from "next/link";
import { AlertTriangle, Workflow } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="mb-8 inline-flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
            <Workflow className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">SolStudio</span>
        </Link>

        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="mb-2 text-lg font-semibold">Authentication Error</h1>
          <p className="mb-6 text-sm text-muted-foreground">{message}</p>
          <Link
            href="/auth/signin"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
