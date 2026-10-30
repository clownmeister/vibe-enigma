// The /3d page: the Enigma scene full screen with a pull-apart slider and a
// message box. Left alone, the machine breathes open and closed; a touch on
// the slider or the model stops that.
import { DEFAULT_API, fetchMachine } from '../api';
import type { MachineDescription } from '../api';
import { createMachine } from '../enigma';
import type { Machine, MachineConfig } from '../enigma';
import { createEnigmaScene } from './scene';
import type { EnigmaScene } from './scene';

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
const ui = {
  canvas: el<HTMLCanvasElement>('stage'),
  status: el('status'),
  explode: el<HTMLInputElement>('explode'),
  explodeOut: el<HTMLOutputElement>('explode-out'),
  msg: el<HTMLTextAreaElement>('msg'),
  route: el('route'),
  pos: el('pos'),
};

let api: MachineDescription | null = null;
let machine: Machine | null = null;
let view: EnigmaScene | null = null;

function hashSettings(): { order: string[]; start: string; rings: string; plug: string[]; msg: string } {
  const h = new URLSearchParams(location.hash.slice(1));
  return {
    order: (h.get('r') ?? '').split(',').filter(Boolean),
    start: h.get('s') ?? '',
    rings: h.get('g') ?? '',
    plug: (h.get('p') ?? '')
      .toUpperCase()
      .split(/[\s,]+/)
      .filter((p) => p.length === 2),
    msg: h.get('m') ?? '',
  };
}

function rebuildMachine(): void {
  if (!api) return;
  const h = hashSettings();
  const bank = api.rotors;
  const rotors =
    h.order.length === bank.length ? h.order.map((n) => bank.find((r) => r.name === n) ?? bank[0]) : bank;
  const cfg: MachineConfig = {
    alphabet: api.alphabet ?? LATIN,
    rotors: rotors.filter((r): r is NonNullable<typeof r> => r !== undefined),
    reflector: api.reflector,
    rings: h.rings !== '' ? h.rings : (api.rings ?? ''),
    plugboard: h.plug.length ? h.plug : (api.plugboard ?? []),
  };
  machine = createMachine(cfg, startFromHash());
  run();
}

function startFromHash(): string {
  const h = hashSettings();
  if (h.start !== '') return h.start;
  return ((api?.alphabet ?? LATIN)[0] ?? 'A').repeat(api?.rotors.length ?? 3);
}

/** Encode the message, pose the rotors as they end up, show the last letter's path. */
function run(): void {
  if (!machine || !view) return;
  const m = machine;
  m.setPositions(startFromHash());
  let path: number[] = [];
  for (const ch of ui.msg.value) {
    const r = m.encodeChar(ch);
    if (r.path) path = r.path;
  }
  const alphabet = m.alphabet;
  const positions = m.positions();
  ui.pos.textContent = positions;
  ui.route.textContent = path.map((i) => alphabet[i] ?? '').join(' > ');
  const w = m.wiring();
  const pairs: [number, number][] = [];
  w.plugboard.forEach((to, from) => {
    if (from < to) pairs.push([from, to]);
  });
  view.setState({ positions, tables: w.rotors, pairs, path });
}

// ----- the breathing: open and close slowly until someone takes over -----
let breathing = true;
let phase = 0;
function breathe(now: number): void {
  if (!breathing) return;
  phase = (now / 9000) % 1; // one open-and-close every nine seconds
  const t = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  showExplode(t);
  requestAnimationFrame(breathe);
}
function showExplode(v: number): void {
  ui.explode.value = String(Math.round(v * 100));
  ui.explodeOut.textContent = ui.explode.value;
  view?.setExplode(v);
}
function takeOver(): void {
  breathing = false;
}

ui.explode.addEventListener('input', () => {
  takeOver();
  view?.setExplode(Number(ui.explode.value) / 100);
  ui.explodeOut.textContent = ui.explode.value;
});
ui.canvas.addEventListener('pointerdown', takeOver);
ui.msg.addEventListener('input', run);
addEventListener('hashchange', rebuildMachine);
addEventListener('resize', () => view?.resize());

async function boot(): Promise<void> {
  try {
    const base = new URLSearchParams(location.search).get('api') ?? DEFAULT_API;
    api = await fetchMachine(base);
    ui.status.textContent = `${(api.machine ?? 'MACHINE').toUpperCase()} · ${String(api.rotors.length)} ROTORS`;
  } catch (e) {
    ui.status.className = 'bad';
    ui.status.textContent = `API FAILED: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  view = createEnigmaScene(ui.canvas, api);
  view.setFraming('full');
  const h = hashSettings();
  ui.msg.value = h.msg || 'HELLO DEVFEST';
  rebuildMachine();
  // ?og renders a still for the share image: no chrome, no motion, parts half apart
  if (new URLSearchParams(location.search).has('og')) {
    document.body.classList.add('og');
    breathing = false;
    showExplode(0.62);
    view.setInteractive(false);
    view.setAutoRotate(false);
    return;
  }
  setTimeout(() => requestAnimationFrame(breathe), 800);
}
void boot();
