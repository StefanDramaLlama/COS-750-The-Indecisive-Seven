import type { CodeLine, Lesson, LessonId, LessonSummary } from '../../shared/contracts.ts';
import { examples, primers } from './fixtures.ts';

const line = (id: string, text: string, explanation: string): CodeLine => ({ id, text, explanation });
type LessonContent = Omit<Lesson, 'id' | 'examples'>;

const content: Record<LessonId, LessonContent> = {
  basics: {
    version: 1,
    name: 'Graph basics',
    category: 'Foundations · nodes, edges, direction',
    title: 'Start here: nodes and edges.',
    summary: 'Learn the vocabulary every other lesson assumes.',
    prerequisites: 'No prior graph knowledge',
    complexity: 'Concepts only — not an algorithm',
    objectives: [
      'Read a graph as nodes connected by edges — and identify each part.',
      'Recognise directed, weighted, connected, and cyclic graphs from small examples.'
    ],
    primers: [primers.direction, primers.cycles, primers.connectivity, primers.weights],
    code: [
      line('graph', 'A graph is a set of nodes joined by edges.',
        'A graph is exactly that: nodes, and edges joining them. Everything else builds on those two sets.'),
      line('node', 'A node (vertex) is one item in the graph.',
        'A node has a label. When drawn, it also has a position. A graph with three nodes has three vertices.'),
      line('edge', 'An edge (link) joins two nodes.',
        'An edge connects a pair of nodes. An arrowhead makes it directed; a number makes it weighted.'),
      line('finish', 'Every algorithm in this studio works on a graph like this one.',
        'The rest of the lessons turn these ideas into procedures.')
    ]
  },
  dijkstra: {
    version: 1,
    name: 'Dijkstra', category: 'Weighted shortest path',
    title: 'Find the lowest-cost route.',
    summary: 'Follow the estimates as Dijkstra finds a shortest route through a weighted graph.',
    prerequisites: 'Nonnegative edge weights', complexity: 'O(V² + E) with a distance table',
    objectives: ['Explain how a smaller candidate distance updates the estimate and predecessor.', 'Apply Dijkstra to a route after an edge cost changes.'],
    primers: [primers.weights],
    code: [
      line('initialize', 'distance = ∞ for every vertex; distance[start] = 0', 'Start with zero cost at the source and no known routes to the other vertices.'),
      line('loop', 'while an unsettled vertex has finite distance:', 'There is more work while a reachable vertex still needs its final distance.'),
      line('settle', '  u = unsettled vertex with smallest distance; settle u', 'Choose the smallest estimate. All edge weights are nonnegative, so this estimate is final. Ties use ascending vertex ID.'),
      line('goal', '  if u == goal: break', 'Stop when the goal is settled. Its predecessor chain now describes a shortest route.'),
      line('consider', '  for each unsettled neighbor v of u: candidate = distance[u] + weight(u, v)', 'Try reaching the neighbor by extending the route to u by one edge.'),
      line('relax', '    if candidate < distance[v]: update distance[v] and predecessor[v]', 'Keep the new estimate and edge only if the candidate improves the current estimate.'),
      line('finish', 'return the predecessor path or report unreachable', 'Follow predecessor edges backwards from the goal. An infinite goal distance means no route was found.')
    ]
  },
  bfs: {
    version: 1,
    name: 'Breadth-first search', category: 'Traversal · unweighted shortest path',
    title: 'Explore one layer at a time.',
    summary: 'Watch a first-in, first-out queue turn neighbor visits into shortest paths by hop count.',
    prerequisites: 'Unweighted edges', complexity: 'O(V + E) with adjacency lists',
    objectives: ['Explain why marking vertices on enqueue avoids duplicate work.', 'Use BFS to predict visit order and hop count from a different start.'],
    primers: [primers.connectivity, primers.weights],
    code: [
      line('seed', 'discover start at distance 0 and enqueue it', 'Mark a vertex as soon as it is queued. This prevents two parents from queueing the same vertex.'),
      line('take', 'while the queue is nonempty: dequeue its first vertex u', 'The vertex that joined first leaves first. Vertices are visited in layers.'),
      line('discover', '  for each undiscovered neighbor v: enqueue v, record u and distance[u] + 1', 'First discovery determines a shortest hop count. Save the incoming edge as a predecessor.'),
      line('finish', 'return the visit order and recover the path if the goal was reached', 'The empty queue means every vertex reachable from the start has been visited.')
    ]
  },
  dfs: {
    version: 1,
    name: 'Depth-first search', category: 'Traversal · backtracking',
    title: 'Follow a branch to its end.',
    summary: 'See the call stack grow along a branch and shrink as DFS backtracks.',
    prerequisites: 'A start vertex', complexity: 'O(V + E) with adjacency lists',
    objectives: ['Explain why DFS returns to the previous stack frame at a dead end.', 'Use a stack to trace DFS on a disconnected graph.'],
    primers: [primers.connectivity, primers.cycles],
    code: [
      line('enter', 'enter(u): mark u visited and push its frame', 'The frame stores the vertex and the next neighbor to consider.'),
      line('check', 'if the top frame has a neighbor left: check it and enter it if unvisited', 'Explore the new vertex before continuing with the previous frame. Skip vertices already visited.'),
      line('return', 'otherwise: pop the finished frame and resume the one below it', 'Backtracking restores the previous vertex at its next neighbor.'),
      line('finish', 'when the stack empties, return the discovery order', 'The search is complete for the starting component.')
    ]
  },
  'topological-sort': {
    version: 1,
    name: 'Topological sort', category: 'Dependency ordering · Kahn',
    title: 'Put dependencies first.',
    summary: 'Build a valid task order by choosing from the ready queue, one vertex at a time.',
    prerequisites: 'A directed graph · full order requires a DAG', complexity: 'In-degrees and a ready queue',
    objectives: ['Explain how zero remaining in-degree makes a task ready.', 'Choose a ready task and produce a valid dependency order.'],
    primers: [primers.direction, primers.cycles],
    code: [
      line('count', 'indegree = count incoming edges; ready = vertices with indegree 0', 'Incoming edges represent prerequisites still to be placed.'),
      line('place', 'while ready is nonempty: remove a ready vertex u and append it to order', 'Any ready vertex can go next. Choosing a different one can produce another valid ordering.'),
      line('release', '  for each outgoing neighbor v: decrement indegree[v]; enqueue v when it reaches 0', 'Placing u satisfies one prerequisite of each outgoing neighbor.'),
      line('finish', 'return order if all vertices were placed; otherwise report a cycle', 'A cycle leaves some prerequisites unresolved and can also block tasks downstream.')
    ],
    variants: [
    {
      id: 'iterative',
      label: 'Iterative',
      code: [
        line('count',   'indegree = count incoming edges; ready = vertices with indegree 0',
          'Incoming edges represent prerequisites still to be placed.'),
        line('place',   'while ready is nonempty: remove a ready vertex u and append it to order',
          'Any ready vertex can go next. Choosing a different one can produce another valid ordering.'),
        line('release', '  for each outgoing neighbor v: decrement indegree[v]; enqueue v when it reaches 0',
          'Placing u satisfies one prerequisite of each outgoing neighbor.'),
        line('finish',  'return order if all vertices were placed; otherwise report a cycle',
          'A cycle leaves some prerequisites unresolved and can also block tasks downstream.')
      ]
    },
    {
      id: 'recursive',
      label: 'Recursive',
      code: [
        line('enter',      'visit(u): mark u visiting; explore its outgoing edges',
          'A vertex stays on the recursion stack until every successor is visited.'),
        line('cycle',      'if a successor is still on the stack: report a cycle',
          'A back-edge means a prerequisite chain leads back to its own start. No topological order exists.'),
        line('skip',       'if a successor is already finished: skip it',
          'Re-visiting a finished vertex would duplicate it in the output.'),
        line('descend',    'follow the edge to an unvisited successor',
          'The order of appends is "last to finish first."'),
        line('finish-one', 'after all successors: mark u finished, append u to postorder',
          'This is the "post" part of postorder: a vertex is appended only after its descendants.'),
        line('finish',     'return the reverse of the postorder as the ordering',
          'Reversing puts each prerequisite before the tasks that need it.')
      ]
    }
  ]
  },
  kruskal: {
    version: 1,
    name: 'Kruskal', category: 'Minimum spanning tree',
    title: 'Connect more for less.',
    summary: 'Build the lowest-cost network by sorting links and merging separate components.',
    prerequisites: 'Weighted undirected graph', complexity: 'Greedy · global edge order',
    objectives: ['Explain why adding an edge within one component creates a cycle.', 'Apply the component test after an edge weight changes.'],
    primers: [primers.cycles, primers.connectivity],
    code: [
      line('sort', 'sort edges by weight; start with one component per vertex', 'Consider lower-cost links first. Equal weights use ascending edge ID.'),
      line('check', 'for each edge (u, v) until V − 1 links are selected: find both components', 'The disjoint sets track which vertices are already connected by selected edges.'),
      line('skip', '  if u and v share a component: skip the edge', 'Adding a link between already connected vertices would close a cycle.'),
      line('join', '  otherwise: select the edge and merge its two components', 'The cheapest eligible edge joins two pieces without forming a cycle.'),
      line('finish', 'return the tree or report a spanning forest if the graph is disconnected', 'A connected graph needs V − 1 selected links to span every vertex.')
    ]
  },
  prim: {
    version: 1,
    name: 'Prim', category: 'Minimum spanning tree',
    title: 'Grow one connected tree.',
    summary: 'Start at one vertex and add the cheapest link crossing from the tree to the outside.',
    prerequisites: 'Weighted undirected graph', complexity: 'O(VE) with an edge scan',
    objectives: ['Explain how the crossing frontier changes as a vertex joins the tree.', 'Select the cheapest eligible link after a weight changes.'],
    primers: [primers.connectivity, primers.weights],
    code: [
      line('seed', 'tree = {start}; selected = []', 'A single vertex is connected and has no edge cost.'),
      line('frontier', 'while some vertices are outside: find the edges with one endpoint in tree', 'Only edges crossing the boundary can expand the current tree.'),
      line('add', '  if a crossing edge exists: add the cheapest edge and its outside vertex', 'The cheapest crossing edge grows the tree by one vertex and cannot form a cycle. Equal costs use edge ID.'),
      line('finish', 'return the tree, or the partial tree when no crossing edge exists', 'A partial tree covers only the component of the selected start.')
    ]
  }
};

export const lessonIds = Object.keys(content) as LessonId[];
export const isLessonId = (id: unknown): id is LessonId => typeof id === 'string' && Object.hasOwn(content, id);
export function getLesson(id: LessonId): Lesson {
  return {
    id, ...content[id],
    examples: examples[id].map(({ id, kind, title, scenario }) => ({ id, kind, title, scenario }))
  };
}
export function getLessons(): LessonSummary[] {
  return lessonIds.map(id => {
    const { version, name, category } = content[id];
    return { id, version, name, category };
  });
}
