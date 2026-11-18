// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

test('linked views share their ground, glyphs and true radius heights', async ({ page }) => {
  // Unit checks use the real inline function, without starting any demo.
  const source = fs.readFileSync(path.join(__dirname, '../../_posts/2026-08-23-cma-es.html'), 'utf8');
  const radii = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const script = [...doc.scripts].find((s) => !s.type).textContent;
    const init = 'ready(function () { stepDemo(); runDemo(); raceDemo(); });';
    if (script.split(init).length !== 2) throw new Error('Expected one demo initialization');
    (0, eval)(script.replace(init, 'window.radiusForTest = circleRadius;'));
    return [[0, 0], [3, 1.1], [-2, 4]].map((centre) => window.radiusForTest(centre));
  }, source);
  expect(radii[0]).toBeCloseTo(Math.hypot(6, 2.2), 10);
  expect(radii[1]).toBeCloseTo(Math.hypot(3, 1.1), 10);
  expect(radii[2]).toBeCloseTo(Math.hypot(8, -1.8), 10);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    // Observe actual Canvas calls, rather than a second copy of the renderer.
    window.circleDrawing = { circles: [], radii: [], dots: [], crosses: [], ellipses: 0, backgrounds: 0, labels: [] };
    window.circleScanEvents = 0;
    // Isolate the bulk 2D geometry checks from redundant GPU draws. Normal
    // interactions before and after the scan use the real 3D consumer.
    document.addEventListener('cma-frame', (event) => {
      if (window.circleGeometryScan && event.target.id === 'cma-step') {
        window.circleScanEvents++;
        event.stopImmediatePropagation();
      }
    }, true);
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ['clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo', 'fill', 'stroke', 'ellipse', 'drawImage', 'fillText']) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (method === 'clearRect') this.canvas.drawnTexts = [];
        if (method === 'fillText') (this.canvas.drawnTexts ||= []).push(String(args[0]));
        if (this.canvas.matches('#cma-step .cma-top')) {
          const drawing = window.circleDrawing;
          if (method === 'clearRect') {
            drawing.circles = []; drawing.radii = []; drawing.dots = []; drawing.crosses = []; drawing.ellipses = 0; drawing.backgrounds = 0; drawing.labels = [];
          }
          if (method === 'beginPath') { this.observedArc = null; this.observedLines = []; this.observedPosition = null; }
          if (method === 'arc') this.observedArc = { x: args[0], y: args[1], r: args[2] };
          if (method === 'moveTo') this.observedPosition = [args[0], args[1]];
          if (method === 'lineTo' && this.observedPosition) {
            const next = [args[0], args[1]];
            this.observedLines.push([this.observedPosition, next]); this.observedPosition = next;
          }
          if (method === 'stroke' && this.observedArc) {
            this.observedArc.stroke = this.strokeStyle;
            this.observedArc.dash = this.getLineDash();
            if (this.observedArc.r > 12) drawing.circles.push(this.observedArc);
          }
          if (method === 'fill' && this.observedArc && this.observedArc.r <= 12) {
            this.observedArc.fill = this.fillStyle;
            this.observedArc.alpha = this.globalAlpha;
            drawing.dots.push(this.observedArc);
          }
          if (method === 'stroke' && !this.observedArc && this.observedLines.length === 2) {
            const [a, b] = this.observedLines[0];
            drawing.crosses.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, dash: this.getLineDash() });
          }
          if (method === 'stroke' && !this.observedArc && this.observedLines.length === 1) {
            const [from, to] = this.observedLines[0];
            drawing.radii.push({ from, to, stroke: this.strokeStyle, dash: this.getLineDash() });
          }
          if (method === 'ellipse') drawing.ellipses++;
          if (method === 'drawImage') drawing.backgrounds++;
          if (method === 'fillText') drawing.labels.push(args[0]);
        }
        return original.apply(this, args);
      };
    }
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/cma-es/?scene-debug');
  const root = page.locator('#cma-step');
  const slider = root.locator('.scrub');
  const button = root.locator('.play');
  await expect(root.locator('.cma-3d canvas')).toHaveCount(1);
  await expect(root.locator('.cma-gauge')).toHaveCount(0);
  await expect(root.locator('figcaption')).not.toContainText('small box');
  // Before this change the circle canvas was 245px wide at this viewport.
  await expect.poll(() => root.locator('.cma-top').evaluate((canvas) => canvas.clientWidth), {
    message: 'the fixed circle drawing has at least 25% more width at 1280px',
  }).toBeGreaterThanOrEqual(245 * 1.25);
  const panels = root.locator('.panels > .panel');
  const left = await panels.nth(0).boundingBox();
  const right = await panels.nth(1).boundingBox();
  expect(Math.abs(left.y - right.y), 'desktop panels share one row').toBeLessThan(1);
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  const maximum = Number(await slider.getAttribute('max'));
  expect(maximum).toBeGreaterThan(6);
  const samplesPerPhase = 2;
  const frames = await root.evaluate((el, { maximum, samplesPerPhase }) => {
    const slider = el.querySelector('.scrub');
    const frames = [];
    let liveEvents = 0;
    el.addEventListener('cma-frame', () => liveEvents++);
    // Start and midpoint of every phase, generation boundaries, and the final frame.
    // Candidate circles stay fixed within a generation; the mean moves separately.
    window.circleGeometryScan = true;
    try {
      for (let tick = 0; tick <= maximum * samplesPerPhase; tick++) {
        slider.value = String(tick / samplesPerPhase);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        frames.push(JSON.parse(JSON.stringify({ drawing: window.circleDrawing, population: el.cmaFrame.X, styles: el.cmaFrame.styles, mean: el.cmaFrame.m, readout: el.querySelector('.read').textContent, phase: el.querySelector('.phase').textContent })));
      }
    } finally {
      window.circleGeometryScan = false;
    }
    slider.value = slider.max;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const canvas = el.querySelector('.cma-top');
    return { frames, events: window.circleScanEvents, liveEvents, finalFrame: el.cmaFrame, width: canvas.clientWidth, height: canvas.clientHeight };
  }, { maximum, samplesPerPhase });
  expect(frames.events).toBe(frames.frames.length);
  expect(frames.liveEvents).toBe(1);
  let fixedPoints;
  let meanDiffersFromBest = false;
  const targets = [[0, 0], [2, 0.6], [4, 1.5], [6, 2.2], [1.2, 1.4], [5, 0.9]];
  for (const [index, frame] of frames.frames.entries()) {
    const drawing = frame.drawing;
    assert(!frame.phase.includes('small box'), 'phase text does not refer to the removed box');
    const generation = Math.min(Math.floor(index / (6 * samplesPerPhase)), maximum / 6 - 1);
    const phase = Math.min(5, Math.floor(index / samplesPerPhase - generation * 6));
    assert.equal(frame.population.length, 6, `frame ${index}: all six current candidates arrive together`);
    assert.equal(frame.styles.length, 6);
    assert(frame.styles.every((style) => style.alpha > 0), `frame ${index}: no candidate is hidden`);
    assert.equal(drawing.dots.length, 12, `frame ${index}: six fixed points and six candidate centres`);
    assert.equal(drawing.ellipses, 0);
    assert.equal(drawing.backgrounds, 0);
    assert.deepEqual([...drawing.labels].sort(), phase === 0 ? [] : ['1', '6'], 'shared rank labels identify the same two candidates');
    const points = drawing.dots.slice(0, 6), drawnCandidates = drawing.dots.slice(6);
    if (!fixedPoints) fixedPoints = points;
    assert.deepEqual(points, fixedPoints);
    const scale = (points[3].x - points[0].x) / 6;
    const project = (p) => [points[0].x + p[0] * scale, points[0].y - p[1] * scale];
    const candidates = frame.population.map((p) => {
      const q = project(p);
      const mark = drawnCandidates.find((c) => Math.hypot(c.x - q[0], c.y - q[1]) < 1e-7);
      assert(mark, 'each candidate keeps its true position');
      return mark;
    });
    for (let k = 0; k < 6; k++) {
      const expected = project(frame.population[k]);
      assert(Math.hypot(candidates[k].x - expected[0], candidates[k].y - expected[1]) < 1e-7, 'candidate centres keep their true positions');
      assert(candidates[k].alpha > 0);
      assert.deepEqual(candidates[k].dash, [], 'candidate outlines stay solid');
    }
    assert.equal(drawing.crosses.length, 1, 'the mean has its own cross');
    assert.deepEqual(drawing.crosses[0].dash, [], 'radius dashes must not leak into the mean cross');
    const expectedMean = project(frame.mean), cross = drawing.crosses[0];
    assert(Math.hypot(cross.x - expectedMean[0], cross.y - expectedMean[1]) < 1e-7, 'the cross follows the real mean');
    const scores = frame.population.map((c) => Math.max(...targets.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
    const order = scores.map((_, k) => k).sort((a, b) => scores[a] - scores[b]);
    const filled = candidates.filter((c) => c.fill !== '#ffffff');
    assert.equal(filled.length, phase === 0 ? 0 : phase === 1 ? 1 : 3);
    if (phase === 0) {
      assert.equal(drawing.circles.length, 0, 'Sample must not reveal a best circle before ranking');
      assert.equal(drawing.radii.length, 0, 'Sample must not reveal ranked radius lines');
      assert.equal(new Set(frame.styles.map((s) => JSON.stringify([s.col, s.rad, s.alpha]))).size, 1, 'Sample does not disclose ranking');
      continue;
    }
    assert.equal(drawing.circles.length, 2, `frame ${index}: compare the best and worst circles`);
    assert.equal(drawing.radii.length, 2, 'each comparison circle has one radius segment');
    const best = candidates[order[0]];
    const circle = drawing.circles.find((c) => c.stroke === best.fill);
    assert(circle, 'the best marker and circle share their emphasis');
    const worst = drawing.circles.find((c) => c !== circle);
    const gray = [1, 3, 5].map((i) => parseInt(worst.stroke.slice(i, i + 2), 16));
    assert(Math.max(...gray) - Math.min(...gray) <= 16 && Math.min(...gray) >= 32 && Math.max(...gray) <= 224, 'the worst circle is gray');
    for (const [shape, candidateIndex] of [[circle, order[0]], [worst, order[5]]]) {
      const centre = candidates[candidateIndex];
      assert.deepEqual([shape.x, shape.y], [centre.x, centre.y], 'comparison circle belongs to the independently ranked candidate');
      assert(Math.abs(shape.r - scores[candidateIndex] * scale) < 1e-7, 'exact enclosing radius');
      assert.deepEqual(shape.dash, [], 'circle outlines stay solid');
      const radius = drawing.radii.find((r) => r.stroke === shape.stroke);
      assert(radius && radius.dash.length > 0 && radius.dash.every((v) => v > 0), 'the radius is dashed');
      assert(Math.hypot(radius.from[0] - shape.x, radius.from[1] - shape.y) < 1e-7, 'radius starts at the centre');
      assert(points.some((p) => Math.hypot(radius.to[0] - p.x, radius.to[1] - p.y) < 1e-7), 'radius ends at a fixed target');
      assert(Math.abs(Math.hypot(radius.to[0] - radius.from[0], radius.to[1] - radius.from[1]) - shape.r) < 1e-7, 'radius ends at a farthest target, with true radius length');
      assert(shape.x - shape.r >= 0 && shape.x + shape.r <= frames.width &&
        shape.y - shape.r >= 0 && shape.y + shape.r <= frames.height, 'both whole circles stay visible');
    }
    assert(frame.readout.includes(scores[order[0]].toFixed(2)) && frame.readout.includes(scores[order[5]].toFixed(2)), 'both displayed radius values match the circles');
    assert.equal(best.fill, circle.stroke, 'the best marker and circle share their emphasis');
    assert(candidates.every((c, k) => k === order[0] || c.fill !== best.fill), 'only the best has that filled colour');
    assert.equal(frame.styles[order[0]].col, circle.stroke, 'the 3D view highlights the same best candidate');
    if (phase >= 4) {
      const weights = [0, 1, 2].map((i) => Math.log(3.5 / (i + 1)));
      const total = weights.reduce((a, b) => a + b);
      const weighted = [0, 1].map((axis) => weights.reduce((sum, w, i) => sum + w * frame.population[order[i]][axis], 0) / total);
      assert(Math.hypot(frame.mean[0] - weighted[0], frame.mean[1] - weighted[1]) < 1e-10, 'the mean uses the best three, rather than just rank one');
      if (Math.hypot(frame.mean[0] - frame.population[order[0]][0], frame.mean[1] - frame.population[order[0]][1]) > 1e-4) meanDiffersFromBest = true;
    }
  }
  for (let i = 0; i < fixedPoints.length; i++) {
    for (let j = i + 1; j < fixedPoints.length; j++) {
      const a = fixedPoints[i], b = fixedPoints[j];
      assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, 'the six fixed points stay distinct');
    }
  }
  expect(meanDiffersFromBest).toBe(true);
  expect(frames.frames.slice(0, samplesPerPhase).map((f) => f.population)).toEqual(Array(samplesPerPhase).fill(frames.frames[0].population));
  expect(frames.finalFrame.X).toHaveLength(6);
  await expect(root.locator('.gen')).toHaveText(/step 6 of 6/);

  // These live checks use actual scene objects; the bulk 2D scan above cannot
  // establish the 3D texture, coordinate mapping, glyphs or segment heights.
  let lastTextureVersion = -1, lastRenderFrame = -1;
  for (const time of [0, 1.5, 2.5, 3.5, 4.5, 5.5, 7.5, maximum]) {
    await slider.evaluate((input, time) => { input.value = String(time); input.dispatchEvent(new Event('input', { bubbles: true })); }, time);
    const state = await root.evaluate((el) => {
      const s = el.cma3d.inspect, canvas = el.querySelector('.cma-top');
      if (!s) return null;
      s.scene.updateMatrixWorld(true);
      let ground;
      s.scene.traverse((o) => { if (o.isMesh && o.material.map?.image === canvas) ground = o; });
      if (!ground) return { shared: false };
      const positions = ground.geometry.getAttribute('position'), uv = ground.geometry.getAttribute('uv');
      const world = (o, a, i) => o.localToWorld(o.position.clone().set(a.getX(i), a.getY(i), a.getZ(i))).toArray();
      const corners = Array.from({ length: positions.count }, (_, i) => ({ uv: [uv.getX(i), uv.getY(i)], position: world(ground, positions, i) }));
      const markers = s.markers.map((o) => {
        const image = o.material.map.image, g = image.getContext('2d'), cx = image.width / 2;
        const rgba = Array.from(g.getImageData(cx, cx, 1, 1).data);
        const row = g.getImageData(cx, cx, cx, 1).data;
        let radius = 0;
        for (let i = 0; i < cx; i++) if (row[i * 4 + 3] > 20) radius = i;
        return { position: o.getWorldPosition(o.position.clone()).toArray(), opacity: o.material.opacity, tint: o.material.color.getHexString(), rgba, texts: image.drawnTexts || [], radiusPx: radius / image.width * o.scale.x / (s.camera.right - s.camera.left) * s.renderer.domElement.clientWidth };
      });
      const lifts = Object.entries(s.lifts).filter(([, o]) => o.visible).map(([rank, o]) => {
        const p = o.geometry.getAttribute('position'), d = o.geometry.getAttribute('lineDistance');
        return { rank, positions: [world(o, p, 0), world(o, p, 1)], dashed: o.material.isLineDashedMaterial, distances: d ? Array.from(d.array).slice(0, 2) : [] };
      });
      const wire = s.scene.getObjectByName('cost-grid'), p = wire.geometry.getAttribute('position');
      const wirePoints = Array.from({ length: 12 }, (_, i) => world(wire, p, Math.floor(i * (p.count - 1) / 11)));
      let lights = 0, otherMeshes = 0;
      s.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh && o !== ground) otherMeshes++; });
      return { shared: true, corners, flipY: ground.material.map.flipY, textureVersion: ground.material.map.version, renderFrame: s.renderer.info.render.frame, markers, lifts, wirePoints, lights, otherMeshes, orthographic: s.camera.isOrthographicCamera, zoom: s.controls.enableZoom, pan: s.controls.enablePan, drawing: window.circleDrawing, frame: el.cmaFrame, width: canvas.clientWidth, height: canvas.clientHeight };
    });
    expect(state?.shared, 'the actual 3D ground material shares the 2D canvas').toBe(true);
    expect(state.orthographic).toBe(true);
    expect(state.lights).toBe(0);
    expect(state.otherMeshes).toBe(0);
    expect(state.zoom).toBe(false);
    expect(state.pan).toBe(false);
    expect(state.textureVersion).toBeGreaterThan(lastTextureVersion);
    expect(state.renderFrame).toBeGreaterThan(lastRenderFrame);
    lastTextureVersion = state.textureVersion; lastRenderFrame = state.renderFrame;
    const corner = (u, v) => state.corners.find((c) => c.uv[0] === u && c.uv[1] === v).position;
    const a = corner(0, 0), b = corner(1, 0), c = corner(0, 1);
    const onGround = (mark) => {
      const u = mark.x / state.width, v = state.flipY ? 1 - mark.y / state.height : mark.y / state.height;
      return a.map((value, axis) => value + u * (b[axis] - value) + v * (c[axis] - value));
    };
    const points = state.drawing.dots.slice(0, 6), marks = state.drawing.dots.slice(6);
    const dataScale = (points[3].x - points[0].x) / 6;
    const worldScale = Math.hypot(...a.map((v, i) => b[i] - v)) / state.width * dataScale;
    const scores = state.frame.X.map((p) => Math.max(...targets.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))));
    const order = scores.map((_, k) => k).sort((a, b) => scores[a] - scores[b]);
    const ranked = state.drawing.circles.length > 0;
    expect(state.lifts).toHaveLength(ranked ? 2 : 0);
    for (const [i, marker] of state.markers.entries()) {
      const pixel = [points[0].x + state.frame.X[i][0] * dataScale, points[0].y - state.frame.X[i][1] * dataScale];
      const mark = marks.find((m) => Math.hypot(m.x - pixel[0], m.y - pixel[1]) < 1e-7);
      const base = onGround(mark), pos = marker.position;
      assert(Math.hypot(pos[0] - base[0], pos[2] - base[2]) < 1e-6, 'the cost marker is above the same ground centre');
      assert(Math.abs(pos[1] - base[1] - scores[i] * worldScale) < 1e-6, 'height is the radius in the shared unit, without minimum subtraction');
      const rgb = [1, 3, 5].map((k) => parseInt(mark.fill.slice(k, k + 2), 16));
      assert.deepEqual(marker.rgba.slice(0, 3), rgb, 'both views paint the same hollow/filled glyph colour');
      assert.equal(marker.tint, 'ffffff', 'glyph colours are not tinted by the 3D material');
      assert.equal(marker.opacity, mark.alpha);
      assert(Math.abs(marker.radiusPx - mark.r - 0.5) <= 1, 'glyph sizes match in CSS pixels');
      assert.deepEqual(marker.texts, ranked && (i === order[0] || i === order[5]) ? [i === order[0] ? '1' : '6'] : []);
    }
    for (const lift of state.lifts) {
      const i = order[Number(lift.rank) - 1], marker = state.markers[i];
      const start = lift.positions[0], end = lift.positions[1];
      assert(Math.abs(start[1]) < 1e-6, 'height starts at the shared ground');
      assert(Math.hypot(...end.map((v, k) => v - marker.position[k])) < 1e-6, 'height ends at the actual cost marker');
      assert(Math.abs(Math.hypot(...end.map((v, k) => v - start[k])) - scores[i] * worldScale) < 1e-6, 'height equals the plan radius');
      assert(lift.dashed && lift.distances.length === 2 && lift.distances[1] > 0, 'height uses an actual dashed line');
    }
    const origin = onGround(points[0]);
    for (const p of state.wirePoints) {
      const xy = [(p[0] - origin[0]) / worldScale, -(p[2] - origin[2]) / worldScale];
      const radius = Math.max(...targets.map((q) => Math.hypot(q[0] - xy[0], q[1] - xy[1])));
      assert(Math.abs(p[1] - radius * worldScale) < 1e-5, 'the actual line surface shows the same objective');
    }
  }

  const view = root.locator('.cma-3d canvas');
  await view.scrollIntoViewIfNeeded();
  const beforeTurn = await root.evaluate((el) => el.cma3d.inspect.camera.quaternion.toArray());
  const bounds = await view.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 - 15, { steps: 5 });
  await page.mouse.up();
  expect(await root.evaluate((el) => el.cma3d.inspect.camera.quaternion.toArray())).not.toEqual(beforeTurn);

  // The existing button replays after the end; scrubbing pauses it.
  await button.click();
  await expect(button).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await slider.evaluate((input) => { input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(button).toHaveAttribute('data-playing', 'false');
  const forward = await page.evaluate(() => window.circleDrawing.circles);
  await slider.evaluate((input) => { input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true })); input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => window.circleDrawing.circles)).toEqual(forward);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const top = await panels.nth(0).boundingBox();
    const bottom = await panels.nth(1).boundingBox();
    return bottom.y - (top.y + top.height);
  }, { message: 'phone panels stack without overlapping' }).toBeGreaterThanOrEqual(0);
  await expect.poll(() => root.locator('.cma-top').evaluate((canvas) => canvas.clientWidth), {
    message: 'the phone circle drawing is wider than its previous 330px',
  }).toBeGreaterThan(330);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
