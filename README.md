# Vibe Enigma

Web Enigma decoder for the DevFest Vibe Lounge challenge, by Lucián Blažek. Vibe-coded with Claude Code.

Live: https://clownmeister.github.io/vibe-enigma/

- Reads the whole machine from `GET /api/enigma`: alphabet, rotors (any count), notches, reflector, rings, plugboard, test vector. Nothing hardcoded.
- Settable: rotor order, start positions on 3D letter drums (drag, flick, wheel, keys), ring settings, reflector, plugboard. Settings and the message live in the URL hash, so a link shares a setup.
- QWERTZ lampboard, animated signal path per letter, typewriter and rotor sounds, play mode that types a message key by key.
- Shows the latest intercept as a decrypt sheet, pages through the last ten, and polls `GET /api/transmissions` every 15 s.
- Self-test runs the API test vector in both directions on every load.

Pure vanilla ES modules, no build, no dependencies beyond three Google fonts. `node selftest.mjs` checks the core against the live API.
