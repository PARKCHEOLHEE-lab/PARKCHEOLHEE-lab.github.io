// Shared look for every figure in the coarse-to-fine post: one camera angle, one
// palette, one dot style. Import this instead of repeating the setup per figure.
import * as THREE from "./three.module.js";

export const W = 600, H = 620;
export const BLUE = 0x3b82f6, RED = 0xd6455b, MESH = 0x343a40;
export const PINK = 0xf1a7b0, LINE = 0xadb5bd, FAINT = 0xd6dbe0;
export const BLUE_TXT = "#2f6fd0", RED_TXT = "#c23a4e";
export { THREE };

export function makeRenderer(canvas, panels) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(W * panels, H, false);
  r.setClearColor(0xffffff, 1);
  return r;
}

/** orthographic, fitted to a box of half-size `half`; same angle in every figure */
export function makeCamera(half, margin = 1.1) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.set(4.3, 2.5, 3.1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const toView = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  let mx = 0, my = 0;
  for (const x of [-half, half]) for (const y of [-half, half]) for (const z of [-half, half]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(toView);
    mx = Math.max(mx, Math.abs(v.x));
    my = Math.max(my, Math.abs(v.y));
  }
  const aspect = W / H;
  const halfH = Math.max(my, mx / aspect) * margin;
  cam.left = -halfH * aspect; cam.right = halfH * aspect;
  cam.top = halfH; cam.bottom = -halfH;
  cam.updateProjectionMatrix();
  return cam;
}

export function lit(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8ced4, 2.0));
  const k = new THREE.DirectionalLight(0xffffff, 1.7); k.position.set(3, 5, 4);
  const f = new THREE.DirectionalLight(0xffffff, 0.9); f.position.set(-3, 2, -3);
  scene.add(k); scene.add(f);
  return scene;
}

export function boxEdges(scene, centre, size, color = LINE, opacity = 0.6) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color, transparent: opacity < 1, opacity }));
  l.position.set(centre[0], centre[1], centre[2]);
  scene.add(l);
}

/** many equal cubes at once */
export function cubes(scene, flat, size, color, opacity = 1, shrink = 0.9) {
  const n = flat.length / 3;
  if (!n) return;
  const m = new THREE.InstancedMesh(
    new THREE.BoxGeometry(size * shrink, size * shrink, size * shrink),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity,
                                    depthWrite: opacity >= 1 }), n);
  const t = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    t.makeTranslation(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
    m.setMatrixAt(i, t);
  }
  m.instanceMatrix.needsUpdate = true;
  scene.add(m);
}

/** the wireframe of many equal cubes, as one geometry */
export function cubeEdges(scene, flat, size, color = FAINT, opacity = 0.45) {
  const n = flat.length / 3;
  if (!n) return;
  const s = size / 2;
  const c = [[-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]];
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const pos = new Float32Array(n * E.length * 6);
  let o = 0;
  for (let i = 0; i < flat.length; i += 3) {
    for (const [a, b] of E) {
      pos[o++] = flat[i] + c[a][0]; pos[o++] = flat[i+1] + c[a][1]; pos[o++] = flat[i+2] + c[a][2];
      pos[o++] = flat[i] + c[b][0]; pos[o++] = flat[i+1] + c[b][1]; pos[o++] = flat[i+2] + c[b][2];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color, transparent: opacity < 1, opacity })));
}

export function ball(scene, p, color, r, opacity = 1, onTop = false) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity,
                                    depthTest: !onTop }));
  if (onTop) m.renderOrder = 10;
  m.position.copy(p);
  scene.add(m);
}

/** sample points as small balls: blue outside, red inside */
export function samples(scene, flatPoints, values, r, blueOpacity = 0.55) {
  const geo = new THREE.SphereGeometry(r, 18, 12);
  for (const [wantInside, color, opacity] of [[false, BLUE, blueOpacity], [true, RED, 1.0]]) {
    const idx = [];
    for (let i = 0; i < values.length; i++) {
      if ((values[i] < 0) === wantInside) idx.push(i);
    }
    if (!idx.length) continue;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color, transparent: opacity < 1, opacity }), idx.length);
    const t = new THREE.Matrix4();
    idx.forEach((i, n) => {
      t.makeTranslation(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]);
      m.setMatrixAt(n, t);
    });
    m.instanceMatrix.needsUpdate = true;
    scene.add(m);
  }
}

export function tube(scene, p0, p1, radius, color, opacity = 1) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 14),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }));
  m.position.copy(p0).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(m);
}

export function surface(scene, data, opacity = 1, color = MESH, edges = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(data.vertices, 3));
  g.setIndex(data.faces);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    color, side: THREE.DoubleSide, flatShading: true,
    transparent: opacity < 1, opacity, depthWrite: opacity > 0.7 })));
  if (edges) {
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 1),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })));
  }
}

/** dark near zero, blue outside, red inside -- the colour used for value clouds */
export function valueColor(d, span = 0.42) {
  return new THREE.Color(MESH).lerp(new THREE.Color(d < 0 ? RED : BLUE),
                                    Math.min(Math.abs(d) / span, 1));
}

export function panelTitles(list) {
  document.getElementById("labels").innerHTML =
    list.map((t) => `<div class="label" style="width:${W}px">${t}</div>`).join("");
}

/** put a text label over the canvas at a projected world point */
export function label(panel, world, cam, html, cls = "", dx = 0, dy = 0) {
  const v = world.clone().project(cam);
  const el = document.createElement("div");
  el.className = `value ${cls}`;
  el.innerHTML = html;
  el.style.left = `${panel * W + (v.x * 0.5 + 0.5) * W + dx}px`;
  el.style.top = `${(1 - (v.y * 0.5 + 0.5)) * H + dy}px`;
  document.getElementById("stage").appendChild(el);
}

export function setupPage(panels) {
  document.getElementById("s").textContent = STYLE;
  for (const id of ["wrap", "stage", "labels"]) {
    document.getElementById(id).style.width = `${W * panels}px`;
  }
  const canvas = document.getElementById("c");
  canvas.width = W * panels; canvas.height = H;
  return makeRenderer(canvas, panels);
}

export function renderPanels(renderer, scenes, cams) {
  renderer.setScissorTest(true);
  scenes.forEach((s, i) => {
    renderer.setViewport(i * W, 0, W, H);
    renderer.setScissor(i * W, 0, W, H);
    renderer.render(s, cams[i]);
  });
  window.__rendered = true;
}

export const STYLE = `
  html, body { margin: 0; padding: 0; background: #fff; }
  #wrap { background: #fff; padding: 0 0 10px 0; }
  #stage { position: relative; }
  canvas { display: block; }
  .value { position: absolute; transform: translate(-50%, -50%); pointer-events: none;
           font-family: "Helvetica Neue", Arial, sans-serif; font-size: 22px;
           text-shadow: 0 0 5px #fff, 0 0 5px #fff, 0 0 5px #fff, 0 0 5px #fff; }
  .value.big { font-size: 26px; }
  .value.note { font-size: 21px; color: #868e96; }
  #labels { display: flex; }
  .label { text-align: center; font-family: "Helvetica Neue", Arial, sans-serif;
           font-size: 30px; color: #212529; padding-top: 2px; }
`;
