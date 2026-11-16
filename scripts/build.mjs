import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

for (const directory of ['.build', 'dist']) rmSync(directory, { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
await import('../.build/src/server/lessons/validate.js');
mkdirSync('dist/assets', { recursive: true });
cpSync('index.html', 'dist/index.html');
cpSync('graph-adt.html', 'dist/graph-adt.html');
cpSync('src/styles', 'dist/assets/styles', { recursive: true });
for (const folder of ['studio', 'shared', 'graphadt']) cpSync(`.build/src/${folder}`, `dist/assets/${folder}`, { recursive: true });
