import type { Choice, Example, LessonId, PracticePrompt, PracticeRequest, PracticeResponse, Run, TraceFrame } from '../shared/contracts.ts';
import { runExample } from './algorithms/index.ts';

interface Checkpoint {
  prompt: PracticePrompt;
  at: (run: Run) => number;
  accepts: (frame: TraceFrame, optionId: string) => boolean;
  hint: string;
  correct: string;
}

const options = (...entries: [string, string][]) => entries.map(([id, label]) => ({ id, label }));
const at = (event: string, vertex?: string, edge?: string) => (run: Run) => run.frames.findIndex(frame =>
  frame.event === event && (vertex === undefined || frame.highlights.vertex === vertex) && (edge === undefined || frame.highlights.edge === edge));
const beforeFinish = (run: Run) => run.frames.length - 2;
const oneAnswer = (correct: string) => (_frame: TraceFrame, optionId: string) => optionId === correct;

const checkpoints: Record<LessonId, Checkpoint[]> = {
  dijkstra: [
    {
      prompt: { id: 'estimate', question: 'What estimate should replace D’s current distance?', options: options(['3', '3'], ['5', '5'], ['7', '7']), reviewLineId: 'relax' },
      at: at('consider', 'D', 'C-D'), accepts: oneAnswer('5'),
      hint: 'Add the settled distance to C to the cost of C–D. Compare the sum with D’s estimate.',
      correct: 'C is 2 away. Adding the new edge cost of 3 gives D an estimate of 5.'
    },
    {
      prompt: { id: 'route', question: 'Which route does D’s predecessor chain describe?', options: options(['ABD', 'A → B → D'], ['ACD', 'A → C → D']), reviewLineId: 'finish' },
      at: beforeFinish, accepts: oneAnswer('ACD'),
      hint: 'Start with the edge in D’s predecessor column, then follow the predecessor of that vertex.',
      correct: 'A → C → D costs 5. The cheaper edge changes the route because relaxation records a new predecessor.'
    }
  ],
  bfs: [
    {
      prompt: { id: 'queue', question: 'Which vertex leaves the queue after D?', options: options(['A', 'A'], ['B', 'B'], ['C', 'C']), reviewLineId: 'take' },
      at: at('discover', 'C', 'C-D'), accepts: oneAnswer('B'),
      hint: 'Read the front of the queue. B joined before C.',
      correct: 'B leaves first because BFS processes the queue in arrival order.'
    },
    {
      prompt: { id: 'hops', question: 'How many hops are in a shortest route from D to A?', options: options(['1', '1'], ['2', '2'], ['3', '3']), reviewLineId: 'discover' },
      at: beforeFinish, accepts: oneAnswer('2'),
      hint: 'Count edges along D → B → A, or read A’s discovered distance.',
      correct: 'A is two hops away. The first discovery of A comes from the preceding layer.'
    }
  ],
  dfs: [
    {
      prompt: { id: 'return', question: 'Where does DFS return when B runs out of unexplored neighbors?', options: options(['A', 'A'], ['C', 'C'], ['none', 'It stops immediately']), reviewLineId: 'return' },
      at: at('dead-end', 'B'), accepts: oneAnswer('A'),
      hint: 'Look at the stack frame immediately below B.',
      correct: 'DFS pops B and resumes A, where it can check any remaining neighbors.'
    },
    {
      prompt: { id: 'unreached', question: 'Which vertices are still unreached when the stack empties?', options: options(['AB', 'A and B'], ['CD', 'C and D'], ['none', 'Every vertex was reached']), reviewLineId: 'finish' },
      at: beforeFinish, accepts: oneAnswer('CD'),
      hint: 'Only vertices in A’s connected component can enter the stack during this run.',
      correct: 'C and D are in a different component, so a traversal starting at A cannot discover them.'
    }
  ],
  'topological-sort': [
    {
      prompt: { id: 'ready', question: 'Which task could go next after Plan?', options: options(['B', 'Research'], ['C', 'Sketch'], ['D', 'Build']), reviewLineId: 'place' },
      at: at('release', 'C', 'A-C'),
      accepts: (frame, id) => frame.state.kind === 'topological-sort' && frame.state.ready.includes(id),
      hint: 'Look for a task with zero remaining incoming edges. More than one task may be ready.',
      correct: 'That task has zero remaining prerequisites. The next frames follow the order you chose.'
    },
    {
      prompt: { id: 'prerequisites', question: 'What had to be placed before Build became ready?', options: options(['research', 'Research alone'], ['sketch', 'Sketch alone'], ['both', 'Both Research and Sketch']), reviewLineId: 'release' },
      at: run => run.frames.findIndex(frame => frame.event === 'release' && frame.highlights.vertex === 'D' &&
        frame.state.kind === 'topological-sort' && frame.state.indegrees.D === 0),
      accepts: oneAnswer('both'),
      hint: 'Follow both arrows entering Build. Each incoming edge is a separate prerequisite.',
      correct: 'Both prerequisite tasks had to be placed. Either can come first, but Build must follow both.'
    }
  ],
  kruskal: [
    {
      prompt: { id: 'cycle-edge', question: 'What should happen to B–C now?', options: options(['add', 'Add B–C'], ['skip', 'Skip B–C']), reviewLineId: 'skip' },
      at: at('check', undefined, 'B-C'), accepts: oneAnswer('skip'),
      hint: 'Read the component labels for B and C. Is there already a path between them through A?',
      correct: 'B and C are already connected through A, so adding B–C would close a cycle.'
    },
    {
      prompt: { id: 'total', question: 'What will the tree cost after connecting D?', options: options(['4', '4'], ['5', '5'], ['7', '7']), reviewLineId: 'join' },
      at: at('check', undefined, 'C-D'), accepts: oneAnswer('5'),
      hint: 'Add the cost of C–D to the current running cost. Leave the skipped edge out of the sum.',
      correct: 'A–C costs 0, A–B costs 1, and C–D costs 4. The total is 5.'
    }
  ],
  prim: [
    {
      prompt: { id: 'first-link', question: 'Which link can Prim add first from A?', options: options(['A-B', 'A–B, cost 1'], ['A-C', 'A–C, cost 3'], ['C-D', 'C–D, cost 0']), reviewLineId: 'frontier' },
      at: at('frontier'), accepts: oneAnswer('A-B'),
      hint: 'A crossing link must touch the current tree. The tree currently contains only A.',
      correct: 'A–B is the cheapest link touching A. C–D can join the frontier after C is added.'
    },
    {
      prompt: { id: 'total', question: 'What will the tree cost after adding the final crossing link?', options: options(['2', '2'], ['3', '3'], ['7', '7']), reviewLineId: 'add' },
      at: run => run.frames.findLastIndex(frame => frame.event === 'frontier'), accepts: oneAnswer('3'),
      hint: 'Read the running cost and add the remaining frontier edge C–D, whose weight is zero.',
      correct: 'The total is 1 + 2 + 0 = 3. The free link becomes eligible once C is in the tree.'
    }
  ]
};

export class PracticeError extends Error {}

export function practice(request: PracticeRequest, example: Example): PracticeResponse {
  const { lessonId, version, action } = request;
  const rules = checkpoints[lessonId];
  const history: Choice[] = [];
  let run = runExample(lessonId, version, example);
  let feedback: PracticeResponse['feedback'] = null;

  function accept(choice: Choice) {
    const rule = rules[history.length];
    if (!rule || rule.prompt.id !== choice.checkpointId || !rule.accepts(run.frames[rule.at(run)], choice.optionId)) return false;
    history.push(choice);
    if (lessonId === 'topological-sort' && choice.checkpointId === 'ready') run = runExample(lessonId, version, example, choice.optionId);
    return true;
  }

  for (const choice of request.acceptedChoices) {
    if (!accept(choice)) throw new PracticeError('The saved decisions do not match this practice run. Restart and try again.');
  }
  if (action.type === 'start' && history.length) throw new PracticeError('A new practice run starts with an empty decision history.');
  if (action.type !== 'start') {
    const current = rules[history.length];
    if (!current || action.checkpointId !== current.prompt.id) throw new PracticeError('This checkpoint is no longer active. Restart and try again.');
    if (action.type === 'hint') feedback = { kind: 'hint', message: current.hint };
    if (action.type === 'answer') {
      if (!current.prompt.options.some(option => option.id === action.optionId)) throw new PracticeError('Choose one of the listed options.');
      const correct = accept({ checkpointId: action.checkpointId, optionId: action.optionId });
      feedback = { kind: correct ? 'correct' : 'incorrect', message: correct ? current.correct : `Try again. ${current.hint}` };
    }
  }

  const { result, frames, ...metadata } = run;
  const next = rules[history.length];
  return {
    ...metadata, frames: next ? frames.slice(0, next.at(run) + 1) : frames,
    acceptedChoices: history, prompt: next?.prompt ?? null, completed: !next,
    feedback, ...(next ? {} : { result })
  };
}

export function validatePractice(lessonId: LessonId, version: number, example: Example): void {
  const rules = checkpoints[lessonId];
  function check(run: Run, from: number, previous: number) {
    for (const [index, rule] of rules.entries()) {
      if (index < from) continue;
      const frame = rule.at(run);
      if (frame <= previous || frame >= run.frames.length - 1) throw new Error(`Invalid practice checkpoint: ${lessonId}/${rule.prompt.id}`);
      const accepted = rule.prompt.options.filter(option => rule.accepts(run.frames[frame], option.id));
      if (!accepted.length) throw new Error(`No valid answer: ${lessonId}/${rule.prompt.id}`);
      if (lessonId === 'topological-sort' && rule.prompt.id === 'ready') {
        for (const choice of accepted) check(runExample(lessonId, version, example, choice.id), index + 1, frame);
      }
      previous = frame;
    }
  }
  check(runExample(lessonId, version, example), 0, -1);
}
