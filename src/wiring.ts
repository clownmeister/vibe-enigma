// "Look inside": the whole machine as a wiring diagram. Every contact of the
// plugboard, each rotor at its current offset, and the reflector pairs, with
// the last letter's path drawn forward in orange and back in blue.
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
}

const ROW = 13;
const PAD_TOP = 22;
const LABEL_W = 22;

export function renderWiring({ alphabet, order, snapshot, path, width, still }: WiringOptions): string {
  const liveCls = still ? 'live still' : 'live';
  const n = alphabet.length;
  const names = [...order].reverse(); // right to left, matching snapshot.rotors
  const columns = ['plug', ...names, 'ukw'];
  const W = Math.max(360, width);
  const H = PAD_TOP + n * ROW + 8;
  const inner = W - LABEL_W * 2;
  const colW = inner / columns.length;
  const x = (col: number): number => LABEL_W + col * colW; // left edge of a column
  const y = (i: number): number => PAD_TOP + i * ROW + ROW / 2;

  const inIdx = path[0],
    outIdx = path[path.length - 1];
  const letters = alphabet
    .split('')
    .map(
      (L, i) =>
        `<text class="key ${i === inIdx ? 'in' : ''}" x="${String(LABEL_W - 6)}" y="${String(y(i) + 4)}">${L}</text>` +
        `<text class="key ${i === outIdx ? 'out' : ''}" x="${String(W - LABEL_W + 6)}" y="${String(y(i) + 4)}">${L}</text>`,
    )
    .join('');
  const heads = columns
    .map((c, k) => `<text class="head" x="${String(x(k) + colW / 2)}" y="12">${c}</text>`)
    .join('');

  // every wire, dim
  const wires: string[] = [];
  snapshot.plugboard.forEach((to, from) => {
    wires.push(line(x(0), y(from), x(1), y(to), to === from ? 'wire straight' : 'wire'));
  });
  snapshot.rotors.forEach((table, r) => {
    table.forEach((to, from) => {
      wires.push(line(x(r + 1), y(from), x(r + 2), y(to), 'wire'));
    });
  });
  const ukwX = x(columns.length - 1);
  snapshot.reflector.forEach((to, from) => {
    if (from < to) wires.push(arc(ukwX, y(from), y(to), colW * 0.8, 'wire'));
  });

  // the live letter: forward leg orange, return leg blue
  const live: string[] = [];
  if (path.length === 2 * snapshot.rotors.length + 4) {
    const R = snapshot.rotors.length;
    // forward: in->plug (col 0->1), plug->rotor1 (1->2) ... ->ukw
    for (let k = 0; k <= R; k++)
      live.push(line(x(k), y(path[k] ?? 0), x(k + 1), y(path[k + 1] ?? 0), `${liveCls} fwd`));
    live.push(arc(ukwX, y(path[R + 1] ?? 0), y(path[R + 2] ?? 0), colW * 0.8, `${liveCls} fwd`));
    // back: ukw->rotorL ... ->plug->out
    for (let k = 0; k <= R; k++) {
      const col = R + 1 - k;
      live.push(
        line(x(col), y(path[R + 2 + k] ?? 0), x(col - 1), y(path[R + 3 + k] ?? 0), `${liveCls} back`),
      );
    }
  }

  return `<svg viewBox="0 0 ${String(W)} ${String(H)}" aria-label="wiring diagram">${heads}${letters}${wires.join('')}${live.join('')}</svg>`;
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  const dx = (x2 - x1) * 0.45;
  return `<path class="${cls}" d="M${f(x1)} ${f(y1)} C${f(x1 + dx)} ${f(y1)} ${f(x2 - dx)} ${f(y2)} ${f(x2)} ${f(y2)}"/>`;
}

function arc(x: number, y1: number, y2: number, bulge: number, cls: string): string {
  return `<path class="${cls}" d="M${f(x)} ${f(y1)} C${f(x + bulge)} ${f(y1)} ${f(x + bulge)} ${f(y2)} ${f(x)} ${f(y2)}"/>`;
}

const f = (v: number): string => v.toFixed(1);
