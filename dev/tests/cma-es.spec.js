// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

test('single top-down figure keeps geometry, legend and camera controls', async ({ page }) => {
  // Unit checks use the real inline function, without starting any demo.
  const source = fs.readFileSync(path.join(__dirname, '../../_posts/2026-08-23-cma-es.html'), 'utf8');
  const unit = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const script = [...doc.scripts].find((s) => !s.type).textContent;
    const init = 'ready(stepDemo);';
    if (script.split(init).length !== 2) throw new Error('Expected one demo initialization');
    (0, eval)(script.replace(init, 'window.radiusForTest = circleRadius; window.landscapeForTest = landscape; window.recordForTest = record;'));
    // A smooth function samples all colour bands.
    const image = window.landscapeForTest(([x]) => 10 ** x, { cx: 0, cy: 0, half: 1 }, 280, 280);
    const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data, palette = new Set();
    for (let i = 0; i < pixels.length; i += 4) palette.add(Array.from(pixels.slice(i, i + 4)).join(','));
    const run = window.recordForTest(window.radiusForTest, [0.5, 3.5], 1, 6, 3, true, 600), history = run.H;
    return {
      radii: [[0, 0], [3, 1.1], [-2, 4]].map((centre) => window.radiusForTest(centre)), palette: [...palette],
      generations: history.map((h) => h.X),
      distributions: history.map(({ m, m1, C, C1, sigma, sigma1, pc1, ps1 }) => ({ m, m1, C, C1, sigma, sigma1, pc1, ps1 })),
      weights: run.P.w, memoryRate: run.P.c1, pathBaseline: run.P.chiN,
      sampleRate: run.P.cmu, pathRate: run.P.cs, centerRate: run.P.cc, dimension: run.P.n,
    };
  }, source);
  expect(unit.radii[0]).toBeCloseTo(Math.hypot(6, 2.2), 10);
  expect(unit.radii[1]).toBeCloseTo(Math.hypot(3, 1.1), 10);
  expect(unit.radii[2]).toBeCloseTo(Math.hypot(8, -1.8), 10);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    // Observe actual Canvas calls, rather than a second copy of the renderer.
    window.circleDrawing = { circles: [], radii: [], dots: [], crosses: [], ellipses: [], backgrounds: 0, labels: [], before: [], origins: [], arrows: [] };
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
            drawing.circles = []; drawing.radii = []; drawing.dots = []; drawing.crosses = []; drawing.ellipses = []; drawing.backgrounds = 0; drawing.labels = [];
            drawing.before = []; drawing.origins = []; drawing.arrows = [];
            drawing.axes = []; drawing.centerTrail = [];
          }
          if (method === 'beginPath') { this.observedArc = null; this.observedEllipse = null; this.observedLines = []; this.observedPosition = null; }
          if (method === 'arc') this.observedArc = { x: args[0], y: args[1], r: args[2] };
          if (method === 'ellipse') this.observedEllipse = { x: args[0], y: args[1], rx: args[2], ry: args[3], angle: args[4], filled: false };
          if (method === 'fill' && this.observedEllipse) this.observedEllipse.filled = true;
          if (method === 'stroke' && this.observedEllipse) {
            Object.assign(this.observedEllipse, { stroke: this.strokeStyle, width: this.lineWidth, dash: this.getLineDash(), alpha: this.globalAlpha });
            // Keep the live guide and the deliberately faint before-state separate.
            (this.globalAlpha < 1 ? drawing.before : drawing.ellipses).push(this.observedEllipse);
          }
          if (method === 'moveTo') this.observedPosition = [args[0], args[1]];
          if (method === 'lineTo' && this.observedPosition) {
            const next = [args[0], args[1]];
            this.observedLines.push([this.observedPosition, next]); this.observedPosition = next;
          }
          if (method === 'stroke' && this.observedArc) {
            this.observedArc.stroke = this.strokeStyle;
            this.observedArc.width = this.lineWidth;
            this.observedArc.dash = this.getLineDash();
            this.observedArc.alpha = this.globalAlpha;
            if (this.observedArc.r > 12) drawing.circles.push(this.observedArc);
          }
          if (method === 'fill' && this.observedArc && this.observedArc.r <= 12) {
            this.observedArc.fill = this.fillStyle;
            this.observedArc.alpha = this.globalAlpha;
            drawing.dots.push(this.observedArc);
          }
          if (method === 'stroke' && this.strokeStyle === '#b91c1c' && this.globalAlpha === 0.55) {
            drawing.centerTrail = this.observedLines;
            return original.apply(this, args);
          }
          if (method === 'stroke' && !this.observedArc && this.observedLines.length === 2) {
            const [a, b] = this.observedLines[0];
            if (this.lineWidth === 1) {
              drawing.axes.push(...this.observedLines);
            } else {
              (this.globalAlpha < 1 ? drawing.origins : drawing.crosses).push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, dash: this.getLineDash() });
            }
          }
          if (method === 'stroke' && !this.observedArc && this.observedLines.length === 1) {
            const [from, to] = this.observedLines[0];
            const segment = { from, to, stroke: this.strokeStyle, width: this.lineWidth, dash: this.getLineDash() };
            (segment.dash.length ? drawing.radii : drawing.arrows).push(segment);
          }
          if (method === 'fill' && !this.observedArc && this.observedLines.length === 2 && drawing.arrows.length) {
            drawing.arrows.at(-1).tip = this.observedLines[0][0];
          }
          if (method === 'drawImage') { drawing.backgrounds++; window.circleBackground = args[0]; }
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
  await expect(root.locator('.phase-name')).toHaveCount(0);
  await expect(page.locator('#cma-updates b').filter({ hasText: /Learn from/ })).toHaveText([
    'Learn from the best samples',
    'Learn from center moves',
  ]);
  const matrix = root.locator('.cma-covariance');
  await expect(matrix.locator('.covariance-matrix')).toHaveCount(2);
  await expect(matrix.locator('.covariance-math .MathJax_CHTML')).toBeVisible();
  expect((await root.locator('.phase').boundingBox()).height).toBeLessThan(2);
  await expect(page.getByText('One generation as equations', { exact: true })).toHaveCount(0);
  await expect(root.locator('.update-before')).toHaveCount(1);
  await expect(root.locator('.panels, .plabel')).toHaveCount(0);
  await expect(root.locator('canvas:visible')).toHaveCount(1);
  await expect(root.locator('.cma-top')).toBeHidden();
  await expect(root.locator('.cma-top')).toHaveAttribute('aria-hidden', 'true');
  await expect(root.locator('.cma-gauge')).toHaveCount(0);
  await expect(root.locator('.cma-legend progress')).toHaveCount(0);
  await expect(root.locator('figcaption')).toHaveText('Fig 1: The smallest circle containing all points');
  const layout = () => root.evaluate((el) => {
    const viewport = el.querySelector('.cma-view').getBoundingClientRect();
    const canvas = el.querySelector('.cma-3d canvas').getBoundingClientRect();
    const matrix = el.querySelector('.cma-covariance').getBoundingClientRect();
    const legend = el.querySelector('.cma-legend'), rect = legend.getBoundingClientRect();
    const style = (selector) => {
      const css = getComputedStyle(legend.querySelector(selector));
      const g = document.createElement('canvas').getContext('2d');
      g.strokeStyle = css.borderTopColor;
      return { colour: g.strokeStyle, line: css.borderTopStyle };
    };
    return { width: el.clientWidth, viewport: viewport.width, canvas: canvas.width,
      matrixRight: matrix.left >= viewport.right && matrix.top < viewport.bottom && matrix.bottom > viewport.top,
      producer: el.querySelector('.cma-top').clientWidth,
      legend: { x: rect.x - viewport.x, y: rect.y - viewport.y, right: rect.right - viewport.x, bottom: rect.bottom - viewport.y },
      height: viewport.height, legendEm: parseFloat(getComputedStyle(legend).fontSize), pointer: getComputedStyle(legend).pointerEvents,
      best: style('.best-key'), shape: style('.shape-key') };
  });
  const initialLayout = await layout();
  const legendPaint = await root.locator('.cma-legend').evaluate((legend) => {
    const style = getComputedStyle(legend);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return { background: Array.from(ctx.getImageData(0, 0, 1, 1).data), opacity: style.opacity };
  });
  expect(legendPaint.background).toEqual([255, 255, 255, 204]);
  expect(legendPaint.opacity).toBe('1');
  expect(initialLayout.matrixRight).toBe(true);
  expect(initialLayout.canvas, 'the desktop canvas uses its pre-compaction width').toBeGreaterThanOrEqual(245 * 1.25);
  expect(initialLayout.canvas).toBeLessThan(initialLayout.width);
  expect(initialLayout.producer).toBe(initialLayout.canvas);
  expect(Math.abs(initialLayout.viewport - initialLayout.canvas), 'renderer width rounds to whole CSS pixels').toBeLessThan(1);
  expect(initialLayout.pointer).toBe('none');
  expect(initialLayout.best.line).toBe('solid');
  expect(initialLayout.shape.line).toBe('dashed');
  expect(initialLayout.best.colour).not.toBe(initialLayout.shape.colour);
  expect(initialLayout.legend.x).toBeGreaterThan(0);
  expect(initialLayout.legend.y).toBeGreaterThan(0);
  expect(initialLayout.legend.right).toBeLessThan(initialLayout.viewport);
  expect(initialLayout.legend.bottom).toBeLessThan(initialLayout.height);
  await expect(root.locator('.cma-legend')).toContainText('C shape, σ size');
  const initialCamera = await root.evaluate((el) => {
    const { camera } = el.cma3d.inspect;
    const project = (z) => camera.position.clone().set(0, 0, z).project(camera).toArray();
    return { direction: camera.getWorldDirection(camera.position.clone()).toArray(), origin: project(0), positiveY: project(-0.2) };
  });
  expect(initialCamera.direction[1], 'initial camera looks straight down').toBeLessThan(-0.99999);
  expect(initialCamera.positiveY[1], 'data +y projects upward').toBeGreaterThan(initialCamera.origin[1]);
  // Fig. 1 keeps these visual values after removing the second demo.
  const reference = {
    best: { r: 3.5, fill: '#1d4ed8' },
    parent: { r: 3, fill: '#3b82f6' },
    dropped: { r: 2.5, fill: '#a1a1aa' },
    lineWidth: 1.5,
  };
  expect(initialLayout.best.colour).toBe(reference.best.fill);
  expect(initialLayout.shape.colour).toBe(await root.evaluate((el) => el.cma3d.colors.neutral));
  const maximum = Number(await slider.getAttribute('max'));
  expect(maximum).toBeGreaterThan(6);
  await expect(root.locator('.spread-comparison, .cma-view svg')).toHaveCount(0);
  const samplesPerPhase = 4;
  const frames = await root.evaluate((el, { maximum, samplesPerPhase }) => {
    const slider = el.querySelector('.scrub');
    const frames = [];
    let liveEvents = 0;
    const background = window.circleBackground;
    let fixedBackground = true;
    el.addEventListener('cma-frame', () => liveEvents++);
    // Quarter steps cover Sample motion, every phase, and generation boundaries.
    window.circleGeometryScan = true;
    try {
      for (let tick = 0; tick <= maximum * samplesPerPhase; tick++) {
        slider.value = String(tick / samplesPerPhase);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        fixedBackground = fixedBackground && window.circleBackground === background;
        frames.push(JSON.parse(JSON.stringify({ drawing: window.circleDrawing, population: el.cmaFrame.X, styles: el.cmaFrame.styles, mean: el.cmaFrame.m, readout: el.querySelector('.read').textContent, phase: el.querySelector('.phase').textContent,
          beforeVisible: !el.querySelector('.update-before').hidden, directionVisible: !el.querySelector('.update-direction').hidden,
          legend: el.querySelector('.cma-legend').innerText })));
      }
    } finally {
      window.circleGeometryScan = false;
    }
    slider.value = slider.max;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const canvas = el.querySelector('.cma-top');
    const palette = (image) => {
      if (!image) return [];
      const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data, colours = new Set();
      for (let i = 0; i < pixels.length; i += 4) colours.add(Array.from(pixels.slice(i, i + 4)).join(','));
      return [...colours];
    };
    const width = canvas.clientWidth;
    const height = width * canvas.height / canvas.width;
    return { frames, events: window.circleScanEvents, liveEvents, finalFrame: el.cmaFrame, width, height, fixedBackground, background: palette(background) };
  }, { maximum, samplesPerPhase });
  expect(frames.events).toBe(frames.frames.length);
  expect(frames.liveEvents).toBe(1);
  expect(frames.fixedBackground, 'the pale background stays fixed during playback').toBe(true);
  expect(frames.background.length, 'a real background has multiple contour bands').toBeGreaterThan(1);
  expect(frames.background.every((colour) => unit.palette.includes(colour)), 'background uses the complete contour renderer palette').toBe(true);
  let fixedPoints;
  let meanDiffersFromBest = false;
  const targets = [[0, 0], [2, 0.6], [4, 1.5], [6, 2.2], [1.2, 1.4], [5, 0.9]];
  for (const [index, frame] of frames.frames.entries()) {
    const drawing = frame.drawing;
    assert(!frame.phase.includes('small box'), 'phase text does not refer to the removed box');
    const generation = Math.min(Math.floor(index / (6 * samplesPerPhase)), maximum / 6 - 1);
    const phase = Math.min(5, Math.floor(index / samplesPerPhase - generation * 6));
    const historyStage = phase === 4 && index % samplesPerPhase >= 2;
    const progress = index === frames.frames.length - 1 ? 1 : [0, 0.125, 0.5, 0.875][index % samplesPerPhase];
    const targetSamples = unit.generations[generation];
    for (const [k, point] of frame.population.entries()) {
      const previous = generation > 0 && phase === 0 ? unit.generations[generation - 1][k] : targetSamples[k];
      const fraction = generation > 0 && phase === 0 ? progress : 1;
      for (let axis = 0; axis < 2; axis++) {
        const expected = previous[axis] + fraction * (targetSamples[k][axis] - previous[axis]);
        assert(Math.abs(point[axis] - expected) < 1e-10, `frame ${index}: Sample connects previous positions to pristine new samples; Rank uses the actual samples`);
      }
    }
    assert.equal(frame.population.length, 6, `frame ${index}: all six current candidates arrive together`);
    assert.equal(frame.styles.length, 6);
    assert(frame.styles.every((style) => style.alpha > 0), `frame ${index}: no candidate is hidden`);
    assert.equal(drawing.dots.length, 12, `frame ${index}: six fixed points and six candidate centres`);
    assert.equal(drawing.ellipses.length, 1, 'the current search spread is drawn in every phase');
    assert.equal(drawing.backgrounds, 1, 'the reference contour background is drawn once');
    assert.deepEqual(drawing.labels, [], 'only the elevated sprite paints the rank, avoiding duplicate labels in top view');
    const points = drawing.dots.slice(0, 6), drawnCandidates = drawing.dots.slice(6);
    if (!fixedPoints) fixedPoints = points;
    assert.deepEqual(points, fixedPoints);
    const scale = (points[3].x - points[0].x) / 6;
    const project = (p) => [points[0].x + p[0] * scale, points[0].y - p[1] * scale];
    const distribution = unit.distributions[generation];
    const mean = phase < 3 ? distribution.m : phase === 3 ? distribution.m.map((v, axis) => v + progress * (distribution.m1[axis] - v)) : distribution.m1;
    const visited = unit.distributions.slice(0, generation + 1).map((entry) => entry.m);
    if (mean.some((v, axis) => v !== distribution.m[axis])) visited.push(mean);
    assert.equal(drawing.centerTrail.length, visited.length - 1, 'only the center moves through this frame are drawn');
    drawing.centerTrail.forEach(([from, to], i) => {
      const [a, b] = [visited[i], visited[i + 1]].map(project);
      assert(Math.hypot(from[0] - a[0], from[1] - a[1]) < 1e-7);
      assert(Math.hypot(to[0] - b[0], to[1] - b[1]) < 1e-7);
    });
    const scores = frame.population.map((c) => Math.max(...targets.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
    const order = scores.map((_, k) => k).sort((a, b) => scores[a] - scores[b]);
    let covariance = phase < 4 ? distribution.C : distribution.C1;
    let beforeCovariance = phase === 5 ? distribution.C1 : distribution.C;
    if (phase === 4) {
      const { dimension: n, pathRate, centerRate, memoryRate, sampleRate, weights } = unit;
      const pathLength2 = distribution.ps1.reduce((sum, v) => sum + v * v, 0);
      const usePath = pathLength2 / n / (1 - (1 - pathRate) ** (2 * (generation + 1))) < 2 + 4 / (n + 1);
      const retained = 1 - sampleRate - memoryRate * (usePath ? 1 : (1 - centerRate) ** 2);
      const samplesOnly = distribution.C.map((v) => retained * v);
      order.slice(0, weights.length).forEach((k, i) => {
        const [dx, dy] = targetSamples[k].map((v, j) => (v - distribution.m[j]) / distribution.sigma);
        [dx * dx, dx * dy, dy * dy].forEach((v, j) => { samplesOnly[j] += sampleRate * weights[i] * v; });
      });
      const from = historyStage ? samplesOnly : distribution.C;
      beforeCovariance = from;
      const to = historyStage ? distribution.C1 : samplesOnly;
      const part = index % 2 === 0 ? 0 : 0.5;
      covariance = from.map((v, j) => v + part * (to[j] - v));
    }
    const sigma = phase < 5 ? distribution.sigma : distribution.sigma * (distribution.sigma1 / distribution.sigma) ** progress;
    const guide = drawing.ellipses[0], centre = project(mean);
    assert(!frame.legend.includes('tick = random'), 'the recent-moves bar label is absent');
    assert.equal(frame.beforeVisible, phase >= 3, 'before-state legend appears only for mean, C and sigma updates');
    assert.equal(frame.directionVisible, historyStage || phase === 5, 'the amber key appears when its contribution is active');
    if (phase === 4) {
      const cause = historyStage ? 'Recent center moves' : 'Top 3 moves';
      assert(frame.legend.includes(cause) && frame.phase.includes(historyStage ? 'orange' : 'blue'), 'the active cause is named and color-matched');
    } else {
      assert(!frame.legend.includes('Top 3 moves'), 'the extra key appears only while reshaping C');
    }
    assert.equal(drawing.before.length, phase >= 3 ? 1 : 0, 'updates keep exactly one faint before-state outline');
    if (phase >= 3) {
      const before = drawing.before[0], oldMean = project(phase === 3 ? distribution.m : distribution.m1);
      assert(Math.hypot(before.x - oldMean[0], before.y - oldMean[1]) < 1e-7, 'before-outline is at the correct pre-update center');
      assert(before.alpha > 0 && before.alpha < guide.alpha, 'the previous state stays visible but quieter');
      const cos = Math.cos(before.angle), sin = Math.sin(before.angle), a = before.rx ** 2, b = before.ry ** 2;
      const factor = 4 * distribution.sigma ** 2 * scale ** 2;
      assert(Math.abs(a * cos ** 2 + b * sin ** 2 - factor * beforeCovariance[0]) < 1e-7, 'before-outline preserves the x spread at the start of this part');
      assert(Math.abs(a * sin ** 2 + b * cos ** 2 - factor * beforeCovariance[2]) < 1e-7, 'before-outline preserves the y spread at the start of this part');
      assert(Math.abs((a - b) * cos * sin + factor * beforeCovariance[1]) < 1e-7, 'before-outline preserves the orientation at the start of this part');
    }
    assert.equal(drawing.origins.length, phase === 3 || phase === 4 ? 1 : 0, 'mean and C arrows retain the original sampling center');
    for (const origin of drawing.origins) {
      const old = project(distribution.m);
      assert(Math.hypot(origin.x - old[0], origin.y - old[1]) < 1e-7);
    }
    assert(Math.hypot(guide.x - centre[0], guide.y - centre[1]) < 1e-7, 'C shape follows the pristine staged search mean');
    assert(Math.hypot(frame.mean[0] - mean[0], frame.mean[1] - mean[1]) < 1e-10, 'X follows the same staged mean');
    const cos = Math.cos(guide.angle), sin = Math.sin(guide.angle), a = guide.rx ** 2, b = guide.ry ** 2;
    const shapeXX = a * cos ** 2 + b * sin ** 2, shapeYY = a * sin ** 2 + b * cos ** 2;
    const shapeXY = (a - b) * cos * sin, factor = 4 * sigma ** 2 * scale ** 2;
    assert(Math.abs(shapeXX - factor * covariance[0]) < 1e-7, 'ellipse width represents the actual C and sigma');
    assert(Math.abs(shapeYY - factor * covariance[2]) < 1e-7, 'ellipse height represents the actual C and sigma');
    assert(Math.abs(shapeXY + factor * covariance[1]) < 1e-7, 'ellipse angle represents C with the drawing y-axis flipped');
    const gray = [1, 3, 5].map((i) => parseInt(guide.stroke.slice(i, i + 2), 16));
    assert(Math.max(...gray) - Math.min(...gray) <= 16 && Math.min(...gray) >= 32 && Math.max(...gray) <= 224, 'C shape is gray');
    assert.equal(guide.width, phase >= 4 ? 2 : 1);
    assert.equal(drawing.axes.length, phase >= 4 ? 2 : 0, 'C and sigma show the two axes on the actual ellipse');
    const spans = [[guide.rx * cos, guide.rx * sin], [-guide.ry * sin, guide.ry * cos]];
    drawing.axes.forEach(([start, end], i) => {
      assert(Math.hypot((start[0] + end[0]) / 2 - guide.x, (start[1] + end[1]) / 2 - guide.y) < 1e-7);
      const dx = (end[0] - start[0]) / 2, dy = (end[1] - start[1]) / 2, [x, y] = spans[i];
      assert(Math.min(Math.hypot(dx - x, dy - y), Math.hypot(dx + x, dy + y)) < 1e-7, 'axis follows the ellipse orientation and radius');
    });
    assert.equal(guide.filled, false, 'the C guide has no fill');
    assert(guide.dash.length > 0 && guide.dash.every((v) => v > 0), 'C shape is dashed');
    const extentX = Math.sqrt(shapeXX), extentY = Math.sqrt(shapeYY);
    assert(guide.x - extentX >= 0 && guide.x + extentX <= frames.width && guide.y - extentY >= 0 && guide.y + extentY <= frames.height, 'the complete staged C shape fits the fixed view');
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
    const expectedArrows = [];
    const expectArrow = (from, tip, colour, width) => {
      if (Math.hypot(tip[0] - from[0], tip[1] - from[1]) >= 1) expectedArrows.push({ from, tip, colour, width });
    };
    if (phase >= 2 && phase <= 4 && !historyStage) {
      for (let i = 0; i < 3; i++) expectArrow(project(distribution.m), project(frame.population[order[i]]), reference.parent.fill, 0.75 + 2 * unit.weights[i]);
    }
    if (phase === 3) expectArrow(project(distribution.m), project(mean), reference.best.fill, 2);
    if (historyStage) {
      const tip = distribution.m.map((v, axis) => v + distribution.sigma * Math.sqrt(unit.memoryRate) * distribution.pc1[axis]);
      expectArrow(project(distribution.m), project(tip), '#f59e0b', 1.5);
    }
    if (phase === 5) {
      const path = Math.hypot(...distribution.ps1) / unit.pathBaseline;
      assert(frame.legend.includes('Size ×' + (sigma / distribution.sigma).toFixed(2)), 'the legend still shows the current size change');
      assert(frame.phase.includes(path.toFixed(2) + '× the random-step baseline'), 'sigma explains the actual path comparison');
      if (path !== 1) assert(frame.phase.includes(path > 1 ? 'grow' : 'shrink'));
      for (const [dx, dy] of spans) {
        const factor = distribution.sigma / sigma;
        expectArrow([guide.x + dx * factor, guide.y + dy * factor], [guide.x + dx, guide.y + dy], '#f59e0b', 1.5);
      }
    }
    assert.equal(drawing.arrows.length, expectedArrows.length, 'only the directions relevant to this update are shown');
    expectedArrows.forEach((expected, i) => {
      const actual = drawing.arrows[i];
      assert(actual.tip, 'direction strokes have real arrowheads');
      assert(Math.hypot(actual.from[0] - expected.from[0], actual.from[1] - expected.from[1]) < 1e-7, 'arrows start at the actual sampling center or previous size');
      assert(Math.hypot(actual.tip[0] - expected.tip[0], actual.tip[1] - expected.tip[1]) < 1e-7, 'arrows show actual selected steps, covariance memory, moving mean or sigma change');
      assert.equal(actual.stroke, expected.colour);
      assert(Math.abs(actual.width - expected.width) < 1e-6, 'selected directions carry their true weight ordering, allowing Canvas fractional-width rounding');
      assert(actual.tip[0] >= 0 && actual.tip[0] <= frames.width && actual.tip[1] >= 0 && actual.tip[1] <= frames.height, 'explanation stays inside the fixed view');
    });
    const filled = candidates.filter((c) => c.fill !== '#ffffff');
    assert.equal(filled.length, 6, 'all candidates use filled points');
    for (let k = 0; k < candidates.length; k++) {
      const rank = order.indexOf(k), candidate = candidates[k];
      const style = phase >= 1 && rank === 0 ? reference.best : phase >= 2 && rank < 3 ? reference.parent : reference.dropped;
      assert.equal(candidate.r, style.r, 'marker size matches the Fig. 1 style');
      assert.equal(candidate.fill, style.fill, 'candidate colours match the actual reference figure');
      assert.equal(candidate.alpha, 1, 'small filled points stay visible');
    }
    if (phase === 0) {
      assert.equal(drawing.circles.length, 0, 'Sample must not reveal a best circle before ranking');
      assert.equal(drawing.radii.length, 0, 'Sample must not reveal ranked radius lines');
      assert.equal(new Set(frame.styles.map((s) => JSON.stringify([s.col, s.rad, s.alpha]))).size, 1, 'Sample does not disclose ranking');
      continue;
    }
    assert.equal(drawing.circles.length, 1, `frame ${index}: only the best enclosing circle is shown`);
    assert.equal(drawing.radii.length, 1, 'only the best circle has a radius segment');
    const best = candidates[order[0]];
    const circle = drawing.circles.find((c) => c.stroke === best.fill);
    assert(circle, 'the best marker and circle share their emphasis');
    assert(phase === 4 ? circle.alpha > 0 && circle.alpha < 0.5 : circle.alpha === 1, 'the unrelated objective circle recedes only during the covariance update');
    assert.equal(circle.width, reference.lineWidth, 'best circle uses the reference line weight');
    assert.deepEqual([circle.x, circle.y], [best.x, best.y], 'circle belongs to the independently ranked best candidate');
    assert(Math.abs(circle.r - scores[order[0]] * scale) < 1e-7, 'exact enclosing radius');
    assert.deepEqual(circle.dash, [], 'circle outline stays solid');
    const radius = drawing.radii[0];
    assert.equal(radius.stroke, circle.stroke);
    assert(radius.dash.length > 0 && radius.dash.every((v) => v > 0), 'the radius is dashed');
    assert.equal(radius.width, 1, 'radius line stays thin');
    assert(Math.hypot(radius.from[0] - circle.x, radius.from[1] - circle.y) < 1e-7, 'radius starts at the center');
    assert(points.some((p) => Math.hypot(radius.to[0] - p.x, radius.to[1] - p.y) < 1e-7), 'radius ends at a fixed target');
    assert(Math.abs(Math.hypot(radius.to[0] - radius.from[0], radius.to[1] - radius.from[1]) - circle.r) < 1e-7, 'radius ends at a farthest target, with true radius length');
    assert(circle.x - circle.r >= 0 && circle.x + circle.r <= frames.width &&
      circle.y - circle.r >= 0 && circle.y + circle.r <= frames.height, 'the whole best circle stays visible');
    assert(frame.readout.includes(scores[order[0]].toFixed(2)), 'the displayed best radius matches the circle');
    assert(!frame.readout.includes('6:'), 'the worst sample has no comparison readout');
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
  const matrixValues = async () => (await matrix.locator('[data-value]').allTextContents()).map((v) => v.replace('−', '-'));
  let initialEquation;
  const checkMatrix = async (times) => {
    await slider.evaluate((input, values) => {
      for (const value of values) {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, times);
    const { drawing } = frames.frames[times.at(-1) * samplesPerPhase];
    const { rx, ry, angle } = drawing.ellipses[0];
    const scale = (drawing.dots[3].x - drawing.dots[0].x) / 6;
    const a = Math.cos(angle), b = Math.sin(angle), x = rx ** 2, y = ry ** 2;
    const format = (v) => (Math.round(v / (4 * scale ** 2) * 1000) / 1000).toFixed(3);
    const values = [format(x * a ** 2 + y * b ** 2), format((y - x) * a * b), format(x * b ** 2 + y * a ** 2)];
    await expect.poll(async () => (await matrixValues()).slice(-4))
      .toEqual([values[0], values[1], values[1], values[2]]);
    const equation = await matrix.locator('.covariance-math').boundingBox();
    const panel = await matrix.boundingBox();
    expect(equation.x).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(equation.x + equation.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    initialEquation ||= equation;
    for (const dimension of ['x', 'width', 'height']) {
      expect(equation[dimension], 'the LaTeX equation holds its size and position when signs change').toBeCloseTo(initialEquation[dimension], 1);
    }
    const time = times.at(-1), generation = Math.floor(time / 6);
    const distribution = unit.distributions[generation];
    const f = Math.max(0, time - generation * 6 - 5);
    const fraction = f <= 0.5 ? 2 * f ** 2 : 1 - 2 * (1 - f) ** 2;
    const sigma2 = (distribution.sigma * (distribution.sigma1 / distribution.sigma) ** fraction) ** 2;
    const term = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
    const C = [x * a ** 2 + y * b ** 2, (y - x) * a * b, x * b ** 2 + y * a ** 2]
      .map((v) => term(v / (4 * scale ** 2 * sigma2)));
    expect(await matrixValues())
      .toEqual([term(sigma2), C[0], C[1], C[1], C[2], values[0], values[1], values[1], values[2]]);
  };
  await checkMatrix([0]);
  expect(await root.evaluate(() => window.circleDrawing.centerTrail)).toEqual([]);
  await checkMatrix([16.25]);
  await checkMatrix([16.75]);
  await checkMatrix([5.25, 23.75, 17.75]);

  // These live checks use actual scene objects; the bulk 2D scan above cannot
  // establish the 3D texture, coordinate mapping, glyphs or segment heights.
  let lastTextureVersion = -1, lastRenderFrame = -1;
  for (const time of [0, 1.5, 2.5, 3.5, 4.5, 5.5, 6, 6.25, 6.5, 6.75, 6.99, 7, 7.5, maximum]) {
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
        return { position: o.getWorldPosition(o.position.clone()).toArray(), opacity: o.material.opacity, tint: o.material.color.getHexString(), rgba, texts: image.drawnTexts || [], radiusPx: radius / image.width * o.scale.x / (s.camera.right - s.camera.left) * s.renderer.domElement.clientWidth * s.camera.zoom };
      });
      const lifts = Object.entries(s.lifts).filter(([, o]) => o.visible).map(([rank, o]) => {
        const p = o.geometry.getAttribute('position'), d = o.geometry.getAttribute('lineDistance');
        return { rank, positions: [world(o, p, 0), world(o, p, 1)], colour: o.material.color.getHexString(), dashed: o.material.isLineDashedMaterial, distances: d ? Array.from(d.array).slice(0, 2) : [] };
      });
      const wire = s.scene.getObjectByName('cost-grid'), p = wire.geometry.getAttribute('position');
      const wirePoints = Array.from({ length: 12 }, (_, i) => world(wire, p, Math.floor(i * (p.count - 1) / 11)));
      let lights = 0, otherMeshes = 0;
      s.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh && o !== ground) otherMeshes++; });
      const width = canvas.clientWidth;
      const height = width * canvas.height / canvas.width;
      return { shared: true, corners, flipY: ground.material.map.flipY, textureVersion: ground.material.map.version, renderFrame: s.renderer.info.render.frame, markers, lifts, liftRanks: Object.keys(s.lifts), wirePoints, lights, otherMeshes, orthographic: s.camera.isOrthographicCamera, zoom: s.controls.enableZoom, cameraZoom: s.camera.zoom, pan: s.controls.enablePan, drawing: window.circleDrawing, frame: el.cmaFrame, width, height };
    });
    expect(state?.shared, 'the actual 3D ground material shares the 2D canvas').toBe(true);
    if (time === 6.99) {
      for (const [k, point] of state.frame.X.entries()) {
        const from = unit.generations[0][k], to = unit.generations[1][k];
        assert(Math.hypot(point[0] - to[0], point[1] - to[1]) < 0.001 * Math.hypot(to[0] - from[0], to[1] - from[1]), 'the last Sample slider step is within 0.1% of the new positions before Rank');
      }
    }
    expect(state.orthographic).toBe(true);
    expect(state.lights).toBe(0);
    expect(state.otherMeshes).toBe(0);
    expect(state.zoom).toBe(true);
    expect(state.pan).toBe(true);
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
    expect(state.liftRanks).toEqual(['1']);
    expect(state.lifts).toHaveLength(ranked ? 1 : 0);
    for (const [i, marker] of state.markers.entries()) {
      const pixel = [points[0].x + state.frame.X[i][0] * dataScale, points[0].y - state.frame.X[i][1] * dataScale];
      const mark = marks.find((m) => Math.hypot(m.x - pixel[0], m.y - pixel[1]) < 1e-7);
      const base = onGround(mark), pos = marker.position;
      assert(Math.hypot(pos[0] - base[0], pos[2] - base[2]) < 1e-6, 'the cost marker is above the same ground centre');
      assert(Math.abs(pos[1] - base[1] - scores[i] * worldScale) < 1e-6, 'height is the radius in the shared unit, without minimum subtraction');
      const rgb = [1, 3, 5].map((k) => parseInt(mark.fill.slice(k, k + 2), 16));
      assert.deepEqual(marker.rgba.slice(0, 3), rgb, 'both views paint the same filled glyph colour');
      assert.equal(marker.tint, 'ffffff', 'glyph colours are not tinted by the 3D material');
      assert.equal(marker.opacity, mark.alpha);
      assert(Math.abs(marker.radiusPx / state.cameraZoom - mark.r - 0.5) <= 1, 'glyph sizes scale with camera zoom');
      assert.deepEqual(marker.texts, ranked && i === order[0] ? ['1'] : []);
    }
    for (const lift of state.lifts) {
      const i = order[Number(lift.rank) - 1], marker = state.markers[i];
      assert.equal(lift.colour, state.frame.styles[i].col.slice(1), 'height line shares the ranked marker colour');
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
  const beforeTurnLegend = (await layout()).legend;
  const bounds = await view.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 - 15, { steps: 5 });
  await page.mouse.up();
  expect(await root.evaluate((el) => el.cma3d.inspect.camera.quaternion.toArray())).not.toEqual(beforeTurn);
  const cameraState = () => root.evaluate((el) => {
    const { camera, controls } = el.cma3d.inspect;
    return { position: camera.position.toArray(), target: controls.target.toArray(), quaternion: camera.quaternion.toArray(), zoom: camera.zoom, frame: el.cmaFrame };
  });
  const beforePan = await cameraState();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 + 10, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const afterPan = await cameraState();
  expect(afterPan.target, 'right drag actually pans the camera target').not.toEqual(beforePan.target);
  for (let axis = 0; axis < 3; axis++) {
    expect(afterPan.position[axis] - beforePan.position[axis]).toBeCloseTo(afterPan.target[axis] - beforePan.target[axis], 10);
  }
  afterPan.quaternion.forEach((v, i) => expect(v).toBeCloseTo(beforePan.quaternion[i], 10));
  expect(afterPan.zoom).toBe(beforePan.zoom);
  expect(afterPan.frame).toEqual(beforePan.frame);
  await view.focus();
  await page.keyboard.press('ArrowRight');
  const afterKey = await cameraState();
  expect(afterKey.target, 'focused arrow key pans').not.toEqual(afterPan.target);
  expect((await layout()).legend).toEqual(beforeTurnLegend);

  // The existing button replays after the end; scrubbing pauses it.
  await button.click();
  await expect(button).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await slider.evaluate((input) => { input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(button).toHaveAttribute('data-playing', 'false');
  const forward = await page.evaluate(() => window.circleDrawing.circles);
  await slider.evaluate((input) => { input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true })); input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => window.circleDrawing.circles)).toEqual(forward);
  await slider.evaluate((input) => { input.value = '6.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const midpoint = await root.evaluate((el) => el.cmaFrame.X);
  await slider.evaluate((input) => { input.value = '19'; input.dispatchEvent(new Event('input', { bubbles: true })); input.value = '6.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await root.evaluate((el) => el.cmaFrame.X), 'reverse scrubbing reproduces the same transition').toEqual(midpoint);
  await slider.evaluate((input) => { input.value = '5.8'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await root.evaluate((el) => {
    window.samplePlayback = [];
    window.samplePlaybackListener = () => window.samplePlayback.push({
      time: Number(el.querySelector('.scrub').value), X: el.cmaFrame.X.map((p) => p.slice()),
      sample: el.cmaFrame.styles.every((style) => !style.label),
    });
    el.addEventListener('cma-frame', window.samplePlaybackListener);
  });
  await button.click();
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(7.05);
  const playback = await root.evaluate((el) => {
    el.removeEventListener('cma-frame', window.samplePlaybackListener);
    return window.samplePlayback;
  });
  await slider.evaluate((input) => { input.value = '7.1'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const afterPlayback = await cameraState();
  expect(afterPlayback.position).toEqual(afterKey.position);
  expect(afterPlayback.target).toEqual(afterKey.target);
  expect(afterPlayback.quaternion).toEqual(afterKey.quaternion);
  expect(afterPlayback.zoom).toBe(afterKey.zoom);
  const firstSample = playback.find((frame) => frame.sample);
  expect(firstSample).toBeTruthy();
  expect(playback.some((frame) => frame.time < 6)).toBe(true);
  expect(playback.some((frame) => frame.time > 6.4 && frame.time < 6.8)).toBe(true);
  for (const [k, point] of firstSample.X.entries()) {
    const from = unit.generations[0][k], to = unit.generations[1][k];
    assert(Math.hypot(point[0] - from[0], point[1] - from[1]) < 0.05 * Math.hypot(to[0] - from[0], to[1] - from[1]), 'real playback crosses the generation boundary without replacing the dots at once');
  }
  const beforeResize = await root.evaluate((el) => {
    const s = el.cma3d.inspect, map = s.scene.getObjectByName('shared-plan').material.map;
    window.floorDisposals = 0;
    map.addEventListener('dispose', () => window.floorDisposals++);
    return { id: map.uuid, error: s.renderer.getContext().getError(), textures: s.renderer.info.memory.textures };
  });
  expect(beforeResize.error).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await layout()).matrixRight, { message: 'equations stay beside the plot on a phone' }).toBe(true);
  const phoneLayout = await layout();
  expect(phoneLayout.canvas, 'the canvas fills the article width on phones').toBe(phoneLayout.width);
  expect(phoneLayout.producer).toBe(phoneLayout.canvas);
  expect(phoneLayout.legend.x / phoneLayout.legendEm).toBeCloseTo(initialLayout.legend.x / initialLayout.legendEm, 2);
  expect(phoneLayout.legend.y / phoneLayout.legendEm).toBeCloseTo(initialLayout.legend.y / initialLayout.legendEm, 2);
  expect(phoneLayout.legend.right).toBeLessThan(phoneLayout.viewport);
  const scroller = root.getByRole('region', { name: 'Circle demo and live equations' });
  await expect(scroller.getByText('Scroll right for the equations')).toHaveCount(0);
  await scroller.press('ArrowRight');
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const equationsFit = await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    const row = el.getBoundingClientRect();
    const equations = el.querySelector('.cma-equations').getBoundingClientRect();
    const visible = equations.left >= row.left - 1 && equations.right <= row.right + 1;
    el.scrollLeft = 0;
    return visible;
  });
  expect(equationsFit).toBe(true);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const start = await scroller.evaluate(async (el) => {
    await document.fonts.ready;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const { left, bottom } = el.getBoundingClientRect();
    return { x: Math.round(left + el.clientWidth * 0.85), y: Math.round(bottom - 6) };
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (const distance of [40, 80, 120, 160, 200, 240, 280]) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: start.x - distance, y: start.y }],
    });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft), {
    message: 'a swipe below the full-width canvas reaches the equations',
  }).toBeLessThanOrEqual(1);
  await scroller.evaluate((el) => { el.scrollLeft = 0; });
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  await expect(root.locator('canvas:visible')).toHaveCount(1);
  await expect.poll(() => root.evaluate((el) => {
    const canvas = el.querySelector('.cma-top'), image = window.circleBackground;
    return canvas.width === Math.round(canvas.clientWidth * window.devicePixelRatio) &&
      image.width === canvas.width && image.height === canvas.height &&
      el.cma3d.inspect.scene.getObjectByName('shared-plan').material.map.image === canvas;
  }), { message: 'the resized background and actual 3D ground use the current canvas' }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await slider.evaluate((input) => { input.value = '6.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const mobileMap = await root.evaluate((el) => {
    const s = el.cma3d.inspect, map = s.scene.getObjectByName('shared-plan').material.map;
    return { id: map.uuid, error: s.renderer.getContext().getError(), disposals: window.floorDisposals, textures: s.renderer.info.memory.textures };
  });
  expect(mobileMap.error, 'the resized floor image uploads successfully to the GPU').toBe(0);
  expect(mobileMap.id).not.toBe(beforeResize.id);
  expect(mobileMap.disposals, 'the previous ground texture is released').toBe(1);
  expect(mobileMap.textures).toBe(beforeResize.textures);
  await slider.evaluate((input) => { input.value = '6.75'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await root.evaluate((el) => el.cma3d.inspect.scene.getObjectByName('shared-plan').material.map.uuid), 'ordinary motion reuses its ground texture').toBe(mobileMap.id);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => root.evaluate((el) => el.cma3d.inspect.scene.getObjectByName('shared-plan').material.map.uuid), {
    message: 'shrinking the backing canvas also replaces the ground texture',
  }).not.toBe(mobileMap.id);
  expect(await root.evaluate((el) => el.cma3d.inspect.renderer.getContext().getError())).toBe(0);
  expect(await root.evaluate((el) => el.cma3d.inspect.renderer.info.memory.textures)).toBe(beforeResize.textures);
  expect(errors).toEqual([]);
});

test('best score follows the ranked sample', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/');
  const root = page.locator('#cma-step');
  const slider = root.locator('.scrub');
  const score = root.locator('.best-score');
  const seek = (value) => slider.evaluate((el, t) => {
    el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await expect(root.locator('.read')).toContainText('not ranked');
  await expect(score).toBeHidden();
  for (const time of ['1', '17', await slider.getAttribute('max')]) {
    await seek(time);
    await expect(score).toBeVisible();
    const { X } = await root.evaluate((el) => el.cmaFrame);
    const targets = [[0, 0], [2, 0.6], [4, 1.5], [6, 2.2], [1.2, 1.4], [5, 0.9]];
    const ranked = X.map((center) => {
      const points = targets.map((point) => ({ point, distance: Math.hypot(point[0] - center[0], point[1] - center[1]) }));
      return { center, ...points.sort((a, b) => b.distance - a.distance)[0] };
    }).sort((a, b) => a.distance - b.distance);
    const { center, point, distance } = ranked[0];
    const format = (n) => n.toFixed(2).replace('-', '−');
    const coordinates = (pair) => '(' + pair.map(format).join(', ') + ')';
    await expect(score.locator('.score-center').first()).toHaveText(coordinates(center));
    await expect(score.locator('.score-center').last()).toHaveText(coordinates(center));
    await expect(score.locator('.score-target')).toHaveText(coordinates(point));
    await expect(score.locator('.score-radius')).toHaveText(format(distance));
    await expect(root.locator('.read')).toHaveText('Best r ' + format(distance));
  }
  await seek('48');
  await expect(score).toBeHidden();
});

test('score, center and covariance share one aligned display', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/');
  const root = page.locator('#cma-step');
  const panel = root.locator('.cma-covariance');
  const slider = root.locator('.scrub');
  const mean = panel.locator('.mean-math');
  await expect(root.locator('.read')).toContainText('not ranked');
  await expect(mean).toBeVisible();
  await expect(mean.locator('.mean-coordinates')).toHaveText('(0.50, 3.50)');
  const seek = (value) => slider.evaluate((el, time) => {
    el.value = time;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  for (const time of ['3.25', '3.75', '4', '31']) {
    await seek(time);
    const center = await root.evaluate((el) => el.cmaFrame.m);
    const coordinates = center.map((n) => n.toFixed(2).replace('-', '−')).join(', ');
    await expect(mean.locator('.mean-coordinates')).toHaveText('(' + coordinates + ')');
  }
  await seek('16.4');
  const scoreGlyph = panel.locator('.best-score .mjx-mi .mjx-char');
  const objectiveGlyph = page.locator('.latex-container .MJXc-display .mjx-mi .mjx-char').filter({ hasText: /^f$/ }).first();
  await expect(scoreGlyph).toHaveText('f');
  const font = (el) => getComputedStyle(el).fontFamily;
  expect(await scoreGlyph.evaluate(font)).toBe(await objectiveGlyph.evaluate(font));
  const scoreNorms = panel.locator('.best-score .mjx-mo .mjx-char').filter({ hasText: /^∥$/ });
  const objectiveNorms = page.locator('.latex-container .MJXc-display').first().locator('.mjx-mo .mjx-char').filter({ hasText: /^∥$/ });
  await expect(scoreNorms).toHaveText(['∥', '∥']);

  for (const width of [1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const fontSize = (el) => getComputedStyle(el).fontSize;
    const bodySize = await objectiveGlyph.evaluate(fontSize);
    expect(await scoreGlyph.evaluate(fontSize)).toBe(bodySize);
    const glyphMetrics = (nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return [style.fontFamily, style.fontSize, node.getBoundingClientRect().width];
    });
    expect(await scoreNorms.evaluateAll(glyphMetrics)).toEqual(await objectiveNorms.evaluateAll(glyphMetrics));
    expect(await mean.locator('.mean-coordinates').evaluate(fontSize)).toBe(bodySize);
    expect(await panel.locator('.covariance-matrix [data-value]').first().evaluate(fontSize)).toBe(bodySize);
    const scoreBox = await panel.locator('.best-score').boundingBox();
    const meanBox = await mean.boundingBox();
    const covarianceBox = await panel.locator('.covariance-math').boundingBox();
    expect(scoreBox.y + scoreBox.height).toBeLessThan(meanBox.y);
    expect(meanBox.y + meanBox.height).toBeLessThan(covarianceBox.y);
    const operators = panel.getByText(/^(=|≈)$/);
    await expect(operators).toHaveCount(5);
    const operatorCenters = () => operators.evaluateAll((nodes) => nodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const { x, width } = range.getBoundingClientRect();
      return x + width / 2;
    }));
    await seek('16.4');
    const [reference] = await operatorCenters();
    for (const time of ['16.4', '31']) {
      await seek(time);
      for (const center of await operatorCenters()) expect(Math.abs(center - reference)).toBeLessThan(1);
      const leftSide = await panel.locator('.best-score .score-center').first().boundingBox();
      expect(leftSide.x + leftSide.width).toBeLessThan(reference);
      expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test('equation figures stay beside their math when scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/cma-es/#cma-updates');
  const pairs = page.locator('#cma-updates .cma-explain');
  await expect(pairs).toHaveCount(4);
  const stepSize = page.locator('#cma-step-size .cma-explain');
  await expect(stepSize.locator('.MJXc-display')).toHaveCount(1);
  await expect(stepSize.locator('.MJXc-display')).toBeVisible();
  const sizeFigure = stepSize.getByRole('img', { name: 'How center moves change the sampling size' });
  await expect(sizeFigure).toBeVisible();
  await expect(sizeFigure).toContainText('σ × 1.31');
  await expect(sizeFigure).toContainText('σ × 0.81');
  await expect(stepSize.locator('figcaption')).toContainText('Same way / turns back');
  await expect(sizeFigure.locator('text').filter({ hasText: /same direction|turns back/i })).toHaveCount(0);
  const captions = page.locator('#cma-step figcaption, #cma-updates figcaption');
  await expect(captions).toHaveCount(5);

  for (const width of [390, 320, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const captionsFit = await captions.evaluateAll((items) => items.every((caption) => {
      const lineHeight = parseFloat(getComputedStyle(caption).lineHeight);
      return caption.getBoundingClientRect().height <= lineHeight + 1 &&
        caption.scrollWidth <= caption.clientWidth + 1;
    }));
    expect(captionsFit, 'each caption fits on one line').toBe(true);
    const layouts = await pairs.evaluateAll((rows) => rows.map((row) => {
      row.scrollLeft = 0;
      const bounds = row.getBoundingClientRect();
      const math = row.querySelector('.cma-explain-math').getBoundingClientRect();
      const figure = row.querySelector('figure');
      const before = figure.getBoundingClientRect();
      const svg = figure.querySelector('svg');
      const scale = svg.getScreenCTM().a;
      const stroke = (selector) => {
        const shape = svg.querySelector(selector);
        return shape && parseFloat(getComputedStyle(shape).strokeWidth) * scale;
      };
      const overflow = row.scrollWidth - row.clientWidth;
      row.scrollLeft = overflow;
      return {
        beside: before.left >= math.right && before.top < math.bottom && before.bottom > math.top,
        figureWidth: before.width,
        scale,
        outline: stroke('ellipse[stroke="royalblue"], g[stroke="royalblue"] > circle'),
        orange: stroke('path[stroke="darkorange"]'),
        dot: svg.querySelector('circle[fill="currentColor"]').r.baseVal.value * scale,
        startVisible: math.left >= bounds.left - 1,
        endVisible: figure.getBoundingClientRect().right <= bounds.right + 1,
        overflow,
        scrolled: row.scrollLeft,
      };
    }));
    for (const layout of layouts) {
      expect(layout.beside).toBe(true);
      expect(layout.startVisible).toBe(true);
      expect(layout.endVisible).toBe(true);
      expect(layout.scrolled).toBe(layout.overflow);
    }
    const [, , centerMoves, stepSize] = layouts;
    expect(stepSize.scale).toBeCloseTo(centerMoves.scale, 3);
    expect(stepSize.outline).toBeCloseTo(centerMoves.outline, 3);
    expect(stepSize.orange).toBeCloseTo(centerMoves.orange, 3);
    expect(stepSize.dot).toBeCloseTo(centerMoves.dot, 3);
    expect(stepSize.figureWidth / centerMoves.figureWidth).toBeCloseTo(1.2, 2);
    if (width === 1280) expect(layouts.every((layout) => layout.overflow === 0)).toBe(true);
    else expect(layouts[0].overflow).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(pageWidth);
  }
});

test('standalone equations scroll only where needed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/cma-es/#cma-updates');
  const formula = page.locator('#cma-updates .MJXc-display').filter({ hasText: /min/ });
  await expect(formula).toBeVisible();
  await expect.poll(() => formula.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);

  await formula.evaluate((el) => { el.style.maxWidth = '8em'; });
  const thumbColor = () => formula.evaluate((el) => getComputedStyle(el, '::-webkit-scrollbar-thumb').borderTopColor);
  await page.mouse.move(0, 0);
  await expect.poll(thumbColor).toBe('rgba(0, 0, 0, 0)');
  await formula.hover();
  await expect.poll(thumbColor).not.toBe('rgba(0, 0, 0, 0)');
  const scroll = await formula.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    return { moved: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
  });
  expect(scroll.moved).toBeGreaterThan(0);
  expect(scroll.moved).toBe(scroll.max);
  await page.mouse.move(0, 0);
  await expect.poll(thumbColor).toBe('rgba(0, 0, 0, 0)');
});

test('live covariance stays visible while playing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/');
  const root = page.locator('#cma-step');
  const equation = root.locator('.covariance-math');
  const slider = root.locator('.scrub');
  await expect(equation.locator('.MathJax_CHTML').first()).toBeVisible();
  await slider.evaluate((e) => { e.value = '16.05'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await equation.evaluate((el) => new Promise((resolve) => {
    window.MathJax.Hub.Queue(() => {
      const observations = { removed: 0, frames: 0, blank: 0, values: new Set(), running: true };
      window.covariancePlayback = observations;
      observations.observer = new MutationObserver((records) => {
        records.forEach((record) => {
          observations.removed += [...record.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE).length;
        });
      });
      observations.observer.observe(el, { childList: true, subtree: true });
      function sample() {
        if (!observations.running) return;
        observations.frames++;
        if (el.getBoundingClientRect().width === 0 || el.getBoundingClientRect().height === 0) observations.blank++;
        observations.values.add(el.textContent);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      resolve();
    });
  }));
  await root.locator('.play').click();
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(16.65);
  await root.locator('.play').click();
  const result = await equation.evaluate(() => {
    const observed = window.covariancePlayback;
    observed.running = false;
    observed.observer.disconnect();
    return { removed: observed.removed, blank: observed.blank, frames: observed.frames, differentValues: observed.values.size };
  });
  expect(result.frames).toBeGreaterThan(4);
  expect(result.differentValues).toBeGreaterThan(1);
  expect(result.removed, 'no equation elements are removed while the numbers change').toBe(0);
  expect(result.blank, 'the equation is visible on every sampled frame').toBe(0);
});

test('compact viewport removes vertical space without shrinking geometry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/?scene-debug');
  const root = page.locator('#cma-step');
  const scroller = root.locator('.cma-step-layout');
  await expect(root.locator('.cma-3d canvas')).toHaveCount(1);
  for (const width of [1920, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const insideTextColumn = await root.evaluate((el) => {
      const parent = el.parentElement;
      const column = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      const left = column.left + parseFloat(style.paddingLeft);
      const right = column.right - parseFloat(style.paddingRight);
      return [...el.querySelectorAll('.ctrls, .cma-step-layout, figcaption')].every((part) => {
        const bounds = part.getBoundingClientRect();
        return bounds.left >= left - 1 && bounds.right <= right + 1;
      });
    });
    expect(insideTextColumn).toBe(true);
    await expect.poll(() => root.evaluate((el) => {
      const canvas = el.querySelector('.cma-3d canvas');
      return canvas.clientHeight / canvas.clientWidth;
    }), { message: 'the viewport uses three quarters of its former square height' }).toBeCloseTo(0.75, 2);
    const size = await root.evaluate((el) => {
      const { camera, renderer } = el.cma3d.inspect;
      const canvas = renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight;
      const project = (x, z) => camera.position.clone().set(x, 0, z).project(camera);
      const planeWidth = Math.abs(project(1, 0).x - project(-1, 0).x) * w / 2;
      const planeHeight = Math.abs(project(0, 1).y - project(0, -1).y) * h / 2;
      const box = el.querySelector('.cma-step-layout').getBoundingClientRect();
      const caption = el.querySelector('figcaption').getBoundingClientRect();
      return { w, h, planeWidth, planeHeight, captionGap: caption.top - box.bottom };
    });
    expect(size.planeWidth, 'the floor retains its previous width, over half the viewport').toBeGreaterThan(size.w / 2);
    expect(size.planeHeight, 'the rectangular canvas must not flatten circles').toBeCloseTo(size.planeWidth, 3);
    expect(size.captionGap, 'the caption follows the shorter viewport').toBeLessThan(20);
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
    const widthOverflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (width === 1920) expect(widthOverflow).toBe(0);
    else expect(widthOverflow).toBeGreaterThan(0);
  }
  const thumbColor = () => scroller.evaluate((el) => getComputedStyle(el, '::-webkit-scrollbar-thumb').borderTopColor);
  await page.mouse.move(0, 0);
  await expect.poll(thumbColor).toBe('rgba(0, 0, 0, 0)');
  await scroller.hover();
  await expect.poll(thumbColor).not.toBe('rgba(0, 0, 0, 0)');
  await page.mouse.move(0, 0);
  await expect.poll(thumbColor).toBe('rgba(0, 0, 0, 0)');
});

test('extra covariance demos are removed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/');
  await expect(page.locator('#cma-race')).toHaveCount(0);
  await expect(page.getByText(/Why learn/)).toHaveCount(0);
  await expect(page.getByText('Many generations', { exact: true })).toHaveCount(0);
  await expect(page.locator('#cma-run')).toHaveCount(0);
  await expect(page.locator('#cma-step .cma-3d canvas')).toHaveCount(1);
  await expect(page.locator('#cma-weights tbody tr')).toHaveCount(3);
});

test('wheel zoom starts closer and stops at both limits', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/cma-es/?scene-debug');
  const root = page.locator('#cma-step'), view = root.locator('.cma-3d canvas');
  await expect(view).toHaveCount(1);
  await view.scrollIntoViewIfNeeded();
  const state = () => root.evaluate((el) => {
    const { camera, controls, renderer } = el.cma3d.inspect;
    const project = (x) => camera.position.clone().set(x, 0, 0).project(camera).x;
    const legend = el.querySelector('.cma-legend').getBoundingClientRect(), box = renderer.domElement.getBoundingClientRect();
    return { zoom: camera.zoom, enabled: controls.enableZoom, min: controls.minZoom, max: controls.maxZoom, renderFrame: renderer.info.render.frame,
      span: Math.abs(project(1) - project(-1)) * box.width / 2, width: box.width,
      position: camera.position.toArray(), target: controls.target.toArray(), quaternion: camera.quaternion.toArray(),
      frame: el.cmaFrame, legend: [legend.x - box.x, legend.y - box.y] };
  });
  const initial = await state();
  expect(initial.zoom, 'the initial camera is 20% closer, keeping axis labels in view').toBe(1.2);
  expect(initial.enabled).toBe(true);
  expect(initial.min).toBe(0.8);
  expect(initial.max).toBe(3);
  expect(initial.span, 'the actual projected floor is enlarged').toBeGreaterThan(initial.width * 0.6);
  const box = await view.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state()).zoom).toBeGreaterThan(initial.zoom);
  const closer = await state();
  expect(closer.span / initial.span).toBeCloseTo(closer.zoom / initial.zoom, 6);
  expect(closer.renderFrame, 'wheel zoom actually redraws the scene').toBeGreaterThan(initial.renderFrame);
  for (const key of ['position', 'target', 'quaternion']) {
    closer[key].forEach((v, i) => expect(v).toBeCloseTo(initial[key][i], 10));
  }
  expect(closer.frame).toEqual(initial.frame);
  expect(closer.legend).toEqual(initial.legend);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state()).zoom, { message: 'wheel input clamps at maximum zoom' }).toBe(3);
  expect((await state()).span / initial.span).toBeCloseTo(3 / initial.zoom, 6);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await state()).zoom, { message: 'wheel input clamps at minimum zoom' }).toBe(0.8);
  expect((await state()).span / initial.span).toBeCloseTo(0.8 / initial.zoom, 6);
  await root.locator('.scrub').evaluate((e) => { e.value = '10.5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  expect((await state()).zoom, 'scrubbing preserves the user zoom').toBe(0.8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await state()).width).toBeLessThan(390);
  expect((await state()).zoom, 'resize preserves the user zoom').toBe(0.8);
});

test('rank weight calculation and bars use the optimizer weights', async ({ page }) => {
  const source = fs.readFileSync(path.join(__dirname, '../../_posts/2026-08-23-cma-es.html'), 'utf8');
  const parameters = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const script = [...doc.scripts].find((s) => !s.type).textContent;
    const init = 'ready(stepDemo);';
    if (script.split(init).length !== 2) throw new Error('Expected one initialization');
    (0, eval)(script.replace(init, 'window.weightParamsForTest = cmaParams;'));
    return [6, 12, 24].map((n) => window.weightParamsForTest(n));
  }, source);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/');
  const graph = page.locator('#cma-weights');
  const updates = page.locator('#cma-updates');
  const toggle = page.locator('summary').filter({ hasText: /^How it evolves$/ });
  await expect(toggle).toBeVisible();
  const labelGap = await toggle.evaluate((el) => {
    if (!el.firstElementChild) return 0;
    const style = getComputedStyle(el.firstElementChild);
    return parseFloat(style.marginInlineStart) / parseFloat(style.fontSize);
  });
  expect(labelGap).toBeCloseTo(0.4);
  await expect(page.locator('#cma-step')).toBeVisible();
  await expect(graph).toBeHidden();
  await expect(updates).toBeHidden();
  await toggle.press('Enter');
  await expect(graph).toBeVisible();
  await expect(updates.locator('.MJXc-display').first()).toBeVisible();
  for (const P of parameters) {
    const raw = Array.from({ length: P.mu }, (_, i) => Math.log((P.lam + 1) / (2 * (i + 1))));
    const total = raw.reduce((a, b) => a + b, 0);
    expect(P.rawWeights).toHaveLength(P.mu);
    raw.forEach((v, i) => {
      expect(P.rawWeights[i]).toBeCloseTo(v, 12);
      expect(P.w[i]).toBeCloseTo(v / total, 12);
    });
    expect(P.w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  }
  const P = parameters[0];
  await expect(graph.locator('tbody tr')).toHaveCount(3);
  await expect(graph.locator('.weight-intro .mjx-chtml')).toBeVisible();
  expect(await graph.locator('.weight-intro script[type="math/tex"]').textContent()).toBe('3 + 0.5 = 3.5');
  await expect(graph.locator('tbody .mjx-chtml')).toHaveCount(9);
  await expect(graph).not.toContainText(/The bars show how much|Total log score|For rank 1|Ranks 4 to 6 get 0%|The table shows rounded values/);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const rows = await graph.locator('tbody tr').evaluateAll((rows) => rows.map((row) => ({
      rank: row.cells[0].querySelector('script[type="math/tex"]').textContent.trim(),
      calculation: row.querySelector('.weight-calculation script[type="math/tex"]').textContent.trim(),
      share: row.querySelector('.weight-percent script[type="math/tex"]').textContent.trim(),
      fraction: row.querySelector('.weight-bar').getBoundingClientRect().width / row.querySelector('.weight-track').getBoundingClientRect().width,
    })));
    rows.forEach((row, i) => {
      expect(row.rank).toBe(String(i + 1));
      expect(row.calculation).toBe(String.raw`\ln(3.5 / ${i + 1}) \approx ${P.rawWeights[i].toFixed(3)}`);
      expect(row.share).toBe((P.w[i] * 100).toFixed(1) + String.raw`\%`);
      expect(row.fraction, 'bar length is the share of the full 100% track').toBeCloseTo(P.w[i], 3);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  const before = await graph.locator('tbody').innerText();
  await page.locator('#cma-step .scrub').evaluate((e) => { e.value = '14.5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await graph.locator('tbody').innerText(), 'rank weights stay the same in another generation').toBe(before);
});
