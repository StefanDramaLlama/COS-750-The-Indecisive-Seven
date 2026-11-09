// Shared build steps for scripts/build.ts and scripts/dev.ts.
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { validateCatalog } from "../src/server/lessons/catalog.js";

export const DIST = path.resolve("dist");

export const browserBuild: esbuild.BuildOptions = {
  entryPoints: ["src/studio/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: path.join(DIST, "assets/studio.js"),
  sourcemap: true,
  minify: true,
  logLevel: "info",
};

export async function copyStatic(): Promise<void> {
  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await copyFile("index.html", path.join(DIST, "index.html"));
  await copyFile("src/styles/tokens.css", path.join(DIST, "assets/tokens.css"));
  await copyFile("src/styles/studio.css", path.join(DIST, "assets/studio.css"));
}

export function checkCatalog(): void {
  const problems = validateCatalog();
  if (problems.length) {
    console.error("Lesson catalog problems:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("Lesson catalog OK (6 lessons).");
}

export async function buildAll(): Promise<void> {
  checkCatalog();
  await rm(DIST, { recursive: true, force: true });
  await copyStatic();
  await esbuild.build(browserBuild);
}
