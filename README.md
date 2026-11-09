# COS-750 · The Indecisive Seven — Graphwise Algorithm Studio

A pre-lecture prototype for COS 212. Learners step through six graph algorithms (Dijkstra, BFS, DFS, Kahn's topological sort, Kruskal, Prim), read the pseudocode line by line, and then predict the next move in a short practice. The full design is in [ALGORITHM_STUDIO_PLAN.md](ALGORITHM_STUDIO_PLAN.md).

## Setup

Requires **Node 24** (`engines.node` is pinned to `24.x`).

```bash
npm ci            # install from the lockfile
npm run dev       # http://localhost:3000/algorithms/dijkstra
```

`npm run dev` watch-builds the browser bundle, serves `dist/` with the same rewrites as `vercel.json`, runs the API handlers in-process, and migrates the local SQLite file `db/local.db` on start.

| Command | What it does |
| --- | --- |
| `npm run check` | Type-check everything and run the test suite (runners, catalog, practice replay, API, persistence) |
| `npm run build` | Validate the lesson catalog, bundle `src/studio` and copy HTML/CSS into `dist/` |
| `npm run migrate` | Apply `db/migrations/*.sql` to the local file, or to Turso when `TURSO_DATABASE_URL` is set |

## Routes

- `/algorithms` lists the lessons; `/algorithms/:lessonId` opens the walkthrough. Lesson ids: `dijkstra`, `bfs`, `dfs`, `topological-sort`, `kruskal`, `prim`.
- `?view=pseudocode` and `?view=practice` select the other views. Browser Back/Forward and direct loads work for all three.
- `#step-N` deep-links a walkthrough step, e.g. `/algorithms/dijkstra#step-12` is the moment D improves from 12 to 7.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/lessons[?id=…]` | Lesson list, or one public lesson (pseudocode, examples; no answers) |
| `POST /api/runs` `{lessonId, exampleId}` | Full walkthrough trace for a worked or variant example |
| `POST /api/practice` | Replays accepted choices server-side, applies `start` / `hint` / `answer`, reveals frames up to the open checkpoint |
| `GET /api/progress` | Per-lesson started/completed timestamps for the anonymous `gw_learner` cookie |

Errors use `{error: {code, message}}` with 400 / 404 / 405 / 409 (stale lesson version) / 422 (unsupported graph or invalid decision history).

## Layout

```text
index.html               Course shell and Algorithm Studio mount point
src/shared/types.ts      Graph, trace, lesson and HTTP contracts (browser + server)
src/server/algorithms/   Graph validation and six pure runners that emit trace frames
src/server/lessons/      Catalog, fixtures, pseudocode, practice checkpoints (server-only)
src/server/practice.ts   Practice replay and feedback
src/server/progress.ts   Anonymous learner id and progress upserts
src/server/handlers.ts   Framework-free handlers shared by Vercel and the dev server
api/                     Thin Vercel entry points
src/studio/              Browser UI: controller, SVG graph, state panel, pseudocode, practice
src/styles/              tokens.css (theme tokens) and studio.css
db/migrations/           Versioned SQL schema
tests/                   Vitest suites
```

## Study helper (AI)

The **Ask about this page** button (bottom right) opens a side panel chat backed by the Gemini API from Google AI Studio.

- Each question sends the visible lesson text (current step, highlighted pseudocode line, state table and the text description of the graph) as context. Answers are grounded in that screen.
- If a practice checkpoint is open, the helper gives hints and does not reveal the answer.
- Every answer has **Simpler**, **More detail** and **Listen** buttons. Listen uses Gemini text-to-speech. Long answers are spoken in chunks. If the AI voice is unavailable or out of quota, the browser's built-in voice takes over.
- The key stays on the server (`/api/tutor`, `/api/tts`). Put `GOOGLE_AI_STUDIO_API_KEY` in `.env` locally, or in Vercel's environment variables when deployed. Model names can be overridden; see `.env.example`.
- Defaults are free-tier models: `gemini-3.5-flash`, falling back to `gemini-flash-lite-latest` if the main model is busy or out of quota, and `gemini-3.8-flash-lite-tts` for voice.

## Visual style

Monochrome for now: white paper and black ink, with state shown by fill, dash patterns, line weight and double lines rather than colour. All colours come from `src/styles/tokens.css`. To bring in the planned cyan and green, set `--accent` and `--success` there (light `#006B78` / `#166534`, dark `#52E5F4` / `#71E8A2`). No component needs to change.

## Deploying to Vercel

1. Import the repository; `vercel.json` sets `npm ci`, `npm run build` and `dist/` output.
2. Create Turso databases for Preview and Production, then scope `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to each environment (see `.env.example`).
3. Run `npm run migrate` against each database (with those variables set) before deploying code that needs it.
