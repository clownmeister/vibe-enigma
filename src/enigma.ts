// Generic Enigma core. Pure, no DOM. Everything comes from the machine
// description the API returns: alphabet, rotors (any count), reflector,
// rings, plugboard.

export interface RotorSpec {
  name: string;
  wiring: string;
  /** One or more notch letters. */
  notch: string;
}

export interface ReflectorSpec {
  name: string;
  wiring: string;
}

export interface MachineConfig {
  alphabet?: string;
  /** Listed left to right, as on the machine. */
  rotors: RotorSpec[];
  reflector: ReflectorSpec;
  /** Ring settings, left to right. Defaults to the first letter for every rotor. */
  rings?: string;
  /** Pairs such as ["DE", "VF"]. */
  plugboard?: string[];
}

export interface EncodedChar {
  out: string;
  /** Index at each stage: in, plugboard, rotors right to left, reflector, rotors left to right, plugboard. Null for pass-through characters. */
  path: number[] | null;
}

export interface Machine {
  readonly alphabet: string;
  encodeChar(ch: string): EncodedChar;
  encode(text: string): string;
  /** Current rotor positions, left to right. */
  positions(): string;
  setPositions(start: string): void;
}

interface Rotor {
  fwd: number[];
  bwd: number[];
  notches: number[];
  ring: number;
  pos: number;
}

const DEFAULT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const mod = (n: number, m: number): number => ((n % m) + m) % m;

function makeRotor(spec: RotorSpec, ring: string, start: string, alpha: string): Rotor {
  const idx = (c: string): number => alpha.indexOf(c);
  const fwd = spec.wiring.toUpperCase().split('').map(idx);
  const bwd: number[] = new Array<number>(alpha.length).fill(0);
  fwd.forEach((to, from) => {
    bwd[to] = from;
  });
  return {
    fwd,
    bwd,
    notches: spec.notch.toUpperCase().split('').map(idx),
    ring: Math.max(0, idx(ring)),
    pos: Math.max(0, idx(start)),
  };
}

function through(rotor: Rotor, c: number, table: number[], n: number): number {
  const shift = rotor.pos - rotor.ring;
  return mod((table[mod(c + shift, n)] ?? 0) - shift, n);
}

function makePlugboard(pairs: string[], alpha: string): number[] {
  const map = alpha.split('').map((_, i) => i);
  for (const pair of pairs) {
    const a = alpha.indexOf(pair[0] ?? ''),
      b = alpha.indexOf(pair[1] ?? '');
    if (a < 0 || b < 0 || a === b) continue;
    map[a] = b;
    map[b] = a;
  }
  return map;
}

/**
 * Build a machine at a given start position (left to right, e.g. "YMJ").
 * Stepping follows the real Enigma: the rightmost rotor steps before every
 * letter; a rotor steps its left neighbour when it moves off its notch; and
 * a rotor sitting on its notch steps itself too (the double step).
 */
export function createMachine(config: MachineConfig, start: string): Machine {
  const alpha = (config.alphabet ?? DEFAULT_ALPHABET).toUpperCase();
  const n = alpha.length;
  const count = config.rotors.length;
  const first = alpha[0] ?? 'A';
  const rings = (config.rings ?? '').toUpperCase().padEnd(count, first);
  const pos = start.toUpperCase().padEnd(count, first);
  // rotors[0] is the rightmost, fastest rotor
  const rotors = config.rotors
    .map((r, i) => makeRotor(r, rings[i] ?? first, pos[i] ?? first, alpha))
    .reverse();
  const reflector = config.reflector.wiring
    .toUpperCase()
    .split('')
    .map((c) => alpha.indexOf(c));
  const plug = makePlugboard(config.plugboard ?? [], alpha);

  function step(): void {
    const atNotch = rotors.map((r) => r.notches.includes(r.pos));
    const moves = rotors.map(
      (_, i) => i === 0 || atNotch[i - 1] === true || (atNotch[i] === true && i < count - 1),
    );
    rotors.forEach((r, i) => {
      if (moves[i] === true) r.pos = mod(r.pos + 1, n);
    });
  }

  function encodeChar(ch: string): EncodedChar {
    const c0 = alpha.indexOf(ch.toUpperCase());
    if (c0 < 0) return { out: ch, path: null };
    step();
    const path = [c0];
    let c = plug[c0] ?? c0;
    path.push(c);
    for (const r of rotors) {
      c = through(r, c, r.fwd, n);
      path.push(c);
    }
    c = reflector[c] ?? c;
    path.push(c);
    for (let i = rotors.length - 1; i >= 0; i--) {
      const r = rotors[i];
      if (!r) continue;
      c = through(r, c, r.bwd, n);
      path.push(c);
    }
    c = plug[c] ?? c;
    path.push(c);
    return { out: alpha[c] ?? ch, path };
  }

  return {
    alphabet: alpha,
    encodeChar,
    encode: (text) =>
      text
        .split('')
        .map((ch) => encodeChar(ch).out)
        .join(''),
    positions: () =>
      rotors
        .map((r) => alpha[r.pos] ?? first)
        .reverse()
        .join(''),
    setPositions: (s) => {
      const p = s.toUpperCase().padEnd(count, first);
      rotors.forEach((r, i) => {
        r.pos = Math.max(0, alpha.indexOf(p[count - 1 - i] ?? first));
      });
    },
  };
}

export function encode(config: MachineConfig, start: string, text: string): string {
  return createMachine(config, start).encode(text);
}
