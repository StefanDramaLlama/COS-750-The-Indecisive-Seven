import type { Edge, Example, Graph, Positions, Primer } from '../../shared/contracts.ts';

type Link = [from: string, to: string, weight?: number];

export function makeGraph(labels: Record<string, string>, links: Link[], directed = false): Graph {
  return {
    directed,
    vertices: Object.entries(labels).map(([id, label]) => ({ id, label })),
    edges: links.map(([from, to, weight]): Edge => ({ id: `${from}-${to}`, from, to, ...(weight !== undefined ? { weight } : {}) }))
  };
}

const abcd = { A: 'A', B: 'B', C: 'C', D: 'D' };
const abc = { A: 'A', B: 'B', C: 'C' };
const diamond: Positions = { A: [70, 125], B: [230, 54], C: [230, 196], D: [390, 125] };
const split: Positions = { A: [75, 84], B: [225, 84], C: [235, 175], D: [385, 175] };
const branch: Positions = { A: [83, 125], B: [224, 64], C: [386, 64], D: [224, 188] };
const mst: Positions = { A: [78, 125], B: [223, 54], C: [223, 196], D: [387, 196] };
const tasks: Positions = { A: [55, 124], B: [164, 53], C: [164, 194], D: [291, 124], E: [407, 124] };

function example(id: string, kind: Example['kind'], title: string, scenario: string, graph: Graph, positions: Positions, startId?: string, goalId?: string): Example {
  return { id, kind, title, scenario, graph, positions, startId, goalId };
}

const routes = (lastWeight: number) => makeGraph(abcd, [['A', 'B', 5], ['A', 'C', 2], ['B', 'D', 2], ['C', 'D', lastWeight]]);
const hops = makeGraph(abcd, [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']]);
const branches = makeGraph(abcd, [['A', 'B'], ['B', 'C'], ['A', 'D']]);
const disconnected = makeGraph(abcd, [['A', 'B'], ['C', 'D']]);
const taskLabels = { A: 'Plan', B: 'Research', C: 'Sketch', D: 'Build', E: 'Ship' };
const dependencies: Link[] = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']];
const project = makeGraph(taskLabels, dependencies, true);
const links = (ac: number, cd: number) => makeGraph(abcd, [['A', 'B', 1], ['B', 'C', 2], ['A', 'C', ac], ['C', 'D', cd]]);
const brokenLinks = makeGraph(abcd, [['A', 'B', 1], ['A', 'C', 3], ['B', 'C', 2]]);

export const examples = {
  dijkstra: [
    example('weighted-diamond', 'walkthrough', 'The weighted diamond', 'Find the lowest-cost delivery route from A to D. Each edge label is its delivery cost.', routes(10), diamond, 'A', 'D'),
    example('unreachable', 'walkthrough', 'An unreachable destination', 'Roads reach B and C from A. D is isolated. Follow the estimates until the search runs out of reachable vertices.', makeGraph(abcd, [['A', 'B', 5], ['A', 'C', 2]]), diamond, 'A', 'D'),
    example('cheaper-connection', 'practice', 'A cheaper connection', 'The C–D road now costs 3. Work out how that changes the route from A to D.', routes(3), diamond, 'A', 'D')
  ],
  bfs: [
    example('unweighted-diamond', 'walkthrough', 'Fewest stops', 'Find a route from A to D with the fewest edges. All connections count as one hop.', hops, diamond, 'A', 'D'),
    example('reverse-search', 'practice', 'Start at the other end', 'Start at D and find how many hops it takes to reach A. Add neighbors in alphabetical order.', hops, diamond, 'D', 'A')
  ],
  dfs: [
    example('branching-graph', 'walkthrough', 'Explore a branch', 'Start at A. Follow each branch as far as possible before returning to an earlier vertex.', branches, branch, 'A'),
    example('split-graph', 'practice', 'Explore one component', 'Start at A on a graph with two separate components. Follow the stack until the run ends.', disconnected, split, 'A')
  ],
  'topological-sort': [
    example('project-plan', 'walkthrough', 'The project graph', 'Plan before researching or sketching, then build and ship. An arrow points from a prerequisite to the task that needs it.', project, tasks),
    example('dependency-cycle', 'walkthrough', 'A dependency cycle', 'Research also requires Build. See which tasks can still be ordered and which remain blocked.', makeGraph(taskLabels, [...dependencies, ['D', 'B']], true), tasks),
    example('ready-tasks', 'practice', 'Choose the next ready task', 'Plan is first. Decide what the team can do next and continue from that choice.', project, tasks)
  ],
  kruskal: [
    example('site-links', 'walkthrough', 'Connect four sites', 'Build the lowest-cost network that connects all four sites. Consider links from cheapest to most expensive.', links(3, 4), mst),
    example('forest', 'walkthrough', 'A missing link', 'No link can reach D. Observe the forest Kruskal builds in the available components.', brokenLinks, mst),
    example('cheaper-link', 'practice', 'A link becomes free', 'A–C now costs 0. Decide which later link would form a cycle and calculate the final network cost.', links(0, 4), mst)
  ],
  prim: [
    example('site-links', 'walkthrough', 'Grow from one site', 'Start from A and grow a low-cost network, one link at a time.', links(3, 4), mst, 'A'),
    example('isolated-site', 'walkthrough', 'An isolated site', 'Start from A on a network with no link to D. Watch what happens when the frontier runs out.', brokenLinks, mst, 'A'),
    example('cheaper-outside-link', 'practice', 'The free link is farther away', 'C–D now costs 0. Starting at A, choose the first link and work out the completed tree’s cost.', links(3, 0), mst, 'A')
  ]
};

const row: Positions = { A: [88, 125], B: [229, 125], C: [370, 125] };
const triangle: Positions = { A: [86, 175], B: [229, 57], C: [372, 175] };
export const primers: Record<Primer['id'], Primer> = {
  direction: {
    id: 'direction', title: 'Undirected and directed',
    positions: row,
    before: { graph: makeGraph(abc, [['A', 'B'], ['B', 'C']]), caption: 'A–B and B–C can be followed in either direction.' },
    after: { graph: makeGraph(abc, [['A', 'B'], ['B', 'C']], true), caption: 'A → B → C is permitted. From C, neither arrow leads back to A.' },
    takeaway: 'Follow the arrow when reading a directed edge. A prerequisite arrow points toward the task that needs it.'
  },
  cycles: {
    id: 'cycles', title: 'Acyclic and cyclic',
    positions: triangle,
    before: { graph: makeGraph(abc, [['A', 'B'], ['B', 'C']]), caption: 'The two edges form a path. There is no closed loop.' },
    after: { graph: makeGraph(abc, [['A', 'B'], ['B', 'C'], ['A', 'C']]), caption: 'A–C closes the loop A → B → C → A.' },
    takeaway: 'A cycle returns to its starting vertex. Spanning trees leave out links that would close a cycle.'
  },
  connectivity: {
    id: 'connectivity', title: 'Connected and disconnected',
    positions: { A: [55, 125], B: [170, 125], C: [290, 125], D: [405, 125] },
    before: { graph: makeGraph(abcd, [['A', 'B'], ['B', 'C'], ['C', 'D']]), caption: 'Every vertex can reach every other vertex along this undirected chain.' },
    after: { graph: disconnected, caption: 'Removing B–C splits the graph into {A, B} and {C, D}.' },
    takeaway: 'A traversal from A reaches only its component once the link is removed.'
  },
  weights: {
    id: 'weights', title: 'Unweighted and weighted',
    positions: diamond,
    before: { graph: hops, caption: 'Both routes from A to D take two hops.' },
    after: { graph: routes(10), caption: 'The same two routes now cost 7 via B and 12 via C.' },
    takeaway: 'An edge weight can represent cost, time, or distance. A weighted route adds the values on its edges.'
  }
};
