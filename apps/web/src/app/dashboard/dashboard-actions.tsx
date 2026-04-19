"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// ─── Create Project Dialog ───────────────────────────────────────────

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState<"ANCHOR" | "PINOCCHIO" | "QUASAR">("ANCHOR");

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      toast.success("Project created");
      onClose();
      router.push(`/editor/${project.id}`);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to create project");
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createProject.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      framework,
    });
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40">
        <h2 className="mb-1 text-lg font-semibold">New project</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Give your Solana program a name and choose a framework.
        </p>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Project name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_token_program"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:ring-offset-2 font-mono"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              snake_case recommended
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your program..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:ring-offset-2"
            />
          </div>

          {/* Framework toggle */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Framework
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["ANCHOR", "PINOCCHIO", "QUASAR"] as const).map((fw) => (
                <button
                  key={fw}
                  type="button"
                  onClick={() => setFramework(fw)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    framework === fw
                      ? fw === "ANCHOR"
                        ? "border-blue-500/60 bg-blue-500/10 text-blue-400"
                        : fw === "PINOCCHIO"
                          ? "border-violet-500/60 bg-violet-500/10 text-violet-400"
                          : "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {fw === "ANCHOR" ? "Anchor" : fw === "PINOCCHIO" ? "Pinocchio" : "Quasar"}
                  <p className="mt-0.5 text-xs opacity-70">
                    {fw === "ANCHOR" ? "High-level, safe" : fw === "PINOCCHIO" ? "Zero-copy, fast" : "Zero-copy, easy"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createProject.isPending || !name.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            {createProject.isPending ? "Creating..." : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project context menu ────────────────────────────────────────────

function ProjectMenu({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      onClose();
      router.refresh();
    },
    onError: () => {
      toast.error("Failed to delete project");
    },
  });

  const renameProject = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Renamed");
      onClose();
      router.refresh();
    },
    onError: () => {
      toast.error("Failed to rename");
    },
  });

  const commitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== projectName) {
      renameProject.mutate({ id: projectId, name: trimmed });
    } else {
      setNameInput(projectName);
      setRenaming(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleDelete = () => {
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) return;
    deleteProject.mutate({ id: projectId });
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-20 w-52 rounded-lg border border-border bg-popover p-1 shadow-xl shadow-black/30"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          router.push(`/editor/${projectId}`);
        }}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open editor
      </button>

      {renaming ? (
        <div className="px-1 py-1">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setNameInput(projectName); setRenaming(false); }
            }}
            className="w-full rounded border border-primary bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.preventDefault();
            setNameInput(projectName);
            setRenaming(true);
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </button>
      )}
      <div className="my-1 border-t border-border" />
      <button
        onClick={(e) => {
          e.preventDefault();
          handleDelete();
        }}
        disabled={deleteProject.isPending}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {deleteProject.isPending ? "Deleting..." : "Delete"}
      </button>
    </div>
  );
}

// ─── Main export: DashboardActions ──────────────────────────────────

export function DashboardActions({
  projectId,
  projectName,
  compact = false,
}: {
  projectId?: string;
  projectName?: string;
  compact?: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Compact mode = just the "..." button for an existing project
  if (compact && projectId && projectName) {
    return (
      <div className="relative" onClick={(e) => e.preventDefault()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu((v) => !v);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Project options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {showMenu && (
          <ProjectMenu
            projectId={projectId}
            projectName={projectName}
            onClose={() => setShowMenu(false)}
          />
        )}
      </div>
    );
  }

  // Default mode = "New project" button
  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New project
      </button>

      {showCreate && (
        <CreateProjectDialog onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}
