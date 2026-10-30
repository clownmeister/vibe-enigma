# Vibe Enigma

Web Enigma decoder for the DevFest Vibe Lounge challenge. Vibe-coded with Claude Code.

- Reads the whole machine from `GET /api/enigma`: alphabet, rotors (any count), notches, reflector, rings, plugboard, test vector. Nothing hardcoded.
- Settable: rotor order, start positions, ring settings, reflector, plugboard. Settings live in the URL hash, so a link shares a setup.
- Keyboard + lampboard with the signal path per letter. Reciprocal, so the same page encodes and decodes.
- Tunes in to `GET /api/transmissions` every 15 s and decodes the agenda live.
- Self-test runs the API test vector in both directions on every load.

Pure vanilla ES modules, no build, no dependencies. `node selftest.mjs` checks the core against the live API.
