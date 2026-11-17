// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

test('one circle follows each candidate and keeps the six points and controls', async ({ page }) => {
  // Unit checks use the real inline function, without starting any demo.
  const source = fs.readFileSync(path.join(__dirname, '../../_posts/2026-08-22-cma-es.html'), 'utf8');
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
    window.circleDrawing = { circles: [], dots: [], ellipses: 0, backgrounds: 0, labels: [] };
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ['clearRect', 'beginPath', 'arc', 'fill', 'stroke', 'ellipse', 'drawImage', 'fillText']) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (this.canvas.matches('#cma-step .cma-top')) {
          const drawing = window.circleDrawing;
          if (method === 'clearRect') {
            drawing.circles = []; drawing.dots = []; drawing.ellipses = 0; drawing.backgrounds = 0; drawing.labels = [];
          }
          if (method === 'beginPath') this.observedArc = null;
          if (method === 'arc') this.observedArc = { x: args[0], y: args[1], r: args[2] };
          if (method === 'stroke' && this.observedArc && this.observedArc.r > 12) drawing.circles.push(this.observedArc);
          if (method === 'fill' && this.observedArc && this.observedArc.r <= 12) drawing.dots.push(this.observedArc);
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
      frames.push(JSON.parse(JSON.stringify(window.circleDrawing)));
    }
    const canvas = el.querySelector('.cma-top');
    return { frames, events, finalFrame: el.cmaFrame, width: canvas.clientWidth, height: canvas.clientHeight };
  }, maximum);
  expect(frames.events).toBe(frames.frames.length);
  let fixedPoints;
  for (const [index, frame] of frames.frames.entries()) {
    assert.equal(frame.circles.length, 1, `frame ${index}: only one enclosing circle`);
    assert.equal(frame.dots.length, 7, `frame ${index}: six fixed points and the current centre`);
    assert.equal(frame.ellipses, 0);
    assert.equal(frame.backgrounds, 0);
    assert.deepEqual(frame.labels, []);
    const points = frame.dots.slice(0, 6);
    if (!fixedPoints) fixedPoints = points;
    assert.deepEqual(points, fixedPoints);
    const circle = frame.circles[0];
    const centre = frame.dots[6];
    assert.deepEqual([circle.x, circle.y], [centre.x, centre.y]);
    const farthest = Math.max(...points.map((p) => Math.hypot(p.x - circle.x, p.y - circle.y)));
    assert(Math.abs(circle.r - farthest) < 1e-7, `frame ${index}: exact enclosing radius`);
    assert(circle.x - circle.r >= 0 && circle.x + circle.r <= frames.width &&
      circle.y - circle.r >= 0 && circle.y + circle.r <= frames.height,
    `frame ${index}: the whole circle must fit in the fixed view`);
  }
  for (let i = 0; i < fixedPoints.length; i++) {
    for (let j = i + 1; j < fixedPoints.length; j++) {
      const a = fixedPoints[i], b = fixedPoints[j];
      assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, 'the six fixed points stay distinct');
    }
  }
  const firstCandidates = frames.frames.slice(0, 10).map((f) => JSON.stringify(f.circles[0]));
  expect(new Set(firstCandidates).size).toBe(6);
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
