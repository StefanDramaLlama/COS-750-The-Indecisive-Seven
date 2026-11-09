// Floating study helper: a side panel chat that answers questions about what is on screen,
// can rewrite an answer simpler or in more detail, and reads answers aloud.
import type { TutorMessage, TutorMode } from "../shared/types.js";
import { ApiFailure, api, isAbort } from "./api.js";
import { h, s } from "./dom.js";

interface Entry extends TutorMessage {
  id: number;
  variant?: "simpler" | "deeper";
  error?: boolean;
}

const SUGGESTIONS = [
  "Explain what just happened in this step.",
  "Why does the highlighted pseudocode line matter here?",
  "What should I watch for in the next step?",
  "Give me a real-world example of this algorithm.",
];

const svg = (d: string, filled = false) =>
  s(
    "svg",
    { viewBox: "0 0 16 16", "aria-hidden": "true", width: 16, height: 16 },
    s("path", { d, fill: filled ? "currentColor" : "none", stroke: filled ? "none" : "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
const ICON = {
  chat: () => svg("M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"),
  speaker: () => svg("M2.5 6h2.5l3-2.5v9L5 10H2.5zM10.5 5.5a3.5 3.5 0 0 1 0 5M12 3.5a6 6 0 0 1 0 9"),
  stop: () => svg("M4 4h8v8H4z", true),
  close: () => svg("M4 4l8 8M12 4l-8 8"),
};

/* ------------------------------------------------------------ markdown */

/** Render the small markdown subset the helper uses, building DOM nodes (never innerHTML). */
export function renderMarkdown(text: string): HTMLElement {
  const root = h("div", { class: "md" });
  const inline = (src: string): (Node | string)[] => {
    const out: (Node | string)[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
    let last = 0;
    for (const m of src.matchAll(re)) {
      if (m.index! > last) out.push(src.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(h("strong", {}, t.slice(2, -2)));
      else if (t.startsWith("`")) out.push(h("code", {}, t.slice(1, -1)));
      else out.push(h("em", {}, t.slice(1, -1)));
      last = m.index! + t.length;
    }
    if (last < src.length) out.push(src.slice(last));
    return out;
  };
  const lines = text.replace(/\r/g, "").split("\n");
  let list: HTMLElement | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) root.append(h("p", {}, inline(para.join(" "))));
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = h(tag, {});
        root.append(list);
      }
      list.append(h("li", {}, inline((bullet ?? numbered)![1])));
      continue;
    }
    list = null;
    if (!line) flushPara();
    else para.push(line.replace(/^#+\s*/, ""));
  }
  flushPara();
  return root;
}

/* -------------------------------------------------------------- speech */

/** Split text into sentence-aligned chunks small enough for one TTS call. */
export function chunkForSpeech(text: string, max = 900): string[] {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?:])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const sentence of sentences) {
    if (cur && (cur + " " + sentence).length > max) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${sentence}` : sentence.slice(0, max);
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

class Speaker {
  private audio = new Audio();
  private abort: AbortController | null = null;
  private cache = new Map<string, string>();
  private playingId: number | null = null;
  private onState: (id: number, state: "idle" | "loading" | "playing", note?: string) => void;

  constructor(onState: Speaker["onState"]) {
    this.onState = onState;
  }

  isActive(id: number) {
    return this.playingId === id;
  }

  stop() {
    this.abort?.abort();
    this.abort = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (this.playingId !== null) this.onState(this.playingId, "idle");
    this.playingId = null;
  }

  private async fetchChunk(text: string, signal: AbortSignal): Promise<string> {
    const hit = this.cache.get(text);
    if (hit) return hit;
    const { data, mimeType } = await api.tts(text, signal);
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    this.cache.set(text, url);
    return url;
  }

  private playUrl(url: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("playback failed"));
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("aborted", "AbortError"));
      };
      const cleanup = () => {
        this.audio.removeEventListener("ended", done);
        this.audio.removeEventListener("error", fail);
        signal.removeEventListener("abort", abort);
      };
      this.audio.addEventListener("ended", done);
      this.audio.addEventListener("error", fail);
      signal.addEventListener("abort", abort);
      this.audio.src = url;
      this.audio.play().catch(fail);
    });
  }

  /** Play the AI voice; fall back to the browser's own voice if the AI voice is unavailable. */
  async speak(id: number, text: string) {
    this.stop();
    this.playingId = id;
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.onState(id, "loading");
    const chunks = chunkForSpeech(text);
    try {
      let next = this.fetchChunk(chunks[0], ctrl.signal);
      for (let i = 0; i < chunks.length; i++) {
        const url = await next;
        // Prefetch the following chunk while this one plays.
        if (i + 1 < chunks.length) {
          next = this.fetchChunk(chunks[i + 1], ctrl.signal);
          next.catch(() => {});
        }
        this.onState(id, "playing");
        await this.playUrl(url, ctrl.signal);
      }
      if (this.playingId === id) this.stop();
    } catch (err) {
      if (isAbort(err) || ctrl.signal.aborted) return;
      this.browserVoice(id, text, err instanceof ApiFailure && err.status === 429 ? "AI voice quota reached" : "AI voice unavailable");
    }
  }

  private browserVoice(id: number, text: string, reason: string) {
    if (!("speechSynthesis" in window)) {
      this.onState(id, "idle", `${reason}, and this browser has no built-in voice.`);
      this.playingId = null;
      return;
    }
    const plain = text.replace(/[*`#]/g, "").replace(/→/g, " to ").replace(/←/g, " becomes ").replace(/∞/g, "infinity");
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 1;
    u.onend = () => {
      if (this.playingId === id) {
        this.playingId = null;
        this.onState(id, "idle");
      }
    };
    this.onState(id, "playing", `${reason}; using your browser's voice instead.`);
    speechSynthesis.speak(u);
  }
}

/* --------------------------------------------------------------- panel */

export class TutorPanel {
  private fab: HTMLButtonElement;
  private panel: HTMLElement;
  private log: HTMLElement;
  private input: HTMLTextAreaElement;
  private send: HTMLButtonElement;
  private contextLine: HTMLElement;
  private entries: Entry[] = [];
  private nextId = 1;
  private pending = false;
  private abort: AbortController | null = null;
  private speaker: Speaker;
  private speakButtons = new Map<number, { btn: HTMLButtonElement; note: HTMLElement }>();

  constructor(
    private getContext: () => { label: string; text: string },
  ) {
    this.fab = h(
      "button",
      { type: "button", class: "tutor-fab", "aria-expanded": "false", "aria-controls": "tutor-panel", "aria-label": "Ask the study helper about this page" },
      ICON.chat(),
      h("span", {}, "Ask about this page"),
    );
    this.fab.addEventListener("click", () => this.toggle());

    this.contextLine = h("p", { class: "tutor__context" });
    this.log = h("div", { class: "tutor__log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
    this.input = h("textarea", { id: "tutor-input", rows: 2, maxlength: 2000, placeholder: "Ask about the step, the code or the graph…" });
    this.send = h("button", { type: "submit", class: "btn btn--solid" }, "Ask");
    const form = h(
      "form",
      { class: "tutor__composer" },
      h("label", { for: "tutor-input", class: "sr-only" }, "Your question"),
      this.input,
      this.send,
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.ask(this.input.value);
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.ask(this.input.value);
      }
    });

    const close = h("button", { type: "button", class: "tutor__icon-btn", "aria-label": "Close study helper" }, ICON.close());
    close.addEventListener("click", () => this.close());
    const reset = h("button", { type: "button", class: "btn btn--quiet" }, "New chat");
    reset.addEventListener("click", () => this.reset());

    this.panel = h(
      "aside",
      { id: "tutor-panel", class: "tutor", role: "dialog", "aria-modal": "false", "aria-labelledby": "tutor-title", hidden: true },
      h(
        "header",
        { class: "tutor__head" },
        h("div", {}, h("p", { class: "label" }, "Study helper · AI"), h("h2", { id: "tutor-title" }, "Ask about this page")),
        h("div", { class: "tutor__head-actions" }, reset, close),
      ),
      this.contextLine,
      this.log,
      form,
      h("p", { class: "tutor__fine" }, "AI can make mistakes. Check answers against the walkthrough. Your question and the text on screen are sent to Google's Gemini API."),
    );
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });

    this.speaker = new Speaker((id, state, note) => this.setSpeakState(id, state, note));
    document.body.append(this.fab, this.panel);
    this.renderLog();
  }

  /* ------------------------------------------------------------ open/close */

  private toggle() {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  open() {
    this.refreshContext();
    this.panel.hidden = false;
    this.fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("tutor-open");
    this.input.focus();
  }

  close() {
    this.panel.hidden = true;
    this.fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("tutor-open");
    this.speaker.stop();
    this.fab.focus();
  }

  /** Called on navigation so the "Reading:" line tracks the page. */
  refreshContext() {
    const { label } = this.getContext();
    this.contextLine.replaceChildren("Reading: ", h("strong", {}, label));
  }

  private reset() {
    this.abort?.abort();
    this.speaker.stop();
    this.entries = [];
    this.pending = false;
    this.renderLog();
    this.input.focus();
  }

  /* -------------------------------------------------------------- talking */

  private history(upTo?: number): TutorMessage[] {
    const list = upTo === undefined ? this.entries : this.entries.slice(0, this.entries.findIndex((e) => e.id === upTo) + 1);
    return list.filter((e) => !e.error).map(({ role, text }) => ({ role, text }));
  }

  private async ask(raw: string) {
    const text = raw.trim();
    if (!text || this.pending) return;
    this.input.value = "";
    this.entries.push({ id: this.nextId++, role: "user", text });
    await this.request("answer", this.history());
  }

  private async rewrite(entry: Entry, mode: Exclude<TutorMode, "answer">) {
    if (this.pending) return;
    await this.request(mode, this.history(entry.id), mode);
  }

  private async request(mode: TutorMode, messages: TutorMessage[], variant?: Entry["variant"]) {
    this.pending = true;
    this.refreshContext();
    this.renderLog();
    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const reply = await api.tutor({ mode, context: this.getContext().text, messages }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.entries.push({ id: this.nextId++, role: "model", text: reply, variant });
    } catch (err) {
      if (isAbort(err)) return;
      this.entries.push({ id: this.nextId++, role: "model", text: (err as Error).message, error: true });
    } finally {
      if (this.abort === ctrl) {
        this.pending = false;
        this.abort = null;
      }
    }
    this.renderLog();
    this.input.focus();
  }

  /* --------------------------------------------------------------- render */

  private renderLog() {
    this.send.disabled = this.pending;
    this.speakButtons.clear();
    const nodes: HTMLElement[] = [];
    if (this.entries.length === 0) {
      nodes.push(
        h(
          "div",
          { class: "tutor__intro" },
          h("p", {}, "Ask anything about the lesson on screen. The helper reads the current step, pseudocode and state table, so you can ask “why” questions about exactly what you see."),
          h(
            "div",
            { class: "tutor__suggestions" },
            SUGGESTIONS.map((q) => {
              const b = h("button", { type: "button", class: "chip" }, q);
              b.addEventListener("click", () => void this.ask(q));
              return b;
            }),
          ),
        ),
      );
    }
    for (const e of this.entries) nodes.push(e.role === "user" ? this.userNode(e) : this.modelNode(e));
    if (this.pending) nodes.push(h("div", { class: "msg msg--ai is-pending", "aria-busy": "true" }, h("span", { class: "label" }, "Helper"), h("p", { class: "loading" }, "Thinking…")));
    this.log.replaceChildren(...nodes);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private userNode(e: Entry) {
    return h("div", { class: "msg msg--user" }, h("span", { class: "label" }, "You"), h("p", {}, e.text));
  }

  private modelNode(e: Entry) {
    const label = e.error ? "Helper · couldn't answer" : e.variant === "simpler" ? "Helper · simpler" : e.variant === "deeper" ? "Helper · in more detail" : "Helper";
    if (e.error) {
      return h("div", { class: "msg msg--ai msg--error", role: "alert" }, h("span", { class: "label" }, label), h("p", {}, e.text));
    }
    const speak = h("button", { type: "button", class: "msg__btn", "aria-label": "Read this answer aloud" }, ICON.speaker(), h("span", {}, "Listen"));
    const note = h("p", { class: "msg__note", "aria-live": "polite" });
    speak.addEventListener("click", () => {
      if (this.speaker.isActive(e.id)) this.speaker.stop();
      else void this.speaker.speak(e.id, e.text);
    });
    this.speakButtons.set(e.id, { btn: speak, note });
    if (this.speaker.isActive(e.id)) this.paintSpeak(speak, "playing");
    const simpler = h("button", { type: "button", class: "msg__btn", disabled: this.pending }, "Simpler");
    simpler.addEventListener("click", () => void this.rewrite(e, "simpler"));
    const deeper = h("button", { type: "button", class: "msg__btn", disabled: this.pending }, "More detail");
    deeper.addEventListener("click", () => void this.rewrite(e, "deeper"));
    return h(
      "div",
      { class: "msg msg--ai" },
      h("span", { class: "label" }, label),
      renderMarkdown(e.text),
      h("div", { class: "msg__actions", role: "group", "aria-label": "Answer options" }, speak, simpler, deeper),
      note,
    );
  }

  private paintSpeak(btn: HTMLButtonElement, state: "idle" | "loading" | "playing") {
    btn.replaceChildren(state === "idle" ? ICON.speaker() : ICON.stop(), h("span", {}, state === "idle" ? "Listen" : state === "loading" ? "Preparing…" : "Stop"));
    btn.setAttribute("aria-label", state === "idle" ? "Read this answer aloud" : "Stop reading");
    btn.setAttribute("aria-pressed", String(state !== "idle"));
    btn.classList.toggle("is-on", state !== "idle");
  }

  private setSpeakState(id: number, state: "idle" | "loading" | "playing", note?: string) {
    const ref = this.speakButtons.get(id);
    if (!ref) return;
    this.paintSpeak(ref.btn, state);
    if (note !== undefined) ref.note.textContent = note;
  }
}

/** Capture what the learner can see: lesson, view, step, visible text and the graph description. */
export function captureScreen(): { label: string; text: string } {
  const app = document.getElementById("app");
  const title = app?.querySelector("h1")?.textContent?.trim() ?? document.title;
  const tab = app?.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.replace(/^\d+\s*/, "").replace("✓", "").trim();
  const step = app?.querySelector(".controls__count")?.textContent?.replace(/\s+/g, " ").trim();
  const label = [title, tab, step].filter(Boolean).join(" · ");
  const visible = (app?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
  // The text description sits in a collapsed <details>, so read it node by node.
  const graphText = [...(app?.querySelectorAll(".as-text > div p, .as-text > div li") ?? [])].map((n) => n.textContent?.trim()).join("\n");
  const text = [`Page: ${label}`, `Address: ${location.pathname}${location.search}`, "", visible, graphText ? `\nGraph description: ${graphText}` : ""].join("\n");
  return { label, text: text.slice(0, 14_000) };
}
