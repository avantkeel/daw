export interface ContextItem {
  label: string;
  onSelect(): void;
}

let current: HTMLElement | null = null;

export function closeContextMenu(): void {
  current?.remove();
  current = null;
}

/** Small right-click menu at a screen position. Closes on pick, click elsewhere, Escape or scroll. */
export function showContextMenu(
  clientX: number,
  clientY: number,
  items: ContextItem[],
): void {
  closeContextMenu();
  const list = document.createElement("div");
  list.className = "menu-list context-menu";
  list.style.left = `${clientX}px`;
  list.style.top = `${clientY}px`;

  for (const item of items) {
    const row = document.createElement("button");
    row.className = "menu-item";
    const label = document.createElement("span");
    label.textContent = item.label;
    row.append(label);
    row.addEventListener("click", () => {
      closeContextMenu();
      item.onSelect();
    });
    list.append(row);
  }

  document.body.append(list);
  // Keep the menu inside the window.
  const r = list.getBoundingClientRect();
  if (r.right > window.innerWidth)
    list.style.left = `${Math.max(0, window.innerWidth - r.width - 4)}px`;
  if (r.bottom > window.innerHeight)
    list.style.top = `${Math.max(0, window.innerHeight - r.height - 4)}px`;
  current = list;

  const close = (e: Event) => {
    if (e instanceof MouseEvent && list.contains(e.target as Node)) return;
    closeContextMenu();
    cleanup();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(e);
  const cleanup = () => {
    document.removeEventListener("mousedown", close, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", close, true);
  };
  document.addEventListener("mousedown", close, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", close, true);
}
