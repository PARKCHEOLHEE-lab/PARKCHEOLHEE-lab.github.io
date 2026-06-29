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
function floorGrid(scene, size) { const g = new THREE.GridHelper(size, size * 4, 0xd7d7d9, 0xededee); g.rotation.x = Math.PI / 2; scene.add(g); return g; }
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

// ---------- scene scaffold ----------
function makeScene(container, build) {
  const W = container.clientWidth, H = container.clientHeight;
  const scene = new THREE.Scene();
  const cp = (container.dataset.cam || '2.5,-2.6,1.9').split(',').map(Number);
  const tg = (container.dataset.target || '0,0,0.6').split(',').map(Number);
  // orthographic, framed to match the old 42° perspective: half-height = dist(cam,target)·tan(fov/2)
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
  build(scene, THREE);
  if (window.ResizeObserver) new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; cam.left = -halfH*w/h; cam.right = halfH*w/h; cam.top = halfH; cam.bottom = -halfH; cam.updateProjectionMatrix(); renderer.setSize(w, h); lr.setSize(w, h); }).observe(container);
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

const elConflict = document.getElementById('s-conflict');
if (elConflict) makeScene(elConflict, buildConflict);
const elDims = document.getElementById('s-dims');
if (elDims) makeScene(elDims, buildDims);
