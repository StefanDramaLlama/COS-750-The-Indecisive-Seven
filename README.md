# Graphwise

Graphwise is an interactive learning app for the COS 212 graph data structures and algorithms unit. It uses TypeScript and Node.js, with SQLite for local progress and Turso for hosted progress.

- **Graph Basics** introduces graph concepts. Its Foundations tab covers directed, undirected, and weighted graphs, with an interactive lab for adjacency lists and matrices.
- **Algorithm Studio** pairs visual walkthroughs and pseudocode with guided practice for BFS, DFS, Dijkstra, topological sort, Kruskal, and Prim. It also includes side-by-side algorithm comparisons.
- **Graph Builder** lets learners create a graph and run algorithms on it. **Algorithm Quiz** is currently open to everyone; set `quizRequiresAllLessons` in `src/shared/contracts.ts` to `true` to unlock it only after all Studio practice exercises.

## Run locally

Install Node.js 24.x and npm, then run the following from the repository root.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open the [course overview](http://127.0.0.1:4173/algorithms). Set `PORT` to use a different port. The local progress database defaults to `.data/graphwise.sqlite`.

For local configuration, copy [`.env.example`](.env.example) to `.env.local` and set the values you need. Set `GOOGLE_AI_STUDIO_API_KEY` to enable the optional Chat with Graphwise study helper.

## Develop and test

| Command | Purpose |
| --- | --- |
| `npm run check` | Build, validate the lesson catalogue, and run the test suite. |
| `npm run build` | Build the frontend into `dist/` and compile the local server into `.build/`. |
| `npm start` | Serve an existing build. |

The [Studio UI](src/studio/) and [Foundations lab](src/graphadt/) are separate frontend entry points. The [server code](src/server/) contains the algorithm implementations, lesson content, and progress storage. The local server and [Vercel functions](api/) use the same handlers.

## Deploy to Vercel

1. Import the repository using its root directory. [`vercel.json`](vercel.json) defines the build and routes.
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for each deployment environment. Use separate databases for Preview and Production.
3. With those variables set in your shell or in `.env.local`, run `npm run db:migrate -- --remote` against each database before deploying.
4. Verify that a practice exercise loads and that completion persists after a page reload.
