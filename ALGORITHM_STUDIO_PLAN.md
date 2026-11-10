# Graphwise Algorithm Studio implementation plan

This plan covers Learning Outcomes 2 and 3 for the COS 212 pre-lecture prototype. The `feature_algorithms` branch starts from a README-only codebase. The first two milestones establish the app shell and a complete walkthrough.

## Learning outcomes and scope

- **LO2 · Explain how an algorithm operates.** Learners advance and rewind a run, follow the active pseudocode line, and explain what changed in the graph or working state and why. Each lesson introduces the graph vocabulary and input assumptions it needs.
- **LO3 · Apply a prototypical algorithmic approach.** Learners work through a representative scenario, then apply the same method to a small variation. They predict the next action or choose a valid action, get a hint or explanation, and inspect the resulting path, order, traversal, or tree.

The exam brief sets a minimum of one accompanying CS2023 core algorithm and calls for formative scaffolding. **All six lessons are required for the team’s exam demo.** Build Dijkstra first to establish the reusable lesson format. Each of BFS, DFS, Kahn’s topological sort, Kruskal, and Prim then needs its own walkthrough, pseudocode, practice scenario, and feedback. The project brief’s LO3 notes also describe adding and removing nodes. Keep those in Graph Foundations or Playground and reuse the resulting graph examples in Algorithm Studio. [CS2023 report, Algorithmic Foundations](https://csed.acm.org/wp-content/uploads/2025/11/CS2023-Report.htm#AL-Foundational)

| Order | Approach and worked example | State to reveal and learner task |
| --- | --- | --- |
| 1 | **Weighted shortest path · Dijkstra.** Find the lowest-cost route from A to D using the Markdown guide’s weighted diamond. | Show tentative distances, predecessors, and the next minimum. Ask which vertex is selected next, then use a changed weight in practice. The worked run first finds cost 12 via C, then improves it to 7 via B. |
| 2 | **Traversal and unweighted shortest path · BFS.** Use the unweighted diamond to find a path from A to D. | Show the queue, discovered vertices, and hop counts. Ask which vertex leaves the queue next. Both routes to D have two edges. Declare the tie order for playback and explain the equal-length paths. |
| 3 | **Depth-first traversal · DFS.** Explore the guide’s branching graph, then use its disconnected example. | Show the stack or recursive call frames, discovered vertices, and backtracking. Ask where the traversal returns when it reaches a dead end. A run from A on the split graph reaches A and B only. |
| 4 | **Dependency ordering · Kahn’s topological sort.** Use the Figma Plan → Research/Sketch → Build → Ship example. | Show remaining in-degrees, the ready queue, and the output order. Accept either Research or Sketch in practice when both are ready. Use a cycle variant to explain why a full ordering can be impossible. |
| 5 | **Minimum spanning tree · Kruskal, then Prim.** Connect four sites with links A–B = 1, B–C = 2, A–C = 3, C–D = 4. | Show Kruskal’s sorted edges and components. Ask why A–C is rejected before adding C–D. Then use the same graph for Prim’s frontier and ask which edge can extend the current tree. Both produce a tree of cost 7. |

Use the Markdown guide’s four independent property contrasts as short primers linked to lessons. Show a plain edge becoming an arrow, a closing edge creating a cycle, a removed edge splitting a component, and weights appearing on unchanged edges. Keep vertex positions stable and show one change at a time. Transitive closure stays optional, as in the Figma export. Full algorithm comparison, a general graph editor, and executing learner-written code sit outside this delivery.

## Two-pane learner experience

Follow the storyboard’s interactive-left and code-right structure and the Figma Algorithm Studio’s navigation and lesson picker. Provide **Walkthrough**, **Pseudocode**, and **Practice** views within the same lesson. Keep the graph visible in each view.

- **Left · Graph and algorithm state.** Render a stable SVG with labeled vertices, arrowheads for directed edges, and weight labels. Highlight the current vertex or edge and show algorithm-specific state below the graph. A legend explains active, discovered or ready, completed, and skipped states. Mark the final path or tree on the same graph.
- **Right · Step-through.** Show the step number, the current action, what changed, and why. Highlight the relevant pseudocode line and make line explanations available by click and keyboard. Inspecting a line preserves the current playback position. Show the hint, learner response, and feedback in this pane during practice.
- **Shared controls.** Provide Back, Next, Restart, Play/Pause, a speed selector, and a step count. Start paused. Changing examples resets playback and practice state. On narrow screens, stack the graph above the current step, make the course navigation collapsible, and keep the primary playback controls easy to reach.
- **Themes and accessibility.** Offer System, Light, and Dark. Use the operating system setting by default and remember the learner’s override. Use CSS tokens for black or near-black ink and dark surfaces, cyan for active controls and the current step, and green for completion or success. Start with cyan `#006B78` and green `#166534` on light surfaces, and cyan `#52E5F4` and green `#71E8A2` on dark surfaces. Pair color with text, shapes, outlines, or line styles. Verify contrast in both modes, visible keyboard focus, touch targets, reduced motion, and a screen-reader-friendly text summary of the graph and current step.

## Project structure and integration boundaries

Use the agreed TypeScript backend, HTML/CSS frontend, and SQLite. The proposed setup uses browser TypeScript modules and plain DOM/SVG for the interactive UI. Keep the module independent of the course shell so the team can mount it from its `index.html` router. Confirm the URL prefix, graph shape, navigation entry, and existing identity support before merging the shell.

```text
index.html                       Course shell and Algorithm Studio mount point
src/studio/                      Lesson router, SVG, state panels, stepper, practice UI
src/styles/                      Shared tokens and responsive Studio styles
src/shared/                      Graph, trace, lesson, and HTTP response types
src/server/lessons/               Catalog, reviewed fixtures, prompts, and answer rules
src/server/algorithms/            Shared graph validation and six pure TypeScript runners
src/server/practice.ts            Replay choices, evaluate checkpoints, return feedback
src/server/progress.ts            Session and persistence operations
api/                             Thin Vercel handlers for lessons, runs, practice, progress
db/migrations/                   Versioned SQL schema
tests/                           Runner, API, persistence, and browser checks
```

Use `/algorithms/:lessonId` for Walkthrough and a `view` query parameter for Pseudocode or Practice. Support browser Back/Forward and direct loads of all three views. Use stable lesson IDs `dijkstra`, `bfs`, `dfs`, `topological-sort`, `kruskal`, and `prim`. Unknown lesson IDs show a lesson picker and a link back to the course. Keep server-only fixtures and answer rules outside the browser build. The browser imports shared types and renders API responses. Server handlers invoke the same services in local development and on Vercel.

## Graph, lesson, and trace contracts

| Record | Required fields and rules |
| --- | --- |
| `Graph` | `directed`, `vertices[{id,label}]`, `edges[{id,from,to,weight?}]`. IDs are unique within their collection and every edge endpoint must exist. Store an undirected edge once and derive both adjacency entries using the same edge ID. |
| `Example` | `id`, `kind`, `graph`, `positions`, `startId?`, `goalId?`, and the scenario text. Keep SVG coordinates keyed by vertex ID and separate from algorithm input. Require the start for BFS, DFS, Dijkstra, and Prim. Require the goal for the Dijkstra route lesson. |
| `Lesson` | `id`, `version`, prerequisites, learning objectives, pseudocode lines with stable IDs and individual explanations, example descriptors, and practice checkpoints. Return a public projection with the instructions and pseudocode. Keep checkpoint answers and unrevealed practice frames server-side. |
| `TraceFrame` | `index`, `event`, `lineId`, graph highlights, the algorithm’s full working state, and short explanations of what happened and why. Reserve `lineId: null` for the opening frame. Store unreachable or unknown distances as JSON `null` and render them as `∞` during a run. |
| `Run` | `lessonId`, `exampleId`, `version`, `graph`, `positions`, `frames`, and a typed result. A result carries a path and cost, visit order, topological order, selected tree edges and weight, or a diagnostic with any partial result. |

Use one discriminated state type per algorithm family. BFS has a queue, discovered set, distances, and predecessors. DFS has call frames, visited vertices, and discovery order. Dijkstra has tentative distances, predecessors, and settled vertices. Kahn has in-degrees, ready vertices, and output order. Kruskal has the sorted edges, component membership, selected edges, and running total. Prim has the growing vertex set, crossing edges, selected edges, and running total. Serialize ordered lists as arrays and lookup tables as records.

Build snapshots from the runner’s working state and copy every mutable collection when emitting a frame. Use stable vertex and edge IDs for ordering and comparisons, with ascending ID as the tie-break after algorithm-specific priorities. Advance by one teachable event, such as dequeueing a vertex, considering an edge, improving a distance, or backtracking. Include an opening frame and an explicit terminal frame. Keep the graph topology fixed throughout algorithm playback. The separate property primers use authored before/after SVG fixtures to illustrate structural changes.

Validate the catalog when running tests or building. Use curated examples of 3–6 vertices for the exam. The shared validator should handle up to 12 vertices and 36 edges, require unique IDs and valid endpoints, reject self-loops and parallel edges for the prototype, and require integer weights between −1,000,000 and 1,000,000 on weighted examples. The bound keeps accumulated costs exact. Dijkstra rejects negative weights. BFS shortest path examples are unweighted. Kahn requires directed input and can diagnose a cycle in a valid graph. Prim and Kruskal require weighted undirected input. Keep the API fixture-based for the exam, so a shared Playground can supply its own graph through the same validator later without a separate trace format.

## Algorithm runners and fixtures

| Runner | Implementation and frames | Acceptance fixture and practice |
| --- | --- | --- |
| Dijkstra | Use a distance table and scan for the minimum unsettled vertex. Initialize, select minimum, consider an outgoing edge, relax or keep its current estimate, and finish when the target is settled or no reachable vertex remains. Save the predecessor edge on strict improvement and reconstruct the path from the target. Teach the table-scan implementation with `O(V² + E)` time. | `A–B:5, A–C:2, B–D:2, C–D:10`. For A → D, check that D’s estimate changes from 12 via C to 7 via B. In practice change `C–D` to 3. Predict the new estimate, then identify A → C → D at cost 5. Include an unreachable target test. |
| BFS | Use an array queue with a read index. Mark discovery at enqueue, record predecessor and hop count, and visit neighbors in ascending ID order. Finish after the reachable component is exhausted. | On `A–B, A–C, B–D, C–D`, visit A, B, C, D and recover A → B → D at two hops. In practice start at D and predict which vertex is dequeued after D, then identify the hop count to A. Test that a vertex with two incoming discovery opportunities enters the queue once. |
| DFS | Use an explicit stack of `{vertexId, nextNeighborIndex}` frames to mirror recursive DFS. Mark on entry, walk one undiscovered neighbor at a time, and pop on backtrack. | On `A–B, B–C, A–D`, discover A, B, C, D and backtrack C → B → A before D. Practice on `A–B, C–D` from A. Ask where DFS returns when B has no undiscovered neighbor and which vertices remain unreached. |
| Kahn | Count in-degrees, seed the ready queue, remove a ready vertex, append it to the output, decrement each outgoing neighbor, and enqueue vertices that reach zero. When the ready queue empties, report either a full order or the blocked vertices. | Use `A→B, A→C, B→D, C→D, D→E`. With A already placed, accept B or C in practice and continue from that choice. Both full orders must respect every edge. Add `D→B` for a cycle case. A and C can be placed while B, D, and E stay blocked. Explain that E depends on the cycle. |
| Kruskal | Sort edges by weight and then by ID. Use disjoint sets to check whether an edge joins different components, union on acceptance, and stop at `V − 1` selected edges or when the edge list ends. Show component labels and why a cycle edge is skipped. | For `A–B:1, B–C:2, A–C:3, C–D:4`, skip A–C and finish at cost 7. Change `A–C` to 0 in practice. Ask whether to accept B–C after accepting A–C and A–B. The new tree costs 5. Test the disconnected case as a partial forest with a clear diagnostic. |
| Prim | Start from the selected vertex. Recompute the crossing edges by scanning the edge list, choose the cheapest crossing edge, and add its outside endpoint. Stop when every vertex is in the tree or when the frontier is exhausted. Teach this simple implementation with `O(VE)` time on connected inputs. | Use Kruskal’s worked fixture and start at A. Finish with total weight 7. Change `C–D` to 0 in practice. Ask which edge can be added first. The tree starts with A–B and finishes with cost 3. Test a disconnected graph and show that the partial tree only covers the start component. |

For the Dijkstra worked run, review this sequence before building the other lessons. Each selection and relaxation links to its pseudocode line. The two D updates provide a concrete LO2 explanation of relaxation and its effect on the highlighted predecessor edge.

| Checkpoint | Visible state after the step |
| --- | --- |
| Initialize | A = 0, B/C/D = ∞, no predecessor edges, nothing settled. |
| Process A | B = 5 via A and C = 2 via A. A is settled. |
| Process C | D = 12 via C. Highlight C–D as D’s current predecessor edge. |
| Process B | D = 7 via B. Replace D’s highlighted predecessor edge with B–D and explain the comparison `5 + 2 < 12`. |
| Settle D | Show A → B → D, total cost 7, and the predecessor chain used to recover the path. |

## Playback and practice behavior

- **State ownership.** Store the active lesson, view, example, loaded run, frame index, playback speed, and request status in one Studio controller. The SVG, state panel, explanation, active pseudocode line, and accessible step summary read the same frame. Use explicit events for Next, Back, Restart, Play/Pause, view changes, and lesson changes.
- **Walkthrough.** Start on frame 0, paused. Clamp Back/Next at the ends and disable unavailable controls. Restart returns to frame 0 and pauses. Play advances one frame at a time at 0.5×, 1×, or 2× and pauses at the last frame. Changing speed replaces the current timer. Switching lesson, example, or view pauses playback and cancels the old timer and request. Ignore any late response from a prior lesson. Keep the walkthrough frame when moving between Walkthrough and Pseudocode for the same example. The Practice view has its own frame and choices.
- **Rendering.** Create the SVG once per example with a `viewBox` and stable edge and vertex groups. On each step update classes, markers, labels, and state tables in place. Cyan marks the current action, and green plus a distinct outline or badge marks the final result. Keep focus on playback controls when the frame changes. Announce manual steps and practice feedback in a polite live region. During autoplay, keep the text summary readable without announcing every frame. Honor reduced motion by removing decorative transitions.
- **Pseudocode.** Give each line a focusable button, stable ID, and short explanation. Visually distinguish the executing line from a line the learner has selected to inspect. Keep the current line in view inside the code card without scrolling the page or moving focus. On mobile put the graph first, then playback controls, then the explanation and code.
- **Practice flow.** Begin with the scenario, input assumptions, and the graph’s first state. Advance to the first checkpoint and ask the learner to make a choice before revealing its result. An incorrect answer leaves the graph at that checkpoint and offers a targeted hint, retry, and a link to the matching walkthrough step. A correct choice updates the graph and advances to the next checkpoint. End with feedback that asks the learner to connect the result to the rule they applied. Require the lesson’s scored checkpoints for completion. Hints and retries remain available throughout.
- **Branching decisions.** Most checkpoints grade a stable option ID against the working state. Kahn also takes a ready vertex as a runner decision. Replay the accepted decisions, verify the selected vertex is ready, and continue the run from that vertex. The same rule controls the visible ready queue, validation, and output ordering. Record an accepted choice only after the server confirms it. Keep in-progress decisions for the current view in browser memory and save completion to the database.

## HTTP contracts and persistence

Use same-origin JSON calls with thin route handlers. `api/lessons.ts` reads an `id` query parameter so the standalone Vercel function can use a fixed file route. The lesson page URL still contains the slug. Share these contracts with the rest of the course before wiring the Code and Playground integrations.

| Endpoint | Request | Response and behavior |
| --- | --- | --- |
| `GET /api/lessons?id=dijkstra` | Stable lesson ID. Without an ID, return the ordered lesson list. | Public lesson metadata, pseudocode, and curated example descriptors. |
| `POST /api/runs` | `{lessonId, exampleId}` for a walkthrough fixture. | `Run` with all walkthrough frames. Return `200` for a valid run that ends in `unreachable`, `cycle`, or `disconnected`. Practice traces are served separately as decisions are made. |
| `POST /api/practice` | `{lessonId, exampleId, version, acceptedChoices, action}`. Each accepted choice contains `checkpointId` and `optionId`. Send `start` with an empty list, `hint` with the current checkpoint ID, or `answer` with the current checkpoint and option IDs. | Replay the accepted prefix server-side. Return revealed frames with stable indexes, feedback, the next prompt if any, and a completion status. An incorrect answer returns normal feedback and keeps the same checkpoint. Omit future frames and answers. |
| `GET /api/progress` | Same-origin request with the course or anonymous session cookie. | Per-lesson started/completed timestamps for the current learner. An empty session gets an empty progress list. Use `Cache-Control: no-store` for progress and practice responses. |

Validate method, JSON shape, fixture kind, lesson version, and decision history at the boundary. Use `405` for the wrong method, `400` for malformed requests, `404` for unknown lesson or example, `409` for a lesson version mismatch that requires restarting practice, and `422` for unsupported graph inputs or invalid decision history. Return `{error: {code, message}}` for request errors. In the UI distinguish loading, recoverable network failure, and valid algorithm diagnostics. Keep the last confirmed frame on a failed practice request and allow retry. Disable repeat submissions while one is pending.

Use the course identity when available. Otherwise, issue a server-generated opaque ID on the first practice request in an `HttpOnly`, `SameSite=Lax` cookie with `Secure` in hosted environments. Store a `lesson_progress` row with `learner_id`, `lesson_id`, `lesson_version`, `started_at`, and nullable `completed_at`. Use `(learner_id, lesson_id, lesson_version)` as the primary key. Use a parameterized upsert on practice start and on successful completion. Preserve the first timestamps with `COALESCE` so retries or two open tabs cannot erase completion. A runner or walkthrough request needs no database write. Reload restores completion status for the same browser session. An unfinished practice run starts again from its first checkpoint.

## Vercel deployment

1. **Build from the repository root.** Import the team’s GitHub repository into a shared Vercel project. Commit the lockfile and use `npm ci` for repeatable installation. Propose Node 24 for both local development and Vercel. Pin the major in `package.json` under `engines.node` and document it in the README. Define `npm run check` for type checking and tests, and `npm run build` to compile the browser modules, validate fixtures, and copy HTML/CSS into `dist`. Keep preview and production settings in `vercel.json`. [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json) · [Supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
2. **Serve the frontend and API from one origin.** Keep the Node.js entry points in root `api/` and use same-origin `/api/...` calls. Only rewrite the `/algorithms` page routes to `index.html`. Use `/assets/...` paths for built resources so they load correctly from a deep link. Build the static output and run `vercel dev` to test the functions and routing locally. Use the Git Preview as the deployment parity check. [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js) · [Vercel rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites)
3. **Provision durable progress storage.** Keep a local SQLite file for development. For Vercel, propose Turso Cloud with `@libsql/client` because Vercel Functions have ephemeral filesystems. Use one versioned SQL schema across local and hosted databases. Provision separate Preview and Production databases, scope `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the matching Vercel environment, and read them only in server code. Commit an `.env.example` with variable names. Run migrations explicitly against each database before deploying code that depends on them, outside request handling and preview builds. [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) · [Turso Cloud integration](https://vercel.com/marketplace/tursocloud) · [Vercel environment variables](https://vercel.com/docs/environment-variables)
4. **Preview before release.** Push `feature_algorithms` to GitHub during implementation and validate its Preview URL. Propose `main` as the production branch, subject to the team’s release workflow. After review, merge through that workflow and verify the Production URL with its own database. Add the setup commands, migration steps, and demo URL to the README. [Vercel Git deployments](https://vercel.com/docs/git)

Use this proposed `vercel.json` once the team confirms the route prefix.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/algorithms", "destination": "/index.html" },
    { "source": "/algorithms/:lessonId", "destination": "/index.html" }
  ]
}
```

**Deployment exit check.** On Preview, refresh a direct lesson link and confirm the Code and Playground APIs return JSON. Complete the Dijkstra practice, then confirm progress survives reload and a redeploy at the same branch URL. Open a second browser session and confirm it has its own progress. Repeat the core flow on Production and test the demo URL signed out of Vercel with the access setting intended for the exam. Keep the local demo runnable against its SQLite file as a fallback.

## Build order and exit checks

| Milestone | Work | Exit check |
| --- | --- | --- |
| 1 · Shell and contract | Agree on routes, types, example shape, and the file boundaries. Build the layout and theme switch using a small Dijkstra fixture response. Configure Vercel and create the first Preview. | Direct links, assets, and a same-origin JSON route work locally and on Preview. The shell renders on desktop and mobile and remembers the theme. |
| 2 · Dijkstra walkthrough | Implement runner, validate the cost 12 → 7 transition, and connect the API to SVG, state panel, pseudocode, and playback. | One canonical trace drives both panes. Back restores D’s prior estimate and predecessor edge. Restart and unreachable cases behave as specified. |
| 3 · Practice and persistence | Add practice replay, hints and feedback, anonymous or course session, migrations, and completion reporting. | A learner can retry an incorrect answer, finish Dijkstra practice, and reload to see it marked complete. Preview progress survives redeploy. |
| 4 · Five remaining lessons | After the trace types stabilize, split work into traversal (BFS/DFS), dependency ordering (Kahn), and spanning trees (Kruskal/Prim). Implement runners and author practice scenarios in parallel with persistence. | All six lesson routes have reviewed pseudocode, a worked run, a practice scenario, and fixture tests. Each lesson has a successful run and a test of an important input condition or branch. |
| 5 · Release and rehearse | Run automated and manual checks, add setup and demo steps to the README, and verify both Preview and Production. Rehearse from the demo URL. | The exam build contains all six lessons. The demo covers a worked run, learner application, feedback, and a path back to the explanation. The separate SE and ID documents capture the team’s implementation and instructional choices. |

Review each lesson with both a content reviewer and an implementation reviewer. The first checks that the graph, pseudocode, narration, feedback, and expected answer agree. The second checks contract compliance, both panes, keyboard operation, and the lesson’s edge cases. Keep transitive closure, audio, and free-form graph editing behind the six-lesson release gate.

## Verification matrix

| Layer | Cases to verify before release |
| --- | --- |
| Runner and fixtures | Verify the six worked results above and the practice answers. Assert repeat runs give identical frames, earlier frames remain unchanged, highlighted IDs and pseudocode line IDs exist, and the final frame matches the typed result. Check zero-weight edges and equal candidates, invalid endpoints and duplicate edges, BFS single discovery, DFS backtrack, Dijkstra unreachable and negative inputs, Kahn partial order on a cycle, and disconnected MST outputs. Verify MST connectivity, absence of cycles, `V − 1` edges, and total weight. |
| API and persistence | Check all response classes in the HTTP table. Submit both Kahn branches. Submit a stale version, invalid checkpoint history, an incorrect current answer, and a repeated correct completion. Confirm future practice frames and answers are absent from responses. Confirm retries preserve timestamps and a separate session has separate progress. |
| Browser | Verify both panes on Back, Next, and Restart. Switch lessons while a request or timer is pending. Test direct URLs, browser history, failed request retry, a full practice run, and completion after reload. Confirm the lesson switcher exposes all six routes. |
| Visual and accessibility | Test light, dark, and system themes at narrow mobile and desktop widths. Check long vertex labels, arrowheads and weights, tab order, visible focus, announcements, zoom, reduced motion, and legibility of states in grayscale. |
| Deployment | Use the Preview and Production checks in the Vercel section. Run the full browser flow against the hosted database before freezing the demo build. |

For the 10-minute demo, show the Dijkstra improvement and one practice retry, then use the lesson picker to show one distinguishing operation in each of the other five lessons. Reserve the last minute for completion status and the learner’s route back to the explanation.

The exam specification sets **08:00 SAST on 16 November 2026** as the cutoff for the SE and ID documents and specifies a 10-minute demo within the presentation slot. Record the prompts and tools used for any GenAI-assisted content or GUI in the ID document, as the specification requests.

## References used

- *COS750 Indecisive Seven*, pp. 1–2, 7–10, for the agreed stack, outcome definitions, and team notes.
- *COS750 Examination Specification V1*, §§2–3, for the exam prototype, scaffolding, documentation, and demo requirements.
- *Graphs in Data Structures & Algorithms* (Markdown guide), for the four property contrasts and graph examples.
- *750 storyboard*, LO 2 + 3 panel, for the interactive view and code placement.
- *Indecisive Seven* Figma export, pp. 2, 4, and 5, for Algorithm Studio, formative feedback, and mobile layout patterns.
