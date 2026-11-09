import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ttsHandler, tutorHandler } from "../src/server/handlers.js";
import type { ApiRequest } from "../src/server/http.js";
import { askTutor, parseTutorRequest, pcmToWav, speak, speakable } from "../src/server/tutor.js";
import { chunkForSpeech } from "../src/studio/tutor.js";

const post = (body: unknown): ApiRequest => ({ method: "POST", query: {}, body, cookies: {}, secure: false });

function mockGemini(response: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(response), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("tutor request validation", () => {
  it("accepts a question and clips oversized context", () => {
    const r = parseTutorRequest({ mode: "answer", context: "x".repeat(50_000), messages: [{ role: "user", text: "Why?" }] });
    expect(r.context.length).toBe(14_000);
  });

  it("requires the right last message for each mode", () => {
    expect(() => parseTutorRequest({ mode: "answer", context: "", messages: [{ role: "model", text: "Hi" }] })).toThrow(/learner/);
    expect(() => parseTutorRequest({ mode: "simpler", context: "", messages: [{ role: "user", text: "Hi" }] })).toThrow(/rewrite/);
    expect(() => parseTutorRequest({ mode: "louder", context: "", messages: [{ role: "user", text: "Hi" }] })).toThrow(/mode/);
    expect(() => parseTutorRequest({ context: "", messages: [] })).toThrow(/non-empty/);
  });
});

describe("speech helpers", () => {
  it("strips markdown and symbols the voice would read out", () => {
    expect(speakable("**Relax** `dist[v] ← 7` via A→B, d = ∞\n- one")).toBe("Relax dist[v]  becomes  7 via A to B, d = infinity\none");
  });

  it("wraps PCM in a valid WAV header", () => {
    const wav = pcmToWav(Buffer.alloc(480), 24000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(480);
  });

  it("chunks long text on sentence boundaries", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkForSpeech(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("Gemini calls (mocked)", () => {
  const saved = process.env.GOOGLE_AI_STUDIO_API_KEY;
  beforeEach(() => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GOOGLE_AI_STUDIO_API_KEY = saved;
  });

  it("sends screen context as a system instruction and the key only in a header", async () => {
    const fetchMock = mockGemini({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Because 5 + 2 < 12." }] } }] });
    const { reply } = await askTutor({ mode: "answer", context: "Step 12: Relax B–D", messages: [{ role: "user", text: "Why 7?" }] });
    expect(reply).toBe("Because 5 + 2 < 12.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toContain("Step 12: Relax B–D");
    expect(body.systemInstruction.parts[0].text).toMatch(/do NOT state which option is correct/);
  });

  it("asks for a simpler rewrite after the previous answer", async () => {
    const fetchMock = mockGemini({ candidates: [{ content: { parts: [{ text: "Shorter." }] } }] });
    await askTutor({ mode: "simpler", context: "", messages: [{ role: "user", text: "Why?" }, { role: "model", text: "Long answer." }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "Explain that more simply, please." }] });
    expect(body.systemInstruction.parts[0].text).toMatch(/simpler/);
  });

  it("falls back to the second model when the first is out of quota", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "From the fallback." }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { reply } = await askTutor({ mode: "answer", context: "", messages: [{ role: "user", text: "Hi" }] });
    expect(reply).toBe("From the fallback.");
    expect(String(fetchMock.mock.calls[0][0])).not.toBe(String(fetchMock.mock.calls[1][0]));
  });

  it("maps quota errors to 429 and a missing key to 503", async () => {
    mockGemini({ error: { message: "quota" } }, 429);
    const limited = await tutorHandler(post({ mode: "answer", context: "", messages: [{ role: "user", text: "Hi" }] }));
    expect(limited.status).toBe(429);
    delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    const missing = await tutorHandler(post({ mode: "answer", context: "", messages: [{ role: "user", text: "Hi" }] }));
    expect(missing.status).toBe(503);
  });

  it("returns WAV audio, converting raw PCM when needed", async () => {
    const pcm = Buffer.alloc(100).toString("base64");
    mockGemini({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16; rate=24000; channels=1", data: pcm } }] } }] });
    const out = await speak("Hello.");
    expect(out.mimeType).toBe("audio/wav");
    expect(Buffer.from(out.data, "base64").subarray(0, 4).toString()).toBe("RIFF");
    const res = await ttsHandler(post({ text: "" }));
    expect(res.status).toBe(400);
  });
});
