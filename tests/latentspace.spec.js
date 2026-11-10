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

// the dots each one is linked to in assets/data/latentspace.json, either way round, as the map draws its links
function linked_slugs() {
  const fs = require('fs');
  const path = require('path');
  const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'latentspace.json'), 'utf8'))
    .filter((post) => post.slug.charAt(0) !== '_');
  const known = new Set(posts.map((post) => post.slug));
  const linked = Object.fromEntries(posts.map((post) => [post.slug, new Set()]));
  for (const post of posts) {
    for (const other of post.connected || []) {
      if (!known.has(other)) continue;
      linked[post.slug].add(other);
      linked[other].add(post.slug);
    }
  }
  return linked;
}

const painted_map = (page) => page.evaluate(() => ({
  dots: [...document.querySelectorAll('#post-map circle.dot')].map((el) => (
    { slug: el.__data__.slug, r: Number(el.getAttribute('r')), opacity: el.getAttribute('opacity') })),
  edges: [...document.querySelectorAll('#post-map line.edge')].map((el) => (
    { ends: [el.__data__.source.slug, el.__data__.target.slug], width: Number(el.getAttribute('stroke-width')), stroke: el.getAttribute('stroke') })),
}));

// a highlighted dot, its linked dots whole and every other dot faded, its links in its colour and wider
function expect_highlight(map, slug, linked) {
  const dot = map.dots.find((d) => d.slug === slug);
  const other = map.dots.find((d) => d.slug !== slug);
  expect(dot.r / other.r).toBeCloseTo(5 / 3, 5);
  for (const d of map.dots) {
    expect([d.slug, d.opacity]).toEqual([d.slug, d.slug === slug || linked[slug].has(d.slug) ? '1' : '0.1']);
  }
  const own = map.edges.filter((e) => e.ends.includes(slug));
  const rest = map.edges.filter((e) => !e.ends.includes(slug));
  expect(own.length).toBeGreaterThan(0);
  expect(new Set(own.map((e) => e.stroke)).size).toBe(1);
  expect(rest.every((e) => e.stroke !== own[0].stroke)).toBe(true);
  for (const e of own) expect(e.width / rest[0].width).toBeCloseTo(0.75 / 0.5, 5);
  for (const e of rest) expect(e.width).toBeCloseTo(rest[0].width, 5);
}

// what a highlighted dot looks like is one decision, whether the mouse or the idle walk picked the dot,
// so assets/js/latentspace.js writes the highlighted dot's radius in one place
test('a dot highlighted by a hover and by the idle walk looks the same, painted in one place', async ({ page }) => {
  const linked = linked_slugs();
  await page.goto('/latentspace/');
  await page.waitForSelector('#post-map svg circle.dot');

  // before the idle walk starts (IDLE_DELAY, 4s)
  const hovered = await page.evaluate((linked_list) => {
    const el = [...document.querySelectorAll('#post-map circle.dot')]
      .find((dot) => linked_list[dot.__data__.slug] && linked_list[dot.__data__.slug].length > 0);
    el.dispatchEvent(new MouseEvent('mouseenter'));
    el.dispatchEvent(new MouseEvent('mouseleave'));
    return el.__data__.slug;
  }, Object.fromEntries(Object.entries(linked).map(([slug, set]) => [slug, [...set]])));
  // the leave clears the hover 80ms later, so read it at once
  expect_highlight(await painted_map(page), hovered, linked);

  // the idle walk's highlight fades in over 400ms; read it once every dot has arrived
  await expect.poll(async () => (await painted_map(page)).dots.every((d) => d.opacity === '1' || d.opacity === '0.1')
    && (await painted_map(page)).dots.some((d) => d.opacity === '0.1'), { timeout: 15000, intervals: [100] }).toBe(true);
  const walked = await painted_map(page);
  const top = walked.dots.reduce((a, b) => (b.r > a.r ? b : a));
  expect_highlight(walked, top.slug, linked);

  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'latentspace.js'), 'utf8');
  expect((source.match(/(?<![\d.])5 \/ current_zoom\.k/g) || []).length).toBeLessThanOrEqual(1);
});

// a dot's neighbours are a property of the data, worked out once from the links: the idle walk steps
// from a dot to one linked to it, and nothing scans the links again for a dot's ends
test('the idle walk steps to a linked dot, and the links are scanned for neighbours in one place', async ({ page }) => {
  const linked = linked_slugs();
  await page.goto('/latentspace/');
  await page.waitForSelector('#post-map svg circle.dot');

  // the dot the idle walk has highlighted, once its 400ms fade has ended
  const settled_top = async () => {
    const map = await painted_map(page);
    if (!map.dots.some((d) => d.opacity === '0.1') || !map.dots.every((d) => d.opacity === '1' || d.opacity === '0.1')) return null;
    return map.dots.reduce((a, b) => (b.r > a.r ? b : a)).slug;
  };
  let first = null;
  await expect.poll(async () => (first = await settled_top()), { timeout: 15000, intervals: [100] }).not.toBeNull();
  let second = null;
  await expect.poll(async () => {
    second = await settled_top();
    return second !== null && second !== first;
  }, { timeout: 15000, intervals: [100] }).toBe(true);
  expect(linked[first].has(second)).toBe(true);

  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'latentspace.js'), 'utf8');
  expect((source.match(/\.index === /g) || []).length).toBe(0);
  expect((source.match(/\blinks\.(forEach|some|filter)\(/g) || []).length).toBeLessThanOrEqual(1);
});
