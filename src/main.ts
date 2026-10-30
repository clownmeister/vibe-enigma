// Page wiring. State lives here; the core, drums, path and audio are pure helpers.
import { DEFAULT_API, fetchMachine, fetchTransmissions, rotorByName } from './api';
import type { MachineDescription, Transmission } from './api';
import { burst, clack, click, isMuted, setMuted } from './audio';
import { renderDrum, setDrums, wireDrums } from './drums';
import { createMachine, encode } from './enigma';
import type { Machine, MachineConfig, ReflectorSpec, RotorSpec } from './enigma';
import { renderPath } from './path';
import { renderWiring } from './wiring';

interface Settings {
  alphabet: string;
  rotorBank: RotorSpec[];
  reflectorBank: ReflectorSpec[];
  order: string[];
  rings: string;
  start: string;
  reflector: string;
  plugboard: string;
}

interface Decoded extends Transmission {
  plain: string;
  fresh: boolean;
}

const FEED_INTERVAL = 15_000;
const AUTO_ADVANCE = 10_000;
const IDLE_AFTER_TOUCH = 30_000;
const LAMP_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const state = {
  api: null as MachineDescription | null,
  config: null as Settings | null,
  seen: new Set<number>(),
  lastFetch: 0,
  feed: [] as Decoded[],
  cursor: 0,
  pinned: false,
  lastLen: 0,
  show: { timer: 0, text: '' },
  auto: { timer: 0, pausedUntil: 0 },
  inside: false,
  lastPath: [] as number[],
  plugPick: null as number | null,
  lidOnLoad: false,
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
const $ = {
  sApi: el<HTMLSpanElement>('s-api'),
  sTest: el<HTMLSpanElement>('s-test'),
  clock: el('clock'),
  tNum: el<HTMLSpanElement>('t-num'),
  tStart: el('t-start'),
  tTime: el<HTMLSpanElement>('t-time'),
  tStamp: el<HTMLSpanElement>('t-stamp'),
  tPlain: el<HTMLDivElement>('t-plain'),
  tCipher: el<HTMLDivElement>('t-cipher'),
  prev: el<HTMLButtonElement>('prev'),
  next: el<HTMLButtonElement>('next'),
  all: el<HTMLButtonElement>('all'),
  allList: el<HTMLDivElement>('all-list'),
  open: el<HTMLButtonElement>('open'),
  feedStatus: el<HTMLSpanElement>('feed-status'),
  autoBar: el('auto-bar'),
  sheet: document.querySelector<HTMLElement>('.sheet'),
  machine: document.querySelector<HTMLElement>('.machine'),
  machineName: el<HTMLSpanElement>('machine-name'),
  reset: el<HTMLButtonElement>('reset'),
  share: el<HTMLButtonElement>('share'),
  rotors: el<HTMLDivElement>('rotors'),
  reflector: el<HTMLSelectElement>('reflector'),
  plugboard: el<HTMLInputElement>('plugboard'),
  play: el<HTMLButtonElement>('play'),
  sound: el<HTMLButtonElement>('sound'),
  swap: el<HTMLButtonElement>('swap'),
  input: el<HTMLTextAreaElement>('input'),
  lamps: el<HTMLDivElement>('lamps'),
  path: el<HTMLDivElement>('path'),
  posNow: el('pos-now'),
  output: el<HTMLDivElement>('output'),
  apiBase: el<HTMLInputElement>('api-base'),
  inside: el<HTMLButtonElement>('inside'),
  insidePanel: el<HTMLDivElement>('inside-panel'),
  wiring: el<HTMLDivElement>('wiring'),
};

function settings(): Settings {
  if (!state.config) throw new Error('machine not loaded');
  return state.config;
}

function apiBase(): string {
  return $.apiBase.value.replace(/\/$/, '') || DEFAULT_API;
}

// ---------- config ----------
async function loadConfig(): Promise<void> {
  $.sApi.className = '';
  $.sApi.textContent = 'LOADING MACHINE';
  try {
    state.api = await fetchMachine(apiBase());
    $.sApi.textContent = (state.api.machine ?? 'machine').toUpperCase();
  } catch (e) {
    $.sApi.className = 'bad';
    $.sApi.textContent = `API FAILED: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  applyFromApi();
  applyHash();
  renderMachine();
  runSelfTest();
  recompute();
  if (state.lidOnLoad && !state.inside) {
    state.lidOnLoad = false;
    setTimeout(() => {
      $.inside.click();
    }, 600);
  }
  await loadFeed();
}

function applyFromApi(): void {
  const a = state.api;
  if (!a) return;
  const alphabet = (a.alphabet ?? LATIN).toUpperCase();
  state.config = {
    alphabet,
    rotorBank: a.rotors.map((r) => ({ ...r })),
    reflectorBank: [a.reflector, ...(a.reflectors ?? [])],
    order: a.rotors.map((r) => r.name),
    rings: (a.rings ?? '').toUpperCase(),
    start: (alphabet[0] ?? 'A').repeat(a.rotors.length),
    reflector: a.reflector.name,
    plugboard: (a.plugboard ?? []).join(' '),
  };
}

function machineConfig(): MachineConfig {
  const c = settings();
  return {
    alphabet: c.alphabet,
    rotors: c.order
      .map((n) => rotorByName(c.rotorBank, n) ?? c.rotorBank[0])
      .filter((r): r is RotorSpec => r !== undefined),
    reflector: c.reflectorBank.find((r) => r.name === c.reflector) ??
      c.reflectorBank[0] ?? { name: '?', wiring: c.alphabet },
    rings: c.rings,
    plugboard: c.plugboard
      .toUpperCase()
      .split(/[\s,]+/)
      .filter((p) => p.length === 2),
  };
}

// ---------- machine panel ----------
function renderMachine(): void {
  const c = settings();
  $.machineName.textContent = state.api?.machine ?? 'Machine';
  $.rotors.innerHTML = c.order
    .map(
      (name, i) => `<div class="rotor">
      <button class="order" data-i="${String(i)}" data-name="${name}" title="Swap in the next rotor" aria-label="rotor ${String(i + 1)}: ${name}">${name}</button>
      ${renderDrum(i, c.alphabet, c.start[i] ?? '')}
      <span class="ringlbl">ring <input class="ring" data-i="${String(i)}" maxlength="1" value="${c.rings[i] ?? c.alphabet[0] ?? ''}" autocapitalize="characters" autocomplete="off" aria-label="rotor ${String(i + 1)} ring setting"></span>
    </div>`,
    )
    .join('');
  setDrums($.rotors, c.alphabet, c.start);
  $.reflector.innerHTML = c.reflectorBank
    .map((r) => `<option ${r.name === c.reflector ? 'selected' : ''}>${r.name}</option>`)
    .join('');
  $.plugboard.value = c.plugboard;
  // the real lampboard is QWERTZ in three rows; another alphabet falls back to rows of nine
  const rows = c.alphabet === LATIN ? LAMP_ROWS : (c.alphabet.match(/.{1,9}/g) ?? []);
  $.lamps.innerHTML = rows
    .map(
      (row) =>
        `<div class="krow">${row
          .split('')
          .map((L) => `<div class="lamp" id="lamp-${L}">${L}</div>`)
          .join('')}</div>`,
    )
    .join('');
}

function readPanel(): void {
  const c = settings();
  const first = c.alphabet[0] ?? 'A';
  c.order = [...$.rotors.querySelectorAll<HTMLElement>('.order')].map((b) => b.dataset['name'] ?? '');
  c.rings = [...$.rotors.querySelectorAll<HTMLInputElement>('.ring')]
    .map((i) => (i.value.toUpperCase() || first)[0] ?? first)
    .join('');
  c.reflector = $.reflector.value;
  c.plugboard = $.plugboard.value;
}

function stepRotor(i: number, d: number): void {
  const c = settings();
  const A = c.alphabet;
  const k = (A.indexOf(c.start[i] ?? '') + d + A.length) % A.length;
  c.start = c.start.slice(0, i) + (A[k] ?? '') + c.start.slice(i + 1);
  setDrums($.rotors, A, c.start);
  recompute();
  if ('vibrate' in navigator) navigator.vibrate(6);
  click();
}

function setRotor(i: number, letter: string): void {
  const c = settings();
  c.start = c.start.slice(0, i) + letter + c.start.slice(i + 1);
  setDrums($.rotors, c.alphabet, c.start);
  recompute();
}

// ---------- self test ----------
function runSelfTest(): void {
  const tv = state.api?.testVector;
  if (!tv) return;
  const cfg = machineConfig();
  const ok =
    encode(cfg, tv.start, tv.plaintext) === tv.ciphertext &&
    encode(cfg, tv.start, tv.ciphertext) === tv.plaintext;
  $.sTest.className = ok ? '' : 'bad';
  $.sTest.textContent = ok ? '' : 'SELF-TEST FAILED';
}

// ---------- keyboard, lamps, path ----------
function recompute(): void {
  readPanel();
  const c = settings();
  const m = createMachine(machineConfig(), c.start);
  let out = '';
  let last: number[] | null = null;
  for (const ch of $.input.value) {
    const r = m.encodeChar(ch);
    out += r.out;
    if (r.path) last = r.path;
  }
  $.output.textContent = out;
  $.posNow.textContent = m.positions();
  setDrums($.rotors, c.alphabet, m.positions());
  $.lamps.querySelectorAll('.lamp.on').forEach((l) => {
    l.classList.remove('on');
  });
  state.lastPath = last ?? [];
  if (state.inside) drawInside(m);
  const letters = last ? last.map((i) => m.alphabet[i] ?? '') : [];
  const lit = letters[letters.length - 1];
  if (lit) document.getElementById(`lamp-${lit}`)?.classList.add('on');
  $.path.innerHTML = renderPath({
    order: c.order,
    letters,
    width: $.path.clientWidth,
    still: state.show.timer !== 0,
  });
  writeHash();
}

function drawInside(m: Machine): void {
  const c = settings();
  $.wiring.innerHTML = renderWiring({
    alphabet: c.alphabet,
    order: c.order,
    snapshot: m.wiring(),
    path: state.lastPath,
    width: $.wiring.clientWidth - 8,
    still: state.show.timer !== 0,
    pick: state.plugPick,
  });
}

// ---------- play mode ----------
function stopShow(): void {
  if (!state.show.timer) return;
  clearTimeout(state.show.timer);
  state.show.timer = 0;
  $.input.value = state.show.text;
  state.lastLen = state.show.text.length;
  recompute();
  $.play.textContent = 'play ▸';
}

function startShow(text: string): void {
  stopShow();
  if (!text) return;
  state.show.text = text;
  $.play.textContent = 'stop ■';
  let i = 0;
  const tick = (): void => {
    i++;
    $.input.value = text.slice(0, i);
    state.lastLen = i;
    const ch = text[i - 1];
    if (ch !== undefined) clack(ch === ' ');
    recompute();
    if (i < text.length) state.show.timer = window.setTimeout(tick, /[a-z]/i.test(ch ?? '') ? 130 : 60);
    else {
      state.show.timer = 0;
      $.play.textContent = 'play ▸';
    }
  };
  $.input.value = '';
  recompute();
  state.show.timer = window.setTimeout(tick, 250);
}

// ---------- feed ----------
async function loadFeed(): Promise<void> {
  state.lastFetch = Date.now();
  try {
    const list = await fetchTransmissions(apiBase());
    const current = state.feed[state.cursor]?.number;
    const cfg = machineConfig();
    state.feed = list.map((t) => ({
      ...t,
      plain: encode(cfg, t.start, t.ciphertext),
      fresh: state.seen.size > 0 && !state.seen.has(t.number),
    }));
    list.forEach((t) => state.seen.add(t.number));
    // a fresh intercept takes the sheet unless the reader pinned an older one; otherwise stay put
    const arrived = state.feed[0]?.fresh === true;
    const idx = arrived && !state.pinned ? 0 : state.feed.findIndex((t) => t.number === current);
    state.cursor = idx >= 0 ? idx : 0;
    if (arrived && !state.pinned) scheduleAuto();
    $.feedStatus.textContent = `${String(list.length)} on record`;
    renderSheet();
    renderAll();
    if (!state.auto.timer) scheduleAuto();
    if (state.feed[0]?.fresh && state.cursor === 0 && $.sheet) {
      $.sheet.classList.remove('flash');
      // a reflow between remove and add restarts the animation
      $.sheet.getBoundingClientRect();
      $.sheet.classList.add('flash');
      burst();
    }
  } catch (e) {
    $.feedStatus.textContent = `no signal: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function renderSheet(direction = 0): void {
  const t = state.feed[state.cursor];
  if (!t) return;
  if (direction !== 0) {
    for (const node of [$.tPlain, $.tCipher]) {
      node.classList.remove('slide');
      node.style.setProperty('--slide-from', `${String(direction * 14)}px`);
      node.getBoundingClientRect();
      node.classList.add('slide');
    }
  }
  $.tNum.textContent = `Nº ${String(t.number)}`;
  $.tStart.textContent = t.start;
  $.tTime.textContent = t.sentAt ? new Date(t.sentAt).toLocaleTimeString() : '';
  $.tStamp.textContent = t.fresh && state.cursor === 0 ? 'Just in' : 'Intercepted';
  $.tPlain.textContent = t.plain;
  $.tCipher.textContent = t.ciphertext;
  $.prev.disabled = state.feed.length < 2;
  $.next.disabled = state.feed.length < 2;
}

function renderAll(): void {
  $.allList.replaceChildren(
    ...state.feed.map((t, i) => {
      const row = document.createElement('div');
      row.className = 'tx';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = `Nº ${String(t.number)} · ${t.start}`;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = t.plain;
      row.append(k, v);
      const pick = (): void => {
        state.cursor = i;
        state.pinned = i > 0;
        $.allList.classList.remove('open');
        renderSheet();
        touched();
      };
      row.onclick = pick;
      row.onkeydown = (e): void => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      };
      return row;
    }),
  );
}

// Paging wraps: past the oldest comes the newest again, and the other way round.
function moveCursor(delta: number): void {
  const n = state.feed.length;
  if (n < 2) return;
  state.cursor = (((state.cursor + delta) % n) + n) % n;
  state.pinned = state.cursor > 0;
  renderSheet(delta > 0 ? -1 : 1);
}

// ---------- idle auto-advance ----------
// Left alone, the sheet walks through the intercepts every ten seconds. Any
// touch on it pauses that for half a minute.
function scheduleAuto(): void {
  clearTimeout(state.auto.timer);
  $.autoBar.classList.remove('run');
  $.autoBar.getBoundingClientRect();
  if (state.feed.length < 2) return;
  const wait = Math.max(0, state.auto.pausedUntil - Date.now());
  state.auto.timer = window.setTimeout(() => {
    $.autoBar.style.setProperty('--auto-ms', `${String(AUTO_ADVANCE)}ms`);
    $.autoBar.classList.add('run');
    state.auto.timer = window.setTimeout(() => {
      state.cursor = (state.cursor + 1) % state.feed.length;
      state.pinned = false;
      renderSheet(-1);
      scheduleAuto();
    }, AUTO_ADVANCE);
  }, wait);
}

function touched(): void {
  state.auto.pausedUntil = Date.now() + IDLE_AFTER_TOUCH;
  scheduleAuto();
}

// ---------- share link ----------
function writeHash(): void {
  const c = settings();
  const h = new URLSearchParams({
    r: c.order.join(','),
    s: c.start,
    g: c.rings,
    u: c.reflector,
    p: c.plugboard.trim(),
  });
  const msg = $.input.value;
  if (msg && msg.length <= 600) h.set('m', msg);
  history.replaceState(null, '', `#${h.toString()}`);
}

function applyHash(): void {
  if (!location.hash.length) return;
  const h = new URLSearchParams(location.hash.slice(1));
  const c = settings();
  const r = h.get('r');
  if (r) c.order = r.split(',').filter((n) => rotorByName(c.rotorBank, n));
  const s = h.get('s');
  if (s) c.start = s.toUpperCase();
  const g = h.get('g');
  if (g) c.rings = g.toUpperCase();
  const u = h.get('u');
  if (u) c.reflector = u;
  const p = h.get('p');
  if (p !== null) c.plugboard = p;
  const m = h.get('m');
  if (m) {
    $.input.value = m;
    state.lastLen = m.length;
  }
}

// ---------- wiring ----------
function wire(): void {
  $.apiBase.addEventListener('change', () => void loadConfig());
  $.reset.onclick = (): void => {
    applyFromApi();
    renderMachine();
    recompute();
  };
  $.share.onclick = (): void => {
    void navigator.clipboard.writeText(location.href).then(() => {
      $.share.textContent = 'copied';
      setTimeout(() => ($.share.textContent = 'share'), 1500);
    });
  };
  $.swap.onclick = (): void => {
    $.input.value = $.output.textContent;
    state.lastLen = $.input.value.length;
    recompute();
  };
  $.play.onclick = (): void => {
    if (state.show.timer) stopShow();
    else startShow($.input.value);
  };
  $.input.addEventListener('focus', stopShow);
  $.input.addEventListener('input', (e) => {
    const v = $.input.value;
    const typed = v.length > state.lastLen && (e as InputEvent).inputType !== 'insertFromPaste';
    if (typed) clack(v.endsWith(' '));
    state.lastLen = v.length;
    recompute();
  });
  const refreshSound = (): void => {
    $.sound.textContent = isMuted() ? 'sound off' : 'sound on';
    $.sound.setAttribute('aria-pressed', String(!isMuted()));
  };
  $.sound.onclick = (): void => {
    setMuted(!isMuted());
    refreshSound();
  };
  refreshSound();

  $.rotors.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('ring')) t.value = t.value.toUpperCase().slice(-1);
    recompute();
  });
  $.rotors.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.order');
    if (!b) return;
    const names = settings().rotorBank.map((r) => r.name);
    const next = names[(names.indexOf(b.dataset['name'] ?? '') + 1) % names.length] ?? names[0] ?? '';
    b.dataset['name'] = next;
    b.textContent = next;
    b.setAttribute('aria-label', `rotor ${String(Number(b.dataset['i']) + 1)}: ${next}`);
    click();
    recompute();
  });
  wireDrums($.rotors, { step: stepRotor, set: setRotor, alphabet: () => settings().alphabet });
  $.reflector.onchange = recompute;
  $.plugboard.oninput = recompute;

  $.prev.onclick = (): void => {
    moveCursor(1);
    touched();
  };
  $.next.onclick = (): void => {
    moveCursor(-1);
    touched();
  };
  // a horizontal swipe on the sheet pages through the intercepts
  const swipe = { x: 0, y: 0, active: false };
  $.sheet?.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button,a,.all')) return;
    swipe.x = e.clientX;
    swipe.y = e.clientY;
    swipe.active = true;
    touched();
  });
  $.sheet?.addEventListener('pointerup', (e) => {
    if (!swipe.active) return;
    swipe.active = false;
    const dx = e.clientX - swipe.x,
      dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) moveCursor(dx < 0 ? 1 : -1);
  });
  $.sheet?.addEventListener('pointercancel', () => {
    swipe.active = false;
  });
  $.all.onclick = (): void => {
    $.allList.classList.toggle('open');
  };
  $.open.onclick = (): void => {
    const t = state.feed[state.cursor];
    if (!t) return;
    const c = settings();
    c.start = t.start;
    setDrums($.rotors, c.alphabet, t.start);
    $.machine?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    startShow(t.ciphertext);
  };
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).matches('input,textarea,select,.drum')) return;
    if (e.key === 'ArrowLeft') moveCursor(1);
    if (e.key === 'ArrowRight') moveCursor(-1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') touched();
  });

  // patching the plugboard from the wiring diagram: first tap picks, second tap pairs or unpairs
  $.wiring.addEventListener('click', (e) => {
    const hit = (e.target as Element).closest<SVGElement>('.hit');
    if (!hit) return;
    const i = Number(hit.dataset.i);
    const c = settings();
    const A = c.alphabet;
    const L = A[i] ?? '';
    const pairs = c.plugboard
      .toUpperCase()
      .split(/[\s,]+/)
      .filter((p) => p.length === 2);
    const existing = pairs.find((p) => p.includes(L));
    if (state.plugPick === null) {
      if (existing) {
        // tapping a patched letter pulls its cable
        $.plugboard.value = pairs.filter((p) => p !== existing).join(' ');
        click();
        recompute();
        return;
      }
      state.plugPick = i;
    } else if (state.plugPick === i) {
      state.plugPick = null;
    } else {
      const other = A[state.plugPick] ?? '';
      const kept = pairs.filter((p) => !p.includes(L) && !p.includes(other));
      $.plugboard.value = [...kept, `${other}${L}`].join(' ');
      state.plugPick = null;
      click();
    }
    recompute();
  });

  const openLid = (): void => {
    state.inside = !state.inside;
    $.inside.classList.remove('pulse');
    try {
      localStorage.setItem('enigma-lid-seen', '1');
    } catch {
      // fine
    }
    $.inside.setAttribute('aria-expanded', String(state.inside));
    $.inside.textContent = state.inside ? 'close the lid' : 'look inside';
    if (state.inside) {
      $.insidePanel.hidden = false;
      recompute();
      requestAnimationFrame(() => {
        $.insidePanel.classList.add('open');
      });
      click();
    } else {
      $.insidePanel.classList.remove('open');
      setTimeout(() => {
        $.insidePanel.hidden = !state.inside;
      }, 600);
    }
  };
  $.inside.onclick = openLid;
  // on a laptop the lid starts open the first time, so the wiring is in the first look
  let seen = false;
  try {
    seen = localStorage.getItem('enigma-lid-seen') === '1';
  } catch {
    // fine
  }
  if (!seen && matchMedia('(min-width: 761px)').matches) state.lidOnLoad = true;

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.config) recompute();
    }, 150);
  });

  setInterval(() => {
    $.clock.textContent = new Date().toLocaleTimeString();
    if (state.api && Date.now() - state.lastFetch >= FEED_INTERVAL) void loadFeed();
  }, 250);
}

wire();
void loadConfig();
