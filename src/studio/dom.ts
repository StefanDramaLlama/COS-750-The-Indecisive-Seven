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
