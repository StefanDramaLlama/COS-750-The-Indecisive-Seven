import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { AcceptedChoice, LessonId, PracticeRequest, PracticeResponse } from "../src/shared/types.js";
import { migrate, setDb } from "../src/server/db.js";
import { lessonsHandler, practiceHandler, progressHandler, runsHandler } from "../src/server/handlers.js";
import type { ApiRequest } from "../src/server/http.js";
import { LESSONS, getLesson, validateCatalog } from "../src/server/lessons/catalog.js";
import { evaluatePractice } from "../src/server/practice.js";
import { markCompleted, markStarted } from "../src/server/progress.js";

const req = (over: Partial<ApiRequest>): ApiRequest => ({ method: "GET", query: {}, body: undefined, cookies: {}, secure: false, ...over });

function practiceReq(lessonId: LessonId, accepted: AcceptedChoice[], action: PracticeRequest["action"]): PracticeRequest {
  const l = getLesson(lessonId)!;
  return { lessonId, exampleId: l.practice.exampleId, version: l.version, acceptedChoices: accepted, action };
}

/** Answer every checkpoint with its first correct option. */
function completePractice(lessonId: LessonId, pick?: (cpId: string, correct: string[]) => string): PracticeResponse {
  const lesson = getLesson(lessonId)!;
  let res = evaluatePractice(practiceReq(lessonId, [], { type: "start" })).response;
  let guard = 0;
  while (res.prompt && guard++ < 10) {
    const cp = lesson.practice.build(res.acceptedChoices).checkpoints[res.acceptedChoices.length];
    const option = pick ? pick(cp.id, cp.correct) : cp.correct[0];
    res = evaluatePractice(practiceReq(lessonId, res.acceptedChoices, { type: "answer", checkpointId: cp.id, optionId: option })).response;
    expect(res.feedback?.tone).toBe("correct");
  }
  return res;
}

describe("catalog", () => {
  it("validates with no problems", () => expect(validateCatalog()).toEqual([]));
  it("exposes all six stable lesson ids", () => {
    expect(LESSONS.map((l) => l.id)).toEqual(["dijkstra", "bfs", "dfs", "topological-sort", "kruskal", "prim"]);
  });
});

describe("practice replay", () => {
  it("every lesson's practice can be completed", () => {
    for (const l of LESSONS) {
      const res = completePractice(l.id);
      expect(res.status).toBe("complete");
      expect(res.reflection).toBeTruthy();
      expect(res.result).toBeTruthy();
    }
  });

  it("an incorrect answer keeps the same checkpoint and reveals nothing new", () => {
    const start = evaluatePractice(practiceReq("dijkstra", [], { type: "start" })).response;
    const wrong = evaluatePractice(
      practiceReq("dijkstra", [], { type: "answer", checkpointId: start.prompt!.checkpointId, optionId: "B" }),
    ).response;
    expect(wrong.feedback?.tone).toBe("incorrect");
    expect(wrong.feedback?.message).toMatch(/smallest tentative distance/);
    expect(wrong.prompt?.checkpointId).toBe(start.prompt!.checkpointId);
    expect(wrong.frames).toHaveLength(start.frames.length);
  });

  it("returns a hint without advancing", () => {
    const start = evaluatePractice(practiceReq("bfs", [], { type: "start" })).response;
    const hint = evaluatePractice(practiceReq("bfs", [], { type: "hint", checkpointId: start.prompt!.checkpointId })).response;
    expect(hint.feedback?.tone).toBe("hint");
    expect(hint.acceptedChoices).toEqual([]);
  });

  it("never sends future frames or answers", () => {
    const start = evaluatePractice(practiceReq("dijkstra", [], { type: "start" })).response;
    const full = getLesson("dijkstra")!.practice.build([]).trace.frames.length;
    expect(start.frames.length).toBeLessThan(full);
    const json = JSON.stringify(start);
    expect(json).not.toMatch(/"correct"/);
    expect(json).not.toMatch(/feedback":"Right/);
    expect(start.result).toBeUndefined();
  });

  it("keeps revealed frame indexes stable across responses", () => {
    const a = evaluatePractice(practiceReq("kruskal", [], { type: "start" })).response;
    const b = completePractice("kruskal");
    expect(JSON.stringify(b.frames.slice(0, a.frames.length))).toBe(JSON.stringify(a.frames));
  });

  it("Kahn accepts both branches and continues from the learner's choice", () => {
    for (const choice of ["B", "C"]) {
      const res = completePractice("topological-sort", (cpId, correct) => (cpId === "choose-next" ? choice : correct[0]));
      expect(res.result).toMatchObject({ kind: "order" });
      if (res.result?.kind === "order") expect(res.result.order[1]).toBe(choice);
    }
  });

  it("rejects invalid decision history with 422", () => {
    expect(() =>
      evaluatePractice(practiceReq("dijkstra", [{ checkpointId: "select-next", optionId: "B" }], { type: "start" })),
    ).toThrow(expect.objectContaining({ status: 422 }));
    expect(() =>
      evaluatePractice(practiceReq("dijkstra", [{ checkpointId: "route", optionId: "acd-5" }], { type: "start" })),
    ).toThrow(expect.objectContaining({ status: 422 }));
  });

  it("rejects a stale lesson version with 409", () => {
    const r = practiceReq("prim", [], { type: "start" });
    expect(() => evaluatePractice({ ...r, version: r.version + 1 })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("rejects an answer for a checkpoint that is not open", () => {
    expect(() =>
      evaluatePractice(practiceReq("prim", [], { type: "answer", checkpointId: "weight", optionId: "3" })),
    ).toThrow(expect.objectContaining({ status: 422 }));
  });
});

describe("HTTP handlers", () => {
  beforeEach(async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    setDb(db);
  });

  it("GET /api/lessons lists the lessons; ?id returns a public lesson", async () => {
    const list = await lessonsHandler(req({}));
    expect(list.status).toBe(200);
    expect((list.body as { lessons: unknown[] }).lessons).toHaveLength(6);
    const one = await lessonsHandler(req({ query: { id: "prim" } }));
    expect(one.status).toBe(200);
    expect(JSON.stringify(one.body)).not.toMatch(/"correct"/);
    expect((await lessonsHandler(req({ query: { id: "nope" } }))).status).toBe(404);
    expect((await lessonsHandler(req({ method: "POST" }))).status).toBe(405);
  });

  it("POST /api/runs returns runs, including valid diagnostics", async () => {
    const ok = await runsHandler(req({ method: "POST", body: { lessonId: "dijkstra", exampleId: "weighted-diamond" } }));
    expect(ok.status).toBe(200);
    const diag = await runsHandler(req({ method: "POST", body: { lessonId: "topological-sort", exampleId: "project-cycle" } }));
    expect(diag.status).toBe(200);
    expect((diag.body as { run: { result: { code: string } } }).run.result.code).toBe("cycle");
    expect((await runsHandler(req({ method: "POST", body: { lessonId: "dijkstra" } }))).status).toBe(400);
    expect((await runsHandler(req({ method: "POST", body: { lessonId: "dijkstra", exampleId: "x" } }))).status).toBe(404);
    // Practice traces are not served as walkthrough runs.
    expect((await runsHandler(req({ method: "POST", body: { lessonId: "dijkstra", exampleId: "cheaper-c-d" } }))).status).toBe(404);
    expect((await runsHandler(req({ method: "GET" }))).status).toBe(405);
  });

  it("POST /api/practice validates shape, sets a learner cookie and no-store", async () => {
    expect((await practiceHandler(req({ method: "POST", body: { lessonId: "dijkstra" } }))).status).toBe(400);
    const res = await practiceHandler(req({ method: "POST", body: practiceReq("dijkstra", [], { type: "start" }) }));
    expect(res.status).toBe(200);
    expect(res.headers?.["Cache-Control"]).toBe("no-store");
    expect(String(res.headers?.["Set-Cookie"])).toMatch(/gw_learner=.*HttpOnly.*SameSite=Lax/);
  });

  it("records completion, preserves timestamps, and keeps sessions separate", async () => {
    const learner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const cookies = { gw_learner: learner };
    let accepted: AcceptedChoice[] = [];
    let body = (await practiceHandler(req({ method: "POST", cookies, body: practiceReq("dijkstra", [], { type: "start" }) }))).body as PracticeResponse;
    const lesson = getLesson("dijkstra")!;
    while (body.prompt) {
      const cp = lesson.practice.build(accepted).checkpoints[accepted.length];
      body = (
        await practiceHandler(
          req({ method: "POST", cookies, body: practiceReq("dijkstra", accepted, { type: "answer", checkpointId: cp.id, optionId: cp.correct[0] }) }),
        )
      ).body as PracticeResponse;
      accepted = body.acceptedChoices;
    }
    expect(body.status).toBe("complete");

    const progress = (await progressHandler(req({ cookies }))).body as { progress: { lessonId: string; completedAt: string; startedAt: string }[] };
    expect(progress.progress).toHaveLength(1);
    expect(progress.progress[0]).toMatchObject({ lessonId: "dijkstra" });
    const first = progress.progress[0];

    // A repeated completion (or restart) does not overwrite the first timestamps.
    const { getDb } = await import("../src/server/db.js");
    await markStarted(getDb(), learner, "dijkstra", 1, new Date("2030-01-01"));
    await markCompleted(getDb(), learner, "dijkstra", 1, new Date("2030-01-01"));
    const again = ((await progressHandler(req({ cookies }))).body as typeof progress).progress[0];
    expect(again.startedAt).toBe(first.startedAt);
    expect(again.completedAt).toBe(first.completedAt);

    const otherProgress = (await progressHandler(req({ cookies: { gw_learner: other } }))).body as typeof progress;
    expect(otherProgress.progress).toEqual([]);
    const anon = await progressHandler(req({}));
    expect(anon.body).toEqual({ progress: [] });
    expect(anon.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("maps a stale version to 409 over HTTP", async () => {
    const r = practiceReq("bfs", [], { type: "start" });
    const res = await practiceHandler(req({ method: "POST", body: { ...r, version: 99 } }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "version_mismatch" } });
  });
});
