import assert from 'node:assert/strict';
import test from 'node:test';
import { tutorEndpoint, ttsEndpoint } from '../src/server/http.ts';
import { chunkForSpeech } from '../src/studio/tutor.ts';

function post(path: string, data: unknown, origin = 'http://localhost') {
  return new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(data)
  });
}

test('tutor validates incoming requests and rejects other origins', async () => {
  assert.equal((await tutorEndpoint(new Request('http://localhost/api/tutor'))).status, 405);
  assert.equal((await tutorEndpoint(post('/api/tutor', { messages: [] }))).status, 400);
  assert.equal((await tutorEndpoint(post('/api/tutor', {}, 'https://other.test'))).status, 403);
  assert.equal((await ttsEndpoint(post('/api/tts', { text: ' ' }))).status, 400);
});

test('tutor sends lesson context and conversation to Gemini, then falls back on quota', async t => {
  const oldKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  process.env.GOOGLE_AI_STUDIO_API_KEY = 'local-test-key';
  t.after(() => {
    if (oldKey === undefined) delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    else process.env.GOOGLE_AI_STUDIO_API_KEY = oldKey;
  });
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    urls.push(url);
    assert.ok(!url.includes('local-test-key'));
    assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'local-test-key');
    const payload = JSON.parse(String(init.body));
    assert.match(payload.systemInstruction.parts[0].text, /Update D to 7/);
    assert.match(payload.systemInstruction.parts[0].text, /do NOT state which option is correct/);
    assert.equal(payload.contents.length, 3);
    assert.equal(payload.contents[1].parts.length, 2);
    assert.equal(payload.contents[2].parts[0].text, 'Explain that more simply, please.');
    if (urls.length === 1) return Response.json({}, { status: 429 });
    return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Add 5 and 2.' }] } }] });
  });
  const response = await tutorEndpoint(post('/api/tutor', {
    mode: 'simpler',
    context: 'Current step: Update D to 7.',
    messages: [
      { role: 'user', text: 'Why 7?' },
      { role: 'model', text: 'Relax the edge.' },
      { role: 'model', text: 'Use the new total.' }
    ]
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { reply: 'Add 5 and 2.' });
  assert.equal(new Set(urls).size, 2);
});


test('text-to-speech returns WAV audio and preserves long utterances', async t => {
  const oldKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  process.env.GOOGLE_AI_STUDIO_API_KEY = 'local-test-key';
  t.after(() => {
    if (oldKey === undefined) delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    else process.env.GOOGLE_AI_STUDIO_API_KEY = oldKey;
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    candidates: [{ content: { parts: [{ inlineData: {
      mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(100).toString('base64')
    } }] } }]
  }));
  const response = await ttsEndpoint(post('/api/tts', { text: '**Start** at A.' }));
  assert.equal(response.status, 200);
  const audio = await response.json();
  const wav = Buffer.from(audio.data, 'base64');
  assert.equal(audio.mimeType, 'audio/wav');
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  const utterance = Array.from({ length: 500 }, () => 'graph').join(' ');
  const chunks = chunkForSpeech(utterance);
  assert.ok(chunks.every(chunk => chunk.length <= 900));
  assert.equal(chunks.join(' '), utterance);
});
