// The Enigma I as a set of procedural parts, proportioned after the real
// machine: rotors on a common axle, the reflector (UKW) at the left, the entry
// wheel (ETW) at the right, the plugboard at the front and the lampboard
// behind it, all in a wooden case. Each part knows where its contacts sit in
// world space, so the live letter can be threaded through.
import * as THREE from 'three';

export const N = 26;
export const ROTOR_R = 1.0; // rotor radius
export const ROTOR_T = 0.42; // rotor thickness along the axle
export const PIN_R = 0.78; // radius of the contact ring on a rotor face
export const EXPLODE_GAP = 1.1; // extra gap when fully pulled apart
export const CASE = { w: 5.2, d: 4.2, floorY: -1.55, rimY: -0.05 };

/** A tileable noise texture, used as roughness and bump for crinkle and brushed finishes. */
function noiseTexture(size: number, contrast: number, repeat: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 120 * contrast;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}
const crinkle = noiseTexture(256, 1, 4);
export const brass = new THREE.MeshStandardMaterial({
  color: 0xc09a5c,
  metalness: 0.95,
  roughness: 0.28,
  roughnessMap: noiseTexture(128, 0.4, 2),
});
export const bakelite = new THREE.MeshStandardMaterial({
  color: 0x15120f,
  metalness: 0.15,
  roughness: 0.62,
  roughnessMap: crinkle,
  bumpMap: crinkle,
  bumpScale: 0.004,
});
const bakeliteBoth = bakelite.clone();
bakeliteBoth.side = THREE.DoubleSide;
export const steel = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.9, roughness: 0.3 });
const pinMat = new THREE.MeshStandardMaterial({ color: 0xd9b56a, metalness: 0.95, roughness: 0.2 });
const wireMat = new THREE.LineBasicMaterial({ color: 0x3a3028, transparent: true, opacity: 0.55 });
const wood = new THREE.MeshStandardMaterial({
  color: 0x3a2a16,
  roughness: 0.7,
  roughnessMap: noiseTexture(256, 0.6, 3),
});
const cableMat = new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 });

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

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = m.receiveShadow = true;
  return m;
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
    ctx.fillStyle = '#121009';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = 'bold 72px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    const step = c.width / N;
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = '#3a3028';
      ctx.fillRect(step * i, 0, 2, c.height);
      ctx.fillStyle = '#efe9dc';
      ctx.fillText(alphabet[i] ?? '', step * i + step / 2, c.height / 2);
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

  // the bakelite core; its faces carry the contacts, so they get a face material that catches light
  const face = new THREE.MeshStandardMaterial({ color: 0x2a241e, metalness: 0.35, roughness: 0.5 });
  const body = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.88, ROTOR_R * 0.88, ROTOR_T - 0.01, 64), [
      bakelite,
      face,
      face,
    ]),
  );
  body.rotation.z = Math.PI / 2;
  drum.add(body);

  // the alphabet tyre: an open band around the left two thirds of the rim, letters engraved around it
  const tyreW = ROTOR_T * 0.6;
  const tyreX = -ROTOR_T / 2 + tyreW / 2 + 0.02;
  const tyre = shadowed(
    new THREE.Mesh(
      new THREE.CylinderGeometry(ROTOR_R, ROTOR_R, tyreW, 64, 1, true),
      new THREE.MeshStandardMaterial({
        map: letterRim(alphabet),
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    ),
  );
  tyre.rotation.z = Math.PI / 2; // axis along the axle; the texture wraps the rim
  tyre.position.x = tyreX;
  drum.add(tyre);
  for (const side of [-1, 1] as const) {
    const cap = new THREE.Mesh(new THREE.RingGeometry(ROTOR_R * 0.9, ROTOR_R, 64), bakeliteBoth);
    cap.rotation.y = (side * Math.PI) / 2;
    cap.position.x = tyreX + (side * tyreW) / 2 + side * 0.004; // a hair proud, no z-fight
    drum.add(cap);
  }

  // the finger wheel: a serrated brass ring on the right edge, a touch larger than the tyre
  const wheelW = ROTOR_T * 0.22;
  const wheel = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 1.02, ROTOR_R * 1.02, wheelW, 64), brass),
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.x = ROTOR_T / 2 - wheelW / 2 + 0.006; // clears the body end face
  drum.add(wheel);
  const tooth = new THREE.BoxGeometry(wheelW, 0.05, 0.09);
  for (let i = 0; i < N; i++) {
    const t = new THREE.Mesh(tooth, brass);
    const a = contactAngle(i) + Math.PI / N;
    t.position.set(wheel.position.x, Math.sin(a) * ROTOR_R * 1.03, Math.cos(a) * ROTOR_R * 1.03);
    t.rotation.x = -a;
    drum.add(t);
  }

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
  const wrap = (i: number): number => ((i % N) + N) % N;
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
      // stator contact i meets drum contact (i - pos): the drum has turned by pos
      return drum.localToWorld(local(1, wrap(i - pos)).clone());
    },
    leftContact(i) {
      return drum.localToWorld(local(-1, wrap(i - pos)).clone());
    },
    setWiring(table) {
      wires.clear();
      const pts: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = local(1, wrap(i - pos)).clone();
        const b = local(-1, wrap((table[i] ?? i) - pos)).clone();
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
  const body = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.92, ROTOR_R * 0.92, 0.3, 64), bakelite),
  );
  body.rotation.z = Math.PI / 2;
  group.add(body);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.6, ROTOR_R * 0.6, 0.04, 64), brass);
  plate.rotation.z = Math.PI / 2;
  plate.position.x = 0.16;
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

/** The entry wheel: a thin brass disc with contacts on its left face. */
export function makeEntryWheel(restX: number, explodeRank: number): DiscPart {
  const group = new THREE.Group();
  group.position.x = restX;
  const body = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(ROTOR_R * 0.92, ROTOR_R * 0.92, 0.12, 64), brass),
  );
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

function boardSockets(
  alphabet: string,
  layout: string[],
  w: number,
  h: number,
  make: (x: number, z: number) => THREE.Mesh,
  group: THREE.Group,
): Map<number, THREE.Mesh> {
  const out = new Map<number, THREE.Mesh>();
  const cols = Math.max(...layout.map((r) => r.length));
  layout.forEach((row, r) => {
    const offset = (cols - row.length) / 2;
    row.split('').forEach((L, c) => {
      const i = alphabet.indexOf(L);
      if (i < 0) return;
      const x = ((c + offset + 0.5) / cols - 0.5) * (w - 0.3);
      const z = ((r + 0.5) / layout.length - 0.5) * (h - 0.3);
      const m = make(x, z);
      group.add(m);
      out.set(i, m);
    });
  });
  return out;
}

/** The plugboard: a plate of 26 sockets at the front, with patch cables. */
export function makePlugboard(alphabet: string, layout: string[]): BoardPart {
  const group = new THREE.Group();
  const w = 3.6,
    h = 1.4;
  group.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), bakelite)));
  const sockets = boardSockets(
    alphabet,
    layout,
    w,
    h,
    (x, z) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), steel);
      s.position.set(x, 0.06, z);
      return s;
    },
    group,
  );
  const cables = new THREE.Group();
  group.add(cables);
  const at = (i: number): THREE.Vector3 => {
    const s = sockets.get(i);
    return s ? s.position.clone().setY(0.1) : new THREE.Vector3(0, 0.1, 0);
  };
  return {
    group,
    restX: 0,
    explodeRank: 0,
    socket(i) {
      return group.localToWorld(at(i));
    },
    setLit() {
      // the plugboard has no lamps; kept for interface symmetry
    },
    setPairs(pairs) {
      cables.clear();
      for (const [a, b] of pairs) {
        if (!sockets.has(a) || !sockets.has(b)) continue;
        const pa = at(a),
          pb = at(b);
        const mid = pa.clone().lerp(pb, 0.5);
        mid.y += 0.25 + pa.distanceTo(pb) * 0.15;
        const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
        cables.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 8, false), cableMat));
      }
    },
  };
}

/** The lampboard: 26 glass lamps in QWERTZ rows, one lit at a time. */
export function makeLampboard(alphabet: string, layout: string[]): BoardPart {
  const group = new THREE.Group();
  const w = 3.6,
    h = 1.2;
  group.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), bakelite)));
  const lamps = boardSockets(
    alphabet,
    layout,
    w,
    h,
    (x, z) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a2520, emissive: 0x000000, roughness: 0.4 }),
      );
      lamp.position.set(x, 0.08, z);
      return lamp;
    },
    group,
  );
  return {
    group,
    restX: 0,
    explodeRank: 0,
    socket(i) {
      const l = lamps.get(i);
      return group.localToWorld(l ? l.position.clone() : new THREE.Vector3());
    },
    setLit(i) {
      for (const [k, l] of lamps) {
        const on = k === i;
        const mat = l.material as THREE.MeshStandardMaterial;
        mat.emissive.set(on ? 0xe3b556 : 0x000000);
        mat.emissiveIntensity = on ? 1.6 : 0;
        mat.color.set(on ? 0xf4c35a : 0x2a2520);
      }
    },
    setPairs() {
      // no cables on a lampboard
    },
  };
}

/** The keyboard: 26 round keys in QWERTZ rows, the one being pressed sits lower. */
export function makeKeyboard(alphabet: string, layout: string[]): BoardPart {
  const group = new THREE.Group();
  const w = 3.6,
    h = 1.25;
  group.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), bakelite)));
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.45 });
  const keys = boardSockets(
    alphabet,
    layout,
    w,
    h,
    (x, z) => {
      const k = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), steel);
      stem.position.y = 0.08;
      k.add(stem);
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.05, 20), keyMat));
      cap.position.y = 0.16;
      k.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 24), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.185;
      k.add(ring);
      const holder = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001));
      holder.position.set(x, 0, z);
      holder.add(k);
      return holder;
    },
    group,
  );
  const letters = letterSheet(alphabet, layout, w, h);
  letters.position.y = 0.19;
  group.add(letters);
  return {
    group,
    restX: 0,
    explodeRank: 0,
    socket(i) {
      const k = keys.get(i);
      return group.localToWorld(k ? k.position.clone().setY(0.19) : new THREE.Vector3());
    },
    setLit(i) {
      for (const [k, m] of keys) m.children[0]?.position.setY(k === i ? -0.03 : 0);
    },
    setPairs() {
      // keys carry no cables
    },
  };
}

/** A transparent sheet with the key letters painted where each key sits. */
function letterSheet(alphabet: string, layout: string[], w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 34px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2ecdc';
    const cols = Math.max(...layout.map((r) => r.length));
    layout.forEach((row, r) => {
      const offset = (cols - row.length) / 2;
      row.split('').forEach((L, col) => {
        if (!alphabet.includes(L)) return;
        const x = ((col + offset + 0.5) / cols - 0.5) * ((w - 0.3) / w) + 0.5;
        const z = ((r + 0.5) / layout.length - 0.5) * ((h - 0.3) / h) + 0.5;
        ctx.fillText(L, x * c.width, z * c.height);
      });
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** The wooden case. The lid hinges along the back edge; rotate `lid` about x to open it. */
export function makeCase(): { base: THREE.Group; lid: THREE.Group; flap: THREE.Group } {
  const base = new THREE.Group();
  const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(CASE.w, 0.12, CASE.d), wood));
  floor.position.y = CASE.floorY;
  base.add(floor);
  // the front wall is a flap hinged at the bottom; it drops to expose the plugboard, as on the real case
  const flap = new THREE.Group();
  const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(CASE.w, 1.5, 0.1), wood));
  front.position.y = 0.75;
  flap.add(front);
  for (const hx of [-1.9, 1.9]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12), brass);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(hx, 0, 0.07);
    flap.add(barrel);
  }
  flap.position.set(0, CASE.floorY + 0.06, CASE.d / 2);
  base.add(flap);
  for (const [x, z, w, d] of [
    [-2.55, 0, 0.1, CASE.d],
    [2.55, 0, 0.1, CASE.d],
    [0, -2.05, CASE.w, 0.1],
  ] as const) {
    const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, d), wood));
    wall.position.set(x, -0.8, z);
    base.add(wall);
  }
  // a darker band along the floor edges reads as the shadow a real box carries inside
  const shade = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  for (const [x, z, w, d] of [
    [-2.3, 0, 0.4, CASE.d - 0.2],
    [2.3, 0, 0.4, CASE.d - 0.2],
    [0, -1.8, CASE.w - 0.2, 0.4],
    [0, 1.8, CASE.w - 0.2, 0.4],
  ] as const) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shade);
    band.rotation.x = -Math.PI / 2;
    band.position.set(x, CASE.floorY + 0.065, z);
    base.add(band);
  }
  const lid = new THREE.Group();
  const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(CASE.w, 0.12, CASE.d), wood));
  top.position.set(0, 1.3, CASE.d / 2);
  lid.add(top);
  for (const [x, z, w, d] of [
    [-2.55, CASE.d / 2, 0.1, CASE.d],
    [2.55, CASE.d / 2, 0.1, CASE.d],
    [0, 0.05, CASE.w, 0.1],
    [0, CASE.d - 0.05, CASE.w, 0.1],
  ] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d), wood);
    wall.position.set(x, 0.65, z);
    lid.add(wall);
  }
  // two brass hinge barrels at the back, two latches at the front, a lip the lid closes over
  for (const hx of [-1.8, 1.8]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12), brass);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.x = hx;
    lid.add(hinge);
  }
  for (const lx of [-1.6, 1.6]) {
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.04), brass);
    latch.position.set(lx, 1.5 - 0.16, 0.07);
    flap.add(latch);
    const keeper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), brass);
    keeper.position.set(lx, 0.12, CASE.d - 0.05 + 0.07);
    lid.add(keeper);
  }
  // a thin lip frame around the opening for the lid to close over
  for (const [x, z, w, d] of [
    [-2.5, 0, 0.12, CASE.d - 0.1],
    [2.5, 0, 0.12, CASE.d - 0.1],
    [0, -2.0, CASE.w - 0.1, 0.12],
  ] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), wood);
    strip.position.set(x, CASE.rimY + 0.03, z);
    base.add(strip);
  }
  lid.position.set(0, CASE.rimY, -CASE.d / 2);
  return { base, lid, flap };
}

/** A cable bundle along a polyline, for the harness from the entry wheel to the boards. */
export function makeBundle(points: THREE.Vector3[], radius = 0.06): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, radius, 10, false), cableMat);
}
