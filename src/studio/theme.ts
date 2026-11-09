type Choice = "system" | "light" | "dark";
const KEY = "gw-theme";

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: Choice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

/** Wire the System / Light / Dark radio group in the top bar. */
export function initTheme(group: HTMLElement): void {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")];
  const sync = (choice: Choice) => {
    for (const b of buttons) {
      const on = b.dataset.themeChoice === choice;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (choice: Choice, focus = false) => {
    apply(choice);
    sync(choice);
    if (focus) buttons.find((b) => b.dataset.themeChoice === choice)?.focus();
  };
  sync(read());
  for (const b of buttons) b.addEventListener("click", () => choose(b.dataset.themeChoice as Choice));
  group.addEventListener("keydown", (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    choose(buttons[(i + dir + buttons.length) % buttons.length].dataset.themeChoice as Choice, true);
  });
}
