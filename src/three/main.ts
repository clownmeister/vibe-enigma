// The Enigma I in three dimensions. Same core, same API, pulled apart on a slider.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_API, fetchMachine } from '../api';
import type { MachineDescription } from '../api';
import { createMachine } from '../enigma';
import type { Machine, MachineConfig } from '../enigma';
import {
  EXPLODE_GAP,
  ROTOR_T,
  makeCase,
  makeEntryWheel,
  makeLampboard,
  makePlugboard,
  makeReflector,
  makeRotor,
  type BoardPart,
  type DiscPart,
  type RotorPart,
} from './model';

const LAMP_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];
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

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 9, 18);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
camera.position.set(3.2, 2.4, 7.4);
const controls = new OrbitControls(camera, ui.canvas);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 3;
controls.maxDistance = 14;
controls.target.set(0, -0.3, 0.2);

scene.add(new THREE.HemisphereLight(0xfff2d6, 0x080604, 0.5));
const key = new THREE.DirectionalLight(0xffe7c2, 2.2);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 0.8);
rim.position.set(-5, 3, -4);
scene.add(rim);
const warm = new THREE.PointLight(0xe3b556, 1.2, 8);
warm.position.set(0, 1.5, 2);
scene.add(warm);

// ---------- parts ----------
interface Parts {
  reflector: DiscPart;
  rotors: RotorPart[]; // left to right, as on the machine
  entry: DiscPart;
  plugboard: BoardPart;
  lampboard: BoardPart;
  lid: THREE.Group;
  axle: THREE.Mesh;
}
let parts: Parts | null = null;
let machine: Machine | null = null;
let api: MachineDescription | null = null;

function buildParts(desc: MachineDescription): Parts {
  const alphabet = (desc.alphabet ?? LATIN).toUpperCase();
  const count = desc.rotors.length;
  const pitch = ROTOR_T + 0.06;
  // reflector at the left, rotors, entry wheel at the right, centred on x = 0
  const total = 0.3 + count * pitch + 0.12;
  let x = -total / 2;
  const reflector = makeReflector(x + 0.15);
  x += 0.3 + 0.03;
  const rotors: RotorPart[] = [];
  for (let i = 0; i < count; i++) {
    rotors.push(makeRotor(alphabet, x + ROTOR_T / 2, i + 1));
    x += pitch;
  }
  const entry = makeEntryWheel(x + 0.06, count + 1);
  const rows = alphabet === LATIN ? LAMP_ROWS : (alphabet.match(/.{1,9}/g) ?? []);
  const plugboard = makePlugboard(alphabet, rows);
  plugboard.group.position.set(0, -1.3, 1.25);
  const lampboard = makeLampboard(alphabet, rows);
  lampboard.group.position.set(0, -1.3, -1.2);
  const { base, lid } = makeCase();
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, total + 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.9, roughness: 0.3 }),
  );
  axle.rotation.z = Math.PI / 2;
  scene.add(base, lid, axle, reflector.group, entry.group, plugboard.group, lampboard.group);
  for (const r of rotors) scene.add(r.group);
  return { reflector, rotors, entry, plugboard, lampboard, lid, axle };
}

// ---------- state ----------
let explode = 0; // 0..1
let path: number[] = [];

function layout(): void {
  if (!parts) return;
  const t = explode;
  parts.reflector.group.position.x = parts.reflector.restX - t * EXPLODE_GAP * 0.4;
  parts.rotors.forEach((r) => {
    r.group.position.x = r.restX + t * EXPLODE_GAP * (r.explodeRank - 0.4);
  });
  parts.entry.group.position.x = parts.entry.restX + t * EXPLODE_GAP * (parts.entry.explodeRank - 0.4);
  parts.lid.position.y = 1.4 + t * 3.2;
  parts.lid.rotation.z = t * 0.35;
  parts.plugboard.group.position.z = 1.25 + t * 1.6;
  parts.plugboard.group.rotation.x = t * 0.5;
  parts.lampboard.group.position.z = -1.2 - t * 1.6;
  parts.lampboard.group.rotation.x = -t * 0.5;
  parts.axle.scale.y = 1 + t * 1.4;
}

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
  if (!api || !parts) return;
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
  const alphabet = (api.alphabet ?? LATIN).toUpperCase();
  const start = h.start !== '' ? h.start : (alphabet[0] ?? 'A').repeat(bank.length);
  machine = createMachine(cfg, start);
  const pairs = (cfg.plugboard ?? []).map((p): [number, number] => [
    alphabet.indexOf(p[0] ?? ''),
    alphabet.indexOf(p[1] ?? ''),
  ]);
  parts.plugboard.setPairs(pairs);
  run();
}

/** Encode the message, pose the rotors as they end up, draw the last letter's path. */
function run(): void {
  if (!machine || !parts) return;
  const m = machine;
  m.setPositions(startFromHash());
  path = [];
  for (const ch of ui.msg.value) {
    const r = m.encodeChar(ch);
    if (r.path) path = r.path;
  }
  const alphabet = m.alphabet;
  const positions = m.positions();
  ui.pos.textContent = positions;
  // pose each drum, then draw its wiring at that pose
  const snapshot = m.wiring(); // rotors right to left
  const count = parts.rotors.length;
  parts.rotors.forEach((rotor, i) => {
    rotor.setPosition(Math.max(0, alphabet.indexOf(positions[i] ?? 'A')));
    rotor.setWiring(snapshot.rotors[count - 1 - i] ?? []);
  });
  const lit = path.length ? (path[path.length - 1] ?? null) : null;
  parts.lampboard.setLit(lit);
  ui.route.textContent = path.length ? path.map((i) => alphabet[i] ?? '').join(' > ') : '';
  drawBeam();
}

function startFromHash(): string {
  const h = hashSettings();
  if (h.start !== '') return h.start;
  return ((api?.alphabet ?? LATIN)[0] ?? 'A').repeat(api?.rotors.length ?? 3);
}

// ---------- the beam: the live letter as a glowing tube ----------
let beam: THREE.Group | null = null;
const fwdMat = new THREE.MeshBasicMaterial({ color: 0xe3b556 });
const backMat = new THREE.MeshBasicMaterial({ color: 0xddd6c4 });

function drawBeam(): void {
  if (beam) {
    scene.remove(beam);
    beam = null;
  }
  if (!parts || !machine || !path.length) return;
  const R = parts.rotors.length;
  const rotorsRtl = [...parts.rotors].reverse(); // right to left, matching the path order
  // waypoints in world space
  const fwd: THREE.Vector3[] = [];
  const back: THREE.Vector3[] = [];
  const p = (i: number): number => path[i] ?? 0;
  const lift = (v: THREE.Vector3, dy: number): THREE.Vector3 => v.clone().add(new THREE.Vector3(0, dy, 0));
  // the harness: cables leave the entry wheel sideways, drop to the case floor and run along it to the boards
  const FLOOR = -1.42;
  const ex = parts.entry.group.position.x + 0.45;
  const harness = (contact: THREE.Vector3, socket: THREE.Vector3, side: 1 | -1): THREE.Vector3[] => [
    contact,
    new THREE.Vector3(ex, contact.y, contact.z),
    new THREE.Vector3(ex, FLOOR, contact.z * 0.4),
    new THREE.Vector3(ex, FLOOR, socket.z - side * 0.5),
    new THREE.Vector3(socket.x, FLOOR, socket.z - side * 0.35),
    socket,
  ];
  const keyIn = parts.plugboard.socket(p(0));
  const plugOut = parts.plugboard.socket(p(1));
  fwd.push(lift(keyIn, -0.5), keyIn, lift(keyIn, 0.35), lift(plugOut, 0.35), plugOut);
  fwd.push(...harness(parts.entry.contact(p(1)), plugOut, 1).reverse());
  for (let j = 0; j < R; j++) {
    const rotor = rotorsRtl[j];
    if (!rotor) continue;
    fwd.push(rotor.rightContact(p(1 + j)), rotor.leftContact(p(2 + j)));
  }
  fwd.push(parts.reflector.contact(p(R + 1)));
  const refl2 = parts.reflector.contact(p(R + 2));
  const inside = parts.reflector.contact(p(R + 1)).lerp(refl2, 0.5);
  inside.x -= 0.25;
  back.push(parts.reflector.contact(p(R + 1)), inside, refl2);
  for (let k = 0; k < R; k++) {
    const rotor = parts.rotors[k];
    if (!rotor) continue;
    back.push(rotor.leftContact(p(R + 2 + k)), rotor.rightContact(p(R + 3 + k)));
  }
  const plugBack = parts.plugboard.socket(p(2 * R + 2));
  back.push(...harness(parts.entry.contact(p(2 * R + 2)), plugBack, 1));
  const lamp = parts.lampboard.socket(p(2 * R + 3));
  back.push(lift(plugBack, 0.35), new THREE.Vector3(plugBack.x, FLOOR - 0.02, plugBack.z - 0.6));
  back.push(new THREE.Vector3(lamp.x, FLOOR - 0.02, lamp.z + 0.6), lamp);

  beam = new THREE.Group();
  beam.add(tube(fwd, fwdMat), tube(back, backMat));
  scene.add(beam);
}

function tube(points: THREE.Vector3[], mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.6);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(32, points.length * 10), 0.022, 8, false),
    mat,
  );
}

// ---------- wiring ----------
function resize(): void {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

ui.explode.addEventListener('input', () => {
  explode = Number(ui.explode.value) / 100;
  ui.explodeOut.textContent = ui.explode.value;
  layout();
  drawBeam();
});
ui.msg.addEventListener('input', run);
addEventListener('hashchange', rebuildMachine);
ui.canvas.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
});

function frame(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

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
  parts = buildParts(api);
  const h = hashSettings();
  if (h.msg) ui.msg.value = h.msg;
  else ui.msg.value = 'HELLO DEVFEST';
  rebuildMachine();
  layout();
  // open it up once so the first look says what it is
  let t = 0;
  const open = (): void => {
    t = Math.min(1, t + 0.012);
    explode = (1 - Math.cos(t * Math.PI)) / 2;
    ui.explode.value = String(Math.round(explode * 100));
    ui.explodeOut.textContent = ui.explode.value;
    layout();
    drawBeam();
    if (t < 1) requestAnimationFrame(open);
  };
  setTimeout(open, 900);
}
void boot();
