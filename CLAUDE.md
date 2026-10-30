# CLAUDE.md

Vibe Enigma: a web Enigma I for the DevFest Prague 2026 Vibe Lounge challenge. One page, no framework, TypeScript on Vite. Deployed to GitHub Pages from `master` by `.github/workflows/deploy.yml`.

Live: https://clownmeister.github.io/vibe-enigma/

## Layout

| Path                   | Holds                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `src/enigma.ts`        | The machine. Pure, any rotor count, alphabet from config. Tested in `enigma.test.ts` |
| `src/api.ts`           | The lounge API types and fetchers                                                    |
| `src/drums.ts`         | 3D letter drums: render, turn, drag, flick, wheel, keys                              |
| `src/path.ts`          | The signal-path SVG                                                                  |
| `src/audio.ts`         | Synthesised clicks, clacks, teleprinter burst, mute                                  |
| `src/main.ts`          | Page state and wiring. The only file that touches the DOM by id                      |
| `src/styles.css`       | All styling. Tokens at the top                                                       |
| `index.html`           | Markup only                                                                          |
| `scripts/selftest.ts`  | Live check against the API test vector and feed                                      |
| `scripts/slopcheck.py` | Flags AI-writing artefacts in markdown                                               |

## Rules

- Nothing about the machine is hardcoded. Rotors, notches, reflector, rings, plugboard, alphabet and the test vector come from `GET /api/enigma`. A change that pins Enigma I in code is wrong even if it passes.
- Every change runs `npm run check` (lint, tests, build) before a commit. Pushes to `master` deploy.
- A UI change is verified by looking at it: `npm run dev`, then screenshot at 1280 and 390 with the `screenshot` skill. The lounge judges on a laptop and a phone.
- Design is the lounge's world: black, warm paper, red `#f11000`, lamp amber, Bebas Neue, JetBrains Mono, Special Elite. No neon, no blinking, no native form controls left undressed. Read `DESIGN.md`.
- Prose in markdown passes `python3 scripts/slopcheck.py FILE`: ASCII punctuation, no em dashes, no exclamation marks.
- The entry is submitted. The board keeps the URL, so a deploy updates the entry; never resubmit.

## Commands

```
npm run dev        # http://localhost:5173/vibe-enigma/
npm run check      # eslint + prettier + vitest + tsc + vite build
npm run fix        # eslint --fix + prettier --write
npm run selftest   # core against the live API
```
