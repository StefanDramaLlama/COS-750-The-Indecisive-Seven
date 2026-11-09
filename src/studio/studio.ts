import type {
  Example,
  Graph,
  LessonSummary,
  PracticeAction,
  PracticeFeedback,
  PracticeResponse,
  Positions,
  PublicLesson,
  Run,
  StudioView,
  TraceFrame,
} from "../shared/types.js";
import { ApiFailure, api, isAbort } from "./api.js";
import { CodeCard } from "./code-card.js";
import { h, icon } from "./dom.js";
import { GraphView } from "./graph-view.js";
import { renderPrimers } from "./primers.js";
import { navigate, studioUrl } from "./router.js";
import { changedKeys, renderLegend, renderResult, renderState, textSummary, vertexNotes } from "./state-panel.js";

type Speed = 0.5 | 1 | 2;
const BASE_DELAY = 1400;

interface PracticeState {
  response: PracticeResponse | null;
  frame: number;
  pending: boolean;
  error: { message: string; retry: PracticeAction | null; restart: boolean } | null;
  /** Options already tried and rejected at the open checkpoint. */
  wrong: Set<string>;
  selected: string | null;
  notes: string;
}

const freshPractice = (): PracticeState => ({
  response: null,
  frame: 0,
  pending: false,
  error: null,
  wrong: new Set(),
  selected: null,
  notes: "",
});

interface Els {
  tabs: Map<StudioView, HTMLButtonElement>;
  exampleBar: HTMLElement;
  scenario: HTMLElement;
  figure: HTMLElement;
  figureSlot: HTMLElement;
  figureStatus: HTMLElement;
  caption: HTMLElement;
  restart: HTMLButtonElement;
  back: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  speed: HTMLSelectElement;
  count: HTMLElement;
  scrubber: HTMLElement;
  state: HTMLElement;
  result: HTMLElement;
  asText: HTMLElement;
  right: HTMLElement;
  step: HTMLElement;
  log: HTMLElement;
  practice: HTMLElement;
  live: HTMLElement;
}

/**
 * One controller owns the Studio state: lesson, view, example, run, frame index,
 * playback and practice. Every panel reads the same frame from here.
 */
export class Studio {
  private lessons: LessonSummary[] = [];
  private completed = new Set<string>();
  private lesson: PublicLesson | null = null;
  private view: StudioView = "walkthrough";
  private exampleId = "";
  private run: Run | null = null;
  private runStatus: "idle" | "loading" | "error" = "idle";
  private runError = "";
  private frame = 0;
  private pendingFrame: number | null = null;
  private playing = false;
  private speed: Speed = 1;
  private timer: number | undefined;
  private practices = new Map<string, PracticeState>();
  private lessonAbort: AbortController | null = null;
  private runAbort: AbortController | null = null;
  private practiceAbort: AbortController | null = null;
  private els: Els | null = null;
  private code: CodeCard | null = null;
  private graphView: GraphView | null = null;
  private graphKey = "";
  private practiceSignature = "";

  constructor(
    private mount: HTMLElement,
    private onChange: () => void,
  ) {
    document.addEventListener("keydown", (e) => this.onKey(e));
  }

  /* ------------------------------------------------------------ public */

  setLessons(lessons: LessonSummary[]): void {
    this.lessons = lessons;
  }

  setCompleted(keys: Set<string>): void {
    this.completed = keys;
  }

  isComplete(l: { id: string; version: number }): boolean {
    return this.completed.has(`${l.id}@${l.version}`);
  }

  currentLessonId(): string | null {
    return this.lesson?.id ?? null;
  }

  /** Route entry point: show a lesson (or the picker) in a view. */
  async show(lessonId: string | null, view: StudioView): Promise<void> {
    if (!lessonId) {
      this.teardown();
      this.renderPicker(null);
      return;
    }
    if (this.lesson && this.lesson.id === lessonId && this.els) {
      this.setView(view);
      return;
    }
    this.teardown();
    this.view = view;
    this.mount.replaceChildren(h("div", { class: "studio" }, h("p", { class: "loading" }, "Loading lesson…")));
    const ctrl = new AbortController();
    this.lessonAbort = ctrl;
    try {
      const lesson = await api.lesson(lessonId, ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.lesson = lesson;
      this.exampleId = lesson.examples.find((e) => e.kind === "worked")!.id;
      // #step-N deep-links a walkthrough step (e.g. a teacher sharing the D = 12 → 7 moment).
      const m = location.hash.match(/^#step-(\d+)$/);
      if (m) this.pendingFrame = Math.max(0, Number(m[1]) - 1);
      this.buildLayout();
      this.onChange();
      void this.loadRun();
      if (view === "practice") void this.ensurePracticeStarted();
    } catch (err) {
      if (isAbort(err)) return;
      if (err instanceof ApiFailure && err.status === 404) {
        this.renderPicker(lessonId);
      } else {
        const retry = h("button", { type: "button", class: "btn" }, "Try again");
        retry.addEventListener("click", () => void this.show(lessonId, view));
        this.mount.replaceChildren(
          h("div", { class: "studio" }, h("div", { class: "error-box", role: "alert" }, h("p", {}, (err as Error).message), retry)),
        );
      }
    }
  }

  /* ---------------------------------------------------------- lifecycle */

  private teardown() {
    this.pause();
    this.lessonAbort?.abort();
    this.runAbort?.abort();
    this.practiceAbort?.abort();
    for (const p of this.practices.values()) p.pending = false;
    this.lesson = null;
    this.run = null;
    this.els = null;
    this.code = null;
    this.graphView = null;
    this.graphKey = "";
    this.practiceSignature = "";
    this.frame = 0;
    this.pendingFrame = null;
  }

  private setView(view: StudioView) {
    if (view === this.view) return;
    this.pause();
    this.view = view;
    if (view === "practice") void this.ensurePracticeStarted();
    this.arrangeRight();
    this.render();
  }

  private goView(view: StudioView) {
    if (!this.lesson) return;
    navigate(studioUrl(this.lesson.id, view));
  }

  /* ------------------------------------------------------------ picker */

  private renderPicker(unknownId: string | null) {
    const list = h(
      "ol",
      { class: "picker" },
      this.lessons.map((l) =>
        h(
          "li",
          {},
          h(
            "a",
            { href: studioUrl(l.id) },
            h("span", { class: "num" }, String(l.order)),
            h("span", { class: "title" }, l.title),
            h("span", { class: "approach" }, `${l.approach}. ${l.blurb}`),
            h("span", { class: `status${this.isComplete(l) ? " is-done" : ""}` }, this.isComplete(l) ? "✓ practised" : ""),
          ),
        ),
      ),
    );
    this.mount.replaceChildren(
      h(
        "div",
        { class: "page" },
        h("p", { class: "label page__eyebrow" }, "Algorithm Studio"),
        h("h1", {}, "Pick an algorithm to step through"),
        unknownId
          ? h(
              "div",
              { class: "notice", role: "status" },
              h("p", {}, `There is no lesson called “${unknownId}”. Choose one below, or `, h("a", { href: "/" }, "go back to the course"), "."),
            )
          : h(
              "p",
              { class: "page__lede" },
              "Each lesson has a worked walkthrough, the pseudocode line by line, and a short practice where you predict the next move.",
            ),
        list,
        h("p", { style: "margin-top: 28px" }, h("a", { href: "/" }, "← Back to the course")),
      ),
    );
  }

  /* ------------------------------------------------------------ layout */

  private buildLayout() {
    const lesson = this.lesson!;
    const tabs = new Map<StudioView, HTMLButtonElement>();
    const tabList = h("div", { class: "views", role: "tablist", "aria-label": "Lesson views" });
    (["walkthrough", "pseudocode", "practice"] as StudioView[]).forEach((v, i) => {
      const done = v === "practice" && this.isComplete(lesson) ? " ✓" : "";
      const btn = h(
        "button",
        { type: "button", role: "tab", id: `tab-${v}`, "aria-controls": "step-pane" },
        h("span", { class: "tab-num" }, `0${i + 1}`),
        v[0].toUpperCase() + v.slice(1) + done,
      );
      btn.addEventListener("click", () => this.goView(v));
      tabs.set(v, btn);
      tabList.append(btn);
    });
    tabList.addEventListener("keydown", (e) => {
      const order: StudioView[] = ["walkthrough", "pseudocode", "practice"];
      const i = order.indexOf(this.view);
      const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const v = order[(i + dir + order.length) % order.length];
      this.goView(v);
      tabs.get(v)!.focus();
    });

    const about = h(
      "details",
      { class: "about" },
      h("summary", {}, "Before you start: goals, vocabulary and graph primers"),
      h(
        "div",
        { class: "about__body" },
        h("section", {}, h("h3", {}, "You will be able to"), h("ul", {}, lesson.objectives.map((o) => h("li", {}, o)))),
        h("section", {}, h("h3", {}, "It helps to know"), h("ul", {}, lesson.prerequisites.map((o) => h("li", {}, o)))),
        h("section", {}, h("h3", {}, "Vocabulary"), h("dl", { class: "vocab" }, lesson.vocabulary.map((v) => [h("dt", {}, v.term), h("dd", {}, v.meaning)]))),
        renderPrimers(lesson.primers),
      ),
    );

    const head = h(
      "header",
      { class: "lesson-head" },
      h("p", { class: "label" }, `Algorithm Studio · Lesson ${lesson.order} of ${this.lessons.length || 6}`),
      h("div", { class: "lesson-head__title" }, h("h1", {}, lesson.title), h("span", { class: "lesson-head__approach" }, lesson.approach)),
      h("p", { class: "lesson-head__blurb" }, lesson.blurb),
      about,
      h("div", { class: "lesson-head__bar" }, tabList),
    );

    // Left pane: graph, controls, legend, state.
    const btn = (label: string, ic: SVGSVGElement, text: string, onClick: () => void, solid = false) => {
      const b = h("button", { type: "button", class: `btn${solid ? " btn--solid" : ""}`, "aria-label": label, title: label }, ic, text ? h("span", {}, text) : null);
      b.addEventListener("click", onClick);
      return b;
    };
    const restart = btn("Restart", icon.restart(), "", () => this.restart());
    const back = btn("Back one step", icon.back(), "Back", () => this.step(-1));
    const play = btn("Play", icon.play(), "Play", () => this.togglePlay());
    const next = btn("Next step", icon.next(), "Next", () => this.step(1), true);
    const speed = h(
      "select",
      { "aria-label": "Playback speed" },
      h("option", { value: "0.5" }, "0.5×"),
      h("option", { value: "1", selected: true }, "1×"),
      h("option", { value: "2" }, "2×"),
    );
    speed.addEventListener("change", () => {
      this.speed = Number(speed.value) as Speed;
      if (this.playing) this.schedule();
    });
    const count = h("span", { class: "controls__count", "aria-live": "off" });
    const scrubber = h("div", { class: "scrubber", "aria-hidden": "true" });

    const figureSlot = h("div", {});
    const figureStatus = h("div", { class: "figure__status", hidden: true });
    const caption = h("span", {});
    const figure = h(
      "figure",
      { class: "figure" },
      figureSlot,
      figureStatus,
      h("figcaption", {}, caption, h("span", { class: "label" }, lesson.approach)),
    );

    const exampleBar = h("div", { class: "example-bar" });
    const scenario = h("div", {});
    const state = h("div", {});
    const result = h("div", {});
    const asText = h("div", {});

    const left = h(
      "section",
      { class: "pane pane--graph", "aria-label": "Graph and algorithm state" },
      exampleBar,
      scenario,
      figure,
      h(
        "div",
        { class: "pane__section", style: "margin-top: 0" },
        h(
          "div",
          { class: "controls", role: "group", "aria-label": "Playback" },
          restart,
          back,
          play,
          next,
          h("label", { class: "speed" }, "Speed", speed),
          count,
        ),
        scrubber,
        h("p", { class: "kbd-hint" }, "Keyboard: ", h("kbd", {}, "←"), " ", h("kbd", {}, "→"), " to step, ", h("kbd", {}, "Space"), " on Play to start or pause."),
      ),
      h("div", { class: "pane__section" }, renderLegend(lesson.id)),
      h("div", { class: "pane__section" }, state),
      h("div", { class: "pane__section" }, result),
      h("details", { class: "as-text" }, h("summary", {}, "Graph and step as text"), asText),
    );

    const step = h("div", {});
    const log = h("div", {});
    const practice = h("div", {});
    const right = h("section", { class: "pane pane--step", id: "step-pane", role: "tabpanel", "aria-label": "Step-through" });
    this.code = new CodeCard(lesson.pseudocode, lesson.title);
    const live = h("div", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true" });

    this.mount.replaceChildren(h("div", { class: "studio" }, head, h("div", { class: "panes" }, left, right), live));
    this.els = {
      tabs,
      exampleBar,
      scenario,
      figure,
      figureSlot,
      figureStatus,
      caption,
      restart,
      back,
      play,
      next,
      speed,
      count,
      scrubber,
      state,
      result,
      asText,
      right,
      step,
      log,
      practice,
      live,
    };
    this.arrangeRight();
    this.render();
  }

  /** Place the shared right-pane blocks in the order each view needs. */
  private arrangeRight() {
    const e = this.els;
    if (!e || !this.code) return;
    for (const [v, b] of e.tabs) {
      b.setAttribute("aria-selected", String(v === this.view));
      b.tabIndex = v === this.view ? 0 : -1;
    }
    e.right.setAttribute("aria-labelledby", `tab-${this.view}`);
    const blocks: HTMLElement[] = [];
    if (this.view === "walkthrough") {
      this.code.setTall(false);
      blocks.push(e.step, h("div", { class: "pane__section" }, this.code.el), h("div", { class: "pane__section" }, h("p", { class: "block-title" }, "Steps so far"), e.log));
    } else if (this.view === "pseudocode") {
      this.code.setTall(true);
      blocks.push(
        this.code.el,
        h("div", { class: "pane__section" }, e.step),
        h("div", { class: "pane__section" }, h("p", { class: "block-title" }, "Cost"), h("p", { class: "complexity" }, this.lesson!.complexity)),
      );
    } else {
      blocks.push(e.practice);
    }
    e.right.replaceChildren(...blocks);
  }

  /* ------------------------------------------------------------- data */

  private currentExample(): Example | undefined {
    return this.lesson?.examples.find((x) => x.id === this.exampleId);
  }

  private practiceState(): PracticeState {
    const id = this.lesson!.id;
    let p = this.practices.get(id);
    if (!p) {
      p = freshPractice();
      this.practices.set(id, p);
    }
    return p;
  }

  private async loadRun() {
    const lesson = this.lesson;
    if (!lesson) return;
    this.runAbort?.abort();
    const ctrl = new AbortController();
    this.runAbort = ctrl;
    const exampleId = this.exampleId;
    this.run = null;
    this.runStatus = "loading";
    this.render();
    try {
      const run = await api.run(lesson.id, exampleId, ctrl.signal);
      // Ignore a late response for a lesson or example we have since left.
      if (ctrl.signal.aborted || this.lesson !== lesson || this.exampleId !== exampleId) return;
      this.run = run;
      this.runStatus = "idle";
      this.frame = Math.min(this.pendingFrame ?? 0, run.frames.length - 1);
      this.pendingFrame = null;
    } catch (err) {
      if (isAbort(err) || this.lesson !== lesson) return;
      this.runStatus = "error";
      this.runError = (err as Error).message;
    }
    this.render();
  }

  private selectExample(id: string) {
    if (id === this.exampleId) return;
    this.pause();
    this.exampleId = id;
    this.frame = 0;
    this.pendingFrame = null;
    void this.loadRun();
  }

  /* ---------------------------------------------------------- playback */

  private frames(): TraceFrame[] {
    if (this.view === "practice") return this.practiceState().response?.frames ?? [];
    return this.run?.frames ?? [];
  }

  private index(): number {
    return this.view === "practice" ? this.practiceState().frame : this.frame;
  }

  private setIndex(i: number, announce: boolean) {
    const frames = this.frames();
    if (frames.length === 0) return;
    const clamped = Math.max(0, Math.min(frames.length - 1, i));
    if (this.view === "practice") this.practiceState().frame = clamped;
    else this.frame = clamped;
    this.render();
    if (announce && this.els) {
      const f = frames[clamped];
      this.els.live.textContent = `Step ${clamped + 1} of ${frames.length}. ${f.title}. ${f.changed}`;
    }
  }

  private step(delta: number) {
    this.pause();
    this.setIndex(this.index() + delta, true);
  }

  private restart() {
    this.pause();
    this.setIndex(0, true);
  }

  private togglePlay() {
    if (this.playing) this.pause();
    else this.playFrom();
  }

  private playFrom() {
    const frames = this.frames();
    if (frames.length === 0) return;
    if (this.index() >= frames.length - 1) this.setIndex(0, false);
    this.playing = true;
    this.schedule();
    this.render();
  }

  private schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.playing) return;
      const frames = this.frames();
      const next = this.index() + 1;
      this.setIndex(next, false);
      if (next >= frames.length - 1) this.pause();
      else this.schedule();
    }, BASE_DELAY / this.speed);
  }

  private pause() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.playing) {
      this.playing = false;
      this.render();
    }
  }

  private onKey(e: KeyboardEvent) {
    if (!this.els || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [role=tablist], [role=radiogroup], .code, .toggle")) return;
    if (!this.mount.contains(t) && t !== document.body) return;
    e.preventDefault();
    this.step(e.key === "ArrowRight" ? 1 : -1);
  }

  /* ---------------------------------------------------------- practice */

  private async ensurePracticeStarted() {
    const p = this.practiceState();
    if (!p.response && !p.pending) await this.sendPractice({ type: "start" });
  }

  private async sendPractice(action: PracticeAction) {
    const lesson = this.lesson;
    if (!lesson) return;
    const p = this.practiceState();
    if (p.pending) return;
    p.pending = true;
    p.error = null;
    this.renderPractice();
    this.practiceAbort?.abort();
    const ctrl = new AbortController();
    this.practiceAbort = ctrl;
    const before = p.response?.prompt?.checkpointId ?? null;
    try {
      const res = await api.practice(
        {
          lessonId: lesson.id,
          exampleId: lesson.practice.exampleId,
          version: lesson.version,
          acceptedChoices: p.response?.acceptedChoices ?? [],
          action,
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted || this.lesson !== lesson) return;
      p.pending = false;
      p.response = res;
      if ((res.prompt?.checkpointId ?? null) !== before) {
        p.wrong = new Set();
        p.selected = null;
      }
      if (action.type === "answer" && res.feedback?.tone === "incorrect") p.wrong.add(action.optionId);
      // Show the newest revealed state, unless an incorrect answer left the graph where it was.
      if (res.feedback?.tone !== "incorrect" && res.feedback?.tone !== "hint") p.frame = res.frames.length - 1;
      else p.frame = Math.min(p.frame, res.frames.length - 1);
      if (res.status === "complete") {
        this.completed.add(`${lesson.id}@${lesson.version}`);
        this.onChange();
        const tab = this.els?.tabs.get("practice");
        if (tab && !tab.textContent?.includes("✓")) tab.append(" ✓");
      }
      if (res.feedback && this.els) this.els.live.textContent = `${toneWord(res.feedback)}. ${res.feedback.message}`;
    } catch (err) {
      if (isAbort(err) || this.lesson !== lesson) return;
      p.pending = false;
      const status = err instanceof ApiFailure ? err.status : 0;
      p.error = {
        message: (err as Error).message,
        retry: status === 0 || status >= 500 ? action : null,
        restart: status === 409 || status === 422,
      };
    }
    this.render();
    if (this.view === "practice") {
      // Move focus to something sensible after the panel re-renders.
      const target =
        this.els?.practice.querySelector<HTMLElement>(".feedback") ?? this.els?.practice.querySelector<HTMLElement>(".checkpoint legend");
      target?.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: false });
    }
  }

  private restartPractice() {
    if (!this.lesson) return;
    this.practiceAbort?.abort();
    this.practices.set(this.lesson.id, freshPractice());
    this.render();
    void this.sendPractice({ type: "start" });
  }

  private jumpToWalkthrough(exampleId: string, frame: number) {
    if (!this.lesson) return;
    this.pause();
    if (exampleId !== this.exampleId || !this.run) {
      this.exampleId = exampleId;
      this.pendingFrame = frame;
      void this.loadRun();
    } else {
      this.frame = Math.min(frame, this.run.frames.length - 1);
    }
    this.goView("walkthrough");
  }

  /* ------------------------------------------------------------ render */

  private render() {
    const e = this.els;
    const lesson = this.lesson;
    if (!e || !lesson) return;
    const practice = this.view === "practice";
    const p = this.practiceState();

    // Example and scenario
    let graph: Graph | undefined;
    let positions: Positions | undefined;
    let example: Example | undefined;
    if (practice) {
      example = lesson.examples.find((x) => x.id === lesson.practice.exampleId);
      graph = p.response?.graph ?? example?.graph;
      positions = p.response?.positions ?? example?.positions;
      e.exampleBar.replaceChildren(h("span", { class: "label" }, "Practice scenario"), h("span", { class: "label" }, example?.title ?? ""));
    } else {
      example = this.currentExample();
      graph = this.run?.graph ?? example?.graph;
      positions = this.run?.positions ?? example?.positions;
      const walkable = lesson.examples.filter((x) => x.kind !== "practice");
      const select = h(
        "select",
        { id: "example-select" },
        walkable.map((x) => h("option", { value: x.id, selected: x.id === this.exampleId }, `${x.kind === "worked" ? "Worked example" : "Variant"}: ${x.title}`)),
      );
      select.addEventListener("change", () => this.selectExample(select.value));
      e.exampleBar.replaceChildren(h("label", { class: "label", for: "example-select" }, "Example"), select);
    }
    e.scenario.replaceChildren(
      h("p", { class: "scenario" }, example?.scenario ?? ""),
      example?.assumptions.length ? h("ul", { class: "assumptions" }, example.assumptions.map((a) => h("li", {}, a))) : "",
    );

    // Figure: rebuild only when the example changes.
    const key = practice ? `practice:${lesson.practice.exampleId}` : `walk:${this.exampleId}`;
    if (graph && positions && key !== this.graphKey) {
      this.graphView = new GraphView(graph, positions, {
        title: `${example?.title ?? "Graph"}`,
        startId: example?.startId,
        goalId: example?.goalId,
      });
      e.figureSlot.replaceChildren(this.graphView.root);
      this.graphKey = key;
    }
    e.caption.textContent = `Fig. ${lesson.order}${practice ? "P" : ""} — ${example?.title ?? ""}`;

    const frames = this.frames();
    const i = this.index();
    const frame = frames[i] ?? null;
    const prev = i > 0 ? frames[i - 1] : null;
    const loading = practice ? p.pending && !p.response : this.runStatus === "loading";
    const failed = !practice && this.runStatus === "error";
    e.figureStatus.hidden = !(loading || failed);
    if (failed) {
      const retry = h("button", { type: "button", class: "btn" }, "Try again");
      retry.addEventListener("click", () => void this.loadRun());
      e.figureStatus.replaceChildren(h("div", { class: "error-box", role: "alert" }, h("p", {}, this.runError), retry));
    } else if (loading) {
      e.figureStatus.replaceChildren(h("span", { class: "loading" }, "Loading…"));
    }

    if (graph) {
      const notes = vertexNotes(frame?.state, graph);
      const prevNotes = prev ? vertexNotes(prev.state, graph) : null;
      this.graphView?.update(frame?.highlights ?? null, notes, changedKeys(notes, prevNotes));
    }

    // Controls
    const n = frames.length;
    e.back.disabled = n === 0 || i <= 0;
    e.restart.disabled = n === 0 || i <= 0;
    e.next.disabled = n === 0 || i >= n - 1;
    e.play.disabled = n <= 1;
    e.play.replaceChildren(this.playing ? icon.pause() : icon.play(), h("span", {}, this.playing ? "Pause" : "Play"));
    e.play.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    e.play.setAttribute("aria-pressed", String(this.playing));
    e.count.replaceChildren(n ? `Step ${i + 1}` : "Step —", h("span", {}, ` / ${n || "—"}`));
    const total = practice && p.response?.status !== "complete" ? n + 1 : n;
    e.scrubber.replaceChildren(
      ...Array.from({ length: Math.max(total, 1) }, (_, k) => h("span", { class: k < i ? "is-past" : k === i ? "is-now" : "" })),
    );

    // State, result, text summary
    e.state.replaceChildren(graph ? renderState(frame, prev, graph) : "");
    const result = practice ? (p.response?.status === "complete" ? p.response.result : undefined) : this.run?.result;
    const atEnd = n > 0 && i === n - 1;
    e.result.replaceChildren(result && graph && atEnd ? renderResult(result, graph) : "");
    e.asText.replaceChildren(graph ? textSummary(graph, frame) : "");

    // Right pane
    if (practice) {
      this.renderPractice();
    } else {
      this.code?.setExec(frame?.lineId ?? null);
      this.renderStep(frame, n);
      if (this.view === "walkthrough") this.renderLog(frames, i);
    }
  }

  private renderStep(frame: TraceFrame | null, n: number) {
    const e = this.els!;
    const compact = this.view === "pseudocode";
    if (!frame) {
      e.step.replaceChildren(h("p", { class: "loading" }, this.runStatus === "error" ? "The run could not be loaded." : "Preparing the run…"));
      return;
    }
    const lineIdx = this.lesson!.pseudocode.findIndex((l) => l.id === frame.lineId);
    e.step.replaceChildren(
      h(
        "article",
        { class: `step${compact ? " step--compact" : ""}`, "aria-label": "Current step" },
        h("p", { class: "step__count" }, h("span", { class: "step__num" }, String(frame.index + 1)), h("span", { class: "step__of" }, `of ${n} · ${lineIdx >= 0 ? `line ${lineIdx + 1}` : "before line 1"}`)),
        h("h2", { class: "step__title" }, frame.title),
        h(
          "dl",
          { class: "step__notes" },
          h("div", {}, h("dt", {}, "What changed"), h("dd", {}, frame.changed)),
          compact ? null : h("div", {}, h("dt", {}, "Why"), h("dd", {}, frame.why)),
        ),
      ),
    );
  }

  private renderLog(frames: TraceFrame[], i: number) {
    const e = this.els!;
    const hadFocus = e.log.contains(document.activeElement);
    const list = h(
      "ol",
      { class: "log" },
      frames.slice(0, i + 1).map((f) => {
        const b = h("button", { type: "button", "aria-current": f.index === i ? "step" : null }, h("span", { class: "n" }, String(f.index + 1)), h("span", {}, f.title));
        b.addEventListener("click", () => {
          this.pause();
          this.setIndex(f.index, true);
        });
        return h("li", {}, b);
      }),
    );
    e.log.replaceChildren(list);
    list.scrollTop = list.scrollHeight;
    if (hadFocus) list.querySelector<HTMLElement>("[aria-current=step]")?.focus();
  }

  private renderPractice() {
    const e = this.els;
    const lesson = this.lesson;
    if (!e || !lesson || this.view !== "practice") return;
    const p = this.practiceState();
    const res = p.response;
    // Stepping through frames must not rebuild the form (focus, notes and selection live there).
    const signature = JSON.stringify([lesson.id, res?.acceptedChoices, res?.prompt?.checkpointId, res?.feedback, res?.status, p.pending, p.error, [...p.wrong]]);
    if (signature === this.practiceSignature && e.practice.isConnected) return;
    this.practiceSignature = signature;
    const total = res?.prompt?.total ?? lesson.practice.checkpointCount;
    const doneCount = res ? res.acceptedChoices.length : 0;

    const intro = h(
      "div",
      { class: "practice__intro" },
      h("p", { class: "label" }, "Practice"),
      h("h2", {}, "Now you drive"),
      h("p", { class: "scenario" }, lesson.practice.scenario),
    );
    const dots = h(
      "div",
      { style: "display:flex;align-items:center" },
      h(
        "ol",
        { class: "dots", "aria-hidden": "true" },
        Array.from({ length: total }, (_, k) => h("li", { class: k < doneCount ? "is-done" : k === doneCount && res?.status !== "complete" ? "is-open" : "" })),
      ),
      h("span", { class: "dots__text" }, `${doneCount} of ${total} checkpoints`),
    );

    const blocks: (HTMLElement | null)[] = [intro, dots];

    if (p.error) {
      const actions = h("div", { class: "checkpoint__actions" });
      if (p.error.retry) {
        const retry = h("button", { type: "button", class: "btn" }, "Try again");
        const action = p.error.retry;
        retry.addEventListener("click", () => void this.sendPractice(action));
        actions.append(retry);
      }
      if (p.error.restart) {
        const restart = h("button", { type: "button", class: "btn" }, "Restart practice");
        restart.addEventListener("click", () => this.restartPractice());
        actions.append(restart);
      }
      blocks.push(h("div", { class: "error-box", role: "alert" }, h("p", {}, p.error.message), actions));
    }

    if (!res) {
      blocks.push(h("p", { class: "loading" }, p.pending ? "Setting up the practice…" : ""));
    } else if (res.prompt) {
      const prompt = res.prompt;
      const name = `cp-${prompt.checkpointId}`;
      const submit = h("button", { type: "submit", class: "btn btn--solid", disabled: p.pending || !p.selected }, p.pending ? "Checking…" : "Check answer");
      const hint = h("button", { type: "button", class: "btn", disabled: p.pending }, "Hint");
      hint.addEventListener("click", () => void this.sendPractice({ type: "hint", checkpointId: prompt.checkpointId }));
      const form = h(
        "form",
        { class: "checkpoint", novalidate: true },
        h(
          "fieldset",
          { disabled: p.pending },
          h("legend", {}, h("span", { class: "label" }, `Checkpoint ${prompt.number} of ${prompt.total}`), h("span", { class: "q" }, prompt.question)),
          h(
            "div",
            { class: "options" },
            prompt.options.map((o) => {
              const wrong = p.wrong.has(o.id);
              const input = h("input", { type: "radio", name, value: o.id, checked: p.selected === o.id });
              input.addEventListener("change", () => {
                p.selected = o.id;
                submit.disabled = p.pending;
              });
              return h("label", { class: `option${wrong ? " is-wrong" : ""}` }, input, h("span", {}, o.label), wrong ? h("span", { class: "tag" }, "tried") : null);
            }),
          ),
        ),
        h("div", { class: "checkpoint__actions" }, submit, hint),
      );
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (p.selected && !p.pending) void this.sendPractice({ type: "answer", checkpointId: prompt.checkpointId, optionId: p.selected });
      });
      blocks.push(form);
      if (res.feedback) blocks.push(this.feedbackBlock(res.feedback, prompt.walkthroughExampleId, prompt.walkthroughFrame));
    } else {
      // Complete
      if (res.feedback) blocks.push(this.feedbackBlock(res.feedback, "", null));
      const notes = h("textarea", { id: "reflection-notes", placeholder: "Write a sentence or two. This stays in your browser tab." });
      notes.value = p.notes;
      notes.addEventListener("input", () => (p.notes = notes.value));
      const again = h("button", { type: "button", class: "btn" }, "Practise again");
      again.addEventListener("click", () => this.restartPractice());
      const toWalk = h("button", { type: "button", class: "btn btn--quiet" }, "Back to the walkthrough");
      toWalk.addEventListener("click", () => this.goView("walkthrough"));
      blocks.push(
        res.result ? renderResult(res.result, res.graph, "Your result") : null,
        h(
          "div",
          { class: "reflection" },
          h("label", { class: "label", for: "reflection-notes" }, "Connect it to the rule"),
          h("p", {}, res.reflection ?? ""),
          notes,
          h("small", {}, "Completion is saved for this browser. Your notes are not sent anywhere."),
        ),
        h("div", { class: "checkpoint__actions" }, again, toWalk),
      );
    }
    e.practice.replaceChildren(h("div", { class: "practice" }, ...blocks.filter((b): b is HTMLElement => !!b)));
  }

  private feedbackBlock(fb: PracticeFeedback, exampleId: string, frame: number | null): HTMLElement {
    const links = h("div", { class: "feedback__links" });
    if (frame !== null && exampleId && (fb.tone === "incorrect" || fb.tone === "hint")) {
      const go = h("button", { type: "button", class: "btn btn--quiet" }, `See this move in the walkthrough (step ${frame + 1}) →`);
      go.addEventListener("click", () => this.jumpToWalkthrough(exampleId, frame));
      links.append(go);
    }
    if (fb.tone === "incorrect") links.prepend(h("span", { class: "label", style: "align-self:center" }, "Pick another option and check again"));
    return h(
      "div",
      { class: `feedback feedback--${fb.tone}`, role: fb.tone === "incorrect" ? "alert" : "status" },
      h("span", { class: "feedback__tone" }, toneWord(fb)),
      h("p", { class: "feedback__msg" }, fb.message),
      links.childElementCount ? links : "",
    );
  }
}

function toneWord(fb: PracticeFeedback): string {
  return { correct: "Correct", incorrect: "Not quite", hint: "Hint", info: "Note" }[fb.tone];
}
