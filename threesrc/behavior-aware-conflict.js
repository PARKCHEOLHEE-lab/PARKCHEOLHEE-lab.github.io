// behavior-aware-conflict.js
// Interactive "conflict zone" figure for the Behavior-Aware Anthropometric Scene
// Generation paper-review note. Follows the repo's threebed convention:
// ES module + importmap ("three") + unpkg CDN for examples/jsm.
// Geometry logic is reused from the paper-viz prototype; labels are English-only
// (the blog has no language toggle).
// lazy: helpers (makeScene/mannequin/furniture) live in this one figure module.
// When a 2nd figure is added to this post, extract them into a shared
// threesrc/anthropometric-viz.js and import it, instead of copying again.
import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.151.3/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "https://unpkg.com/three@0.151.3/examples/jsm/renderers/CSS2DRenderer.js";

const COL = { featured: 0x0011e3, mag: 0xd6336c, gray: 0x9aa0a6, wood: 0xc9a274, metal: 0x4a4e56, skin: 0xca924f };

const MAT = {
  wood:  () => new THREE.MeshStandardMaterial({ color: COL.wood,  roughness: .62 }),
  metal: () => new THREE.MeshStandardMaterial({ color: COL.metal, roughness: .5, metalness: .25 }),
  seat:  () => new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: .6 }),
  skin:  () => new THREE.MeshStandardMaterial({ color: COL.skin, roughness: .6 }),
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
  if (pose === 'sit') return {
    head: [0, -0.02, 1.16], neck: [0, -0.02, 1.02], chest: [0, -0.02, 0.92], pelvis: [0, 0, 0.5],
    shL: [-0.18, -0.02, 0.9], shR: [0.18, -0.02, 0.9], elL: [-0.2, 0.08, 0.68], elR: [0.2, 0.08, 0.68], wrL: [-0.16, 0.32, 0.56], wrR: [0.16, 0.32, 0.56],
    hipL: [-0.1, 0.02, 0.48], hipR: [0.1, 0.02, 0.48], knL: [-0.1, 0.4, 0.46], knR: [0.1, 0.4, 0.46], anL: [-0.1, 0.42, 0.06], anR: [0.1, 0.42, 0.06],
  };
  return stand;
}
function makeMannequin(pose) {
  pose = pose || 'stand';
  const g = new THREE.Group(), mat = MAT.skin(), J = poseJoints(pose);
  const V = p => new THREE.Vector3(p[0], p[1], p[2]);
  const Y = new THREE.Vector3(0, 1, 0);
  const limb = (a, b, r) => {
    const A = V(a), B = V(b), dir = new THREE.Vector3().subVectors(B, A), len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.001, len), 12), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, dir.normalize()); g.add(m);
  };
  const ball = (p, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), mat); m.position.copy(V(p)); g.add(m); };
  limb(J.pelvis, J.chest, 0.115); limb(J.chest, J.neck, 0.06);
  ball(J.head, 0.115); ball(J.pelvis, 0.115); ball(J.chest, 0.1);
  limb(J.chest, J.shL, 0.05); limb(J.chest, J.shR, 0.05); ball(J.shL, 0.055); ball(J.shR, 0.055);
  limb(J.shL, J.elL, 0.05); limb(J.elL, J.wrL, 0.042); limb(J.shR, J.elR, 0.05); limb(J.elR, J.wrR, 0.042);
  ball(J.elL, 0.045); ball(J.elR, 0.045); ball(J.wrL, 0.04); ball(J.wrR, 0.04);
  ball(J.hipL, 0.07); ball(J.hipR, 0.07); limb(J.hipL, J.hipR, 0.055);
  limb(J.hipL, J.knL, 0.07); limb(J.knL, J.anL, 0.055); limb(J.hipR, J.knR, 0.07); limb(J.knR, J.anR, 0.055);
  ball(J.knL, 0.06); ball(J.knR, 0.06);
  [J.anL, J.anR].forEach(a => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.06), mat); f.position.set(a[0], a[1] + 0.06, 0.04); g.add(f); });
  return g;
}

// ---------- scene scaffold ----------
function makeScene(container, build) {
  const W = container.clientWidth, H = container.clientHeight;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.05, 100); cam.up.set(0, 0, 1);
  const cp = (container.dataset.cam || '2.5,-2.6,1.9').split(',').map(Number);
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
  ctr.enableDamping = true; ctr.dampingFactor = .08; ctr.autoRotate = true; ctr.autoRotateSpeed = 0.55; ctr.enablePan = false;
  ctr.minDistance = 1.2; ctr.maxDistance = 14;
  const tg = (container.dataset.target || '0,0,0.6').split(',').map(Number); ctr.target.set(tg[0], tg[1], tg[2]);
  build(scene, THREE);
  if (window.ResizeObserver) new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h); lr.setSize(w, h); }).observe(container);
  (function loop() { requestAnimationFrame(loop); ctr.update(); renderer.render(scene, cam); lr.render(scene, cam); })();
  return { scene, cam, controls: ctr };
}

// ---------- the figure: a plausible-but-unusable desk/chair conflict ----------
function buildConflict(scene) {
  floorGrid(scene, 5);
  const desk = makeDesk(1.2, 0.6, 0.74); desk.position.set(0, -0.18, 0); scene.add(desk);
  const chair = makeChair(0.46); chair.position.set(0, 0.42, 0); chair.rotation.z = Math.PI; scene.add(chair);
  const sit = makeMannequin('sit'); sit.position.set(0, 0.44, 0); sit.rotation.z = Math.PI; scene.add(sit);
  // clearance volume to push the chair back and stand (behind the seat, +Y)
  const clr = boxEdges(0.74, 0.66, 1.34, COL.featured, 0.10); clr.position.set(0, 0.96, 0.62); scene.add(clr);
  scene.add(label('clearance to stand', 'f', -0.68, 0.96, 1.42));
  // intruding wall / next desk (+Y)
  const wall = boxEdges(2.2, 0.16, 1.5, COL.gray, 0.22); wall.position.set(0, 1.2, 0.75); scene.add(wall);
  // conflict overlap (magenta): clearance that the wall steals
  const cf = boxEdges(0.76, 0.22, 1.34, COL.mag, 0.34); cf.position.set(0, 1.18, 0.62); scene.add(cf);
  scene.add(label('conflict', 'm', 0, 1.18, 0.16));
}

const el = document.getElementById('s-conflict');
if (el) makeScene(el, buildConflict);
