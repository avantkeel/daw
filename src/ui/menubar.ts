export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect(): void;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

interface OpenMenu {
  btn: HTMLElement;
  list: HTMLElement;
}

/** Minimal in-app menu bar (File, ...). In-app so it works the same on any host. */
export class MenuBar {
  private open: OpenMenu | null = null;
  private menus: OpenMenu[] = [];

  constructor(private root: HTMLElement, menus: Menu[]) {
    for (const menu of menus) {
      const wrap = document.createElement('div');
      wrap.className = 'menu';

      const btn = document.createElement('button');
      btn.className = 'menu-btn';
      btn.textContent = menu.label;

      const list = document.createElement('div');
      list.className = 'menu-list';
      list.hidden = true;

      for (const item of menu.items) {
        const row = document.createElement('button');
        row.className = 'menu-item';
        const label = document.createElement('span');
        label.textContent = item.label;
        const shortcut = document.createElement('span');
        shortcut.className = 'menu-shortcut';
        shortcut.textContent = item.shortcut ?? '';
        row.append(label, shortcut);
        row.addEventListener('click', () => {
          this.close();
          item.onSelect();
        });
        list.append(row);
      }

      const entry: OpenMenu = { btn, list };
      this.menus.push(entry);
      btn.addEventListener('click', () => (this.open === entry ? this.close() : this.show(entry)));
      btn.addEventListener('mouseenter', () => this.open && this.open !== entry && this.show(entry));

      wrap.append(btn, list);
      root.append(wrap);
    }

    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.root.contains(e.target as Node)) this.close();
    });
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
  }

  private show(m: OpenMenu): void {
    this.close();
    m.list.hidden = false;
    m.btn.classList.add('active');
    this.open = m;
  }

  private close(): void {
    if (!this.open) return;
    this.open.list.hidden = true;
    this.open.btn.classList.remove('active');
    this.open = null;
  }
}
