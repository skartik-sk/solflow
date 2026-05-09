"use client";

// /editor/new — fallback route for direct links; dashboard opens the same flow as a dialog.

import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";

export default function NewWorkflowPage() {
  return <NewWorkflowDialog mode="page" />;
}
