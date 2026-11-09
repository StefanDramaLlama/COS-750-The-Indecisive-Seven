import type {
  AcceptedChoice,
  ApiError,
  LessonId,
  LessonSummary,
  PracticeAction,
  PracticeResponse,
  ProgressEntry,
  PublicLesson,
  Run,
  TutorRequest,
} from "../shared/types.js";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiFailure(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiFailure(res.status, "bad_response", "The server sent an unexpected response.");
  }
  if (!res.ok) {
    const e = (body as ApiError).error;
    throw new ApiFailure(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export interface PracticeBody {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  acceptedChoices: AcceptedChoice[];
  action: PracticeAction;
}

export const api = {
  lessons: (signal?: AbortSignal) =>
    call<{ lessons: LessonSummary[] }>("/api/lessons", { signal }).then((r) => r.lessons),
  lesson: (id: string, signal?: AbortSignal) =>
    call<{ lesson: PublicLesson }>(`/api/lessons?id=${encodeURIComponent(id)}`, { signal }).then((r) => r.lesson),
  run: (lessonId: LessonId, exampleId: string, signal?: AbortSignal) =>
    call<{ run: Run }>("/api/runs", { method: "POST", body: JSON.stringify({ lessonId, exampleId }), signal }).then(
      (r) => r.run,
    ),
  practice: (body: PracticeBody, signal?: AbortSignal) =>
    call<PracticeResponse>("/api/practice", { method: "POST", body: JSON.stringify(body), signal }),
  progress: (signal?: AbortSignal) =>
    call<{ progress: ProgressEntry[] }>("/api/progress", { signal }).then((r) => r.progress),
  tutor: (body: TutorRequest, signal?: AbortSignal) =>
    call<{ reply: string }>("/api/tutor", { method: "POST", body: JSON.stringify(body), signal }).then((r) => r.reply),
  tts: (text: string, signal?: AbortSignal) =>
    call<{ mimeType: string; data: string }>("/api/tts", { method: "POST", body: JSON.stringify({ text }), signal }),
};
