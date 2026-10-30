// Mechanical sounds, synthesised on the fly. Nothing is downloaded.

const MUTE_KEY = 'enigma-mute';

let ctx: AudioContext | null = null;
let muted = readMute();

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // private mode: the toggle still works for this page view
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(ac: AudioContext, seconds: number, curve = 3): AudioBufferSourceNode {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** curve;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  return source;
}

function tone(
  ac: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  gain: number,
  seconds: number,
): void {
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.01);
}

/** A rotor detent: a filtered noise tick with a small thump under it. */
export function click(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const n = noise(ac, 0.02);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600;
    f.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    n.connect(f).connect(g).connect(ac.destination);
    n.start(t);
    tone(ac, 'sine', 180, 70, 0.12, 0.04);
  } catch {
    // audio is a garnish; never let it break input
  }
}

/** A typewriter strike with a short metallic ring. The space bar is a duller thud. */
export function clack(space: boolean): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const n = noise(ac, space ? 0.05 : 0.035, 2);
    const f = ac.createBiquadFilter();
    f.type = space ? 'lowpass' : 'highpass';
    f.frequency.value = space ? 900 : 1800;
    const g = ac.createGain();
    g.gain.setValueAtTime(space ? 0.5 : 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (space ? 0.07 : 0.05));
    n.connect(f).connect(g).connect(ac.destination);
    n.start(t);
    if (!space) tone(ac, 'triangle', 3200 + Math.random() * 600, 3200, 0.06, 0.09);
    tone(ac, 'sine', space ? 110 : 150, 50, 0.25, 0.06);
  } catch {
    // see click()
  }
}

/** A teleprinter burst for a fresh intercept. */
export function burst(): void {
  for (let i = 0; i < 7; i++)
    setTimeout(() => {
      clack(i % 3 === 2);
    }, i * 55);
}
