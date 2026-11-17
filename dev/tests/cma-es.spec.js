// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

test('six candidate centres appear together and only the best gets a circle', async ({ page }) => {
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
    window.circleDrawing = { circles: [], dots: [], crosses: [], ellipses: 0, backgrounds: 0, labels: [] };
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ['clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo', 'fill', 'stroke', 'ellipse', 'drawImage', 'fillText']) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (this.canvas.matches('#cma-step .cma-top')) {
          const drawing = window.circleDrawing;
          if (method === 'clearRect') {
            drawing.circles = []; drawing.dots = []; drawing.crosses = []; drawing.ellipses = 0; drawing.backgrounds = 0; drawing.labels = [];
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
            if (this.observedArc.r > 12) drawing.circles.push(this.observedArc);
          }
          if (method === 'fill' && this.observedArc && this.observedArc.r <= 12) {
            this.observedArc.fill = this.fillStyle;
            this.observedArc.alpha = this.globalAlpha;
            drawing.dots.push(this.observedArc);
          }
          if (method === 'stroke' && !this.observedArc && this.observedLines.length === 2) {
            const [a, b] = this.observedLines[0];
            drawing.crosses.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 });
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
  await page.goto('/cma-es/');
  const root = page.locator('#cma-step');
  const slider = root.locator('.scrub');
  const button = root.locator('.play');
  await expect(root.locator('.cma-3d canvas')).toHaveCount(1);
  const panels = root.locator('.panels > .panel');
  const left = await panels.nth(0).boundingBox();
  const right = await panels.nth(1).boundingBox();
  expect(Math.abs(left.y - right.y), 'desktop panels share one row').toBeLessThan(1);
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  const maximum = Number(await slider.getAttribute('max'));
  expect(maximum).toBeGreaterThan(6);
  const frames = await root.evaluate((el, maximum) => {
    const slider = el.querySelector('.scrub');
    const frames = [];
    let events = 0;
    el.addEventListener('cma-frame', () => events++);
    // Every phase, both sides of generation boundaries, and the final frame.
    for (let tick = 0; tick <= maximum * 10; tick++) {
      slider.value = String(tick / 10);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      frames.push(JSON.parse(JSON.stringify({ drawing: window.circleDrawing, population: el.cmaFrame.X, styles: el.cmaFrame.styles, mean: el.cmaFrame.m })));
    }
    const canvas = el.querySelector('.cma-top');
    return { frames, events, finalFrame: el.cmaFrame, width: canvas.clientWidth, height: canvas.clientHeight };
  }, maximum);
  expect(frames.events).toBe(frames.frames.length);
  let fixedPoints;
  let meanDiffersFromBest = false;
  const targets = [[0, 0], [2, 0.6], [4, 1.5], [6, 2.2], [1.2, 1.4], [5, 0.9]];
  for (const [index, frame] of frames.frames.entries()) {
    const drawing = frame.drawing;
    const generation = Math.min(Math.floor(index / 60), maximum / 6 - 1);
    const phase = Math.min(5, Math.floor(index / 10 - generation * 6));
    assert.equal(frame.population.length, 6, `frame ${index}: all six current candidates arrive together`);
    assert.equal(frame.styles.length, 6);
    assert(frame.styles.every((style) => style.alpha > 0), `frame ${index}: no candidate is hidden`);
    assert.equal(drawing.dots.length, 12, `frame ${index}: six fixed points and six candidate centres`);
    assert.equal(drawing.ellipses, 0);
    assert.equal(drawing.backgrounds, 0);
    assert.deepEqual(drawing.labels, []);
    const points = drawing.dots.slice(0, 6), candidates = drawing.dots.slice(6);
    if (!fixedPoints) fixedPoints = points;
    assert.deepEqual(points, fixedPoints);
    const scale = (points[3].x - points[0].x) / 6;
    const project = (p) => [points[0].x + p[0] * scale, points[0].y - p[1] * scale];
    for (let k = 0; k < 6; k++) {
      const expected = project(frame.population[k]);
      assert(Math.hypot(candidates[k].x - expected[0], candidates[k].y - expected[1]) < 1e-7, 'candidate centres keep their true positions');
      assert(candidates[k].alpha > 0);
    }
    assert.equal(drawing.crosses.length, 1, 'the mean has its own cross');
    const expectedMean = project(frame.mean), cross = drawing.crosses[0];
    assert(Math.hypot(cross.x - expectedMean[0], cross.y - expectedMean[1]) < 1e-7, 'the cross follows the real mean');
    const scores = frame.population.map((c) => Math.max(...targets.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
    const order = scores.map((_, k) => k).sort((a, b) => scores[a] - scores[b]);
    const filled = candidates.filter((c) => c.fill !== '#ffffff');
    assert.equal(filled.length, phase === 0 ? 0 : phase === 1 ? 1 : 3);
    if (phase === 0) {
      assert.equal(drawing.circles.length, 0, 'Sample must not reveal a best circle before ranking');
      assert.equal(new Set(frame.styles.map((s) => JSON.stringify([s.col, s.rad, s.alpha]))).size, 1, 'Sample does not disclose ranking');
      continue;
    }
    assert.equal(drawing.circles.length, 1, `frame ${index}: only the best circle`);
    const circle = drawing.circles[0], best = candidates[order[0]];
    assert.deepEqual([circle.x, circle.y], [best.x, best.y], 'the circle belongs to the independently ranked best candidate');
    assert(Math.abs(circle.r - scores[order[0]] * scale) < 1e-7, 'exact enclosing radius of the best candidate');
    assert.equal(best.fill, circle.stroke, 'the best marker and circle share their emphasis');
    assert(candidates.every((c, k) => k === order[0] || c.fill !== best.fill), 'only the best has that filled colour');
    assert.equal(frame.styles[order[0]].col, circle.stroke, 'the 3D view highlights the same best candidate');
    assert(circle.x - circle.r >= 0 && circle.x + circle.r <= frames.width &&
      circle.y - circle.r >= 0 && circle.y + circle.r <= frames.height, 'the whole best circle stays visible');
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
  expect(frames.frames.slice(0, 10).map((f) => f.population)).toEqual(Array(10).fill(frames.frames[0].population));
  expect(frames.finalFrame.X).toHaveLength(6);
  expect(frames.finalFrame.ell).toHaveLength(97);
  await expect(root.locator('.gen')).toHaveText(/step 6 of 6/);

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
