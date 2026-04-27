// @ts-check
const { test, expect } = require('@playwright/test');

test('smoke: latentspace page renders SVG with dots', async ({ page }) => {
  await page.goto('/latentspace/');

  const dot = page.locator('#post-map svg circle.dot').first();
  await expect(dot).toBeVisible();

  const count = await page.locator('#post-map svg circle.dot').count();
  expect(count).toBeGreaterThan(0);
});

test('pick_weighted_index: weights + rand maps to expected index', async ({ page }) => {
  await page.goto('/latentspace/');
  await page.waitForSelector('#post-map svg circle.dot');

  const r = await page.evaluate(() => {
    const fn = window.pick_weighted_index;
    if (typeof fn !== 'function') return { isFn: false };
    return {
      isFn: true,
      visitedLow_a: fn([1, 0.1], 0.5),    // un-visited (idx 0) wins
      visitedLow_b: fn([0.1, 1], 0.5),    // un-visited (idx 1) wins
      uniformFirst: fn([1, 1, 1], 0.05),  // total=3, r=0.15 -> idx 0
      uniformLast:  fn([1, 1, 1], 0.95),  // total=3, r=2.85 -> idx 2
      single:       fn([1], 0.5),         // idx 0
      allZero:      fn([0, 0, 0], 0.5),   // safe fallback -> idx 0
    };
  });

  expect(r.isFn).toBe(true);
  expect(r.visitedLow_a).toBe(0);
  expect(r.visitedLow_b).toBe(1);
  expect(r.uniformFirst).toBe(0);
  expect(r.uniformLast).toBe(2);
  expect(r.single).toBe(0);
  expect(r.allZero).toBe(0);
});

test('hover on empty canvas during idle walk does not interrupt cycling', async ({ page }) => {
  await page.goto('/latentspace/');
  await page.waitForSelector('#post-map svg circle.dot');

  const tooltip = page.locator('#post-map .map-tooltip');

  // Wait for the idle walk to highlight a node (tooltip fades in).
  await expect
    .poll(
      () => tooltip.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
      { timeout: 10000, intervals: [200] }
    )
    .toBeGreaterThan(0.5);

  // Hover empty canvas: dispatch mouseenter + mousemove on the svg (target = svg, not a dot).
  await page.evaluate(() => {
    const svg = document.querySelector('#post-map svg');
    svg.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
  });

  // If cycling continues, clear_hover_state at the end of IDLE_WALK_HIGHLIGHT_DURATION
  // (~2.5s) fades the tooltip back to 0. With the bug, hover triggers reset_idle which
  // preserves the highlight indefinitely (active_hover_node is kept), so tooltip stays at 1.
  await expect
    .poll(
      () => tooltip.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
      { timeout: 5000, intervals: [100] }
    )
    .toBeLessThan(0.1);
});

test('click on empty canvas during idle walk clears active node + tooltip', async ({ page }) => {
  await page.goto('/latentspace/');
  await page.waitForSelector('#post-map svg circle.dot');

  const tooltip = page.locator('#post-map .map-tooltip');

  // Idle walk auto-highlights a node after IDLE_DELAY (4s). Wait for tooltip to fade in.
  await expect
    .poll(
      () => tooltip.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
      { timeout: 10000, intervals: [200] }
    )
    .toBeGreaterThan(0.5);

  // Click on empty canvas. dispatchEvent on the svg ensures event.target is the svg
  // itself (not a dot), simulating a click outside any node.
  await page.evaluate(() => {
    const svg = document.querySelector('#post-map svg');
    svg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    svg.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  // After clicking empty canvas, tooltip should fade out (active node cleared).
  await expect
    .poll(
      () => tooltip.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
      { timeout: 2000, intervals: [50] }
    )
    .toBeLessThan(0.1);
});
