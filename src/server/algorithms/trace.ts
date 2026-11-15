import type { Highlights, TraceFrame, WorkingState } from '../../shared/contracts.ts';

export function trace(state: WorkingState) {
  const frames: TraceFrame[] = [];
  function emit(lineId: string | null, title: string, change: string, reason: string, highlights: Highlights = {}, event = lineId ?? 'open') {
    frames.push({
      index: frames.length, event, lineId, title, change, reason,
      state: structuredClone(state), highlights: structuredClone(highlights)
    });
  }
  return { frames, emit };
}
