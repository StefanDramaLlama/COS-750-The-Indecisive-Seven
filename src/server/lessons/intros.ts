import type { LessonId, LessonIntro } from '../../shared/contracts.ts';

// "Before you start" cards: plain-language orientation for learners meeting each algorithm for the first time.
// Every term the walkthrough and pseudocode use without explanation should be defined here.
export const intros: Record<LessonId, LessonIntro> = {
  basics: {
    problem: 'Many real problems are about things and the connections between them: cities and roads, people and friendships, tasks and the tasks they depend on. A graph is the picture we draw to reason about those connections, and every later lesson runs an algorithm on one.',
    analogy: 'Think of a map of train stations. Each station is a dot, and each track between two stations is a line. You can ignore everything else about the stations and still plan a journey.',
    steps: [
      'Draw each thing as a dot. These dots are called nodes (or vertices).',
      'Draw a line between two dots when they are connected. These lines are called edges.',
      'If a connection only works one way, put an arrowhead on the edge. The graph is now directed.',
      'If a connection has a cost, such as distance or time, write that number on the edge. The graph is now weighted.',
      'An algorithm is a fixed list of steps that walks around this picture to answer a question about it.'
    ],
    terms: [
      { term: 'Node / vertex', meaning: 'One item in the graph, drawn as a circle with a label such as A or B. "Vertex" and "node" mean the same thing; the plural of vertex is vertices.' },
      { term: 'Edge', meaning: 'A line joining two nodes. It says those two nodes are directly connected.' },
      { term: 'Neighbor', meaning: 'A node you can reach from another node by following exactly one edge.' },
      { term: 'Directed', meaning: 'Edges have arrows and can only be followed in the arrow’s direction, like a one-way street.' },
      { term: 'Weight', meaning: 'A number on an edge giving the cost of using it, such as kilometres or minutes.' },
      { term: 'Path', meaning: 'A sequence of edges that leads from one node to another, such as A → B → C.' },
      { term: 'Cycle', meaning: 'A path that ends back where it started without reusing an edge.' },
      { term: 'Connected', meaning: 'Every node can be reached from every other node by some path. If not, the graph splits into separate pieces called components.' }
    ],
    pitfall: 'Where a node is drawn does not matter. Two pictures with the same nodes and the same edges are the same graph, even if the dots are in different places or the lines have different lengths.'
  },
  dijkstra: {
    problem: 'You want the cheapest route from a start node to a goal node, where each edge has a cost (its weight). The route with the fewest edges is not always the cheapest one, so you cannot just count steps.',
    analogy: 'Imagine a delivery company that keeps a whiteboard with its best known cost to reach each town. At first only the depot is known (cost 0). Each time it locks in the cheapest town it hasn’t finalised yet, it checks whether going through that town makes any neighbouring town cheaper, and rubs out the old number if so.',
    steps: [
      'Give the start a cost of 0 and every other node a cost of ∞ (meaning "no route found yet").',
      'Pick the node with the smallest cost that is not yet final. Mark its cost as final. This is called settling it.',
      'For each neighbor of that node, add the edge weight to the settled cost. If the total beats the neighbor’s current cost, replace it and remember which edge you came through.',
      'Repeat until the goal is settled, or until no reachable node is left.',
      'To read the route, start at the goal and follow the remembered edges back to the start.'
    ],
    terms: [
      { term: 'Estimate (distance)', meaning: 'The cheapest total cost found so far to reach a node. It can go down as better routes are found, until the node is settled.' },
      { term: '∞ (infinity)', meaning: 'A placeholder meaning "no route to this node has been found yet". Any real cost is smaller than ∞.' },
      { term: 'Settle', meaning: 'Mark a node’s estimate as final. Dijkstra always settles the unsettled node with the smallest estimate.' },
      { term: 'Candidate', meaning: 'A possible new estimate: the settled node’s cost plus the weight of the edge to the neighbor.' },
      { term: 'Relax', meaning: 'Compare a candidate with the neighbor’s current estimate and keep whichever is smaller.' },
      { term: 'Predecessor', meaning: 'The edge you arrived through on the best route found so far. Following predecessors backwards from the goal gives the route.' },
      { term: 'Nonnegative weights', meaning: 'No edge cost is below zero. Dijkstra relies on this: adding an edge can never make a route cheaper, so a settled cost really is final.' },
      { term: 'O(V² + E)', meaning: 'How the work grows: V is the number of nodes and E the number of edges. Scanning a table for the smallest estimate costs about V steps each time, done V times.' }
    ],
    pitfall: 'A node’s estimate can drop several times before it is settled. Only the settled value is guaranteed to be the cheapest. Also, Dijkstra gives wrong answers if any edge has a negative weight.'
  },
  bfs: {
    problem: 'You want to visit every node you can reach from a start node, and find the route to a goal that uses the fewest edges (hops). Every edge counts the same, so there are no weights to add up.',
    analogy: 'Drop a stone in a pond. The ripple reaches everything 1 step away first, then everything 2 steps away, then 3. BFS spreads out from the start in the same rings, so the first time it reaches a node is along a route with the fewest hops.',
    steps: [
      'Put the start node in a queue (a waiting line) and mark it as discovered, at distance 0.',
      'Take the node at the front of the queue.',
      'Look at each of its neighbors. Any neighbor not yet discovered is marked discovered, given a distance one more than the current node, and added to the back of the queue.',
      'Repeat until the queue is empty. Nodes leave the queue in rings: all distance-1 nodes, then all distance-2 nodes, and so on.',
      'To read the route to the goal, follow the remembered edges back from the goal to the start.'
    ],
    terms: [
      { term: 'Queue (FIFO)', meaning: 'A waiting line: first in, first out. New nodes join at the back; the next node to process always comes from the front.' },
      { term: 'Enqueue / dequeue', meaning: 'Add a node to the back of the queue / remove the node at the front.' },
      { term: 'Hop', meaning: 'Following one edge. A route’s hop count is how many edges it uses.' },
      { term: 'Layer', meaning: 'All the nodes the same number of hops from the start. BFS finishes one layer before starting the next.' },
      { term: 'Discovered', meaning: 'BFS has seen this node and put it in the queue. It is marked straight away so it is never added twice.' },
      { term: 'Visit order', meaning: 'The order in which nodes leave the queue.' },
      { term: 'O(V + E)', meaning: 'BFS handles each node once and looks at each edge once, so the work grows with the number of nodes plus edges.' }
    ],
    pitfall: 'BFS finds the fewest hops, not the lowest cost. If edges have different weights, a route with more edges can be cheaper, and you need Dijkstra instead.'
  },
  dfs: {
    problem: 'You want to visit every node you can reach from a start node, going as deep as possible down one route before trying another. DFS is the building block for finding cycles, solving mazes and ordering tasks.',
    analogy: 'Explore a maze by always taking the next unexplored corridor. When you hit a dead end, walk back to the last junction that still has an unexplored corridor and try that one. A trail of breadcrumbs tells you where you have already been.',
    steps: [
      'Start at the start node. Mark it as visited.',
      'Look for a neighbor you have not visited yet. If there is one, go to it, mark it visited, and repeat this step from there.',
      'If every neighbor has been visited (a dead end), step back to the node you came from. This is called backtracking.',
      'Continue from that earlier node with its next unvisited neighbor.',
      'When you have backtracked all the way to the start and it has no unvisited neighbors left, the search is done.'
    ],
    terms: [
      { term: 'Visited', meaning: 'DFS has already entered this node. It is skipped if reached again, so the search never loops forever.' },
      { term: 'Stack (LIFO)', meaning: 'A pile: last in, first out. DFS keeps the route it is currently on as a stack, with the newest node on top.' },
      { term: 'Frame', meaning: 'One entry on the stack: a node and a bookmark for which of its neighbors to check next.' },
      { term: 'Push / pop', meaning: 'Put a new frame on top of the stack / remove the top frame.' },
      { term: 'Backtrack', meaning: 'Pop the finished node off the stack and carry on from the node underneath it.' },
      { term: 'Discovery order', meaning: 'The order in which nodes are first visited.' },
      { term: 'Component', meaning: 'A group of nodes that are connected to each other but not to the rest of the graph. One DFS run only reaches the start’s component.' }
    ],
    pitfall: 'DFS does not find shortest routes. It takes whichever branch it meets first, which may be a long way round. It also never reaches nodes in a different component from the start.'
  },
  'topological-sort': {
    problem: 'You have tasks where some must happen before others, drawn as arrows from each prerequisite to the task that needs it. You want one order for all the tasks that never does a task before its prerequisites.',
    analogy: 'Getting dressed: socks before shoes, shirt before tie. At any moment, you may put on anything whose prerequisites are already on. There is usually more than one correct order, but shoes can never come before socks.',
    steps: [
      'For each task, count how many prerequisites it still waits for. This count is its in-degree.',
      'Every task with a count of 0 is ready. Put the ready tasks in a list.',
      'Take any ready task and add it to the final order.',
      'That task is now done, so each task that depended on it waits for one fewer prerequisite. Subtract 1 from each of their counts; any that reach 0 become ready.',
      'Repeat until nothing is ready. If every task was placed, the order is complete. If some were never placed, they are stuck in a cycle.'
    ],
    terms: [
      { term: 'Dependency / prerequisite', meaning: 'A task that must be done before another. An arrow A → B means "A before B".' },
      { term: 'In-degree', meaning: 'How many arrows point into a node: how many prerequisites it is still waiting for.' },
      { term: 'Ready', meaning: 'A task whose in-degree has reached 0. It can be placed next.' },
      { term: 'Topological order', meaning: 'A list of all the tasks where every arrow points forward, from earlier in the list to later.' },
      { term: 'DAG', meaning: 'Directed acyclic graph: arrows only, and no cycle. Only a DAG has a full topological order.' },
      { term: 'Cycle', meaning: 'Tasks that wait for each other in a loop, such as A needs B and B needs A. None of them can ever become ready.' },
      { term: 'Postorder (recursive version)', meaning: 'The order in which a DFS finishes nodes. Reversing it gives a topological order.' }
    ],
    pitfall: 'There is usually more than one correct order. When two tasks are ready at the same time, either can go first. A cycle, though, means no correct order exists at all.'
  },
  kruskal: {
    problem: 'You want to connect every node using the cheapest possible set of edges, such as laying cable so every building is on one network. You need every node joined, no wasted loops, and the lowest total cost. The result is called a minimum spanning tree.',
    analogy: 'Sort every possible cable from cheapest to most expensive. Go down the list and lay each cable unless the two buildings it joins are already connected by cables you have laid. If they are, that cable would only create a loop, so you skip it.',
    steps: [
      'Sort all the edges from lowest weight to highest.',
      'Start with every node in its own group. A group is a set of nodes already joined by chosen edges.',
      'Take the next cheapest edge. If its two ends are in different groups, choose it and merge the two groups into one.',
      'If both ends are already in the same group, skip the edge: it would close a loop.',
      'Stop when you have chosen one fewer edge than there are nodes. Everything is now in one group.'
    ],
    terms: [
      { term: 'Spanning tree', meaning: 'A set of edges that connects every node with no cycles. With V nodes it always has exactly V − 1 edges.' },
      { term: 'Minimum spanning tree (MST)', meaning: 'The spanning tree whose edge weights add up to the smallest total.' },
      { term: 'Component (group)', meaning: 'A set of nodes already connected by the edges chosen so far. At the start, each node is its own component.' },
      { term: 'Disjoint sets (union–find)', meaning: 'The bookkeeping Kruskal uses to check quickly whether two nodes are in the same component, and to merge two components.' },
      { term: 'Greedy', meaning: 'Always takes the best-looking option right now (the cheapest safe edge) and never undoes a choice.' },
      { term: 'Spanning forest', meaning: 'What you get if the graph is not connected: a separate tree for each piece.' },
      { term: 'O(E log E)', meaning: 'Most of the work is sorting the E edges.' }
    ],
    pitfall: 'Kruskal ignores which edges are close together. It may pick edges in different corners of the graph first, so the partial result is often several separate pieces that join up only at the end.'
  },
  prim: {
    problem: 'Same goal as Kruskal: connect every node with the cheapest total set of edges (a minimum spanning tree). Prim gets there by growing a single connected tree outward from one starting node.',
    analogy: 'Spread a network from one building. At each step, look at every cable that runs from a building already on the network to a building not yet on it, and lay the cheapest one. The network grows by one building at a time and is always one connected piece.',
    steps: [
      'Start the tree with one node and no edges.',
      'Find every edge with one end inside the tree and the other end outside it. These edges are the frontier.',
      'Choose the cheapest frontier edge and add it, together with the outside node it reaches.',
      'Repeat until every node is in the tree.',
      'If the frontier runs out while some nodes are still outside, those nodes cannot be reached from the start.'
    ],
    terms: [
      { term: 'Tree', meaning: 'The connected set of nodes and edges Prim has built so far. It never contains a cycle.' },
      { term: 'Frontier (crossing edge)', meaning: 'An edge with exactly one end inside the tree. Only these edges can add a new node.' },
      { term: 'Minimum spanning tree (MST)', meaning: 'Edges that connect every node, with no cycle, at the lowest possible total weight.' },
      { term: 'Greedy', meaning: 'Always takes the cheapest frontier edge right now and never undoes a choice.' },
      { term: 'Partial tree', meaning: 'The result when the graph is not connected: a tree covering only the start node’s component.' },
      { term: 'O(VE)', meaning: 'This simple version scans all E edges each time it adds one of the V nodes.' }
    ],
    pitfall: 'Prim only looks at edges touching the current tree. A very cheap edge far away is ignored until the tree grows to reach it, unlike in Kruskal, which considers it first.'
  },
  compare: {
    problem: 'BFS and Dijkstra both find a route from a start node to a goal. They answer different questions: BFS finds the fewest edges, while Dijkstra finds the lowest total weight. This lesson shows when those answers differ.',
    analogy: 'BFS is choosing the bus route with the fewest stops. Dijkstra is choosing the route with the shortest total travel time. If every stop-to-stop trip takes the same time, both pick the same route.',
    steps: [
      'Run both algorithms on the same graph, from the same start to the same goal.',
      'BFS counts every edge as 1 hop and ignores the weights.',
      'Dijkstra adds up the weights along each route.',
      'If the weights differ, the fewest-hop route may not be the cheapest, so only Dijkstra is correct.',
      'If there are no weights, or all weights are equal, both return the same route, so pick BFS because it is simpler.'
    ],
    terms: [
      { term: 'Hop count', meaning: 'The number of edges on a route. This is what BFS minimises.' },
      { term: 'Total cost', meaning: 'The sum of the edge weights on a route. This is what Dijkstra minimises.' },
      { term: 'Queue vs. priority queue', meaning: 'BFS takes nodes in arrival order. Dijkstra always takes the node with the smallest estimate, which needs more code.' },
      { term: 'Unweighted graph', meaning: 'A graph with no numbers on its edges. Every edge effectively costs the same.' }
    ],
    pitfall: 'Faster is not the only deciding factor. When both algorithms give the same correct answer, the simpler code (BFS) is the better choice. When the weights matter, BFS is simply wrong.'
  },
  'compare-trees': {
    problem: 'Kruskal and Prim both build a minimum spanning tree: edges that connect every node with no cycle at the lowest total cost. This lesson shows that their totals always match, and what else decides which to use.',
    analogy: 'Two crews wire up the same campus. One sorts every cable by price and lays the cheapest useful ones wherever they are (Kruskal). The other starts at one building and keeps adding the cheapest cable that reaches a new building (Prim). They may lay different cables, but their bills are the same.',
    steps: [
      'Kruskal: sort all edges by weight, then take each one unless it would close a loop.',
      'Prim: start at one node, then repeatedly add the cheapest edge that reaches a new node.',
      'Both are greedy: they always take the cheapest safe edge available to them.',
      'Both end with V − 1 edges and the same minimum total cost.',
      'Choose based on the input: a ready list of edges suits Kruskal; a graph where any node can link to any other suits Prim.'
    ],
    terms: [
      { term: 'Minimum spanning tree (MST)', meaning: 'Edges that connect every node, with no cycle, at the lowest possible total weight.' },
      { term: 'Tie', meaning: 'Two edges with the same weight. With ties, the two algorithms can pick different edges, but the total stays the same.' },
      { term: 'Edge list', meaning: 'Input given as a list of (node, node, weight) entries. Kruskal works on this directly.' },
      { term: 'Dense graph', meaning: 'A graph where almost every pair of nodes has an edge. Prim with a simple array handles this well.' }
    ],
    pitfall: 'Different trees do not mean one algorithm is wrong. If the totals match, both answers are minimum spanning trees.'
  }
};
