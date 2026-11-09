import type { PseudocodeLine } from "../shared/types.js";
import { h } from "./dom.js";

/**
 * Pseudocode with one focusable button per line. The executing line (driven by
 * playback) and the inspected line (chosen by the learner) are styled differently,
 * and inspecting never changes the playback position.
 */
export class CodeCard {
  readonly el: HTMLElement;
  private list: HTMLOListElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private inspector: HTMLElement;
  private exec: string | null = null;
  private inspected: string | null = null;

  constructor(
    private lines: PseudocodeLine[],
    title: string,
  ) {
    this.list = h("ol", { class: "code", "aria-label": `${title} pseudocode` });
    lines.forEach((line, i) => {
      const btn = h(
        "button",
        {
          type: "button",
          class: "code__line",
          "data-line": line.id,
          "aria-pressed": "false",
          tabindex: i === 0 ? 0 : -1,
          style: `padding-left: ${6 + line.indent * 20}px`,
        },
        h("span", { class: "gutter", "aria-hidden": "true" }, "▶"),
        h("span", { class: "ln" }, String(i + 1)),
        h("code", {}, line.text),
      );
      btn.addEventListener("click", () => this.inspect(this.inspected === line.id ? null : line.id));
      this.buttons.set(line.id, btn);
      this.list.append(h("li", {}, btn));
    });
    this.list.addEventListener("keydown", (e) => this.onKey(e));
    this.inspector = h("div", { class: "inspector", "aria-live": "polite" });
    this.el = h(
      "section",
      { class: "code-card" },
      h("div", { class: "code-card__head" }, h("span", { class: "label" }, "Pseudocode"), h("span", { class: "label" }, "select a line to inspect it")),
      this.list,
      this.inspector,
    );
    this.renderInspector();
  }

  setTall(tall: boolean): void {
    this.el.classList.toggle("code-card--tall", tall);
  }

  setExec(lineId: string | null): void {
    if (lineId === this.exec) return;
    if (this.exec) {
      const old = this.buttons.get(this.exec);
      old?.classList.remove("is-exec");
      old?.removeAttribute("aria-current");
    }
    this.exec = lineId;
    const btn = lineId ? this.buttons.get(lineId) : undefined;
    if (btn) {
      btn.classList.add("is-exec");
      btn.setAttribute("aria-current", "step");
      this.keepInView(btn);
    }
    if (!this.inspected) this.renderInspector();
  }

  inspect(lineId: string | null): void {
    if (this.inspected) {
      const old = this.buttons.get(this.inspected);
      old?.classList.remove("is-inspected");
      old?.setAttribute("aria-pressed", "false");
    }
    this.inspected = lineId;
    const btn = lineId ? this.buttons.get(lineId) : undefined;
    if (btn) {
      btn.classList.add("is-inspected");
      btn.setAttribute("aria-pressed", "true");
    }
    this.renderInspector();
  }

  /** Scroll inside the code list only — never the page, never focus. */
  private keepInView(btn: HTMLElement) {
    const li = btn.parentElement as HTMLElement;
    const top = li.offsetTop;
    const bottom = top + li.offsetHeight;
    if (top < this.list.scrollTop) this.list.scrollTop = top - 6;
    else if (bottom > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = bottom - this.list.clientHeight + 6;
  }

  private renderInspector() {
    const id = this.inspected ?? this.exec;
    const idx = this.lines.findIndex((l) => l.id === id);
    if (idx < 0) {
      this.inspector.replaceChildren(
        h("span", { class: "label" }, "Not started"),
        h("p", { class: "muted" }, "Press Next to run the first line, or select any line to read what it does."),
      );
      return;
    }
    const line = this.lines[idx];
    const inspecting = this.inspected !== null;
    const back = h("button", { type: "button", class: "btn btn--quiet" }, "Back to the running line");
    back.addEventListener("click", () => {
      this.inspect(null);
      if (this.exec) this.buttons.get(this.exec)?.focus();
    });
    this.inspector.replaceChildren(
      h("span", { class: "label" }, inspecting ? `Inspecting line ${idx + 1}` : `Running line ${idx + 1}`),
      h("code", {}, line.text),
      h("p", {}, line.explanation),
      inspecting && this.exec !== this.inspected ? h("div", {}, back) : "",
    );
  }

  private onKey(e: KeyboardEvent) {
    const all = [...this.buttons.values()];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(all.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = all.length - 1;
    else if (e.key === "Escape") {
      this.inspect(null);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    all[i].tabIndex = -1;
    all[next].tabIndex = 0;
    all[next].focus();
  }
}
