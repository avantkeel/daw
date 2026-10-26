export type UnsavedChoice = "save" | "discard" | "cancel";

let isOpen = false;

interface DialogButton<T> {
  label: string;
  value: T;
  primary?: boolean;
}

/**
 * Modal dialog, drawn in the app so it looks and behaves the same on every host.
 * The first button has the focus (so Enter picks it), Esc picks `cancelValue`.
 * Other shortcuts are blocked while it is open.
 */
function choose<T>(
  title: string,
  text: string,
  buttons: DialogButton<T>[],
  cancelValue: T,
): Promise<T> {
  if (isOpen) return Promise.resolve(cancelValue);
  isOpen = true;

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const titleEl = document.createElement("div");
    titleEl.className = "modal-title";
    titleEl.textContent = title;

    const textEl = document.createElement("div");
    textEl.className = "modal-text";
    textEl.textContent = text;

    const row = document.createElement("div");
    row.className = "modal-buttons";

    const finish = (value: T) => {
      window.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      isOpen = false;
      resolve(value);
    };

    const made = buttons.map((def) => {
      const b = document.createElement("button");
      b.textContent = def.label;
      if (def.primary) b.className = "primary";
      b.addEventListener("click", () => finish(def.value));
      row.append(b);
      return b;
    });

    // Capture phase: keeps Space, Ctrl+N, Delete etc. from reaching the app behind the dialog.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(cancelValue);
      }
    };
    window.addEventListener("keydown", onKey, true);

    box.append(titleEl, textEl, row);
    backdrop.append(box);
    document.body.append(backdrop);
    made[0]?.focus();
  });
}

export function askUnsavedChanges(projectName: string): Promise<UnsavedChoice> {
  return choose<UnsavedChoice>(
    `Do you want to save the changes to "${projectName}"?`,
    "Your changes will be lost if you don't save them.",
    [
      { label: "Save", value: "save", primary: true },
      { label: "Don't Save", value: "discard" },
      { label: "Cancel", value: "cancel" },
    ],
    "cancel",
  );
}

/**
 * A clip would overlap other clips on its track. Resolves true if the user agrees to delete those clips.
 * `onCancel` finishes the sentence "Cancel ..." (what happens to the clip if they say no).
 */
export function askReplaceClips(
  clipName: string,
  overlapped: string[],
  onCancel: string,
): Promise<boolean> {
  const quoted = overlapped.slice(0, 3).map((n) => `"${n}"`);
  if (overlapped.length > 3) quoted.push(`and ${overlapped.length - 3} more`);
  const many = overlapped.length > 1;
  return choose<boolean>(
    many ? "Delete overlapping clips?" : "Delete overlapping clip?",
    `"${clipName}" overlaps ${many ? `${overlapped.length} clips` : "another clip"} on this track: ${quoted.join(", ")}. ` +
      `Delete ${many ? "them" : "it"} to make room? Cancel ${onCancel}`,
    [
      { label: "Delete", value: true, primary: true },
      { label: "Cancel", value: false },
    ],
    false,
  );
}
