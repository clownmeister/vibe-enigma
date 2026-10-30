// The Enigma I as a set of procedural parts. Each part knows where its
// contacts sit in world space, so the live letter can be threaded through.
import * as THREE from 'three';

export const N = 26;
export const ROTOR_R = 1.0; // rotor radius
export const ROTOR_T = 0.42; // rotor thickness along the axle
export const PIN_R = 0.78; // radius of the contact ring on a rotor face
export const EXPLODE_GAP = 1.1; // extra gap when fully pulled apart

const brass = new THREE.MeshStandardMaterial({ color: 0xb8925a, metalness: 0.85, roughness: 0.35 });
const bakelite = new THREE.MeshStandardMaterial({ color: 0x15120f, metalness: 0.2, roughness: 0.55 });
const steel = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.9, roughness: 0.3 });
const pinMat = new THREE.MeshStandardMaterial({ color: 0xd9b56a, metalness: 0.9, roughness: 0.25 });
const wireMat = new THREE.LineBasicMaterial({ color: 0x3a3028, transparent: true, opacity: 0.55 });

export interface Part {
  group: THREE.Group;
  /** Rest position along the axle (x). */
  restX: number;
  /** How far this part travels when pulled apart, as a multiple of EXPLODE_GAP. */
  explodeRank: number;
}

export interface RotorPart extends Part {
  /** Rotate the drum to show a position (0..25) in the window. */
  setPosition(pos: number): void;
  /** World position of contact i on the right (input) face at the current rotation. */
  rightContact(i: number): THREE.Vector3;
  /** World position of contact i on the left (output) face. */
  leftContact(i: number): THREE.Vector3;
  /** Redraw the internal wires for a wiring table (input contact -> output contact). */
  setWiring(table: number[]): void;
}

/** Angle of contact i on a face. A sits at the top. */
export function contactAngle(i: number): number {
  return Math.PI / 2 - (i / N) * Math.PI * 2;
}

function ringOfPins(x: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8);
  for (let i = 0; i < N; i++) {
    const pin = new THREE.Mesh(geo, pinMat);
    const a = contactAngle(i);
    pin.position.set(x, Math.sin(a) * PIN_R, Math.cos(a) * PIN_R);
    pin.rotation.z = Math.PI / 2;
    g.add(pin);
  }
  return g;
}

function letterRim(alphabet: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0c0b09';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#efe9dc';
    ctx.font = 'bold 72px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = c.width / N;
    for (let i = 0; i < N; i++) {
      ctx.fillText(alphabet[i] ?? '', step * i + step / 2, c.height / 2);
      ctx.fillStyle = '#3a3028';
      ctx.fillRect(step * i, 0, 2, c.height);
      ctx.fillStyle = '#efe9dc';
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function makeRotor(alphabet: string, restX: number, explodeRank: number): RotorPart {
  const group = new THREE.Group();
  group.position.x = restX;
  const drum = new THREE.Group(); // the part that turns
  group.add(drum);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ROTOR_R * 0.92, ROTOR_R * 0.92, ROTOR_T, 64),
    bakelite,
  );
  body.rotation.z = Math.PI / 2;
  drum.add(body);

  // the letter ring, slightly proud of the body
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(ROTOR_R, ROTOR_R, ROTOR_T * 0.55, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: letterRim(alphabet), metalness: 0.1, roughness: 0.7 }),
  );
  rim.rotation.z = Math.PI / 2;
  rim.rotation.y = Math.PI / 2; // texture seam at the back, A on top at rest
  drum.add(rim);

  // brass thumb ring on the right edge
  const thumb = new THREE.Mesh(new THREE.TorusGeometry(ROTOR_R * 0.95, 0.03, 10, 64), brass);
  thumb.rotation.y = Math.PI / 2;
  thumb.position.x = ROTOR_T / 2 - 0.02;
  drum.add(thumb);

  drum.add(ringOfPins(ROTOR_T / 2 + 0.02));
  drum.add(ringOfPins(-ROTOR_T / 2 - 0.02));

  const wires = new THREE.Group();
  drum.add(wires);

  const axleHole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, ROTOR_T + 0.01, 24), steel);
  axleHole.rotation.z = Math.PI / 2;
  drum.add(axleHole);

  let pos = 0;
  const tmp = new THREE.Vector3();
  const local = (face: 1 | -1, i: number): THREE.Vector3 => {
    const a = contactAngle(i);
    return tmp.set((ROTOR_T / 2 + 0.03) * face, Math.sin(a) * PIN_R, Math.cos(a) * PIN_R);
  };
  return {
    group,
    restX,
    explodeRank,
    setPosition(p) {
      pos = p;
      // turning the drum forward moves the next letter into the window at the top
      drum.rotation.x = (p / N) * Math.PI * 2;
    },
    rightContact(i) {
      // contact i on the stator side meets drum contact (i - pos): the drum has turned by pos
      return drum.localToWorld(local(1, (((i - pos) % N) + N) % N).clone());
    },
    leftContact(i) {
      return drum.localToWorld(local(-1, (((i - pos) % N) + N) % N).clone());
    },
    setWiring(table) {
      wires.clear();
      // table is in stator coordinates at the current position; draw it in drum coordinates
      const pts: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = local(1, (((i - pos) % N) + N) % N).clone();
        const b = local(-1, ((((table[i] ?? i) - pos) % N) + N) % N).clone();
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      wires.add(new THREE.LineSegments(geo, wireMat));
    },
  };
}

export interface DiscPart extends Part {
  contact(i: number): THREE.Vector3;
}

/** The reflector: a thick disc with contacts on its right face only. */
export function makeReflector(restX: number): DiscPart {
  const group = new THREE.Group();
  group.position.x = restX;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.92, ROTOR_R * 0.92, 0.3, 64), bakelite);
  body.rotation.z = Math.PI / 2;
  group.add(body);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.6, ROTOR_R * 0.6, 0.32, 64), brass);
  plate.rotation.z = Math.PI / 2;
  group.add(plate);
  group.add(ringOfPins(0.17));
  const tmp = new THREE.Vector3();
  return {
    group,
    restX,
    explodeRank: 0,
    contact(i) {
      const a = contactAngle(i);
      return group.localToWorld(tmp.set(0.18, Math.sin(a) * PIN_R, Math.cos(a) * PIN_R).clone());
    },
  };
}

/** The entry wheel: a thin disc with contacts on its left face. */
export function makeEntryWheel(restX: number, explodeRank: number): DiscPart {
  const group = new THREE.Group();
  group.position.x = restX;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.92, ROTOR_R * 0.92, 0.12, 64), brass);
  body.rotation.z = Math.PI / 2;
  group.add(body);
  group.add(ringOfPins(-0.08));
  const tmp = new THREE.Vector3();
  return {
    group,
    restX,
    explodeRank,
    contact(i) {
      const a = contactAngle(i);
      return group.localToWorld(tmp.set(-0.09, Math.sin(a) * PIN_R, Math.cos(a) * PIN_R).clone());
    },
  };
}

export interface BoardPart extends Part {
  socket(i: number): THREE.Vector3;
  setLit(i: number | null): void;
  setPairs(pairs: [number, number][]): void;
}

/** The plugboard: a plate of 26 sockets below the rotors, with patch cables. */
export function makePlugboard(alphabet: string, layout: string[]): BoardPart {
  const group = new THREE.Group();
  const w = 3.6,
    h = 1.4;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), bakelite);
  group.add(plate);
  const sockets = new Map<number, THREE.Vector3>();
  const cols = Math.max(...layout.map((r) => r.length));
  layout.forEach((row, r) => {
    const offset = (cols - row.length) / 2;
    row.split('').forEach((L, c) => {
      const i = alphabet.indexOf(L);
      if (i < 0) return;
      const x = ((c + offset + 0.5) / cols - 0.5) * (w - 0.3);
      const z = ((r + 0.5) / layout.length - 0.5) * (h - 0.3);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), steel);
      s.position.set(x, 0.06, z);
      group.add(s);
      sockets.set(i, new THREE.Vector3(x, 0.1, z));
    });
  });
  const cables = new THREE.Group();
  group.add(cables);
  const tmp = new THREE.Vector3();
  return {
    group,
    restX: 0,
    explodeRank: 0,
    socket(i) {
      return group.localToWorld((sockets.get(i) ?? tmp.set(0, 0, 0)).clone());
    },
    setLit() {
      // the plugboard has no lamps; kept for interface symmetry
    },
    setPairs(pairs) {
      cables.clear();
      for (const [a, b] of pairs) {
        const pa = sockets.get(a),
          pb = sockets.get(b);
        if (!pa || !pb) continue;
        const mid = pa.clone().lerp(pb, 0.5);
        mid.y += 0.25 + pa.distanceTo(pb) * 0.15;
        const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, 0.022, 8, false),
          new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 }),
        );
        cables.add(cable);
      }
    },
  };
}

/** The lampboard: 26 glass lamps in QWERTZ rows, one lit at a time. */
export function makeLampboard(alphabet: string, layout: string[]): BoardPart {
  const group = new THREE.Group();
  const w = 3.6,
    h = 1.2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), bakelite);
  group.add(plate);
  const lamps = new Map<number, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>();
  const cols = Math.max(...layout.map((r) => r.length));
  layout.forEach((row, r) => {
    const offset = (cols - row.length) / 2;
    row.split('').forEach((L, c) => {
      const i = alphabet.indexOf(L);
      if (i < 0) return;
      const x = ((c + offset + 0.5) / cols - 0.5) * (w - 0.3);
      const z = ((r + 0.5) / layout.length - 0.5) * (h - 0.3);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a2520, emissive: 0x000000, roughness: 0.4 }),
      );
      lamp.position.set(x, 0.08, z);
      group.add(lamp);
      lamps.set(i, lamp);
    });
  });
  const tmp = new THREE.Vector3();
  return {
    group,
    restX: 0,
    explodeRank: 0,
    socket(i) {
      const l = lamps.get(i);
      return group.localToWorld((l ? l.position : tmp.set(0, 0, 0)).clone());
    },
    setLit(i) {
      for (const [k, l] of lamps) {
        const on = k === i;
        l.material.emissive.set(on ? 0xe3b556 : 0x000000);
        l.material.emissiveIntensity = on ? 1.6 : 0;
        l.material.color.set(on ? 0xf4c35a : 0x2a2520);
      }
    },
    setPairs() {
      // no cables on a lampboard
    },
  };
}

/** The wooden case: a shallow box the parts sit in, with a lid that lifts away. */
export function makeCase(): { base: THREE.Group; lid: THREE.Group } {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a16, roughness: 0.75 });
  const base = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 4.2), wood);
  floor.position.y = -1.55;
  base.add(floor);
  for (const [x, z, w, d] of [
    [-2.55, 0, 0.1, 4.2],
    [2.55, 0, 0.1, 4.2],
    [0, -2.05, 5.2, 0.1],
    [0, 2.05, 5.2, 0.1],
  ] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, d), wood);
    wall.position.set(x, -0.8, z);
    base.add(wall);
  }
  const lid = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 4.2), wood);
  top.position.y = 0.06;
  lid.add(top);
  lid.position.y = 1.4;
  return { base, lid };
}

export { brass, bakelite, steel };
