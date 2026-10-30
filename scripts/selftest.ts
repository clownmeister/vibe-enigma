// Checks the core against the live lounge API: test vector both ways, then
// the latest three transmissions. Runs with Node's type stripping, no build.
import { encode } from '../src/enigma.ts';
import type { MachineDescription, Transmission } from '../src/api.ts';

const base = process.env['API'] ?? 'https://devfest-vibe-lounge.web.app/api';
const cfg = (await (await fetch(`${base}/enigma`)).json()) as MachineDescription;
const tv = cfg.testVector;
if (!tv) throw new Error('API has no test vector');
const got = encode(cfg, tv.start, tv.plaintext);
const back = encode(cfg, tv.start, tv.ciphertext);
const ok = got === tv.ciphertext && back === tv.plaintext;
process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${got}\n`);
const { transmissions } = (await (await fetch(`${base}/transmissions`)).json()) as {
  transmissions: Transmission[];
};
for (const t of transmissions.slice(0, 3))
  process.stdout.write(`${String(t.number)} ${t.start} ${encode(cfg, t.start, t.ciphertext)}\n`);
process.exit(ok ? 0 : 1);
