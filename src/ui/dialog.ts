export type UnsavedChoice = 'save' | 'discard' | 'cancel';

let isOpen = false;

/**
 * Modal "save changes?" prompt, drawn in the app so it looks and behaves the same on every host.
 * Enter = Save, Esc = Cancel. Other shortcuts are blocked while it is open.
 */
export function askUnsavedChanges(projectName: string): Promise<UnsavedChoice> {
  if (isOpen) return Promise.resolve('cancel');
  isOpen = true;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = `Do you want to save the changes to "${projectName}"?`;

    const text = document.createElement('div');
    text.className = 'modal-text';
    text.textContent = "Your changes will be lost if you don't save them.";

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const finish = (choice: UnsavedChoice) => {
      window.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      isOpen = false;
      resolve(choice);
    };

    const button = (label: string, choice: UnsavedChoice, primary = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (primary) b.className = 'primary';
      b.addEventListener('click', () => finish(choice));
      buttons.append(b);
      return b;
    };
    const save = button('Save', 'save', true);
    button("Don't Save", 'discard');
    button('Cancel', 'cancel');

    // Capture phase: keeps Space, Ctrl+N, Delete etc. from reaching the app behind the dialog.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finish('cancel');
      }
    };
    window.addEventListener('keydown', onKey, true);

    box.append(title, text, buttons);
    backdrop.append(box);
    document.body.append(backdrop);
    save.focus();
  });
}
