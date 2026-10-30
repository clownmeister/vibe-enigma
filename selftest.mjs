import { encode } from './enigma.js';
const base = process.env.API ?? 'https://devfest-vibe-lounge.web.app/api';
const cfg = await (await fetch(`${base}/enigma`)).json();
const tv = cfg.testVector;
const got = encode(cfg, tv.start, tv.plaintext);
console.log(got === tv.ciphertext ? 'PASS' : 'FAIL', got);
const { transmissions } = await (await fetch(`${base}/transmissions`)).json();
for (const t of transmissions.slice(0, 3)) console.log(t.number, t.start, encode(cfg, t.start, t.ciphertext));
if (got !== tv.ciphertext) process.exit(1);
