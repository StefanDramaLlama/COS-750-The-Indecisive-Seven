import { enhanceSelect } from './dom.ts';

export function mountTheme(select: HTMLSelectElement) {
  const key = 'graphwise-theme';
  const apply = (value: string | null) => {
    const theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    select.value = theme;
  };

  try { apply(localStorage.getItem(key)); } catch { apply(null); }
  enhanceSelect(select);
  select.addEventListener('change', () => {
    apply(select.value);
    try { localStorage.setItem(key, select.value); } catch { /* The current theme still applies. */ }
  });
}
