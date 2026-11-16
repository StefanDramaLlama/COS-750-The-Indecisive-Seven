# Graphwise Algorithm Studio

Graphwise is the COS 212 pre-lecture prototype for Learning Outcomes 2 and 3. Each of the six lessons pairs an SVG graph and algorithm state with a synchronized step-through, annotated pseudocode, and a practice example.

## Run locally

Use Node.js 24 and npm from the repository root.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open [Algorithm Studio](http://127.0.0.1:4173/algorithms/dijkstra). The course overview is at [`/algorithms`](http://127.0.0.1:4173/algorithms). To use a different local port, set `PORT` before running the server.

The default database is `.data/graphwise.sqlite`. The app saves practice completion under an anonymous browser session and stores the theme choice in the browser. Use `.env.local` for local overrides listed in `.env.example`.

```sh
npm run check    # Compile, validate the catalog, and run runner and API tests
npm run build    # Produce static assets in dist and local server output in .build
npm start        # Serve the existing local build without rebuilding
```

## Lessons

| Lesson | Worked example | Apply it |
| --- | --- | --- |
| Dijkstra | Watch the cheapest route improve from 12 to 7. | Change the C–D cost and recover a new route. |
| BFS | Find a shortest route by counting hops. | Start at D and use the queue to predict the next visit. |
| DFS | Follow a branch and watch the call stack unwind. | Trace which vertices a disconnected graph leaves unreached. |
| Kahn’s topological sort | Order tasks from Plan to Ship. | Choose Research or Sketch when both are ready. |
| Kruskal | Skip a link that would form a cycle. | Recalculate the tree when one link becomes free. |
| Prim | Grow the tree from A using its crossing edges. | Decide when a free link can join the frontier. |

For the demo, open Dijkstra and advance to **Update D to 7**. Step back to see the estimate of 12 and its prior predecessor. In Practice, make one incorrect prediction, use the hint, and complete the exercise. Use the lesson selector to show the distinguishing operation in the remaining lessons. The Learning Guide contains before-and-after graph examples and each lesson’s objectives.

Open `/builder` for the Graph Builder. Add vertices to the grid, drag them into place, select two vertices to create an edge, and choose directed or weighted edges before running Dijkstra, BFS, DFS, topological sort, Kruskal, or Prim. The builder sends the graph through the same server-side validation and algorithm runners as the lessons. Invalid combinations return useful feedback, such as requiring weights for Dijkstra, Kruskal, and Prim, rejecting weights for BFS, requiring directed edges for topological sort, and requiring undirected edges for spanning-tree algorithms.

## How the app fits together

- `src/server/algorithms` runs the algorithms and emits frame snapshots. `src/server/lessons` owns the lesson copy, graph fixtures, and pseudocode.
- `src/studio` renders the two panes from the same active frame. Each lesson has a direct URL and separate Walkthrough, Pseudocode, and Practice views.
- The same handlers serve the local HTTP server and Vercel. `GET /api/lessons` returns the catalog, `POST /api/runs` returns a worked trace, `POST /api/practice` checks decisions and reveals steps, and `GET /api/progress` returns progress for the current session.
- `db/migrations` versions the shared SQLite schema. The server uses local SQLite for development and a hosted libSQL connection when configured for Vercel.

## Graph basics and Foundations

Graph basics opens on the Basics tab. Its Foundations tab covers the Graph ADT in four views: `/graph-adt/undirected`, `/graph-adt/directed`, `/graph-adt/weighted` and `/graph-adt/weighted-directed`. Each view has a definition and properties section, matrix and list pictures, an Operation lab (guided walkthrough and playground with the graph and its memory side by side, step back and forward, execution log, optional sound cues and read-aloud), an operation reference with before and after pictures, prediction questions, and full TypeScript code for both representations.

- `src/graphadt/engine.ts` turns a graph and a list of operations into frames (the contract is in `types.ts`). `content.ts` holds the copy and walkthrough scripts, `code.ts` the code samples, `quiz.ts` the prediction questions, `sound.ts` the audio cues, `render.ts` and `page.ts` the UI. The page entry is `graph-adt.html`.
- `tests/graphadt.test.ts` runs the code samples against the engine, so the code shown to learners behaves like the lab.

## AI study helper

Set `GOOGLE_AI_STUDIO_API_KEY` in the Git-ignored `.env` or `.env.local` file, then restart the dev server. On a hosted instance, set the same variable in the server environment. See `.env.example` for optional Gemini model and voice settings.

Open **Ask about this page** to ask a question about the visible lesson step. The helper sends the question, recent conversation, and visible lesson context to Gemini through `/api/tutor`. Answers can be simplified, expanded, or read aloud. The Listen action uses `/api/tts` and falls back to the browser voice when the AI voice is unavailable. The API key stays on the server.

## Vercel setup for later

1. Import the GitHub repository with the repository root as the Vercel project root. `vercel.json` selects the Other preset, builds the static frontend into `dist`, and keeps lesson deep links and API routes separate.
2. Create separate Turso databases for Preview and Production. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as server-only variables in the corresponding Vercel environment.
3. With the intended database credentials in your shell or local environment file, run `npm run db:migrate -- --remote` for each database before deploying. Keep credentials out of Git. For local Vercel routing checks, build first and run `vercel dev` with the local SQLite database migrated.
4. Verify the Preview URL with direct lesson links, all four API routes, and a full practice run. Check that completion survives a redeploy at the same branch URL. Repeat on Production once the team approves release.

See the [implementation plan](ALGORITHM_STUDIO_PLAN.md) for the full design and verification matrix.

## Learning-focused UI design

The interface is designed to reduce the visual distance between an algorithm rule and the learner's next decision. The lesson title and scenario sit at the top of the reading column, the graph and its legend occupy the primary study area, and the current step is placed beside the graph so learners can compare the visual change with its explanation without losing context. Playback controls remain directly below the graph, while pseudocode and practice prompts stay in the adjacent column. On small screens this becomes a deliberate reading sequence: graph, controls, explanation, working state, practice, then pseudocode and reference material.

The visual language takes cues from iOS and the portfolio's floating glass navigation without copying a product interface. Navigation, selectors, and lightweight controls use translucent pill surfaces with blur and a bright inner edge, while the graph and code panels remain more solid so information stays legible. The header includes a local date and time to make the studio feel present during a study session. The default background uses a soft lavender-blue field to keep long study sessions comfortable. Learners can independently choose System, Light, or Dark appearance and select Violet, Ocean, Mint, or Sunset accents; each accent updates the semantic learning highlight, dropdowns, and 3D graph rather than recoloring text arbitrarily.

Accessibility is treated as part of the layout. Text uses a dark blue ink color against pale surfaces, and the dark theme swaps to light text and deeper surfaces through the same semantic variables. Focus-visible outlines are retained for keyboard users, controls have stable touch-sized targets, graph state is also described in text and live announcements, and `prefers-reduced-motion` disables playback and decorative movement. Color is paired with labels, borders, and state text so a learner does not need to distinguish color alone.

## Section 8 · Algorithm Quiz Question Bank

Algorithm Quiz unlocks after you complete Practice for every Studio lesson, including both pairs in the Comparisons lesson. Comparisons opens with the results side by side. Choose BFS vs. Dijkstra to compare shortest paths or Kruskal vs. Prim to compare minimum spanning trees.

The quiz uses these 48 questions and scores the first 42. After submission, you can compare your six written responses with model answers. The answer choices are shuffled when the quiz loads.

### Graph foundations

1. **What two components make up every graph?**
   - A) Nodes and edges
   - B) Weights and labels
   - C) Paths and cycles
   - D) Vertices and distances

   **Answer:** A — A graph is a set of nodes (vertices) joined by edges.

2. **What distinguishes a directed edge from an undirected edge?**
   - A) It carries a weight
   - B) It has an arrowhead showing one permitted direction
   - C) It connects more than two nodes
   - D) It cannot be part of a cycle

   **Answer:** B — An arrowhead means the edge can be followed in only one direction.

3. **What does a weight on an edge represent?**
   - A) The number of vertices it skips
   - B) Cost, time, or distance along that link
   - C) Whether the edge is directed
   - D) The order in which algorithms consider it

   **Answer:** B — A weighted route adds the values on its edges.

4. **When is a graph cyclic?**
   - A) When every vertex can reach every other vertex
   - B) When an edge returns to its own starting vertex, forming a closed loop
   - C) When it has weighted edges
   - D) When it has more edges than vertices

   **Answer:** B — A cycle closes a loop back to a vertex already on the path.

5. **When is a graph disconnected?**
   - A) When it has isolated vertices only
   - B) When at least one vertex cannot reach another along edges
   - C) When it has no weights
   - D) When it contains a cycle

   **Answer:** B — Removing a bridge can split a graph into separate components.

### Dijkstra (weighted shortest path)

6. **What requirement must edge weights meet for Dijkstra to work?**
   - A) They must all be equal
   - B) They must be nonnegative
   - C) They must be integers
   - D) They must be prime numbers

   **Answer:** B — Negative weights can invalidate the "smallest estimate is final" guarantee.

7. **Which vertex does Dijkstra settle next?**
   - A) The first vertex in the graph
   - B) The unsettled vertex with the smallest distance estimate
   - C) The goal vertex immediately
   - D) A random reachable vertex

   **Answer:** B — With nonnegative weights, the smallest estimate is final.

8. **What happens when a candidate distance is smaller than the current estimate?**
   - A) The edge is skipped
   - B) The estimate and predecessor are updated (relaxation)
   - C) The vertex is marked unreachable
   - D) The search restarts

   **Answer:** B — Relaxation keeps the improving estimate and records the new edge.

9. **When does Dijkstra stop?**
   - A) After visiting every vertex
   - B) When the goal is settled, or no reachable unsettled vertex remains
   - C) After the first edge is considered
   - D) When all weights are equal

   **Answer:** B — An infinite goal distance means no route was found.

10. **What does a predecessor chain describe?**
    - A) The order vertices were discovered
    - B) A shortest route from the start to the goal, traced backward
    - C) All edges considered during the run
    - D) The cycle in the graph

    **Answer:** B — Follow predecessor edges backward from the goal.

### Breadth-first search (unweighted shortest path)

11. **What data structure does BFS use, and what order does it process vertices?**
    - A) A stack, last-in first-out
    - B) A queue, first-in first-out (layer by layer)
    - C) A priority queue, by distance
    - D) A set, in no particular order

    **Answer:** B — BFS visits vertices one layer at a time.

12. **Why does BFS mark a vertex as discovered when it is enqueued, not when dequeued?**
    - A) To weight the edges
    - B) To prevent two parents from queueing the same vertex twice
    - C) To compute hop counts
    - D) To detect cycles

    **Answer:** B — First discovery fixes the shortest hop count.

13. **What does BFS's first discovery of a vertex determine?**
    - A) Its predecessor only
    - B) Its shortest hop count from the start
    - C) Whether it is in a cycle
    - D) Its weight

    **Answer:** B — The first time a vertex is reached is via the fewest edges.

14. **What does an empty BFS queue mean?**
    - A) The goal was not found
    - B) Every vertex reachable from the start has been visited
    - C) The graph is empty
    - D) A cycle was detected

    **Answer:** B — All reachable vertices have been processed.

### Depth-first search (backtracking)

15. **What data structure does DFS use to explore?**
    - A) A queue
    - B) A stack (the call stack)
    - C) A priority queue
    - D) A hash table

    **Answer:** B — DFS follows a branch as far as possible before backtracking.

16. **What does DFS do when it reaches a dead end?**
    - A) Stops immediately
    - B) Pops the finished frame and resumes the previous vertex
    - C) Restarts from the start vertex
    - D) Picks a random edge

    **Answer:** B — Backtracking restores the previous vertex at its next neighbor.

17. **What does DFS return when the stack empties?**
    - A) The shortest path
    - B) The discovery order for the starting component
    - C) A minimum spanning tree
    - D) A topological order

    **Answer:** B — The search is complete for the starting component.

18. **Why can a DFS from A not reach vertices in a disconnected component?**
    - A) The stack is too small
    - B) Only vertices in A's connected component can be entered during this run
    - C) DFS only visits weighted edges
    - D) The graph has a cycle

    **Answer:** B — Traversal is bounded by connectivity.

### Topological sort (Kahn's algorithm)

19. **What makes a task ready in Kahn's algorithm?**
    - A) It has the highest cost
    - B) It has zero remaining incoming edges (indegree 0)
    - C) It was discovered first
    - D) It has no outgoing edges

    **Answer:** B — Incoming edges are prerequisites still to be placed.

20. **Can more than one valid topological ordering exist for the same DAG?**
    - A) No, the order is unique
    - B) Yes, any ready vertex can be placed next
    - C) Only if the graph is disconnected
    - D) Only if all weights are equal

    **Answer:** B — Choosing a different ready task can produce another valid ordering.

21. **What does a cycle in the dependency graph mean for topological sort?**
    - A) A faster ordering
    - B) No valid topological order exists; some tasks remain blocked
    - C) All tasks become ready at once
    - D) The algorithm skips the cycle and continues

    **Answer:** B — A back-edge means a prerequisite chain leads back to its own start.

22. **What must be placed before a task with two incoming edges?**
    - A) One of its prerequisite tasks
    - B) Both of its prerequisite tasks
    - C) All tasks in the graph
    - D) Nothing

    **Answer:** B — Each incoming edge is a separate prerequisite that must be resolved.

### Kruskal (minimum spanning tree)

23. **In what order does Kruskal consider edges?**
    - A) Random order
    - B) From cheapest to most expensive (global edge order)
    - C) From the start vertex outward
    - D) By vertex label

    **Answer:** B — Lower-cost links are considered first.

24. **When does Kruskal skip an edge?**
    - A) When it is the cheapest edge
    - B) When its endpoints already share a component (adding it would close a cycle)
    - C) When it has weight zero
    - D) When it touches the start vertex

    **Answer:** B — A link between already connected vertices forms a cycle.

25. **How many edges does a spanning tree on V vertices need?**
    - A) V
    - B) V − 1
    - C) V × (V − 1) / 2
    - D) E − 1

    **Answer:** B — V − 1 links connect every vertex without a cycle.

26. **What does Kruskal produce if the graph is disconnected?**
    - A) Nothing
    - B) A spanning forest — one tree per component
    - C) A cycle
    - D) A single tree using all edges

    **Answer:** B — It builds the best available network within each component.

### Prim (minimum spanning tree)

27. **What does Prim grow, and from where?**
    - A) Several trees in parallel
    - B) One connected tree, starting from a single chosen vertex
    - C) A cycle through all vertices
    - D) A topological ordering

    **Answer:** B — A single vertex is connected and has no edge cost.

28. **Which edges can Prim add next?**
    - A) Any edge in the graph
    - B) Only crossing edges — one endpoint in the tree, one outside
    - C) Only edges touching the start vertex
    - D) Only the cheapest edge overall

    **Answer:** B — Only edges crossing the frontier can expand the tree.

29. **Can the cheapest crossing edge Prim adds form a cycle?**
    - A) Yes, always
    - B) No — it connects a tree vertex to an outside vertex, so no cycle is created
    - C) Only if the edge has weight zero
    - D) Only if the graph is disconnected

    **Answer:** B — It grows the tree by one vertex and cannot close a loop.

30. **What does Prim return when no crossing edge exists?**
    - A) An error
    - B) The partial tree covering only the start vertex's component
    - C) A cycle
    - D) All edges sorted by weight

    **Answer:** B — A partial tree spans only the component reachable from the start.

### Mixed algorithms

31. **Which algorithm should you use to find the fewest-hop route in an unweighted graph?**
    - A) Dijkstra
    - B) BFS
    - C) Kruskal
    - D) Topological sort

    **Answer:** B — BFS counts hops and finds the shortest unweighted path.

32. **Which algorithm finds the lowest-cost route in a weighted graph with nonnegative weights?**
    - A) DFS
    - B) BFS
    - C) Dijkstra
    - D) Prim

    **Answer:** C — Dijkstra minimizes total edge weight.

33. **Which two algorithms build a minimum spanning tree?**
    - A) Dijkstra and BFS
    - B) Kruskal and Prim
    - C) DFS and topological sort
    - D) Kruskal and Dijkstra

    **Answer:** B — Both are greedy MST algorithms, one by global edge order, one by growing a tree.

34. **Which algorithm orders tasks by dependency?**
    - A) Prim
    - B) Topological sort
    - C) DFS
    - D) Kruskal

    **Answer:** B — Topological sort places prerequisites before dependents.

35. **Which algorithm explores a branch to its end before backtracking?**
    - A) BFS
    - B) Dijkstra
    - C) DFS
    - D) Kruskal

    **Answer:** C — DFS uses a stack and follows each branch as far as possible.

36. **Which algorithm uses a ready queue of zero-indegree vertices?**
    - A) Prim
    - B) Kruskal
    - C) Topological sort (Kahn's)
    - D) DFS

    **Answer:** C — Kahn's algorithm repeatedly places ready tasks and releases dependents.

37. **Which algorithm can report "unreachable" for a goal?**
    - A) Prim and Kruskal
    - B) Dijkstra and BFS
    - C) Topological sort only
    - D) DFS only

    **Answer:** B — Both shortest-path algorithms detect when no route exists.

38. **Which algorithm requires a directed graph?**
    - A) Prim
    - B) Kruskal
    - C) Topological sort
    - D) BFS

    **Answer:** C — Dependency arrows need direction; spanning trees require undirected edges.

39. **Which algorithm requires nonnegative weights?**
    - A) BFS
    - B) DFS
    - C) Dijkstra
    - D) Topological sort

    **Answer:** C — Dijkstra's finality guarantee depends on nonnegative edge weights.

40. **Which algorithm leaves out edges that would close a cycle?**
    - A) Dijkstra
    - B) BFS
    - C) Kruskal and Prim
    - D) Topological sort

    **Answer:** C — Both MST algorithms avoid cycle-forming edges; Kruskal via components, Prim via the crossing frontier.

41. **Which algorithm visits vertices in layers from a start vertex?**
    - A) DFS
    - B) BFS
    - C) Prim
    - D) Kruskal

    **Answer:** B — BFS processes the queue in arrival order, one layer at a time.

42. **Which algorithm's output can vary depending on tie-breaking choices?**
    - A) Dijkstra only
    - B) Topological sort only
    - C) Topological sort and DFS (neighbor order)
    - D) All of them can vary with ties

    **Answer:** D — Ties in weights, ready-queue choice, and neighbor order can all shift output.

### Short answer

43. **Explain in one sentence why Dijkstra settles the smallest-distance unsettled vertex first.**
    - Because all edge weights are nonnegative, no later-discovered path can offer a smaller estimate, so that distance is final.

44. **Explain why BFS marks vertices on enqueue rather than on dequeue.**
    - It prevents multiple parents from enqueueing the same vertex, ensuring each vertex is discovered once via its shortest hop count.

45. **Explain why DFS backtracks at a dead end.**
    - A branch is fully explored before the algorithm returns to the previous stack frame to try its remaining neighbors.

46. **Explain why a cycle blocks topological ordering.**
    - A cycle means every task in it depends (directly or indirectly) on another task in the cycle, so none can have zero remaining prerequisites.

47. **Explain the difference between Kruskal and Prim.**
    - Kruskal sorts all edges globally and adds the cheapest edge that joins two separate components; Prim grows one tree from a start vertex and repeatedly adds the cheapest crossing edge.

48. **When is Dijkstra's goal distance ∞, and what does it mean?**
    - When no reachable unsettled vertex remains before the goal is settled; the goal is unreachable from the start.
