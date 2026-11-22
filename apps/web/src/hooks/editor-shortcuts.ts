// Editor keyboard shortcuts (Ctrl on Windows/Linux, Cmd on macOS).
// Canvas shortcuts are skipped while the user types in a field, so the
// browser's own text behaviour (copy, paste, select all, undo) wins there.

export type EditorShortcut =
  | "copy"
  | "paste"
  | "save"
  | "selectAll"
  | "undo"
  | "redo"
  | "codeTab"
  | "consoleTab"
  | "toggleBottomPanel";

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

/** Text-field-sensitive shortcuts: these yield to the focused input. */
const CANVAS_ONLY = new Set<EditorShortcut>(["copy", "paste", "selectAll", "undo", "redo"]);

export function resolveEditorShortcut(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
  inEditableField: boolean,
): EditorShortcut | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  let action: EditorShortcut | null = null;
  switch (e.key.toLowerCase()) {
    case "c": action = "copy"; break;
    case "v": action = "paste"; break;
    case "s": action = "save"; break;
    case "a": action = "selectAll"; break;
    case "z": action = e.shiftKey ? "redo" : "undo"; break;
    case "y": action = "redo"; break;
    case "1": action = "codeTab"; break;
    case "2": action = "consoleTab"; break;
    case "b": action = "toggleBottomPanel"; break;
  }
  if (action && inEditableField && CANVAS_ONLY.has(action)) return null;
  return action;
}
