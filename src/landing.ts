// The landing with the live 3D strip. The page logic is the same app; the
// strip mirrors its state and grows into the full stage on request.
import { startApp } from './app';
import type { AppState } from './app';
import { DEFAULT_API, fetchMachine } from './api';
import type { EnigmaScene } from './three/scene';
import { LID_PART } from './three/scene';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
const ui = {
  stage: el('stage'),
  canvas: el<HTMLCanvasElement>('stage-canvas'),
  open: el<HTMLButtonElement>('stage-open'),
  close: el<HTMLButtonElement>('stage-close'),
  tools: el('stage-tools'),
  explode: el<HTMLInputElement>('explode'),
  explodeOut: el<HTMLOutputElement>('explode-out'),
  fallback: el('stage-fallback'),
  apiBase: el<HTMLInputElement>('api-base'),
};

let view: EnigmaScene | null = null;
let pending: AppState | null = null;
let full = false;

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

// three.js is loaded only after the page is interactive, so the first paint stays light
async function mountScene(): Promise<void> {
  if (!hasWebGL()) {
    ui.fallback.hidden = false;
    ui.open.hidden = true;
    return;
  }
  const [{ createEnigmaScene }, desc] = await Promise.all([
    import('./three/scene'),
    fetchMachine(ui.apiBase.value.replace(/\/$/, '') || DEFAULT_API),
  ]);
  view = createEnigmaScene(ui.canvas, desc);
  view.setFraming('strip');
  view.setInteractive(false);
  if (pending) view.setState(pending);
}

function showExplode(v: number): void {
  ui.explode.value = String(Math.round(v * 100));
  ui.explodeOut.textContent = ui.explode.value;
  view?.setExplode(v);
}

// The machine breathes open and closed while nobody is typing. A keystroke
// or play mode snaps it shut so the drums and the beam can be watched working;
// after a quiet spell it breathes again. On the full stage the slider rules.
const BREATH_PERIOD = 9000;
const QUIET_AFTER_TYPING = 6000;
let explodeNow = LID_PART;
let manual = false; // the slider or a drag took over
let lastTyped = 0;
let breathStart = performance.now();

let lastTick = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  if (!view || manual) return;
  // on the strip the lid stays open; at rest the parts sit together, breathing pulls them apart
  const quiet = now - lastTyped > QUIET_AFTER_TYPING;
  let target = LID_PART;
  if (quiet) {
    if (breathStart === 0) breathStart = now;
    const phase = ((now - breathStart) / BREATH_PERIOD) % 1;
    target = LID_PART + ((1 - Math.cos(phase * Math.PI * 2)) / 2) * (1 - LID_PART);
  } else breathStart = 0;
  // snap shut fast, drift open slowly; time based so a slow frame rate keeps pace
  const rate = target < explodeNow ? 9 : 2.5;
  explodeNow += (target - explodeNow) * (1 - Math.exp(-dt * rate));
  if (Math.abs(target - explodeNow) < 0.002) explodeNow = target;
  showExplode(explodeNow);
}
requestAnimationFrame(tick);

function openStage(): void {
  full = true;
  ui.stage.classList.add('full');
  ui.tools.hidden = false;
  ui.open.setAttribute('aria-expanded', 'true');
  view?.setFraming('full');
  view?.setInteractive(true);
  setTimeout(() => view?.resize(), 650);
  ui.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeStage(): void {
  full = false;
  manual = false;
  ui.stage.classList.remove('full');
  ui.tools.hidden = true;
  ui.open.setAttribute('aria-expanded', 'false');
  view?.setFraming('strip');
  view?.setInteractive(false);
  setTimeout(() => view?.resize(), 650);
}

ui.open.onclick = openStage;
ui.close.onclick = closeStage;
ui.explode.addEventListener('input', () => {
  manual = true;
  explodeNow = Number(ui.explode.value) / 100;
  view?.setExplode(explodeNow);
  ui.explodeOut.textContent = ui.explode.value;
});
ui.canvas.addEventListener('pointerdown', () => {
  if (full) manual = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && full) closeStage();
});
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => view?.resize(), 120);
});

let lastPathKey = '';
startApp({
  onState(s) {
    pending = s;
    view?.setState(s);
    // a new letter went through: close up and show it working
    const key = s.path.join(',') + s.positions;
    if (s.path.length && key !== lastPathKey) lastTyped = performance.now();
    lastPathKey = key;
  },
});
if ('requestIdleCallback' in window) requestIdleCallback(() => void mountScene());
else setTimeout(() => void mountScene(), 600);
