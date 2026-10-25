/** Accepts files dropped on `target`. Also stops the shell from navigating to dropped files. */
export function attachFileDrop(
  target: HTMLElement,
  onDrop: (files: File[], clientX: number, clientY: number) => void,
): void {
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    target.classList.add('dragging');
  });
  target.addEventListener('dragleave', () => target.classList.remove('dragging'));
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    target.classList.remove('dragging');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onDrop(files, e.clientX, e.clientY);
  });
}
