import type { Sound } from './types.ts';

const KEY = 'graphwise-sound-muted';

interface Tone { freq: number; start: number; length: number; type: OscillatorType; gain: number }

/** Short, soft cues. Each sound has a distinct shape, so a learner can tell them apart without looking. */
const TONES: Record<Exclude<Sound, 'none'>, Tone[]> = {
  add: [{ freq: 523.25, start: 0, length: 0.1, type: 'triangle', gain: 0.16 }, { freq: 783.99, start: 0.09, length: 0.16, type: 'triangle', gain: 0.16 }],
  remove: [{ freq: 523.25, start: 0, length: 0.1, type: 'triangle', gain: 0.16 }, { freq: 349.23, start: 0.09, length: 0.18, type: 'triangle', gain: 0.16 }],
  update: [{ freq: 587.33, start: 0, length: 0.08, type: 'sine', gain: 0.15 }, { freq: 587.33, start: 0.12, length: 0.12, type: 'sine', gain: 0.15 }],
  query: [{ freq: 880, start: 0, length: 0.05, type: 'sine', gain: 0.08 }],
  error: [{ freq: 164.81, start: 0, length: 0.22, type: 'sawtooth', gain: 0.1 }]
};

let context: AudioContext | undefined;
// Cues are on by default and only ever play after a click or tap, so browsers allow them. The mute toggle is always visible.
let muted = false;
try { muted = localStorage.getItem(KEY) === 'muted'; } catch { /* Sound stays on for this visit. */ }
let speaking = false;

export const isMuted = () => muted;
export function setMuted(value: boolean): void {
  muted = value;
  try { localStorage.setItem(KEY, value ? 'muted' : 'unmuted'); } catch { /* The choice still applies this visit. */ }
}

export function play(sound: Sound): void {
  if (muted || sound === 'none' || typeof AudioContext === 'undefined') return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    for (const tone of TONES[sound]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.freq;
      envelope.gain.setValueAtTime(0.0001, now + tone.start);
      envelope.gain.exponentialRampToValueAtTime(tone.gain, now + tone.start + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.length);
      oscillator.connect(envelope).connect(context.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.length + 0.03);
    }
  } catch { /* A blocked or unavailable audio device is not an error for the lesson. */ }
}

export const canSpeak = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
export function isSpeaking() { return speaking; }
export function setSpeaking(value: boolean): void {
  speaking = value && canSpeak();
  if (!speaking && canSpeak()) speechSynthesis.cancel();
}
export function speak(text: string): void {
  if (!speaking || !canSpeak()) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
