type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false | Child[];

function apply(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** Create an HTML element: h("p", {class: "x"}, "text"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": 1.8 };

/** Small inline icons drawn in currentColor. */
export const icon = {
  back: () => s("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, s("path", { d: "M9 2 4 7l5 5", ...stroke })),
  next: () => s("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, s("path", { d: "m5 2 5 5-5 5", ...stroke })),
  play: () => s("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, s("path", { d: "M3.5 2v10l8.5-5z", fill: "currentColor" })),
  pause: () =>
    s("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, s("path", { d: "M3.5 2h2.5v10H3.5zM8 2h2.5v10H8z", fill: "currentColor" })),
  restart: () =>
    s("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, s("path", { d: "M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 1.5v3h3", ...stroke })),
};
