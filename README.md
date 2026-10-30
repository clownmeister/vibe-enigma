# Vibe Enigma

A web Enigma I for the DevFest Prague 2026 Vibe Lounge challenge, by Lucián Blažek. Vibe-coded with Claude Code.

Live: https://clownmeister.github.io/vibe-enigma/

## What it does

- Reads the whole machine from `GET /api/enigma`: alphabet, rotors (any count), notches, reflector, rings, plugboard, test vector. Nothing is hardcoded.
- Rotor start positions sit on 3D letter drums you drag, flick, scroll or type into, with a mechanical click. Rotor order, ring settings, reflector and plugboard are all settable.
- A QWERTZ lampboard lights the output letter and an SVG traces the signal through plugboard, rotors, reflector and back.
- The machine itself in 3D, procedural Three.js: a wooden case, hinged lid, three drums with letter rings and brass pins, reflector, entry wheel, plugboard cables, lampboard. It mirrors the page as you type, breathes apart when idle, and "examine" opens a full inspector with a pull-apart slider. `/3d/` is the inspector on its own.
- Typewriter sounds on every key, a play mode that types a message key by key, and a share link that carries settings and message in the URL hash.
- The latest intercept shows on a ruled form; page through the last ten or open any of them in the machine. Polls `GET /api/transmissions` every 15 s.
- The API test vector runs in both directions on every load.

## Stack

TypeScript on Vite, no framework, Three.js as the one runtime dependency, loaded after first paint. ESLint (strict, type-checked), Prettier, Vitest for the core. GitHub Actions runs the checks and deploys `dist/` to Pages on every push to `master`.

```
npm install
npm run dev        # http://localhost:5173/vibe-enigma/
npm run check      # lint, tests, type-check, build
npm run selftest   # the core against the live API
```

`CLAUDE.md` carries the rules an agent follows in this repo; `.claude/` holds its hooks and the screenshot skill.
