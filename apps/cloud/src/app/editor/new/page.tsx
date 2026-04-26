"use client";

// /editor/new — creates a new workflow and redirects to its editor page.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewWorkflowPage() {
  const router = useRouter();

  useEffect(() => {
    // Generate a temporary ID and redirect
    // TODO: Create via tRPC API and get real ID back
    const id = crypto.randomUUID();
    router.replace(`/editor/${id}`);
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Creating workflow...</p>
    </div>
  );
}
