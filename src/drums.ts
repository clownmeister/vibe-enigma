// The rotor windows: CSS 3D letter drums you can drag, flick, scroll and type into.
import { click } from './audio';

const FACE = 28; // px per letter face

export function drumRadius(letters: number): number {
  return Math.round(FACE / (2 * Math.tan(Math.PI / letters)));
}

export function renderDrum(index: number, alphabet: string, letter: string): string {
  const r = drumRadius(alphabet.length);
  const faces = alphabet
    .split('')
    .map(
      (L, k) =>
        `<div class="face" style="transform:rotateX(${String((k * 360) / alphabet.length)}deg) translateZ(${String(r)}px)">${L}</div>`,
    )
    .join('');
  return `<div class="rim"><div class="drum" data-i="${String(index)}" tabindex="0" role="spinbutton" aria-label="rotor ${String(index + 1)} start position" aria-valuetext="${letter}"><div class="cyl">${faces}</div></div></div>`;
}

/** Turn every drum to the given letters, taking the short way round. */
export function setDrums(root: ParentNode, alphabet: string, letters: string): void {
  const n = alphabet.length;
  root.querySelectorAll<HTMLElement>('.drum').forEach((d, i) => {
    const k = Math.max(0, alphabet.indexOf(letters[i] ?? ''));
    const prev = Number(d.dataset['k'] ?? k);
    let turns = Number(d.dataset['turns'] ?? 0);
    let delta = k - prev;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    turns += delta;
    d.dataset['k'] = String(k);
    d.dataset['turns'] = String(turns);
    const cyl = d.querySelector<HTMLElement>('.cyl');
    if (cyl)
      cyl.style.transform = `translateZ(-${String(drumRadius(n))}px) rotateX(${String((-turns * 360) / n)}deg)`;
    d.setAttribute('aria-valuetext', alphabet[k] ?? '');
  });
}

export interface DrumHandlers {
  /** Step rotor `i` by `d` detents. */
  step(i: number, d: number): void;
  /** Set rotor `i` straight to a letter. */
  set(i: number, letter: string): void;
  alphabet(): string;
}

/** Pointer, wheel and keyboard handling for every drum under `root`. */
export function wireDrums(root: HTMLElement, h: DrumHandlers): void {
  const drag = {
    el: null as HTMLElement | null,
    i: 0,
    y0: 0,
    acc: 0,
    samples: [] as [number, number][],
    moved: false,
    timer: 0,
  };
  const stopInertia = (): void => {
    clearTimeout(drag.timer);
    drag.timer = 0;
  };
  const spinDown = (i: number, dir: number, interval: number): void => {
    if (interval > 260) return;
    drag.timer = window.setTimeout(() => {
      h.step(i, dir);
      spinDown(i, dir, interval * 1.11 + 2);
    }, interval);
  };
  const drumOf = (e: Event): HTMLElement | null =>
    (e.target as Element | null)?.closest<HTMLElement>('.drum') ?? null;

  root.addEventListener('pointerdown', (e) => {
    const d = drumOf(e);
    if (!d) return;
    stopInertia();
    Object.assign(drag, {
      el: d,
      i: Number(d.dataset['i']),
      y0: e.clientY,
      acc: 0,
      samples: [[e.clientY, performance.now()]],
      moved: false,
    });
    d.setPointerCapture(e.pointerId);
    d.classList.add('dragging');
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag.el) return;
    const dy = e.clientY - drag.y0;
    drag.y0 = e.clientY;
    drag.acc += dy;
    drag.samples.push([e.clientY, performance.now()]);
    if (drag.samples.length > 6) drag.samples.shift();
    while (Math.abs(drag.acc) >= FACE) {
      const dir = drag.acc > 0 ? 1 : -1;
      drag.acc -= Math.sign(drag.acc) * FACE;
      drag.moved = true;
      h.step(drag.i, dir);
    }
  });
  root.addEventListener('pointerup', (e) => {
    const d = drag.el;
    if (!d) return;
    d.classList.remove('dragging');
    drag.el = null;
    if (!drag.moved) {
      const r = d.getBoundingClientRect();
      h.step(drag.i, e.clientY < r.top + r.height / 2 ? 1 : -1);
      return;
    }
    const first = drag.samples[0],
      last = drag.samples[drag.samples.length - 1];
    if (!first || !last) return;
    const v = (last[0] - first[0]) / Math.max(1, last[1] - first[1]); // px per ms
    if (Math.abs(v) < 0.3) return;
    spinDown(drag.i, v > 0 ? 1 : -1, Math.max(24, 70 / Math.abs(v)));
  });
  root.addEventListener('pointercancel', () => {
    drag.el?.classList.remove('dragging');
    drag.el = null;
  });
  root.addEventListener(
    'wheel',
    (e) => {
      const d = drumOf(e);
      if (!d) return;
      e.preventDefault();
      stopInertia();
      h.step(Number(d.dataset['i']), e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  root.addEventListener('keydown', (e) => {
    const d = drumOf(e);
    if (!d) return;
    const i = Number(d.dataset['i']),
      L = e.key.toUpperCase();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      h.step(i, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      h.step(i, -1);
    } else if (L.length === 1 && h.alphabet().includes(L)) {
      h.set(i, L);
      click();
    }
  });
}
