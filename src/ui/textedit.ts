export interface EditBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Inline text editor: a small input placed over `box` (relative to `host`).
 * Enter or clicking away saves, Escape cancels. Keys stay inside the input so
 * shortcuts (Space, Delete, Ctrl+Z) don't reach the app while typing.
 */
export function editText(
  host: HTMLElement,
  box: EditBox,
  value: string,
  onCommit: (text: string) => void,
): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-edit";
  input.value = value;
  input.style.left = `${box.x}px`;
  input.style.top = `${box.y}px`;
  input.style.width = `${box.w}px`;
  input.style.height = `${box.h}px`;

  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const text = input.value;
    input.remove();
    if (save) onCommit(text);
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("blur", () => finish(true));

  host.append(input);
  input.focus();
  input.select();
}
