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
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="relative w-full max-w-[420px] rounded-[16px] border border-white/[0.08] bg-popover p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_40px_100px_-30px_rgba(0,0,0,0.9)]"
      >
        <h2 id="new-project-title" className="text-[15px] font-semibold tracking-[-0.01em]">New project</h2>
        <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
          Give your Solana program a name and choose a framework.
        </p>

        <div className="space-y-3.5">
          {/* Name */}
          <div>
            <label htmlFor="new-project-name" className="mb-1.5 block text-[12px] font-medium text-foreground/90">
              Project name <span className="text-destructive">*</span>
            </label>
            <input
              id="new-project-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_token_program"
              className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-background px-3 font-mono text-[16px] outline-none transition-colors duration-150 placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-[13px]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              snake_case recommended
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="new-project-description" className="mb-1.5 block text-[12px] font-medium text-foreground/90">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="new-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your program..."
              rows={2}
              className="w-full resize-none rounded-[10px] border border-white/[0.08] bg-background px-3 py-2 text-[16px] outline-none transition-colors duration-150 placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-[13px]"
            />
          </div>

          {/* Framework toggle */}
          <div>
            <p id="new-project-framework" className="mb-1.5 block text-[12px] font-medium text-foreground/90">
              Framework
            </p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="new-project-framework">
              {(["ANCHOR", "PINOCCHIO", "QUASAR"] as const).map((fw) => (
                <button
                  key={fw}
                  type="button"
                  role="radio"
                  aria-checked={framework === fw}
                  onClick={() => setFramework(fw)}
                  className={`rounded-[10px] border px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] ${
                    framework === fw
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-white/[0.08] bg-background text-muted-foreground hover:border-white/[0.14] hover:text-foreground"
                  }`}
                >
                  {fw === "ANCHOR" ? "Anchor" : fw === "PINOCCHIO" ? "Pinocchio" : "Quasar"}
                  <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                    {fw === "ANCHOR" ? "High-level, safe" : fw === "PINOCCHIO" ? "Zero-copy, fast" : "Zero-copy, easy"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[10px] border border-white/[0.08] bg-background px-3.5 text-[13px] font-medium transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createProject.isPending || !name.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
      className="absolute right-0 top-9 z-20 w-48 rounded-[12px] border border-white/[0.08] bg-popover p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_50px_-15px_rgba(0,0,0,0.85)]"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          router.push(`/editor/${projectId}`);
        }}
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-[13px] outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
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
            className="h-8 w-full rounded-[8px] border border-primary/60 bg-background px-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-[13px]"
          />
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.preventDefault();
            setNameInput(projectName);
            setRenaming(true);
          }}
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-[13px] outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </button>
      )}
      <div className="my-1 border-t border-white/[0.07]" />
      <button
        onClick={(e) => {
          e.preventDefault();
          handleDelete();
        }}
        disabled={deleteProject.isPending}
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-[13px] text-destructive outline-none transition-colors duration-150 hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:opacity-50"
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
          className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.1] bg-popover/90 text-muted-foreground backdrop-blur-sm transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-[0.95]"
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
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
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
