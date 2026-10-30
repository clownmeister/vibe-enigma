// Generic Enigma core. Pure functions, no DOM. Everything comes from the
// machine config returned by /api/enigma: alphabet, rotors (any count),
// reflector, rings, plugboard. Shared by the page and the self-test.

const mod = (n, m) => ((n % m) + m) % m;

function makeRotor(spec, ring, start, alpha) {
  const n = alpha.length;
  const idx = (c) => alpha.indexOf(c);
  const fwd = spec.wiring.split('').map(idx);
  const bwd = new Array(n);
  fwd.forEach((to, from) => (bwd[to] = from));
  const notches = (spec.notch || '').split('').map(idx);
  return { name: spec.name, fwd, bwd, notches, ring: idx(ring), pos: idx(start) };
}

function through(rotor, c, dir, n) {
  const shift = rotor.pos - rotor.ring;
  const table = dir === 'fwd' ? rotor.fwd : rotor.bwd;
  return mod(table[mod(c + shift, n)] - shift, n);
}

function makePlugboard(pairs, alpha) {
  const map = alpha.split('').map((_, i) => i);
  for (const p of pairs || []) {
    const a = alpha.indexOf(p[0]), b = alpha.indexOf(p[1]);
    if (a < 0 || b < 0 || a === b) continue;
    map[a] = b; map[b] = a;
  }
  return map;
}

/**
 * @param config { alphabet, rotors:[{name,wiring,notch}], reflector:{wiring}, rings, plugboard }
 *   rotors listed left to right.
 * @param start  rotor start positions, left to right, e.g. "YMJ"
 */
export function createMachine(config, start) {
  const alpha = (config.alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').toUpperCase();
  const n = alpha.length;
  const count = config.rotors.length;
  const rings = (config.rings || alpha[0].repeat(count)).toUpperCase().padEnd(count, alpha[0]);
  const pos = start.toUpperCase().padEnd(count, alpha[0]);
  // Index 0 is the rightmost (fastest) rotor.
  const rotors = config.rotors
    .map((r, i) => makeRotor(r, rings[i], pos[i], alpha))
    .reverse();
  const reflector = config.reflector.wiring.toUpperCase().split('').map((c) => alpha.indexOf(c));
  const plug = makePlugboard(config.plugboard, alpha);

  function step() {
    const atNotch = rotors.map((r) => r.notches.includes(r.pos));
    const moves = rotors.map((_, i) =>
      i === 0 || atNotch[i - 1] || (atNotch[i] && i < count - 1));
    rotors.forEach((r, i) => { if (moves[i]) r.pos = mod(r.pos + 1, n); });
  }

  function encodeChar(ch) {
    const c0 = alpha.indexOf(ch.toUpperCase());
    if (c0 < 0) return { out: ch, path: null };
    step();
    const path = [c0];
    let c = plug[c0]; path.push(c);
    for (const r of rotors) { c = through(r, c, 'fwd', n); path.push(c); }
    c = reflector[c]; path.push(c);
    for (let i = rotors.length - 1; i >= 0; i--) { c = through(rotors[i], c, 'bwd', n); path.push(c); }
    c = plug[c]; path.push(c);
    return { out: alpha[c], path };
  }

  return {
    alphabet: alpha,
    encodeChar,
    encode: (text) => text.split('').map((ch) => encodeChar(ch).out).join(''),
    positions: () => rotors.map((r) => alpha[r.pos]).reverse().join(''),
    setPositions: (s) => {
      const p = s.toUpperCase().padEnd(count, alpha[0]);
      rotors.forEach((r, i) => { r.pos = alpha.indexOf(p[count - 1 - i]); });
    },
  };
}

export function encode(config, start, text) {
  return createMachine(config, start).encode(text);
}
