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

## How the app fits together

- `src/server/algorithms` runs the algorithms and emits frame snapshots. `src/server/lessons` owns the lesson copy, graph fixtures, and pseudocode.
- `src/studio` renders the two panes from the same active frame. Each lesson has a direct URL and separate Walkthrough, Pseudocode, and Practice views.
- The same handlers serve the local HTTP server and Vercel. `GET /api/lessons` returns the catalog, `POST /api/runs` returns a worked trace, `POST /api/practice` checks decisions and reveals steps, and `GET /api/progress` returns progress for the current session.
- `db/migrations` versions the shared SQLite schema. The server uses local SQLite for development and a hosted libSQL connection when configured for Vercel.

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
