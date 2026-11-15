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

const lessonCheckpoints: Record<Exclude<LessonId, 'quiz'>, Checkpoint[]> = {
  basics: [
    {
      prompt: {
        id: 'graph',
        question: 'What two kinds of thing make up a graph?',
        options: options(['nodes-edges', 'Nodes and edges'], ['nodes-only', 'Only nodes'], ['edges-only', 'Only edges']),
        reviewLineId: 'graph'
      },
      at: at('graph'),
      accepts: oneAnswer('nodes-edges'),
      hint: 'Look at the picture: dots and the lines between them.',
      correct: 'A graph is nodes joined by edges. Both are part of the definition.'
    },
    {
      prompt: {
        id: 'node',
        question: 'Which part of the picture is a node?',
        options: options(['dot', 'One of the dots'], ['line', 'One of the lines'], ['label', 'A number on a line']),
        reviewLineId: 'node'
      },
      at: at('node'),
      accepts: oneAnswer('dot'),
      hint: 'A node is a single point — the dots in the graph.',
      correct: 'The dots are nodes (vertices). Each node is one item in the graph.'
    },
    {
      prompt: {
        id: 'edge',
        question: 'What does an edge connect?',
        options: options(['two-nodes', 'Two nodes'], ['node-graph', 'A node to the whole graph'], ['weights', 'Two edge weights']),
        reviewLineId: 'edge'
      },
      at: at('edge'),
      accepts: oneAnswer('two-nodes'),
      hint: 'An edge is a line. What is on each end of the line?',
      correct: 'An edge joins two nodes. Direction and weight describe *how* the connection works.'
    }
  ],
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
  ],
  compare: [
    {
      prompt: { id: 'bfs-route', question: 'Which route does BFS return from A to D?', options: options(['AD', 'A → D'], ['ACD', 'A → C → D'], ['ABD', 'A → B → D']), reviewLineId: 'bfs' },
      at: at('open'), accepts: oneAnswer('AD'),
      hint: 'BFS counts hops and ignores the minutes on each path. Which route uses the fewest paths?',
      correct: 'A → D is a single hop, so BFS returns it, even though it takes 9 minutes.'
    },
    {
      prompt: { id: 'dijkstra-route', question: 'Which route does Dijkstra return?', options: options(['AD', 'A → D'], ['ACD', 'A → C → D'], ['ABD', 'A → B → D']), reviewLineId: 'dijkstra' },
      at: at('bfs'), accepts: oneAnswer('ACD'),
      hint: 'Add up the minutes along each route and pick the smallest total.',
      correct: 'A → C → D takes 1 + 1 = 2 minutes, the lowest total.'
    },
    {
      prompt: { id: 'choose', question: 'A friendship network has no weights. Which algorithm should an app use to count degrees of separation?', options: options(['bfs', 'BFS: same route, simpler code'], ['dijkstra', 'Dijkstra: it works on more graphs'], ['big-o', 'Either: only Big-O matters']), reviewLineId: 'equal' },
      at: beforeFinish, accepts: oneAnswer('bfs'),
      hint: 'Without weights, the cheapest route is the one with the fewest hops. Which algorithm finds that with less code?',
      correct: 'BFS. Without weights both return the same route, and BFS needs only a queue, so it is quicker to write and easier to maintain.'
    }
  ],
  'compare-trees': [
    {
      prompt: { id: 'same-cost', question: 'Will Kruskal’s tree and Prim’s tree cost the same?', options: options(['same', 'Yes: both always find the lowest total cost'], ['kruskal', 'No: Kruskal’s sorted list finds a cheaper tree'], ['start', 'Only if Prim starts at the right site']), reviewLineId: 'same' },
      at: at('open'), accepts: oneAnswer('same'),
      hint: 'Both algorithms return a minimum spanning tree. Can one spanning tree cost less than the minimum?',
      correct: 'Yes. Both always return a minimum spanning tree, whichever site Prim starts from. Here both trees cost 6.'
    },
    {
      prompt: { id: 'trenches', question: 'A council lists 40 possible fibre trenches between homes, each with a cost. Which algorithm fits that input?', options: options(['kruskal', 'Kruskal: it works straight from the list'], ['prim', 'Prim: it grows from one site'], ['either', 'Either: the trees cost the same']), reviewLineId: 'factors' },
      at: at('prim'), accepts: oneAnswer('kruskal'),
      hint: 'The input is already a list of links with costs. Which algorithm starts by sorting such a list?',
      correct: 'Kruskal. It sorts the council’s list by cost and skips any trench that would close a loop, so it works from the data as given.'
    },
    {
      prompt: { id: 'existing-code', question: 'Your code already has Dijkstra’s priority queue. Which algorithm needs less new code?', options: options(['prim', 'Prim: it is almost the same as Dijkstra'], ['kruskal', 'Kruskal: it only needs a sort'], ['big-o', 'Either: only Big-O matters']), reviewLineId: 'prim' },
      at: at('same'), accepts: oneAnswer('prim'),
      hint: 'Prim and Dijkstra both grow from a start and take the cheapest next site from a priority queue. What would Kruskal need that the code does not have?',
      correct: 'Prim. It is Dijkstra with one change: the priority is the cost of the link itself, not the distance from the start. Kruskal would need a sort and a structure to track joined groups.'
    }
  ],
  review: [
    {
      prompt: {
        id: 'graph-parts',
        question: 'What two components make up every graph?',
        options: options(['nodes-edges', 'Nodes and edges'], ['weights-labels', 'Weights and labels'], ['paths-cycles', 'Paths and cycles']),
        reviewLineId: 'settle'
      },
      at: (run) => 2, accepts: oneAnswer('nodes-edges'),
      hint: 'Look at the picture: dots and the lines between them.',
      correct: 'A graph is a set of nodes (vertices) joined by edges.'
    },
    {
      prompt: {
        id: 'dijkstra-settle',
        question: 'Which vertex does Dijkstra settle next?',
        options: options(['smallest', 'The unsettled vertex with the smallest distance'], ['first', 'The first vertex in the graph'], ['goal', 'The goal vertex immediately']),
        reviewLineId: 'settle'
      },
      at: (run) => 4, accepts: oneAnswer('smallest'),
      hint: 'Dijkstra always picks the smallest finite estimate among unsettled vertices.',
      correct: 'With nonnegative weights, the smallest estimate is final.'
    },
    {
      prompt: {
        id: 'bfs-structure',
        question: 'What data structure does BFS use, and in what order?',
        options: options(['queue', 'A queue — first-in, first-out, layer by layer'], ['stack', 'A stack — last-in, first-out'], ['heap', 'A priority queue — by distance']),
        reviewLineId: 'consider'
      },
      at: (run) => 6, accepts: oneAnswer('queue'),
      hint: 'BFS visits vertices one layer at a time.',
      correct: 'BFS uses a FIFO queue and processes vertices in arrival order.'
    },
    {
      prompt: {
        id: 'dfs-structure',
        question: 'What data structure does DFS use to explore?',
        options: options(['stack', 'A stack (the call stack)'], ['queue', 'A queue'], ['set', 'A hash set']),
        reviewLineId: 'relax'
      },
      at: (run) => 8, accepts: oneAnswer('stack'),
      hint: 'DFS follows a branch as far as possible before backtracking.',
      correct: 'DFS uses a stack and explores each branch to its end.'
    },
    {
      prompt: {
        id: 'topological-ready',
        question: 'What makes a task ready to place in topological sort?',
        options: options(['zero-indegree', 'It has zero remaining incoming edges'], ['highest-cost', 'It has the highest cost'], ['no-outgoing', 'It has no outgoing edges']),
        reviewLineId: 'consider'
      },
      at: (run) => 10, accepts: oneAnswer('zero-indegree'),
      hint: 'Incoming edges are prerequisites still to be placed.',
      correct: 'A task is ready when all its prerequisites have been placed.'
    },
    {
      prompt: {
        id: 'kruskal-skip',
        question: 'When does Kruskal skip an edge?',
        options: options(['component', 'When its endpoints already share a component'], ['cheapest', 'When it is the cheapest edge'], ['zero', 'When it has weight zero']),
        reviewLineId: 'relax'
      },
      at: (run) => 12, accepts: oneAnswer('component'),
      hint: 'Adding a link between already connected vertices closes a cycle.',
      correct: 'Kruskal skips any edge whose endpoints are already connected.'
    },
    {
      prompt: {
        id: 'prim-crossing',
        question: 'Which edges can Prim add next?',
        options: options(['crossing', 'Only crossing edges — one endpoint in the tree, one outside'], ['any', 'Any edge in the graph'], ['start', 'Only edges touching the start vertex']),
        reviewLineId: 'settle'
      },
      at: (run) => 14, accepts: oneAnswer('crossing'),
      hint: 'Only edges crossing the frontier can expand the tree.',
      correct: 'Prim grows one tree by adding the cheapest crossing edge.'
    },
    {
      prompt: {
        id: 'mixed-bfs',
        question: 'Which algorithm finds the fewest-hop route in an unweighted graph?',
        options: options(['bfs', 'Breadth-first search'], ['dijkstra', 'Dijkstra'], ['kruskal', 'Kruskal']),
        reviewLineId: 'consider'
      },
      at: (run) => 16, accepts: oneAnswer('bfs'),
      hint: 'BFS counts hops and finds the shortest unweighted path.',
      correct: 'BFS explores layer by layer, so the first discovery is the fewest hops.'
    },
    {
      prompt: {
        id: 'mixed-dijkstra',
        question: 'Which algorithm finds the lowest-cost route in a weighted graph with nonnegative weights?',
        options: options(['dijkstra', 'Dijkstra'], ['bfs', 'Breadth-first search'], ['dfs', 'Depth-first search']),
        reviewLineId: 'relax'
      },
      at: (run) => 18, accepts: oneAnswer('dijkstra'),
      hint: 'Dijkstra minimizes the sum of edge weights along a route.',
      correct: 'Dijkstra settles the smallest-distance vertex first, guaranteeing the lowest cost.'
    },
    {
      prompt: {
        id: 'mixed-mst',
        question: 'Which two algorithms build a minimum spanning tree?',
        options: options(['kruskal-prim', 'Kruskal and Prim'], ['dijkstra-bfs', 'Dijkstra and BFS'], ['dfs-topo', 'DFS and topological sort']),
        reviewLineId: 'finish'
      },
      at: (run) => 20, accepts: oneAnswer('kruskal-prim'),
      hint: 'Both are greedy algorithms that avoid cycle-forming edges.',
      correct: 'Kruskal sorts edges globally; Prim grows one tree from a start vertex.'
    }
  ]
};

export const checkpoints: Record<LessonId, Checkpoint[]> = { ...lessonCheckpoints, quiz: lessonCheckpoints.review };

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
