// behavior-aware-conflict.js
// Interactive "conflict zone" figure for the Behavior-Aware Anthropometric Scene
// Generation paper-review note. Follows the repo's threebed convention:
// ES module + importmap ("three") + unpkg CDN for examples/jsm.
// Geometry logic is reused from the paper-viz prototype; labels are English-only
// (the blog has no language toggle).
// This module holds the figures this post needs (the desk/clearance conflict and the
// structural-vs-functional anthropometry box), sharing helpers (makeScene/mannequin/
// furniture) in one place — no duplication.
import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.151.3/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "https://unpkg.com/three@0.151.3/examples/jsm/renderers/CSS2DRenderer.js";

const COL = { featured: 0x0011e3, mag: 0xd6336c, gray: 0x9aa0a6, green: 0x2fa35a, greenfig: 0x8bbf86, blue: 0x6b8fd6, amber: 0xcf9a4a, wood: 0xc9a274, metal: 0x4a4e56, skin: 0xca924f, coat: 0x6a7b8c };

const MAT = {
  wood:  () => new THREE.MeshStandardMaterial({ color: COL.wood,  roughness: .62 }),
  metal: () => new THREE.MeshStandardMaterial({ color: COL.metal, roughness: .5, metalness: .25 }),
  seat:  () => new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: .6 }),
  skin:  () => new THREE.MeshStandardMaterial({ color: COL.skin, roughness: .6 }),
  coat:  () => new THREE.MeshStandardMaterial({ color: COL.coat, roughness: .8 }),
};

// ---------- generic helpers ----------
function boxEdges(w, d, h, color, opacity) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, d, h);
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: (opacity != null ? opacity : 0.12), roughness: .85, depthWrite: false })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color })));
  return g;
}
function floorGrid(scene, size) { const g = new THREE.GridHelper(size, size * 4, 0xd7d7d9, 0xededee); g.rotation.x = Math.PI / 2; g.userData.isFloor = true; scene.add(g); return g; }
function label(text, cls, x, y, z) {
  const el = document.createElement('div');
  el.className = 'lbl' + (cls ? ' ' + cls : '');
  el.innerHTML = text;
  const o = new CSS2DObject(el); o.position.set(x, y, z); return o;
}
// dimension line a->b with short perpendicular ticks (offset vector t) at each end
function dim(a, b, t, color) {
  const seg = (p, q) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(q[0], q[1], q[2])]), new THREE.LineBasicMaterial({ color: color != null ? color : 0x8a9097 }));
  const g = new THREE.Group();
  g.add(seg(a, b));
  g.add(seg([a[0] - t[0], a[1] - t[1], a[2] - t[2]], [a[0] + t[0], a[1] + t[1], a[2] + t[2]]));
  g.add(seg([b[0] - t[0], b[1] - t[1], b[2] - t[2]], [b[0] + t[0], b[1] + t[1], b[2] + t[2]]));
  return g;
}
// a dimension line with its label centred on the span (lo = label offset off the line)
function dimLabel(a, b, t, text, cls, color, lo) {
  const g = dim(a, b, t, color); lo = lo || [0, 0, 0];
  g.add(label(text, cls, (a[0] + b[0]) / 2 + lo[0], (a[1] + b[1]) / 2 + lo[1], (a[2] + b[2]) / 2 + lo[2]));
  return g;
}
// dashed reach-envelope arc in a plane ('xz' front, 'yz' side), centre (cx,cy,cz), radius r, angles a0->a1
function arc(cx, cy, cz, r, plane, a0, a1, color) {
  const pts = [], N = 56;
  for (let i = 0; i <= N; i++) {
    const a = a0 + (a1 - a0) * i / N; let x = cx, y = cy, z = cz;
    if (plane === 'xz') { x = cx + r * Math.cos(a); z = cz + r * Math.sin(a); }
    else if (plane === 'yz') { y = cy + r * Math.cos(a); z = cz + r * Math.sin(a); }
    pts.push(new THREE.Vector3(x, y, z));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: color != null ? color : COL.green, dashSize: 0.06, gapSize: 0.045 }));
  line.computeLineDistances(); return line;
}
// dimensioned measurement (보조선): measures a->b, the dim line offset by 'off', with dashed
// extension lines from each feature to the dim line, ticks t, and a label at the mid + lo.
function dimExt(a, b, off, t, text, cls, color, lo) {
  const a2 = [a[0] + off[0], a[1] + off[1], a[2] + off[2]], b2 = [b[0] + off[0], b[1] + off[1], b[2] + off[2]];
  const c = color != null ? color : 0x8a9097;
  const g = dim(a2, b2, t, c);
  const ext = (p, q) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(q[0], q[1], q[2])]), new THREE.LineDashedMaterial({ color: c, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0.55 })); l.computeLineDistances(); return l; };
  g.add(ext(a, a2)); g.add(ext(b, b2));
  lo = lo || [0, 0, 0];
  g.add(label(text, cls, (a2[0] + b2[0]) / 2 + lo[0], (a2[1] + b2[1]) / 2 + lo[1], (a2[2] + b2[2]) / 2 + lo[2]));
  return g;
}

// ---------- furniture (procedural, +Y forward, +Z up, metres) ----------
function makeDesk(w, d, h) {
  w = w || 1.2; d = d || 0.6; h = h || 0.74;
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, d, 0.04), MAT.wood()); top.position.set(0, 0, h - 0.02); g.add(top);
  const lg = new THREE.BoxGeometry(0.05, 0.05, h - 0.04), m = MAT.metal();
  const ix = w / 2 - 0.06, iy = d / 2 - 0.06;
  [[-ix, -iy], [ix, -iy], [-ix, iy], [ix, iy]].forEach(p => { const l = new THREE.Mesh(lg, m); l.position.set(p[0], p[1], (h - 0.04) / 2); g.add(l); });
  return g;
}
// chest of drawers / cabinet — drawers + handles face -Y (toward whoever operates it)
function makeChest(w, d, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), MAT.wood()); body.position.set(0, 0, h / 2); g.add(body);
  for (let i = 1; i <= 3; i++) {
    const z = h * i / 4;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.012, 0.008), MAT.metal()); seam.position.set(0, -d / 2 - 0.002, z); g.add(seam);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.018), MAT.metal()); handle.position.set(0, -d / 2 - 0.02, z - h / 8); g.add(handle);
  }
  return g;
}
// storage cabinet — a body with two hinged front doors + centre handles (fits a "storage area" better than drawers)
function makeStorageCabinet(w, d, h) {
  const g = new THREE.Group(), m = MAT.metal();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), MAT.wood()); body.position.set(0, 0, h / 2); g.add(body);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: .6 });
  [-1, 1].forEach(sgn => {
    const door = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.02, 0.016, h - 0.08), doorMat);
    door.position.set(sgn * w / 4, -d / 2 - 0.009, h / 2); g.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.12), m);
    handle.position.set(sgn * 0.03, -d / 2 - 0.025, h / 2); g.add(handle); // handles flank the centre seam
  });
  return g;
}
// a coat: a flat extruded silhouette (collar, shoulders, hanging sleeves, A-line body)
function makeCoat() {
  const pts = [[-0.04, 0.5], [-0.18, 0.42], [-0.28, 0.34], [-0.25, -0.05], [-0.17, -0.05], [-0.15, 0.24], [-0.22, -0.38], [0.22, -0.38], [0.15, 0.24], [0.17, -0.05], [0.25, -0.05], [0.28, 0.34], [0.18, 0.42], [0.04, 0.5]];
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); geo.translate(0, 0, -0.03);
  const m = new THREE.Mesh(geo, MAT.coat()); m.rotation.x = Math.PI / 2; return m; // stand upright, face -Y (toward viewer)
}
// standing coat rack: cross feet, pole, top hook knobs, and a coat draped on it — green reaches up to it
function makeCoatRack(h) {
  h = h || 1.82;
  const g = new THREE.Group(), wood = MAT.wood();
  for (let i = 0; i < 4; i++) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.025), wood); foot.position.set(0, 0, 0.02); foot.rotation.z = i * Math.PI / 4; g.add(foot); }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, h, 12), wood); pole.rotation.x = Math.PI / 2; pole.position.set(0, 0, h / 2); g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), wood); knob.position.set(0, 0, h + 0.01); g.add(knob);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const hook = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), wood); hook.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, h - 0.05); g.add(hook); }
  const coat = makeCoat(); coat.position.set(0, -0.1, h - 0.64); g.add(coat); // draped on the front (-Y) hook
  return g;
}
// open bookshelf: two side panels, a back, shelves, and a few books — blue reaches into it
function makeBookshelf(w, d, h) {
  const g = new THREE.Group(), wood = MAT.wood();
  [-w / 2, w / 2].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, d, h), wood); p.position.set(x, 0, h / 2); g.add(p); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, h), wood); back.position.set(0, d / 2 - 0.01, h / 2); g.add(back);
  for (let i = 0; i <= 3; i++) { const z = h * i / 3; const sh = new THREE.Mesh(new THREE.BoxGeometry(w, d, 0.025), wood); sh.position.set(0, 0, z + 0.012); g.add(sh); }
  const cols = [0x9aa0a6, 0xb86b5e, 0x6f8f6a, 0x5b6f93, 0xc2a24a];
  for (let s = 1; s <= 2; s++) for (let b = 0; b < 5; b++) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.035, d * 0.66, 0.16 + (b % 2) * 0.03), new THREE.MeshStandardMaterial({ color: cols[(s * 2 + b) % 5], roughness: .8 }));
    bk.position.set(-w / 2 + 0.08 + b * 0.05, -0.02, h * s / 3 + 0.1); g.add(bk);
  }
  return g;
}
function makeChair(seatH) {
  seatH = seatH || 0.46;
  const g = new THREE.Group(), seatMat = MAT.seat(), m = MAT.metal();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.07), seatMat); seat.position.set(0, 0, seatH); g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.5), seatMat); back.position.set(0, -0.2, seatH + 0.26); g.add(back);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, seatH - 0.12, 12), m); post.rotation.x = Math.PI / 2; post.position.set(0, 0, (seatH - 0.12) / 2 + 0.1); g.add(post);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.27, 0.03), m); spoke.position.set(Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0.06); spoke.rotation.z = -a; g.add(spoke);
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), m); caster.position.set(Math.sin(a) * 0.25, Math.cos(a) * 0.25, 0.04); g.add(caster);
  }
  return g;
}

// ---------- wooden mannequin (faces +Y) ----------
function poseJoints(pose) {
  const stand = {
    head: [0, 0, 1.62], neck: [0, 0, 1.46], chest: [0, 0, 1.36], pelvis: [0, 0, 0.96],
    shL: [-0.19, 0, 1.4], shR: [0.19, 0, 1.4], elL: [-0.23, 0.01, 1.12], elR: [0.23, 0.01, 1.12], wrL: [-0.24, 0.02, 0.86], wrR: [0.24, 0.02, 0.86],
    hipL: [-0.1, 0, 0.94], hipR: [0.1, 0, 0.94], knL: [-0.1, 0.02, 0.5], knR: [0.1, 0.02, 0.5], anL: [-0.1, 0, 0.06], anR: [0.1, 0, 0.06],
  };
  if (pose === 'reach') return Object.assign({}, stand, { shR: [0.19, 0, 1.4], elR: [0.3, 0.26, 1.42], wrR: [0.32, 0.55, 1.46] });
  // functional reach poses: up (vertical V1), out to the side (lateral H3), crouch-and-reach-low
  if (pose === 'reachUp') return Object.assign({}, stand, { shR: [0.19, 0, 1.42], elR: [0.34, 0, 1.62], wrR: [0.46, 0, 1.92] });
  if (pose === 'reachSide') return Object.assign({}, stand, { shR: [0.19, 0, 1.42], elR: [0.44, 0.2, 1.33], wrR: [0.62, 0.4, 1.2] }); // forward-and-out, into a shelf
  if (pose === 'crouch') return {
    head: [0, 0.2, 1.12], neck: [0, 0.16, 0.98], chest: [0, 0.12, 0.88], pelvis: [0, 0, 0.55],
    shL: [-0.18, 0.12, 0.86], shR: [0.18, 0.12, 0.86], elL: [-0.22, 0.2, 0.64], elR: [0.3, 0.32, 0.78], wrL: [-0.2, 0.38, 0.5], wrR: [0.44, 0.54, 0.68],
    hipL: [-0.1, 0, 0.53], hipR: [0.1, 0, 0.53], knL: [-0.12, 0.34, 0.3], knR: [0.12, 0.34, 0.3], anL: [-0.1, 0.06, 0.06], anR: [0.1, 0.06, 0.06],
  };
  // Vitruvian "star": arms raised up-and-out, legs spread — the body filling its movement envelope
  if (pose === 'star') return Object.assign({}, stand, {
    elL: [-0.30, 0, 1.56], wrL: [-0.46, 0, 1.78], elR: [0.30, 0, 1.56], wrR: [0.46, 0, 1.78],
    knL: [-0.20, 0.02, 0.50], anL: [-0.30, 0, 0.06], knR: [0.20, 0.02, 0.50], anR: [0.30, 0, 0.06],
  });
  if (pose === 'sit') return {
    head: [0, -0.02, 1.16], neck: [0, -0.02, 1.02], chest: [0, -0.02, 0.92], pelvis: [0, 0, 0.5],
    shL: [-0.18, -0.02, 0.9], shR: [0.18, -0.02, 0.9], elL: [-0.2, 0.08, 0.68], elR: [0.2, 0.08, 0.68], wrL: [-0.16, 0.32, 0.56], wrR: [0.16, 0.32, 0.56],
    hipL: [-0.1, 0.02, 0.48], hipR: [0.1, 0.02, 0.48], knL: [-0.1, 0.4, 0.46], knR: [0.1, 0.4, 0.46], anL: [-0.1, 0.42, 0.06], anR: [0.1, 0.42, 0.06],
  };
  return stand;
}
function makeMannequin(pose, color) {
  pose = pose || 'stand';
  const g = new THREE.Group(), mat = color != null ? new THREE.MeshStandardMaterial({ color, roughness: .6 }) : MAT.skin();
  const V = p => new THREE.Vector3(p[0], p[1], p[2]);
  const Y = new THREE.Vector3(0, 1, 0);
  const ups = []; // per-part updaters — lets the figure be re-posed each frame without rebuilding geometry
  const limb = (an, bn, r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), mat); g.add(m);
    ups.push(J => {
      const A = V(J[an]), B = V(J[bn]), dir = new THREE.Vector3().subVectors(B, A), len = Math.max(0.001, dir.length());
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.scale.set(1, len, 1); // unit cylinder scaled to limb length (rigid limbs keep constant length)
      m.quaternion.setFromUnitVectors(Y, dir.normalize());
    });
  };
  const ball = (jn, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), mat); g.add(m); ups.push(J => m.position.copy(V(J[jn]))); };
  const foot = (jn) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.06), mat); g.add(m); ups.push(J => { const a = J[jn]; m.position.set(a[0], a[1] + 0.06, 0.04); }); };
  limb('pelvis', 'chest', 0.115); limb('chest', 'neck', 0.06);
  ball('head', 0.115); ball('pelvis', 0.115); ball('chest', 0.1);
  limb('chest', 'shL', 0.05); limb('chest', 'shR', 0.05); ball('shL', 0.055); ball('shR', 0.055);
  limb('shL', 'elL', 0.05); limb('elL', 'wrL', 0.042); limb('shR', 'elR', 0.05); limb('elR', 'wrR', 0.042);
  ball('elL', 0.045); ball('elR', 0.045); ball('wrL', 0.04); ball('wrR', 0.04);
  ball('hipL', 0.07); ball('hipR', 0.07); limb('hipL', 'hipR', 0.055);
  limb('hipL', 'knL', 0.07); limb('knL', 'anL', 0.055); limb('hipR', 'knR', 0.07); limb('knR', 'anR', 0.055);
  ball('knL', 0.06); ball('knR', 0.06);
  foot('anL'); foot('anR');
  g.userData.setPose = (J) => ups.forEach(u => u(J));
  g.userData.setPose((typeof pose === 'object' && pose) ? pose : poseJoints(pose));
  return g;
}

// ---------- kinematic posing (FK torso + two-bone IK limbs, constant bone lengths) — for the interaction figure ----------
function twoBoneIK(A, T, L1, L2, pole) {
  const AT = T.clone().sub(A);
  let d = AT.length();
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const dir = AT.clone().normalize();
  const Tc = A.clone().add(dir.clone().multiplyScalar(d));
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  let up = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (up.lengthSq() < 1e-6) { up = (Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)); up.sub(dir.clone().multiplyScalar(up.dot(dir))); }
  up.normalize();
  const elbowDir = dir.clone().multiplyScalar(Math.cos(a)).add(up.multiplyScalar(Math.sin(a)));
  return [A.clone().add(elbowDir.multiplyScalar(L1)), Tc];
}
const BONE = { spine: 0.40, neck: 0.10, head: 0.16, shW: 0.19, shUp: 0.04, upArm: 0.28, foreArm: 0.26, hipW: 0.10, thigh: 0.44, shin: 0.44 };
// solve a figure from high-level targets (hand/foot positions, pelvis, lean) → joint dict for makeMannequin
function solveFigure(pose) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const p = Object.assign({ pelvis: [0, 0, 0.92], lean: 0, footL: null, footR: null, handL: null, handR: null }, pose);
  const pelvis = V(p.pelvis[0], p.pelvis[1], p.pelvis[2]);
  const up = V(0, Math.sin(p.lean), Math.cos(p.lean)), side = V(1, 0, 0);
  const J = {};
  J.pelvis = pelvis;
  J.chest = pelvis.clone().add(up.clone().multiplyScalar(BONE.spine));
  J.neck = J.chest.clone().add(up.clone().multiplyScalar(BONE.neck));
  J.head = J.neck.clone().add(up.clone().multiplyScalar(BONE.head));
  J.shR = J.chest.clone().add(side.clone().multiplyScalar(BONE.shW)).add(up.clone().multiplyScalar(BONE.shUp));
  J.shL = J.chest.clone().add(side.clone().multiplyScalar(-BONE.shW)).add(up.clone().multiplyScalar(BONE.shUp));
  J.hipR = pelvis.clone().add(side.clone().multiplyScalar(BONE.hipW));
  J.hipL = pelvis.clone().add(side.clone().multiplyScalar(-BONE.hipW));
  const armReach = BONE.upArm + BONE.foreArm;
  const footR = p.footR ? V(p.footR[0], p.footR[1], p.footR[2]) : V(J.hipR.x, 0, 0.06);
  const footL = p.footL ? V(p.footL[0], p.footL[1], p.footL[2]) : V(J.hipL.x, 0, 0.06);
  const handR = p.handR ? V(p.handR[0], p.handR[1], p.handR[2]) : V(J.shR.x + 0.05, 0.02, J.shR.z - armReach + 0.04);
  const handL = p.handL ? V(p.handL[0], p.handL[1], p.handL[2]) : V(J.shL.x - 0.05, 0.02, J.shL.z - armReach + 0.04);
  const kneePole = p.kneePole ? V(p.kneePole[0], p.kneePole[1], p.kneePole[2]) : V(0, 1, -0.2);
  [J.knR, J.anR] = twoBoneIK(J.hipR, footR, BONE.thigh, BONE.shin, kneePole);
  [J.knL, J.anL] = twoBoneIK(J.hipL, footL, BONE.thigh, BONE.shin, kneePole);
  const epR = p.elbowPole ? V(p.elbowPole[0], p.elbowPole[1], p.elbowPole[2]) : V(0.3, -0.5, -1);
  const epL = p.elbowPole ? V(-p.elbowPole[0], p.elbowPole[1], p.elbowPole[2]) : V(-0.3, -0.5, -1);
  [J.elR, J.wrR] = twoBoneIK(J.shR, handR, BONE.upArm, BONE.foreArm, epR);
  [J.elL, J.wrL] = twoBoneIK(J.shL, handL, BONE.upArm, BONE.foreArm, epL);
  const out = {}; for (const k in J) out[k] = [J[k].x, J[k].y, J[k].z]; return out;
}
// axis-aligned bounding box of an object → translucent volume (for the grouping figure)
function bboxOf(obj, color, opacity) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const geo = new THREE.BoxGeometry(Math.max(size.x, .01), Math.max(size.y, .01), Math.max(size.z, .01));
  const g = new THREE.Group(); g.position.copy(center);
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: (opacity != null ? opacity : .06), depthWrite: false })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .55 })));
  g.userData.center = center; g.userData.size = size;
  return g;
}

// ---------- scene scaffold ----------
function makeScene(container, build) {
  const W = container.clientWidth, H = container.clientHeight;
  const scene = new THREE.Scene();
  const cp = (container.dataset.cam || '2.5,-2.6,1.9').split(',').map(Number);
  const tg = (container.dataset.target || '0,0,0.6').split(',').map(Number);
  // seed half-height only; frame() replaces it with a content fit once the scene is built
  const halfH = Math.hypot(cp[0]-tg[0], cp[1]-tg[1], cp[2]-tg[2]) * Math.tan(21 * Math.PI/180);
  const cam = new THREE.OrthographicCamera(-halfH*W/H, halfH*W/H, halfH, -halfH, 0.05, 100); cam.up.set(0, 0, 1);
  cam.position.set(cp[0], cp[1], cp[2]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  if (THREE.sRGBEncoding != null) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W, H);
  container.appendChild(renderer.domElement);
  const lr = new CSS2DRenderer(); lr.setSize(W, H);
  Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  container.appendChild(lr.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 0.95); dl.position.set(4, -5, 8); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.3); dl2.position.set(-4, 3, 5); scene.add(dl2);
  const ctr = new OrbitControls(cam, renderer.domElement);
  ctr.enableDamping = true; ctr.dampingFactor = .08; ctr.autoRotate = false; ctr.enablePan = true; // static (no auto-spin); right-drag pans (OrbitControls default RIGHT=PAN)
  ctr.minZoom = 0.7; ctr.maxZoom = 2.5; // ortho zoom clamps (minDistance/maxDistance are no-ops for OrthographicCamera)
  ctr.target.set(tg[0], tg[1], tg[2]);
  build(scene, THREE, renderer);   // renderer passed so a build can render-to-texture (multi-view capture)
  // Content-fit framing. The camera is orthographic, so cam.top (hH) IS the zoom — dist(cam,target)
  // only sets the view direction. Fit hH to the silhouette the camera actually sees: project every
  // vertex onto the camera's right/up axes. A bounding-sphere estimate cannot do this, because a
  // sphere's radius is the half-DIAGONAL: stage B's flat view planes and the long storage run
  // measured ~15% wider than they draw, and the resulting margin was visible as dead space.
  const target = new THREE.Vector3(tg[0], tg[1], tg[2]);
  const fwd = new THREE.Vector3().subVectors(target, cam.position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  scene.updateMatrixWorld(true);
  const tR = target.dot(right), tU = target.dot(up), v = new THREE.Vector3();
  let cW = 0, cH = 0;   // content half-extents, measured from the target (= the frame centre)
  scene.traverse(o => {
    if (o.userData.isFloor || !o.geometry) return;   // the floor grid is backdrop, not content
    const pos = o.geometry.attributes.position; if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      cW = Math.max(cW, Math.abs(v.dot(right) - tR));
      cH = Math.max(cH, Math.abs(v.dot(up) - tU));
    }
  });
  // Labels are fixed-size DOM boxes, so their footprint shrinks as the camera zooms out and cannot be
  // expressed in world units. Render once to attach them, then solve hH per label so its box clears the
  // container edge. This replaces the old blanket 1.22 fit factor, which padded every scene for the
  // worst-case label whether or not that scene had one near an edge.
  lr.render(scene, cam);
  const labels = [];
  scene.traverse(o => {
    if (!o.isCSS2DObject) return;
    const wp = o.getWorldPosition(new THREE.Vector3());
    labels.push({ r: Math.abs(wp.dot(right) - tR), u: Math.abs(wp.dot(up) - tU),
                  bx: o.element.offsetWidth / 2, by: o.element.offsetHeight / 2 });
  });
  const MARGIN = 1.18;   // silhouette fills 1/MARGIN of the card; a tight fit reads cramped, not legible
  const EDGE = 12;       // px kept clear at the container edge
  function frame() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    const aspect = w / h;
    let hH = Math.max(cH, cW / aspect) * MARGIN;
    for (const l of labels) {
      const availX = w / 2 - EDGE - l.bx, availY = h / 2 - EDGE - l.by;
      if (availX > 0) hH = Math.max(hH, l.r * (w / 2) / (availX * aspect));   // px x = l.r/(hH·aspect)·(w/2)
      if (availY > 0) hH = Math.max(hH, l.u * (h / 2) / availY);              // px y = l.u/hH·(h/2)
    }
    cam.left = -hH * aspect; cam.right = hH * aspect; cam.top = hH; cam.bottom = -hH; cam.updateProjectionMatrix();
    renderer.setSize(w, h); lr.setSize(w, h);
  }
  frame();
  if (window.ResizeObserver) new ResizeObserver(frame).observe(container);
  (function loop() { requestAnimationFrame(loop); if (scene.userData.tick) scene.userData.tick(performance.now()); ctr.update(); renderer.render(scene, cam); lr.render(scene, cam); })();
  return { scene, cam, controls: ctr };
}

// ---------- the figure: same stand-up clearance, conflict vs resolved, side by side in ONE scene ----------
// Left station: the wall sits inside the clearance (plausible but unusable).
// Right station: the furniture is spaced apart so the clearance stays free (usable).
// Same body + same blue clearance volume in both — only the wall distance changes.
function buildConflict(scene) {
  floorGrid(scene, 8);
  // one desk + seated body + stand-up clearance, in front of a FIXED wall, at x-offset cx.
  // The wall is in the same place in both stations; only the furniture distance changes:
  // conflict → furniture pushed toward the wall (clearance hits it); resolved → pulled back (clearance clears).
  function station(cx, resolved) {
    const g = new THREE.Group(); g.position.set(cx, 0, 0);
    // wall / next desk — identical position in both stations
    const WALL_Y = 1.45, wallFront = WALL_Y - 0.08;
    const wall = boxEdges(1.3, 0.16, 1.5, COL.gray, 0.22); wall.position.set(0, WALL_Y, 0.75); g.add(wall);
    // furniture (desk + seated body + stand-up clearance) shifts in Y: toward the wall vs pulled back
    const fy = resolved ? -0.25 : 0.25;
    const desk = makeDesk(1.2, 0.6, 0.74); desk.position.set(0, -0.18 + fy, 0); g.add(desk);
    const chair = makeChair(0.46); chair.position.set(0, 0.42 + fy, 0); chair.rotation.z = Math.PI; g.add(chair);
    const sit = makeMannequin('sit'); sit.position.set(0, 0.44 + fy, 0); sit.rotation.z = Math.PI; g.add(sit);
    const clr = boxEdges(0.74, 0.66, 1.34, COL.featured, 0.10); clr.position.set(0, 0.96 + fy, 0.62); g.add(clr);
    const clrBack = 0.96 + fy + 0.33; // back face of the clearance volume
    if (resolved) {
      g.add(label('clearance kept', 'f', 0.78, 0.96 + fy, 1.46));
      g.add(label('spaced apart', 'g', 0, -0.62 + fy, 0.05));
    } else {
      // conflict overlap (magenta): where the moved-in clearance meets the fixed wall
      const cf = boxEdges(0.76, clrBack - wallFront, 1.34, COL.mag, 0.34); cf.position.set(0, (wallFront + clrBack) / 2, 0.62); g.add(cf);
      g.add(label('conflict', 'm', 0, (wallFront + clrBack) / 2, 0.16));
      g.add(label('too close', 'g', 0, -0.62 + fy, 0.05));
    }
    return g;
  }
  scene.add(station(-1.2, false));
  scene.add(station(1.2, true));
  // name the shared blue volume once, on the left (conflict) station
  scene.add(label('clearance to stand', 'f', -1.98, 1.21, 1.46));
}

// ---------- §2.2 figure: structural (static box) vs functional (movement box) anthropometry ----------
function buildDims(scene) {
  floorGrid(scene, 5);
  // structural (static): the body's fixed dimensions — a snug gray box
  const s = makeMannequin('stand', COL.gray); s.position.set(-0.95, 0, 0); scene.add(s);
  const sbox = boxEdges(0.5, 0.34, 1.68, COL.gray, 0.07); sbox.position.set(-0.95, 0, 0.84); scene.add(sbox);
  scene.add(label('structural (static)', '', -0.95, 0, 2.02)); // black (default .lbl colour)
  // dimension lines on the box edges so each label clearly marks the extent it measures
  scene.add(dimLabel([-0.7, 0.17, 0.02], [-0.7, 0.17, 1.66], [0.05, 0, 0], 'V1 height', 'g', 0x8a9097, [0.22, 0.16, 0]));
  scene.add(dimExt([-1.2, 0.17, 0.04], [-0.7, 0.17, 0.04], [0, 0.26, -0.05], [0, 0, 0.05], 'body width', 'g', 0x8a9097, [0, 0.12, -0.05]));
  scene.add(dimExt([-1.2, -0.17, 0.55], [-1.2, 0.17, 0.55], [-0.28, 0, 0], [0, 0, 0.05], 'torso depth', 'g', 0x8a9097, [-0.18, 0, -0.12]));
  // functional (movement): the body reaching in many directions — up, to the side, crouching low —
  // with a dotted reach-envelope arc. Functional dimensions = the space the body sweeps (vs the static box).
  const fUp = makeMannequin('reachUp', COL.greenfig); fUp.position.set(0.4, 0, 0); scene.add(fUp);
  const fCrouch = makeMannequin('crouch', COL.amber); fCrouch.position.set(1.65, 0, 0); scene.add(fCrouch);
  const fSide = makeMannequin('reachSide', COL.blue); fSide.position.set(2.9, 0.3, 0); scene.add(fSide); // stands in front of the shelf, reaches forward-and-out into it
  // varied furniture each figure interacts with — grounds the reach in a plausible task
  const rack = makeCoatRack(2); rack.position.set(0.9, 0.2, 0); scene.add(rack);                   // green reaches up to a coat-stand hook
  const chest = makeChest(0.5, 0.4, 0.56); chest.position.set(2.12, 0.72, 0); scene.add(chest);    // amber crouches into a low chest of drawers
  const shelf = makeBookshelf(0.7, 0.34, 1.66); shelf.position.set(3.7, 0.8, 0); scene.add(shelf); // blue reaches into an open bookshelf
  const sx = 0.59, sy = 0, sz = 1.42, R = 0.84; // reach-envelope arc from the 'reach up' figure's shoulder
  scene.add(arc(sx, sy, sz, R, 'yz', -Math.PI / 2.4, Math.PI / 2, COL.green)); // low-forward sweep up to overhead
  scene.add(label('functional (movement)', '', 1.6, 0, 2.6)); // black (default .lbl colour)
  // 보조선: dimension the key functional reaches (vertical reach from green, lateral reach from blue)
  scene.add(dimExt([0.86, 0, 1.92], [0.86, 0, 0.04], [-0.75, 0, 0], [0.05, 0, 0], 'reach up (V1)', 'gr', COL.green, [-0.22, 0, -0.55]));
  scene.add(dimExt([2.9, 0.45, 1.3], [3.52, 0.45, 1.3], [0, 0, 0.65], [0, 0, 0.05], 'reach to the side (H3)', 'fb', 0x3a5cc0, [-0.3, 0, 0.2])); // horizontal lateral measure, raised above the head with drops to the reach
  scene.add(label('crouch &amp; reach low', 'fa', 1.65, 0.36, 1.0));
  scene.add(label('reach envelope', 'gr', sx, sy + 0.92, sz + 0.08));
}

// shared asset used by BOTH the preprocessing (B) and functional-description (C) figures, so the two
// read continuously: an open-shelf cabinet with two movable parts — a sliding door (upper-right) and a
// hinged door (lower-left). Returns refs (not via userData, which would break group.clone()'s JSON copy).
function makeAsset() {
  const g = new THREE.Group();
  const w = 0.9, d = 0.4, h = 0.7, t = 0.02, colW = w / 2;
  const shell = new THREE.MeshStandardMaterial({ color: 0xe9e9ec, roughness: .7 });
  const fixed = new THREE.MeshStandardMaterial({ color: 0x803a3a, roughness: .65 });
  const red = () => new THREE.MeshStandardMaterial({ color: 0x9c4646, roughness: .55 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: .4 });
  const panel = (sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), shell); m.position.set(px, py, pz); g.add(m); };
  panel(w, d, t, 0, 0, h - t / 2);            // top
  panel(w, d, t, 0, 0, t / 2);                // bottom
  panel(w, d, t, 0, 0, h / 2);                // middle shelf
  panel(t, d, h, -w / 2 + t / 2, 0, h / 2);   // left side
  panel(t, d, h, w / 2 - t / 2, 0, h / 2);    // right side
  panel(t, d, h, 0, 0, h / 2);                // centre divider
  panel(w, t, h, 0, d / 2 - t / 2, h / 2);    // back
  const solid = new THREE.Mesh(new THREE.BoxGeometry(colW - 0.07, d - 0.07, h / 2 - 0.07), fixed); solid.position.set(colW / 2, 0, h / 4); g.add(solid); // lower-right: fixed
  const slide = new THREE.Mesh(new THREE.BoxGeometry(colW - 0.04, t, h / 2 - 0.06), red()); slide.position.set(colW / 2, -d / 2 + 0.006, h * 0.75); g.add(slide); // upper-right: sliding door
  const sk = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), knobMat); sk.position.set(-(colW - 0.04) / 2 + 0.05, -0.014, 0); slide.add(sk); // child of the door → moves with it
  const hinge = new THREE.Group(); hinge.position.set(-w / 2 + 0.012, -d / 2 + 0.006, h / 4); g.add(hinge); // lower-left: hinged door on the outer edge
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(colW - 0.04, t, h / 2 - 0.06), red()); leaf.position.set((colW - 0.04) / 2, 0, 0); hinge.add(leaf);
  const hk = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), knobMat); hk.position.set(colW - 0.07, -0.008, 0); hinge.add(hk);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, d, h)), new THREE.LineBasicMaterial({ color: 0xb8b8bd })); outline.position.set(0, 0, h / 2); g.add(outline);
  return { group: g, slide, hinge, slideClosedX: colW / 2, w, d, h, colW };
}

// ---------- Method §3.1 Stage B · multi-view preprocessing (renders each asset from 4 views to textures) ----------
function buildStageB(scene, THREE, renderer) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const capScene = new THREE.Scene();
  function captureView(camPos, look, halfW, halfH, rtW, rtH) {
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 30);
    cam.up.set(0, 0, 1); cam.position.set(camPos[0], camPos[1], camPos[2]); cam.lookAt(look[0], look[1], look[2]);
    const rt = new THREE.WebGLRenderTarget(rtW, rtH, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(capScene, cam); renderer.setRenderTarget(null);
    return rt.texture;
  }
  function billboard(tex, pos, pw, ph, facePos) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    const hw = (pw + 0.05) / 2, hh = (ph + 0.05) / 2;
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(-hw, -hh, 0), V(hw, -hh, 0), V(hw, hh, 0), V(-hw, hh, 0)]), new THREE.LineBasicMaterial({ color: 0x4a4a8c })));
    g.position.set(pos[0], pos[1], pos[2]); g.up.set(0, 0, 1); g.lookAt(facePos[0], facePos[1], facePos[2]);
    return g;
  }
  function makeCamera(camPos, target, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: .4, metalness: .2 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.11), mat));
    const vf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), mat); vf.position.set(0, -0.02, 0.07); g.add(vf);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 12), dark); btn.position.set(0.05, -0.01, 0.065); g.add(btn);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.09, 18), dark); lens.position.set(0, 0.095, 0); g.add(lens);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 18), mat); ring.position.set(0, 0.14, 0); g.add(ring);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 18), new THREE.MeshStandardMaterial({ color: 0x9fb4e8, roughness: .2, metalness: .4 })); glass.position.set(0, 0.151, 0); g.add(glass);
    const dir = V(target[0], target[1], target[2]).sub(V(camPos[0], camPos[1], camPos[2])).normalize();
    g.quaternion.setFromUnitVectors(V(0, 1, 0), dir); g.position.set(camPos[0], camPos[1], camPos[2]);
    return g;
  }
  // A view's camera basis. `at(centre, halfW, halfH)` returns that rect's 4 world corners, always in the
  // same winding, so two rects on the same view axis can be linked corner-to-corner without crossing.
  // The billboard's own lookAt basis works out to this same (right, up), so plane corners share it.
  function viewRect(camPos, target) {
    const P = V(camPos[0], camPos[1], camPos[2]), T = V(target[0], target[1], target[2]);
    const dir = T.clone().sub(P).normalize();
    const right = new THREE.Vector3().crossVectors(dir, V(0, 0, 1)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const at = (ctr, hw, hh) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(s => ctr.clone()
      .add(right.clone().multiplyScalar(s[0] * hw)).add(up.clone().multiplyScalar(s[1] * hh)));
    return { P, T, at };
  }
  function orthoCamMarker(camPos, target, halfW, halfH, color) {
    const g = new THREE.Group();
    const { P, T, at } = viewRect(camPos, target);
    const near = at(P, halfW, halfH), far = at(T, halfW, halfH);
    const m = new THREE.LineBasicMaterial({ color: 0x9ab0e8, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 4; i++) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([near[i], far[i]]), m));
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(near), m));
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(far), m));
    g.add(makeCamera(camPos, target, color));
    return g;
  }
  function dashLink(a, b) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: 0x6a6aa8, dashSize: 0.06, gapSize: 0.045 })); l.computeLineDistances(); return l; }
  const views = [{ deg: '0°', dir: [0, -1], front: true }, { deg: '90°', dir: [1, 0], front: false }, { deg: '180°', dir: [0, 1], front: true }, { deg: '270°', dir: [-1, 0], front: false }];
  floorGrid(scene, 10);
  const a = makeAsset(); scene.add(a.group);
  capScene.add(new THREE.AmbientLight(0xffffff, 0.92));
  const cdl = new THREE.DirectionalLight(0xffffff, 0.32); cdl.position.set(2, -3, 5); capScene.add(cdl);
  const cdl2 = new THREE.DirectionalLight(0xffffff, 0.16); cdl2.position.set(-2, 3, 4); capScene.add(cdl2);
  capScene.add(a.group.clone());
  const C = [0, 0, 0.35], Rcap = 4, Rc = 1.5, Ro = 2.95, billZ = 0.78, camZ = 0.35, ds = 1.2;
  const oldColor = new THREE.Color(); renderer.getClearColor(oldColor); const oldAlpha = renderer.getClearAlpha();
  views.forEach(v => {
    const halfW = v.front ? 0.5 : 0.27, halfH = 0.42, big = Math.max(halfW, halfH);
    const tex = captureView([v.dir[0] * Rcap, v.dir[1] * Rcap, C[2]], C, halfW, halfH, Math.round(512 * halfW / big), Math.round(512 * halfH / big));
    const pw = 2 * halfW * ds, ph = 2 * halfH * ds;
    const camP = [v.dir[0] * Rc, v.dir[1] * Rc, camZ], pos = [v.dir[0] * Ro, v.dir[1] * Ro, billZ];
    const faceDist = v.front ? 0.2 : 0.45, boxHW = v.front ? 0.46 : 0.21, boxHH = 0.36;
    const faceTarget = [v.dir[0] * faceDist, v.dir[1] * faceDist, camZ];
    scene.add(orthoCamMarker(camP, faceTarget, boxHW, boxHH, 0x3a5cc0));
    scene.add(billboard(tex, pos, pw, ph, [pos[0] + v.dir[0], pos[1] + v.dir[1], pos[2]]));
    scene.add(label(v.deg, '', pos[0], pos[1], pos[2] + ph / 2 + 0.18));
    // Link the capture box's outer face to the view plane corner-to-corner. That face is what the
    // orthographic camera captures, and the plane is that capture — a single centre line read as if
    // the camera sampled one point.
    const { P, at } = viewRect(camP, faceTarget);
    const boxFace = at(P, boxHW, boxHH);
    const planeFace = at(V(pos[0], pos[1], pos[2]), (pw + 0.05) / 2, (ph + 0.05) / 2);   // the billboard's drawn border
    for (let i = 0; i < 4; i++) scene.add(dashLink(boxFace[i], planeFace[i]));
  });
  renderer.setClearColor(oldColor, oldAlpha);
}

// ---------- Method §3.1 Stage C · functional description (sliding door + hinged door) ----------
function buildStageC(scene) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function axisArrow(x0, x1, y, z, color) {
    const g = new THREE.Group(), m = new THREE.LineBasicMaterial({ color });
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x0, y, z), V(x1, y, z)]), m));
    const head = (x, dir) => { const h = new THREE.Group();
      h.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x, y, z), V(x + dir * 0.05, y, z + 0.03)]), m));
      h.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x, y, z), V(x + dir * 0.05, y, z - 0.03)]), m));
      return h; };
    g.add(head(x0, 1)); g.add(head(x1, -1)); return g;
  }
  floorGrid(scene, 10);
  const a = makeAsset(); scene.add(a.group);   // the SAME asset the B figure captures
  const w = a.w, d = a.d, h = a.h, colW = a.colW;
  // slide arrow above the upper row (the sliding door travels along X)
  scene.add(axisArrow(-0.12, w / 2 - 0.02, -d / 2 - 0.04, h + 0.08, 0x9c4646));
  // swing arc of the hinged door (top-down quarter arc about its outer hinge)
  const swingMax = 1.4, hx = -w / 2 + 0.012, hy = -d / 2 + 0.006, R = colW - 0.04, zc = h / 4;
  const arcPts = []; for (let i = 0; i <= 22; i++) { const f = -swingMax * i / 22; arcPts.push(V(hx + R * Math.cos(f), hy + R * Math.sin(f), zc)); }
  const swingArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineDashedMaterial({ color: 0x9c4646, dashSize: 0.03, gapSize: 0.02 })); swingArc.computeLineDistances(); scene.add(swingArc);
  scene.add(label('sliding door', 'f', colW / 2, -d / 2 - 0.05, h + 0.16));
  scene.add(label('slides along X', 'g', w / 2 + 0.24, -d / 2, h - 0.05));
  scene.add(label('hinged door (swings open)', 'm', -0.3, -d / 2 - 0.5, h / 4 - 0.02));
  scene.add(label('keep front clear for access', 'g', 0.12, -d / 2 - 0.56, 0.08));
  scene.userData.tick = (ms) => {
    const t = ms / 1000;
    a.slide.position.x = a.slideClosedX - (colW - 0.08) * (Math.sin(t * 1.1) + 1) / 2;
    a.hinge.rotation.z = -swingMax * (0.5 - 0.5 * Math.cos(t * 0.9));
  };
}

// ---------- Method §3.1 Stage D · human-object interaction (kinematic: hand grips the movable part) ----------
function buildStageD(scene) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cw = 0.4, cd = 0.34, ch = 0.45, gap = 0.006, z0 = 0.45;
  const cols = [-(cw + gap) / 2, (cw + gap) / 2];
  const rows = [z0 + ch / 2, z0 + ch + gap + ch / 2];
  const MOV = 0x7088c4, CUE = 0x3a5cc0, O = [0.4, 0.55, 0];
  const grip = c => [c[0] + O[0], c[1] + O[1] - 0.02, c[2] + O[2]];
  const doorGrip = s => [cols[0] + s - cw / 2 + 0.05, -cd / 2 - 0.022, rows[1]];
  const drawerGrip = dout => [cols[0], -cd / 2 - dout - 0.022, z0 + ch - 0.10];
  const touchPt = () => [cols[0], -cd / 2 - 0.01, rows[1]];
  const panel = (w, h, color) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.016, h), new THREE.MeshStandardMaterial({ color, roughness: .5 }));
  const handleBar = () => new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: COL.metal, roughness: .4, metalness: .3 }));
  function motionArrow(at, dir, color) {
    const g = new THREE.Group();
    const A = V(at[0], at[1], at[2]), d = V(dir[0], dir[1], dir[2]).normalize(), len = 0.14;
    const B = A.clone().add(d.clone().multiplyScalar(len));
    const mat = new THREE.MeshStandardMaterial({ color, roughness: .5 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 8), mat);
    shaft.position.copy(A.clone().add(B).multiplyScalar(0.5)); shaft.quaternion.setFromUnitVectors(V(0, 1, 0), d); g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 14), mat); head.position.copy(B); head.quaternion.setFromUnitVectors(V(0, 1, 0), d); g.add(head);
    return g;
  }
  function makeCabinet(state) {
    const g = new THREE.Group();
    cols.forEach(x => rows.forEach(z => { const c = boxEdges(cw, cd, ch, 0x969ba2, 0.06); c.position.set(x, 0, z); g.add(c); }));
    const s = state.door || 0, dout = state.drawer || 0, dz = z0 + ch - 0.10;
    const door = panel(cw - 0.03, ch - 0.05, MOV); door.position.set(cols[0] + s, -cd / 2, rows[1]); g.add(door);
    const dg = doorGrip(s); const dh = handleBar(); dh.position.set(dg[0], dg[1], dg[2]); g.add(dh);
    const dbody = boxEdges(cw - 0.05, cd - 0.04, ch - 0.08, MOV, 0.05); dbody.position.set(cols[0], -dout, z0 + ch / 2); g.add(dbody);
    const dfront = panel(cw - 0.04, ch - 0.10, MOV); dfront.position.set(cols[0], -cd / 2 - dout, z0 + ch / 2); g.add(dfront);
    const rg = drawerGrip(dout); const drh = handleBar(); drh.rotation.y = Math.PI / 2; drh.position.set(rg[0], rg[1], rg[2]); g.add(drh);
    if (state.touch) { const tp = touchPt(); const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.072, 28), new THREE.MeshBasicMaterial({ color: CUE, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.set(tp[0], -cd / 2 - 0.02, tp[2]); g.add(ring); }
    if (state.cue === 'open')  g.add(motionArrow([cols[0] + s + 0.04, -cd / 2 - 0.05, rows[1] + 0.30], [1, 0, 0], CUE));
    if (state.cue === 'close') g.add(motionArrow([cols[0] + s + 0.04, -cd / 2 - 0.05, rows[1] + 0.30], [-1, 0, 0], CUE));
    if (state.cue === 'pull')  g.add(motionArrow([cols[0] + 0.22, -cd / 2 - dout, dz], [0, -1, 0], CUE));
    if (state.cue === 'push')  g.add(motionArrow([cols[0] + 0.22, -cd / 2 - dout - 0.14, dz], [0, 1, 0], CUE));
    return g;
  }
  floorGrid(scene, 14);
  const dx = 1.4;
  const items = [
    ['open', { door: 0.24, cue: 'open' }, { handR: grip(doorGrip(0.24)) }],
    ['close', { door: 0.05, cue: 'close' }, { handR: grip(doorGrip(0.05)), lean: 0.05 }],
    ['pull', { drawer: 0.22, cue: 'pull' }, { pelvis: [0, -0.05, 0.84], lean: 0.12, handR: grip(drawerGrip(0.22)), footL: [-0.1, 0.06, 0.06], footR: [0.12, -0.06, 0.06] }],
    ['push', { drawer: 0.04, cue: 'push' }, { pelvis: [0, 0.04, 0.84], lean: 0.22, handR: grip(drawerGrip(0.04)), elbowPole: [0.2, 0.1, -1] }],
    ['touch', { touch: true }, { handR: grip(touchPt()) }],
  ];
  items.forEach((it, i) => {
    const en = it[0], state = it[1], pose = it[2], x = i * dx;
    const cab = makeCabinet(state); cab.position.set(x, 0.55, 0); scene.add(cab);
    const man = makeMannequin(solveFigure(pose)); man.position.set(x - 0.4, 0, 0); scene.add(man);
    scene.add(label(en, '', x - 0.1, 0.3, 1.82));
  });
}

// ---------- Method §3.1 Stage E · semantic grouping (intra- and inter-group relations) ----------
function buildStageE(scene) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const sphere = (p, r, color) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), new THREE.MeshStandardMaterial({ color, roughness: .4 })); m.position.set(p[0], p[1], p[2]); return m; };
  const solidEdge = (a, b, color, op) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(a[0], a[1], a[2]), V(b[0], b[1], b[2])]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
  function dashEdge(a, b, color) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(a[0], a[1], a[2]), V(b[0], b[1], b[2])]), new THREE.LineDashedMaterial({ color, dashSize: 0.09, gapSize: 0.06 })); l.computeLineDistances(); return l; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  function makeSofa() {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: .75 });
    const add = (w, d, h, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); m.position.set(x, y, z); g.add(m); };
    add(0.92, 0.52, 0.22, 0, 0, 0.14); add(0.86, 0.48, 0.12, 0, 0.02, 0.31); add(0.92, 0.14, 0.36, 0, -0.19, 0.42);
    add(0.1, 0.52, 0.34, -0.41, 0, 0.36); add(0.1, 0.52, 0.34, 0.41, 0, 0.36);
    return g;
  }
  floorGrid(scene, 14);
  const groups = [
    { name: 'individual work area', cls: 'fb', color: 0x3a5cc0, make() {
        const desk = makeDesk(1.05, 0.58, 0.74); desk.position.set(-2.0, 0.2, 0);
        const cA = makeChair(); cA.position.set(-2.35, -0.4, 0);
        const cB = makeChair(); cB.position.set(-1.65, -0.4, 0);
        return { objs: [desk, cA, cB], nodes: [[-2.0, 0.2, 0.8], [-2.35, -0.4, 1.0], [-1.65, -0.4, 1.0]], intra: [[1, 0], [2, 0]] };
      } },
    { name: 'lounge area', cls: 'fa', color: 0xa8752a, make() {
        const t = makeDesk(0.7, 0.5, 0.36); t.position.set(0, 2.3, 0);
        const s1 = makeSofa(); s1.position.set(0, 2.9, 0); s1.rotation.z = Math.PI;
        const s2 = makeSofa(); s2.position.set(0, 1.7, 0);
        return { objs: [t, s1, s2], nodes: [[0, 2.3, 0.5], [0, 2.9, 0.72], [0, 1.7, 0.72]], intra: [[1, 0], [2, 0]] };
      } },
    { name: 'storage area', cls: 'gr', color: 0x2fa35a, make() {
        const cs = []; [1.55, 2.05, 2.55].forEach(x => { const c = makeStorageCabinet(0.5, 0.4, 0.95); c.position.set(x, -0.15, 0); cs.push(c); });
        return { objs: cs, nodes: [[1.55, -0.15, 1.0], [2.05, -0.15, 1.0], [2.55, -0.15, 1.0]], intra: [[0, 1], [1, 2]] };
      } },
  ];
  const gnodes = [];
  groups.forEach(gr => {
    const r = gr.make(), objs = r.objs, nodes = r.nodes, intra = r.intra;
    const holder = new THREE.Group(); objs.forEach(o => holder.add(o)); scene.add(holder);
    const hull = bboxOf(holder, gr.color, 0.07); scene.add(hull);
    const c = hull.userData.center, s = hull.userData.size, gp = [c.x, c.y, c.z + s.z / 2 + 0.42];
    scene.add(sphere(gp, 0.06, gr.color));
    nodes.forEach(n => scene.add(sphere(n, 0.03, gr.color)));
    intra.forEach(ij => scene.add(solidEdge(nodes[ij[0]], nodes[ij[1]], gr.color, 0.8)));
    scene.add(label(gr.name, gr.cls, gp[0], gp[1], gp[2] + 0.14));
    gnodes.push(gp);
  });
  [[0, 1], [0, 2], [1, 2]].forEach(ij => scene.add(dashEdge(gnodes[ij[0]], gnodes[ij[1]], 0xd6336c)));
  scene.add(label('intra-group', 'g', -2.0, -0.15, 1.12));
  const mm = mid(gnodes[0], gnodes[2]);
  scene.add(label('inter-group', 'm', mm[0], mm[1], mm[2] + 0.04));
}

const elConflict = document.getElementById('s-conflict');
if (elConflict) makeScene(elConflict, buildConflict);
const elDims = document.getElementById('s-dims');
if (elDims) makeScene(elDims, buildDims);
const elB = document.getElementById('s-preproc'); if (elB) makeScene(elB, buildStageB);
const elC = document.getElementById('s-funcdesc'); if (elC) makeScene(elC, buildStageC);
const elD = document.getElementById('s-interaction'); if (elD) makeScene(elD, buildStageD);
const elE = document.getElementById('s-grouping'); if (elE) makeScene(elE, buildStageE);
