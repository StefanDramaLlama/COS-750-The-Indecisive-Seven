export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function button(text: string, action: () => void, className?: string): HTMLButtonElement {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function required<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing Studio element: ${selector}`);
  return node;
}

type DropdownController = { refresh: () => void };
const dropdowns = new WeakMap<HTMLSelectElement, DropdownController>();
let dropdownNumber = 0;

export function enhanceSelect(select: HTMLSelectElement): DropdownController {
  const existing = dropdowns.get(select);
  if (existing) return existing;
  const host = select.parentElement;
  if (!host) throw new Error('A dropdown select needs a parent element.');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dropdown-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.hidden = true;
  menu.id = `dropdown-${++dropdownNumber}`;
  menu.setAttribute('role', 'listbox');
  trigger.setAttribute('aria-controls', menu.id);
  select.classList.add('native-select-source');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  host.classList.add('dropdown');
  host.append(trigger, menu);

  let open = false;
  let activeIndex = 0;
  const close = () => {
    open = false;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
  };
  const setActive = (index: number) => {
    const options = Array.from(menu.querySelectorAll<HTMLElement>('[role="option"]'));
    activeIndex = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((option, optionIndex) => option.classList.toggle('is-active', optionIndex === activeIndex));
    const active = options[activeIndex];
    if (active) {
      trigger.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  };
  const openMenu = () => {
    const options = Array.from(select.options);
    if (!options.length) return;
    open = true;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, options.findIndex(option => option.value === select.value)));
  };
  const refresh = () => {
    const selected = select.selectedOptions[0];
    trigger.textContent = selected?.textContent ?? 'Choose an option';
    menu.replaceChildren(...Array.from(select.options).map((option, index) => {
      const item = document.createElement('div');
      item.id = `${menu.id}-option-${index}`;
      item.className = 'dropdown-option';
      item.setAttribute('role', 'option');
      item.tabIndex = -1;
      item.setAttribute('aria-selected', String(option.value === select.value));
      item.textContent = option.textContent;
      const choose = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
        trigger.focus();
      };
      item.addEventListener('pointerup', event => {
        if (event.button === 0) choose();
      });
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
      });
      return item;
    }));
    if (open) setActive(Math.max(0, Array.from(select.options).findIndex(option => option.value === select.value)));
  };
  const controller = { refresh };
  dropdowns.set(select, controller);
  select.addEventListener('change', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true });
  trigger.addEventListener('click', () => open ? close() : openMenu());
  trigger.addEventListener('keydown', event => {
    const options = select.options;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openMenu();
      setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' && open) {
      event.preventDefault(); setActive(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault(); setActive(options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      close();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); close();
    }
  });
  document.addEventListener('click', event => {
    if (open && event.target instanceof Node && !host.contains(event.target)) close();
  });
  refresh();
  return controller;
}
