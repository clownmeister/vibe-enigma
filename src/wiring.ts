// "Look inside": the whole machine as a wiring diagram, laid out like the real
// one. The reflector on the left, rotors in their slot order, the plugboard
// and the keyboard contacts on the right; a letter enters from the right,
// crosses to the reflector and comes back. Every contact of every part is
// drawn at its current offset, with the last letter's path on top.
import type { WiringSnapshot } from './enigma';

export interface WiringOptions {
  alphabet: string;
  /** Rotor names, left to right. */
  order: string[];
  snapshot: WiringSnapshot;
  /** Stage indices of the last letter, as encodeChar reports them; empty when idle. */
  path: number[];
  width: number;
  /** Skip the draw-on animation (play mode redraws every key). */
  still: boolean;
  /** A contact the user has picked for a new plugboard pair, if any. */
  pick?: number | null;
}

const ROW = 13;
const PAD_TOP = 22;
const LABEL_W = 22;
const UKW_W = 46; // room for the reflector's loops

export function renderWiring({
  alphabet,
  order,
  snapshot,
  path,
  width,
  still,
  pick = null,
}: WiringOptions): string {
  const n = alphabet.length;
  const R = snapshot.rotors.length;
  const liveCls = still ? 'live still' : 'live';
  const W = Math.max(360, width);
  const H = PAD_TOP + n * ROW + 8;
  // R + 1 spans between R + 2 boundaries: rotors left to right, then the plugboard
  const spans = R + 1;
  const inner = W - LABEL_W * 2 - UKW_W;
  const spanW = inner / spans;
  const x = (k: number): number => LABEL_W + UKW_W + k * spanW; // boundary k, 0 = reflector side
  const y = (i: number): number => PAD_TOP + i * ROW + ROW / 2;
  const ukwX = x(0);
  const keyX = x(spans);

  const inIdx = path[0],
    outIdx = path[path.length - 1];
  const letters = alphabet
    .split('')
    .map(
      (L, i) =>
        `<text class="key" x="${f(LABEL_W - 6)}" y="${f(y(i) + 4)}">${L}</text>` +
        `<text class="key ${i === inIdx ? 'in' : ''} ${i === outIdx ? 'out' : ''} ${i === pick ? 'pick' : ''}" x="${f(keyX + 6)}" y="${f(y(i) + 4)}">${L}</text>`,
    )
    .join('');
  const heads =
    `<text class="head" x="${f(ukwX - UKW_W / 2)}" y="12">ukw</text>` +
    order.map((name, k) => `<text class="head" x="${f(x(k) + spanW / 2)}" y="12">${name}</text>`).join('') +
    `<text class="head" x="${f(x(R) + spanW / 2)}" y="12">plug</text>`;

  // contact strips: the faces where one part meets the next
  const strips = Array.from({ length: spans + 1 }, (_, k) => k)
    .map(
      (k) =>
        `<line class="strip" x1="${f(x(k))}" y1="${f(y(0) - ROW / 2)}" x2="${f(x(k))}" y2="${f(y(n - 1) + ROW / 2)}"/>`,
    )
    .join('');

  // every wire, dim. Rotor j in the snapshot is the j-th from the right and
  // occupies the span between boundaries R - 1 - j and R - j.
  const wires: string[] = [];
  snapshot.plugboard.forEach((to, from) => {
    wires.push(line(keyX, y(from), x(R), y(to), to === from ? 'wire straight' : 'wire'));
  });
  snapshot.rotors.forEach((table, j) => {
    table.forEach((to, from) => {
      wires.push(line(x(R - j), y(from), x(R - 1 - j), y(to), 'wire'));
    });
  });
  snapshot.reflector.forEach((to, from) => {
    if (from < to) wires.push(arc(ukwX, y(from), y(to), -UKW_W * 1.3, 'wire'));
  });

  // the live letter: in from the keyboard to the reflector, then back out
  const live: string[] = [];
  if (path.length === 2 * R + 4) {
    const at = (i: number): number => y(path[i] ?? 0);
    live.push(line(keyX, at(0), x(R), at(1), `${liveCls} fwd`));
    for (let j = 0; j < R; j++)
      live.push(line(x(R - j), at(1 + j), x(R - 1 - j), at(2 + j), `${liveCls} fwd`));
    live.push(arc(ukwX, at(R + 1), at(R + 2), -UKW_W * 1.3, `${liveCls} fwd`));
    for (let k = 0; k < R; k++)
      live.push(line(x(k), at(R + 2 + k), x(k + 1), at(R + 3 + k), `${liveCls} back`));
    live.push(line(x(R), at(2 * R + 2), keyX, at(2 * R + 3), `${liveCls} back`));
    // a dot and the contact letter at every junction, so the route can be read off
    const stops: [number, number, string][] = [
      [keyX, 0, 'fwd'],
      [x(R), 1, 'fwd'],
      ...Array.from({ length: R }, (_, j): [number, number, string] => [x(R - 1 - j), 2 + j, 'fwd']),
      [ukwX, R + 2, 'back'],
      ...Array.from({ length: R }, (_, k): [number, number, string] => [x(k + 1), R + 3 + k, 'back']),
      [keyX, 2 * R + 3, 'back'],
    ];
    for (const [sx, i, leg] of stops) {
      const L = alphabet[path[i] ?? 0] ?? '';
      const side = sx === keyX ? -1 : 1; // keep the tag inside the drawing
      live.push(`<circle class="stop ${leg}" cx="${f(sx)}" cy="${f(at(i))}" r="3"/>`);
      live.push(
        `<text class="tag ${leg}" x="${f(sx + side * 7)}" y="${f(at(i) - 5)}" text-anchor="${side > 0 ? 'start' : 'end'}">${L}</text>`,
      );
    }
  }

  // hit targets over the plugboard span and the keyboard letters: tap two to patch them
  const hits = alphabet
    .split('')
    .map(
      (L, i) =>
        `<rect class="hit" data-i="${String(i)}" x="${f(x(R))}" y="${f(y(i) - ROW / 2)}" width="${f(W - x(R))}" height="${String(ROW)}"><title>patch ${L}</title></rect>`,
    )
    .join('');

  return `<svg viewBox="0 0 ${f(W)} ${f(H)}" aria-label="wiring diagram">${strips}${heads}${letters}${wires.join('')}${live.join('')}${hits}</svg>`;
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  const dx = (x2 - x1) * 0.45;
  return `<path class="${cls}" d="M${f(x1)} ${f(y1)} C${f(x1 + dx)} ${f(y1)} ${f(x2 - dx)} ${f(y2)} ${f(x2)} ${f(y2)}"/>`;
}

function arc(x: number, y1: number, y2: number, bulge: number, cls: string): string {
  return `<path class="${cls}" d="M${f(x)} ${f(y1)} C${f(x + bulge)} ${f(y1)} ${f(x + bulge)} ${f(y2)} ${f(x)} ${f(y2)}"/>`;
}

const f = (v: number): string => v.toFixed(1);
