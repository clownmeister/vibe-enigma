// A self-contained Enigma scene: build once for a machine description, then
// feed it rotor positions and a letter path. Used full-screen on /3d and as
// the live strip on the landing page.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MachineDescription } from '../api';
import {
  CASE,
  EXPLODE_GAP,
  ROTOR_T,
  makeBundle,
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
/** Slider value at which the lid is fully open and the parts start to move. */
export const LID_PART = 0.3;

export interface SceneState {
  /** Rotor positions, left to right. */
  positions: string;
  /** Wiring tables, rotors right to left, as Machine.wiring() reports. */
  tables: number[][];
  /** Plugboard pairs as index pairs. */
  pairs: [number, number][];
  /** Stage indices of the last letter; empty for none. */
  path: number[];
}

export interface EnigmaScene {
  setState(s: SceneState): void;
  /** 0 closed in its case, 1 fully pulled apart. */
  setExplode(t: number): void;
  /** Orbit controls on or off (the strip is look-only). */
  setInteractive(on: boolean): void;
  /** Camera framing: 'strip' for a wide shallow view, 'full' for the stage. */
  setFraming(mode: 'strip' | 'full'): void;
  setAutoRotate(on: boolean): void;
  resize(): void;
  dispose(): void;
}

export function createEnigmaScene(canvas: HTMLCanvasElement, desc: MachineDescription): EnigmaScene {
  const alphabet = (desc.alphabet ?? LATIN).toUpperCase();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 10, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight(0xfff2d6, 0x080604, 0.35));
  const key = new THREE.DirectionalLight(0xffe7c2, 2.4);
  key.position.set(3, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -5;
  key.shadow.camera.right = key.shadow.camera.top = 5;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.6);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  const warm = new THREE.PointLight(0xe3b556, 0.9, 8);
  warm.position.set(0, 1.5, 2);
  scene.add(warm);

  // ----- parts -----
  const count = desc.rotors.length;
  const pitch = ROTOR_T + 0.06;
  const total = 0.3 + count * pitch + 0.12;
  let x = -total / 2;
  const reflector: DiscPart = makeReflector(x + 0.15);
  x += 0.33;
  const rotors: RotorPart[] = [];
  for (let i = 0; i < count; i++) {
    rotors.push(makeRotor(alphabet, x + ROTOR_T / 2, i + 1));
    x += pitch;
  }
  const entry: DiscPart = makeEntryWheel(x + 0.06, count + 1);
  const rows = alphabet === LATIN ? LAMP_ROWS : (alphabet.match(/.{1,9}/g) ?? []);
  const plugboard: BoardPart = makePlugboard(alphabet, rows);
  plugboard.group.position.set(0, -1.3, 1.25);
  const lampboard: BoardPart = makeLampboard(alphabet, rows);
  lampboard.group.position.set(0, -1.3, -1.2);
  const { base, lid } = makeCase();
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, total + 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.9, roughness: 0.3 }),
  );
  axle.rotation.z = Math.PI / 2;
  scene.add(base, lid, axle, reflector.group, entry.group, plugboard.group, lampboard.group);
  for (const r of rotors) scene.add(r.group);

  // the harness: a bundle from behind the entry wheel down the right wall and along the floor to each board
  const FLOOR = CASE.floorY + 0.1;
  const harness = new THREE.Group();
  scene.add(harness);
  const rebuildHarness = (): void => {
    harness.clear();
    const ex = Math.min(entry.group.position.x + 0.5, CASE.w / 2 - 0.25); // stays inside the right wall
    const toPlug = [
      new THREE.Vector3(ex - 0.2, 0, 0),
      new THREE.Vector3(ex, -0.2, 0.2),
      new THREE.Vector3(ex, FLOOR, 0.4),
      new THREE.Vector3(ex, FLOOR, plugboard.group.position.z - 0.5),
      new THREE.Vector3(0.6, FLOOR, plugboard.group.position.z - 0.5),
      new THREE.Vector3(0, FLOOR + 0.1, plugboard.group.position.z - 0.3),
    ];
    const toLamp = [
      new THREE.Vector3(ex - 0.2, 0, 0),
      new THREE.Vector3(ex, -0.2, -0.2),
      new THREE.Vector3(ex, FLOOR, -0.4),
      new THREE.Vector3(ex, FLOOR, lampboard.group.position.z + 0.5),
      new THREE.Vector3(0.6, FLOOR, lampboard.group.position.z + 0.5),
      new THREE.Vector3(0, FLOOR + 0.1, lampboard.group.position.z + 0.3),
    ];
    harness.add(makeBundle(toPlug), makeBundle(toLamp));
  };

  // ----- state -----
  let explode = 0;
  let state: SceneState = { positions: '', tables: [], pairs: [], path: [] };
  let beam: THREE.Group | null = null;
  let bead: THREE.Mesh | null = null;
  let beadCurve: THREE.CatmullRomCurve3 | null = null;
  let beadT = 0;
  const fwdMat = new THREE.MeshBasicMaterial({ color: 0xe3b556, transparent: true, opacity: 0.9 });
  const backMat = new THREE.MeshBasicMaterial({ color: 0xddd6c4, transparent: true, opacity: 0.9 });

  function layout(): void {
    // the lid swings open over the first third of the slider, the parts separate after that
    const lidT = Math.min(1, explode / LID_PART);
    const t = Math.max(0, (explode - LID_PART) / (1 - LID_PART));
    reflector.group.position.x = reflector.restX - t * EXPLODE_GAP * 0.4;
    for (const r of rotors) r.group.position.x = r.restX + t * EXPLODE_GAP * (r.explodeRank - 0.4);
    entry.group.position.x = entry.restX + t * EXPLODE_GAP * (entry.explodeRank - 0.4);
    lid.rotation.x = -lidT * 1.95; // swings back on its hinge
    // the boards lift and tilt toward the viewer, staying inside the case
    plugboard.group.position.y = -1.3 + t * 0.9;
    plugboard.group.rotation.x = -t * 0.55;
    lampboard.group.position.y = -1.3 + t * 0.9;
    lampboard.group.rotation.x = t * 0.55;
    axle.scale.y = 1 + t * 1.4;
    rebuildHarness();
  }

  function pose(): void {
    const n = rotors.length;
    rotors.forEach((rotor, i) => {
      rotor.setPosition(Math.max(0, alphabet.indexOf(state.positions[i] ?? 'A')));
      rotor.setWiring(state.tables[n - 1 - i] ?? []);
    });
    plugboard.setPairs(state.pairs);
    const lit = state.path.length ? (state.path[state.path.length - 1] ?? null) : null;
    lampboard.setLit(lit);
  }

  function drawBeam(): void {
    if (beam) {
      scene.remove(beam);
      beam = null;
    }
    const path = state.path;
    const R = rotors.length;
    if (path.length !== 2 * R + 4) return;
    const p = (i: number): number => path[i] ?? 0;
    const lift = (v: THREE.Vector3, dy: number): THREE.Vector3 => v.clone().add(new THREE.Vector3(0, dy, 0));
    const ex = Math.min(entry.group.position.x + 0.5, CASE.w / 2 - 0.25); // stays inside the right wall
    // ride the harness between the entry wheel and a board
    const viaHarness = (contact: THREE.Vector3, socket: THREE.Vector3, sign: 1 | -1): THREE.Vector3[] => [
      contact,
      new THREE.Vector3(ex - 0.2, 0, sign * 0.1),
      new THREE.Vector3(ex, FLOOR, sign * 0.4),
      new THREE.Vector3(ex, FLOOR, socket.z - sign * 0.5),
      new THREE.Vector3(socket.x, FLOOR + 0.05, socket.z - sign * 0.4),
      socket,
    ];
    const rtl = [...rotors].reverse();
    const fwd: THREE.Vector3[] = [];
    const keyIn = plugboard.socket(p(0));
    const plugOut = plugboard.socket(p(1));
    fwd.push(lift(keyIn, -0.4), keyIn, lift(keyIn, 0.3), lift(plugOut, 0.3), plugOut);
    fwd.push(
      ...viaHarness(entry.contact(p(1)), plugOut, 1)
        .reverse()
        .slice(1),
    );
    for (let j = 0; j < R; j++) {
      const rotor = rtl[j];
      if (rotor) fwd.push(rotor.rightContact(p(1 + j)), rotor.leftContact(p(2 + j)));
    }
    const r1 = reflector.contact(p(R + 1)),
      r2 = reflector.contact(p(R + 2));
    fwd.push(r1);
    const inside = r1.clone().lerp(r2, 0.5);
    inside.x -= 0.25;
    const back: THREE.Vector3[] = [r1, inside, r2];
    for (let k = 0; k < R; k++) {
      const rotor = rotors[k];
      if (rotor) back.push(rotor.leftContact(p(R + 2 + k)), rotor.rightContact(p(R + 3 + k)));
    }
    const plugBack = plugboard.socket(p(2 * R + 2));
    back.push(...viaHarness(entry.contact(p(2 * R + 2)), plugBack, 1));
    const lamp = lampboard.socket(p(2 * R + 3));
    back.push(lift(plugBack, 0.3), new THREE.Vector3(plugBack.x, FLOOR, plugBack.z - 0.7));
    back.push(new THREE.Vector3(lamp.x, FLOOR, lamp.z + 0.7), lamp);
    beam = new THREE.Group();
    beam.add(tube(fwd, fwdMat), tube(back, backMat));
    scene.add(beam);
    // a bead of light runs the whole route once
    beadCurve = new THREE.CatmullRomCurve3([...fwd, ...back.slice(1)], false, 'centripetal', 0.6);
    beadT = 0;
    if (!bead) {
      bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff1c4 }),
      );
      scene.add(bead);
    }
    bead.visible = true;
  }

  function tube(points: THREE.Vector3[], mat: THREE.Material): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.6);
    return new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(32, points.length * 10), 0.02, 8, false),
      mat,
    );
  }

  // ----- loop -----
  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    controls.update();
    if (bead && beadCurve && bead.visible) {
      beadT += dt / 1.6;
      if (beadT >= 1) bead.visible = false;
      else bead.position.copy(beadCurve.getPointAt(beadT));
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  let framing: 'strip' | 'full' = 'full';
  function resize(): void {
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = framing === 'strip' ? 26 : 36;
    camera.updateProjectionMatrix();
  }

  layout();
  resize();
  controls.target.set(0, -0.3, 0.2);
  camera.position.set(3.2, 2.4, 7.4);

  return {
    setState(s) {
      state = s;
      pose();
      drawBeam();
    },
    setExplode(t) {
      const next = Math.max(0, Math.min(1, t));
      // tube geometry is rebuilt on change only; sub-percent moves are not worth it
      if (Math.abs(next - explode) < 0.008 && next !== 0 && next !== 1) return;
      explode = next;
      layout();
      drawBeam();
    },
    setInteractive(on) {
      controls.enabled = on;
      controls.autoRotate = true;
    },
    setFraming(mode) {
      framing = mode;
      if (mode === 'strip') {
        controls.target.set(0, -0.1, 0.2);
        camera.position.set(2.8, 2.3, 7.8);
        controls.autoRotateSpeed = 0.35;
      } else {
        controls.target.set(0, -0.3, 0.2);
        camera.position.set(3.2, 2.4, 7.4);
        controls.autoRotateSpeed = 0.5;
      }
      resize();
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
