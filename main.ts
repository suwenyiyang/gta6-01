// SOLMAR's entry point for the make.fun scorer (Node 22, standard library only).
//
// What this file does, in one paragraph: it takes the playable game that lives in
// game/ beside it — plain static files a desktop browser loads offline, no build
// step and no network — plus whatever screenshots sit in screenshots/, copies both
// into the output directory, and writes the dossier.json the judge reads, using
// the vendored make.fun library. The dossier is the entry's table of contents:
// the game tree, the screenshots, and the source text the scorer is allowed to
// see, all cut to the caps the bounty sets.
//
// Run it from this directory with an output folder of your own choosing:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Without MAKEFUN_OUTPUT_DIR it writes to /output, the scorer's own directory.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in: game/ and screenshots/ sit beside it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
// Where the finished entry goes. The scorer sets this to /output itself;
// outside its container, point it at a scratch folder instead.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });

// The game itself, copied whole: index.html, its modules, everything under game/.
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

// The screenshots, if there are any. An empty screenshots/ still copies cleanly,
// so the build succeeds even before the renders exist.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps come straight from the bounty's gate: at most 160 KiB of source text in
// the dossier, at most 4 screenshots of 256 KiB each, and game/ itself capped at
// 993 entries / 48 MiB total / 1000-byte paths, so the entry the scorer would
// refuse is refused here first, at build time, instead of at judging time.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
