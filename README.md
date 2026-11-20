[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/suwenyiyang/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/suwenyiyang/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR — a make.fun gta6-01 entry

**SOLMAR** is an original open-world crime game set in a fictional sun-baked coastal city. You play **Mara Quinn**, a getaway driver who owes the Breakwater crew one last debt. Over four nights in Solmar, she takes four jobs from the fixer Silas Venn — each one a drive, a delivery, or a disappearance — to buy her way out and take back the tide.

Drive the streets, steal a better car when you need one, dodge the harbour patrol, and finish each job before the heat catches up with you. The city is alive: traffic flows, pedestrians scatter, police cruisers give chase, and the sea is always at the south edge of the map.

## How to play

No build step, no install, no network. Open the game in a desktop browser:

- Double-click `game/index.html`, or
- run `node serve.ts` and open http://localhost:8080

Your progress saves automatically to the browser (local storage) and you can continue where you left off from the title screen.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D or arrow keys | Move / drive |
| Mouse | Aim (on foot) |
| Click | Fire pistol |
| E | Enter / exit the nearest car |
| Space | Handbrake |
| F | Punch |
| R | Reload |
| Shift | Run |
| Esc | Pause |
| M | Mute |
| Enter | New game |
| C | Continue saved game |

## Features

- A hand-built coastal city: gridded streets, parks, parking lots, a beach promenade, and the sea
- Live traffic and pedestrians with their own routes and reactions
- Car theft: take any parked or passing car (E to get in, E to step out)
- Wanted system: cause trouble and the heat rises; police cruisers spawn and chase you
- Four story missions with cash rewards, each introduced by its own briefing toast
- On-foot combat: pistol with ammo and reloads, plus a punch for close encounters
- Live minimap with the mission marker, player arrow, and police positions
- HUD with health, cash, wanted stars, weapon, speedometer, and a distance-to-target objective tracker
- Autosave and continue, plus a pause menu with manual save
- Synthesised WebAudio sound (engine, sirens, gunshots, interface blips) — no audio files
- Deterministic seeded world: the same seed always builds the same Solmar

## Missions

Four jobs, one way out. Each pays cash on completion and unlocks the next briefing.

1. **Salt Air — $350 (on foot).** Venn is calling in the last favour Mara owes the crew. Nessa waits at the marina steps with the tide chart for a boat that never docks — walk in quiet, while the harbour patrol is watching.
2. **Hot Cargo — $650 (drive).** The crew lifted a gold coupe off the north strip, and its papers point straight back at them. Get it to the arcade lot before the owners report it missing: one clean run, no scratches, no questions.
3. **Bad Radio — $900 (drive).** A pirate station on the old radio tower is broadcasting the crew's getaway routes. Reach the tower, cut the signal, and shake the patrol cars rolling your way — if it stays live, every job after this burns.
4. **Clean Tide — $1,300 (drive).** The last Breakwater payment sits in a duffel at the north pier, and Venn's buyers want it moved before dawn. Carry it yourself: one quiet drive, no crew, no backup. Deliver it clean and the debt is settled.

## Screenshots

The game stages its own screenshots deterministically from the URL, so every render is reproducible:

| Shot | URL |
| --- | --- |
| Title / start | `game/index.html?shot=start&seed=1` |
| Driving | `game/index.html?shot=drive&seed=1` |
| Police chase | `game/index.html?shot=chase&seed=1` |
| Mission approach | `game/index.html?shot=mission&seed=1` |

Change `seed=N` to rebuild the same scene in a different Solmar.

## Tech notes

- Pure JavaScript (ES modules) and a single `<canvas>` — no libraries, no framework, no network requests, no assets to download.
- All sound is synthesised at runtime with the WebAudio API; there are no audio files.
- The world, traffic, and pedestrians are generated from a seed, so the city is deterministic and replayable.
- `main.ts` (repo root) packages `game/` and `screenshots/` into the entry bundle with the vendored make.fun library (`vendor/makefun-game.ts`), writing `dossier.json`. Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## License

MIT — see [LICENSE](LICENSE).

## About this entry

SOLMAR is a 2D top-down open-world crime game, built from scratch for the make.fun GTA 6 bounty: one hand-built coastal city, four story missions, car theft, a wanted system with police chases, on-foot combat, a live minimap, and autosave. The four screenshots in `screenshots/` are real renders of the game itself, staged deterministically at seed 1 — the title screen (`1-start.jpg`), driving a delivery (`2-drive.jpg`), shaking a police tail (`3-chase.jpg`), and walking in on the first job (`4-mission.jpg`).

Play it live: https://suwenyiyang.github.io/gta6-01/game/ — no install, no account, just open it in a desktop browser.

## How to Play

You are Mara Quinn, a getaway driver working off a debt over four nights. Each night is one job — finish it, get paid, and the next briefing unlocks.

### Controls

- **W / A / S / D or arrow keys** — move on foot, drive in a car
- **E** — enter / exit the nearest car (steal any car you find)
- **Space** — handbrake
- **Mouse + click** — aim and fire the pistol (on foot)
- **F** — punch, **R** — reload
- **Esc** — pause, **M** — mute

### The four jobs

1. **Salt Air — $350 (on foot).** Meet Nessa at the marina steps.
2. **Hot Cargo — $650 (drive).** Deliver the gold coupe to the arcade lot.
3. **Bad Radio — $900 (drive).** Reach the radio tower and shake the tail.
4. **Clean Tide — $1,300 (drive).** Bring the payment to the north pier.

### Wanted level

Causing trouble raises your heat: stealing a car, hitting pedestrians, crashing, or firing your weapon. The HUD shows up to five wanted stars — the higher the heat, the more police cruisers spawn and the faster they arrive. Lay low and stay out of trouble and the stars drop one at a time. Lose the tail before you reach the objective, or the job gets a lot harder.

---

Built for the make.fun bounty: https://make.fun/bounty/gta6-01 — referral code `3mmef68q`.
