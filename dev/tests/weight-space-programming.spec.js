// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const POST = '/weight-space-programming/';
const SCENE = fs.readFileSync(path.join(__dirname, '../../_includes/weight-space-car-scene.svg'), 'utf8');

// Where a recorded car body is at time t, read straight from the source keyframes (linear, as SMIL plays them).
function recorded(body, t) {
  const group = SCENE.match(new RegExp(`data-car-body="${body}"><animateTransform[^>]*dur="([\\d.]+)s"[^>]*keyTimes="([^"]*)" values="([^"]*)"`));
  const dur = parseFloat(group[1]);
  const times = group[2].split(';').map((k) => parseFloat(k) * dur);
  const points = group[3].split(';').map((v) => v.trim().split(/\s+/).map(Number));
  if (t >= times[times.length - 1]) return points[points.length - 1];
  const i = times.findIndex((k, j) => t >= k && t < times[j + 1]);
  const f = (t - times[i]) / (times[i + 1] - times[i]);
  return points[i].map((v, d) => v + (points[i + 1][d] - v) * f);
}

// The computed look of one figure's control row and legend, read the same way on any post.
function controlStyle(root) {
  const pick = (el, keys) => Object.fromEntries(keys.map((k) => [k, getComputedStyle(el).getPropertyValue(k)]));
  const one = (selector) => {
    const found = root.querySelectorAll(selector);
    if (found.length !== 1) throw new Error(`${selector}: expected 1, found ${found.length}`);
    return found[0];
  };
  return {
    row: pick(one('.ctrls'), ['display', 'gap', 'align-items', 'flex-wrap']),
    play: pick(one('.play'), ['width', 'height', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'background-color', 'font-size']),
    icon: pick(one('.play .play-icon'), ['width', 'height', 'fill']),
    scrub: pick(one('.scrub'), ['height', 'border-radius', 'background-color', 'appearance']),
    readout: pick(one('.tval'), ['font-family', 'font-size', 'color', 'white-space']),
    legend: pick(one('[class$="-legend"]'), ['font-family', 'font-size']),
  };
}

test('control rows match the CMA-ES post', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cma-es/', { waitUntil: 'domcontentloaded' });
  const reference = await page.locator('#cma-step').evaluate(controlStyle);

  await page.goto(POST, { waitUntil: 'domcontentloaded' });
  const figures = page.locator('.ws-demo');
  await expect(figures).toHaveCount(2);
  for (const figure of await figures.all()) {
    expect(await figure.evaluate(controlStyle)).toEqual(reference);
  }
  // Text buttons and disclosures were the Codex draft's controls; the blog uses the icon row only.
  await expect(page.locator('.post-main button:not(.play)')).toHaveCount(0);
  await expect(page.locator('.post-main details')).toHaveCount(0);
});

test('short outline and one three.js from unpkg', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(POST, { waitUntil: 'load' });

  // An intro, the two examples, and the chair-to-sofa experiment, each a few short bullets
  // (user, 2026-11-26: "make the post simple"; the experiment added on 2026-11-27: "노트에 추가").
  const outline = page.locator('.post-main > ul').first();
  const titles = await outline.locator(':scope > li').allTextContents();
  expect(titles.map((t) => t.trim())).toEqual([
    'Weight-space programming',
    'Example: a car that cannot climb a ramp',
    'Example: an ink wash prompt that paints like Lee Jung-seop',
    'Experiment: a chair model that makes sofas',
  ]);
  const bullets = await outline.locator(':scope > ul').evaluateAll((lists) => lists.map((ul) => ul.querySelectorAll(':scope > li').length));
  expect(bullets.length).toBe(4);
  for (const count of bullets) expect(count).toBeLessThanOrEqual(3);
  await expect(page.locator('.post-main table')).toHaveCount(0);
  await expect(page.locator('.post-main .article')).toHaveCount(0);

  // three.js comes once, from the same unpkg build the CMA-ES and behavior-aware posts use; nothing from old local copies.
  expect(requests.filter((url) => /three(\.module)?\.js$|three\.core\.js$/.test(url))).toEqual(['https://unpkg.com/three@0.151.3/build/three.module.js']);
  expect(requests.filter((url) => /\/assets\/(vendor|js\/weight-space)/.test(url))).toEqual([]);

  const links = await page.locator('.post-main > ul').last().locator('a').evaluateAll((as) => as.map((a) => a.href));
  expect(links).toEqual(expect.arrayContaining([
    'https://rikiyat.github.io/blog/weight-space-programming/',
    'https://aifrontier.kr/ko/articles/weight-space-programming-lab/',
  ]));
});

test('car slider shows the recorded motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(POST, { waitUntil: 'load' });
  const car = page.locator('#ws-car');
  const at = (body) => car.locator(`[data-car-body="${body}"]`).evaluate((el) => {
    const m = el.transform.animVal.getItem(0).matrix;
    return [m.e, m.f];
  });

  // 1.3 s: the edited car has backed up to the right, the far side from the box.
  await car.locator('.scrub').fill('1.3');
  await expect(car.locator('.tval')).toHaveText('1.3 s of 5.2 s');
  const back = await at('after');
  recorded('after', 1.3).forEach((v, d) => expect(back[d]).toBeCloseTo(v, 2));
  expect(back[0]).toBeGreaterThan(4);

  // The end: the edited car is past the red strip (x < 1.18); the trained car is still on the ramp (x > 1.9).
  await car.locator('.scrub').fill('5.2');
  await expect(car.locator('.tval')).toHaveText('5.2 s of 5.2 s');
  const [after, before] = [await at('after'), await at('before')];
  recorded('after', 5.2).forEach((v, d) => expect(after[d]).toBeCloseTo(v, 2));
  recorded('before', 5.2).forEach((v, d) => expect(before[d]).toBeCloseTo(v, 2));
  expect(after[0]).toBeLessThan(1.18);
  expect(before[0]).toBeGreaterThan(1.9);
});

// Seconds shown by a "t s of 5.2 s" read-out.
const seconds = async (figure) => parseFloat(await figure.locator('.tval').textContent());

test('car plays, pauses and restarts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto(POST, { waitUntil: 'load' });
  const car = page.locator('#ws-car'), play = car.locator('.play');

  // Off screen it waits; the first time it is seen it plays by itself.
  await page.waitForTimeout(400);
  await expect(play).not.toHaveAttribute('data-playing', 'true');
  expect(await seconds(car)).toBe(0);
  await car.scrollIntoViewIfNeeded();
  await expect(play).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => seconds(car)).toBeGreaterThan(0.2);

  // Pause holds the time; play continues from there.
  await play.click();
  await expect(play).toHaveAttribute('data-playing', 'false');
  const held = await seconds(car);
  await page.waitForTimeout(400);
  expect(await seconds(car)).toBe(held);
  await play.click();
  await expect.poll(() => seconds(car)).toBeGreaterThan(held);

  // At the end, play starts over from 0.
  await car.locator('.scrub').fill('5.2');
  await expect(play).toHaveAttribute('data-playing', 'false');
  await play.click();
  await expect(play).toHaveAttribute('data-playing', 'true');
  expect(await seconds(car)).toBeLessThan(1);
});

test('car does not play by itself with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(POST, { waitUntil: 'load' });
  const car = page.locator('#ws-car');
  await car.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await expect(car.locator('.play')).not.toHaveAttribute('data-playing', 'true');
  await expect(car.locator('.tval')).toHaveText('0.0 s of 5.2 s');
});

test('painting step records follow the source', async ({ page }) => {
  // Unit checks use the real inline function, without starting any demo (the CMA-ES test does the same).
  const html = fs.readFileSync(path.join(__dirname, '../../_posts/2026-11-08-weight-space-programming.html'), 'utf8');
  const frames = await page.evaluate(([source, data]) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const script = [...doc.scripts].find((s) => !s.type).textContent;
    const init = 'ready(start);';
    if (script.split(init).length !== 2) throw new Error('Expected one demo initialization');
    (0, eval)(script.replace(init, 'window.frameForTest = frame;'));
    return Object.fromEntries([11, 15, 20].map((i) => [i, window.frameForTest(data, i)]));
  }, [html, PAINTING]);

  // In AI Frontier's viewer (WspImage3D) the four tensors of each block, qkv, out, fc1 and fc2, are the 4-bit ones.
  const fourBit = (parts) => parts.filter((id) => /^b\d+\.(qkv|out|fc1|fc2)$/.test(id)).length;
  // The article: Astra chose step 20 (0.776, 0.40% of weights), its best score was step 15 (0.794),
  // and step 11 is the only step that opened four 4-bit layers.
  expect(frames[20]).toMatchObject({ step: 20, chosen: true, last: 21 });
  expect(frames[20].score).toBeCloseTo(0.776, 3);
  expect(frames[20].fraction).toBeCloseTo(0.0040, 4);
  expect(frames[20].parts).toEqual(expect.arrayContaining(['b0.adaln', 'b49.adaln', 'vae.out']));
  expect(fourBit(frames[20].parts)).toBe(0);
  expect(frames[15]).toMatchObject({ step: 15, chosen: false });
  expect(frames[15].score).toBeCloseTo(0.794, 3);
  expect(fourBit(frames[11].parts)).toBe(4);
});

const PAINTING = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/data/weight-space-painting.json'), 'utf8'));

test("each step's painting style follows its score", async ({ page }) => {
  // Agreed mapping (2026-11-27): the original model's score is no style; the best step is full style;
  // a step scoring below the original "went wrong", fully so at the worst step.
  const html = fs.readFileSync(path.join(__dirname, '../../_posts/2026-11-08-weight-space-programming.html'), 'utf8');
  const frames = await page.evaluate(([source, data]) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const script = [...doc.scripts].find((s) => !s.type).textContent;
    (0, eval)(script.replace('ready(start);', 'window.frameForTest = frame;'));
    return data.steps.map((s, i) => window.frameForTest(data, i));
  }, [html, PAINTING]);
  const scores = PAINTING.steps.map((s) => s.score), base = scores[0], best = Math.max(...scores), worst = Math.min(...scores);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  frames.forEach((f, i) => {
    expect(f.style, `style of step ${i}`).toBeCloseTo(clamp((scores[i] - base) / (best - base)), 6);
    expect(f.damage, `damage of step ${i}`).toBeCloseTo(clamp((base - scores[i]) / (base - worst)), 6);
  });
  expect([frames[0].style, frames[0].damage]).toEqual([0, 0]);    // the original model
  expect(frames[15].style).toBe(1);                                // Astra's best score
  expect(frames[3].damage).toBe(1);                                // the worst edit
  expect(frames[20].style).toBeGreaterThan(0.75);                  // the chosen step, 0.776
  expect(frames[20].damage).toBe(0);
});

// Ids of the boxes the 3D scene draws in the "changed" color, read from the real meshes (?scene-debug).
const redBoxes = (figure) => figure.evaluate((root) => {
  const want = getComputedStyle(root).getPropertyValue('--edited').trim().replace('#', '').toLowerCase();
  return Object.entries(root.wsInspect.meshes)
    .filter(([, mesh]) => mesh.material.color.getHexString() === want)
    .map(([id]) => id).sort();
});
// Whether the painting inside the 3D scene is exactly the painting of `step` (same check as the figure canvases).
const sceneShowsStep = async (figure, step) => {
  const handle = await figure.evaluateHandle((root) => {
    const map = root.wsInspect.picture.material.map;
    return map && map.image instanceof HTMLCanvasElement ? map.image : null;
  });
  const canvas = handle.asElement();
  if (!canvas) return false;
  return canvas.evaluate((el, [step, scores]) => {
    const root = document.getElementById('ws-painting'), base = scores[0], best = Math.max(...scores), worst = Math.min(...scores);
    const clamp = (v) => Math.max(0, Math.min(1, v));
    if (el.width < 200) return false;
    const fresh = document.createElement('canvas'); fresh.width = el.width; fresh.height = el.height;
    root.wsPaint(fresh, step, clamp((scores[step] - base) / (best - base)), clamp((base - scores[step]) / (base - worst)));
    return fresh.toDataURL() === el.toDataURL();
  }, [step, PAINTING.steps.map((s) => s.score)]);
};

test('painting slider updates the red boxes and the painting in the scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${POST}?scene-debug`, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await expect.poll(() => figure.evaluate((root) => !!(root.wsInspect && root.wsInspect.drawn))).toBe(true);
  await expect(figure.locator('svg.ws-chart')).toHaveCount(0);   // the score line is gone; the score is one number

  // It opens on the step Astra chose.
  await expect(figure.locator('.tval')).toHaveText('step 20 of 21');
  await expect(figure.locator('.ws-score')).toHaveText(`similarity ${PAINTING.steps[20].score.toFixed(3)}`);
  expect(await redBoxes(figure)).toEqual([...PAINTING.steps[20].parts].sort());
  await expect.poll(() => sceneShowsStep(figure, 20)).toBe(true);

  await figure.locator('.scrub').fill('13');
  await expect(figure.locator('.tval')).toHaveText('step 13 of 21');
  await expect(figure.locator('.ws-score')).toHaveText(`similarity ${PAINTING.steps[13].score.toFixed(3)}`);
  expect(PAINTING.steps[13].parts).toHaveLength(7);
  expect(await redBoxes(figure)).toEqual([...PAINTING.steps[13].parts].sort());
  await expect.poll(() => sceneShowsStep(figure, 13)).toBe(true);
});

// Whether a canvas shows exactly the painting of `step`: the page's painter drawn again on a fresh canvas
// of the same size, with the style and damage the agreed mapping gives that step's score.
const showsStep = (canvas, step) => canvas.evaluate((el, [step, scores]) => {
  const root = el.closest('#ws-painting'), base = scores[0], best = Math.max(...scores), worst = Math.min(...scores);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  if (!root.wsPaint || el.width < 200) return false;
  const fresh = document.createElement('canvas'); fresh.width = el.width; fresh.height = el.height;
  root.wsPaint(fresh, step, clamp((scores[step] - base) / (best - base)), clamp((base - scores[step]) / (base - worst)));
  return fresh.toDataURL() === el.toDataURL();
}, [step, PAINTING.steps.map((s) => s.score)]);

test('the figure paintings show step 0 and the selected step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(POST, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await expect(figure.locator('.tval')).toHaveText('step 20 of 21');
  await expect.poll(() => showsStep(figure.locator('canvas.ws-step'), 20)).toBe(true);
  await expect.poll(() => showsStep(figure.locator('canvas.ws-original'), 0)).toBe(true);
  expect(await showsStep(figure.locator('canvas.ws-step'), 21)).toBe(false);     // steps 20 and 21 differ

  await figure.locator('.scrub').fill('13');
  await expect(figure.locator('.ws-step-label')).toHaveText('step 13');
  await expect.poll(() => showsStep(figure.locator('canvas.ws-step'), 13)).toBe(true);
  expect(await showsStep(figure.locator('canvas.ws-original'), 0)).toBe(true);
});

// For each label: whether it is shown, and how far (px) its center is outside the screen area of the parts it names.
const labelOffsets = (figure) => figure.evaluate((root) => {
  const { camera, renderer } = root.wsInspect.stage, canvas = renderer.domElement.getBoundingClientRect(), meshes = root.wsInspect.meshes;
  const area = (objects) => {
    const xs = [], ys = [];
    for (const o of objects) {
      o.geometry.computeBoundingBox();
      const { min, max } = o.geometry.boundingBox, V = o.position.constructor;
      for (let i = 0; i < 8; i++) {
        const p = new V(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(o.matrixWorld).project(camera);
        xs.push(canvas.left + (p.x + 1) / 2 * canvas.width); ys.push(canvas.top + (1 - p.y) / 2 * canvas.height);
      }
    }
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  const pick = (test) => Object.keys(meshes).filter(test).map((id) => meshes[id]);
  const parts = {
    'prompt in': pick((id) => id === 'te' || id === 'cond'),
    'text encoder': pick((id) => id === 'te'),
    '50 blocks': pick((id) => /^b\d+\./.test(id)),
    'VAE': pick((id) => id.startsWith('vae.')),
    'image out': [root.wsInspect.picture],
  };
  return Object.fromEntries(Object.entries(parts).map(([text, objects]) => {
    const els = [...root.querySelectorAll('.ws-label')].filter((el) => el.textContent === text);
    if (els.length !== 1) return [text, { count: els.length }];
    const r = els[0].getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, a = area(objects);
    const off = Math.max(a.left - cx, cx - a.right, a.top - cy, cy - a.bottom, 0);
    return [text, { count: 1, shown: getComputedStyle(els[0]).display !== 'none' && r.width > 0, off: Math.round(off) }];
  }));
});

test('labels sit on their own parts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${POST}?scene-debug`, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await expect.poll(() => figure.evaluate((root) => !!(root.wsInspect && root.wsInspect.drawn))).toBe(true);
  const onParts = (offsets) => Object.entries(offsets).forEach(([text, o]) => {
    expect(o, text).toMatchObject({ count: 1, shown: true });
    expect(o.off, `${text} is ${o.off}px away from its parts`).toBeLessThanOrEqual(24);
  });
  onParts(await labelOffsets(figure));

  // Rotate the view by dragging: the labels move with their parts.
  const canvas = figure.locator('.ws-3d canvas');
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  onParts(await labelOffsets(figure));
});

test('path runs around the U and ends with an arrow at the painting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${POST}?scene-debug`, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await expect.poll(() => figure.evaluate((root) => !!(root.wsInspect && root.wsInspect.drawn))).toBe(true);
  const drawn = await figure.evaluate((root) => {
    const world = (o) => { const a = o.geometry.getAttribute('position'), V = o.position.constructor, out = [];
      for (let i = 0; i < a.count; i++) out.push(new V(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(o.matrixWorld).toArray());
      return out; };
    const { path, arrow, picture } = root.wsInspect;
    if (!path || !arrow) return null;
    picture.geometry.computeBoundingBox();
    const box = picture.geometry.boundingBox.clone().applyMatrix4(picture.matrixWorld);
    return { path: world(path), arrow: world(arrow), picture: [box.min.x, box.max.x] };
  });
  expect(drawn, 'a path line and an arrowhead in the scene').not.toBeNull();
  const { path, arrow, picture } = drawn;

  // AI Frontier's viewer (WspImage3D) draws the prompt's path from x = -9.2 on the z = -3.3 arm, around a
  // half circle of radius 3.3 past block 24 (x = 24 x 0.72 + 0.6), and back on z = +3.3 to the painting.
  const [first, last] = [path[0], path[path.length - 1]];
  expect(first[0]).toBeCloseTo(-9.2, 3); expect(first[2]).toBeCloseTo(-3.3, 3);
  expect(Math.max(...path.map((p) => p[0]))).toBeCloseTo(24 * 0.72 + 0.6 + 3.3, 2);
  expect(last[2]).toBeCloseTo(3.3, 3);
  expect(last[0]).toBeGreaterThan(picture[0]); expect(last[0]).toBeLessThan(picture[1]);   // it ends under the painting
  // The arrowhead's two strokes start at the path's end and point back along it (toward +x).
  const tips = arrow.filter((p) => Math.abs(p[0] - last[0]) < 1e-6 && Math.abs(p[2] - last[2]) < 1e-6);
  const tails = arrow.filter((p) => !tips.includes(p));
  expect(tips.length).toBe(2);
  expect(tails.length).toBe(2);
  for (const t of tails) expect(t[0]).toBeGreaterThan(last[0]);
  expect(tails[0][2] < last[2]).not.toBe(tails[1][2] < last[2]);   // one stroke on each side
});

// The step number shown by a "step n of 21" read-out.
const stepOf = async (figure) => parseInt((await figure.locator('.tval').textContent()).split(' ')[1], 10);

test('painting plays through the steps and stops', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto(POST, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting'), play = figure.locator('.play');

  // Off screen it rests on Astra's choice; the first time it is seen it plays from the original.
  await expect(figure.locator('.tval')).toHaveText('step 20 of 21');
  await page.waitForTimeout(300);
  await expect(play).not.toHaveAttribute('data-playing', 'true');
  await figure.scrollIntoViewIfNeeded();
  await expect(play).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => stepOf(figure)).toBeLessThan(5);

  // Pause holds the step.
  await play.click();
  const held = await stepOf(figure);
  await page.waitForTimeout(1200);
  expect(await stepOf(figure)).toBe(held);

  // Play runs to the last recorded step and stops there.
  await play.click();
  await expect(figure.locator('.tval')).toHaveText('step 21 of 21', { timeout: 30000 });
  await expect(play).toHaveAttribute('data-playing', 'false');
});

test('painting does not play by itself with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(POST, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await figure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await expect(figure.locator('.play')).not.toHaveAttribute('data-playing', 'true');
  await expect(figure.locator('.tval')).toHaveText('step 20 of 21');
});

// How many drawn parts a figure's legend covers: the car scene's parts, or each box of the 3D view.
const drawnParts = (figure) => figure.evaluate((root) => {
  const parts = [...root.querySelectorAll('[data-part]')].map((el) => el.getBoundingClientRect());
  if (root.wsInspect) {
    const { camera, renderer } = root.wsInspect.stage, canvas = renderer.domElement.getBoundingClientRect();
    for (const mesh of Object.values(root.wsInspect.meshes)) {
      mesh.geometry.computeBoundingBox();
      const { min, max } = mesh.geometry.boundingBox, V = mesh.position.constructor, xs = [], ys = [];
      for (let i = 0; i < 8; i++) {
        const p = new V(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(mesh.matrixWorld).project(camera);
        xs.push(canvas.left + (p.x + 1) / 2 * canvas.width); ys.push(canvas.top + (1 - p.y) / 2 * canvas.height);
      }
      parts.push({ left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) });
    }
  }
  const legend = root.querySelector('.ws-legend').getBoundingClientRect();
  return parts.filter((r) => r.left < legend.right && r.right > legend.left && r.top < legend.bottom && r.bottom > legend.top).length;
});

test('figures fit a phone screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${POST}?scene-debug`, { waitUntil: 'load' });
    const painting = page.locator('#ws-painting'), car = page.locator('#ws-car');
    await expect.poll(() => painting.evaluate((root) => !!(root.wsInspect && root.wsInspect.drawn))).toBe(true);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const column = await page.locator('.post-main').boundingBox();
    for (const figure of [car, painting]) {
      const report = await figure.evaluate((root, c) => {
        const name = (el) => `${el.tagName.toLowerCase()}.${el.getAttribute('class') || ''} ${el.textContent.trim().slice(0, 20)}`;
        const outside = [...root.querySelectorAll('.ctrls, .ws-view > svg, canvas, .ws-legend, img')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.left < c.x - 0.5 || r.right > c.x + c.width + 0.5; })
          .map(name);
        const drawing = root.querySelector('.ws-view > svg, .ws-view canvas').getBoundingClientRect();
        const legend = root.querySelector('.ws-legend').getBoundingClientRect();
        // every 3D label stays inside the drawing, so none is cut off at the edge
        const cut = [...root.querySelectorAll('.ws-label')].filter((el) => { const r = el.getBoundingClientRect();
          return r.left < drawing.left - 0.5 || r.right > drawing.right + 0.5 || r.top < drawing.top - 0.5 || r.bottom > drawing.bottom + 0.5; }).map(name);
        // and no two labels cover each other
        const chips = [...root.querySelectorAll('.ws-label')].map((el) => [el.textContent, el.getBoundingClientRect()]);
        const overlaps = [];
        chips.forEach(([a, r], i) => chips.slice(i + 1).forEach(([b, q]) => {
          if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) overlaps.push(`${a} / ${b}`);
        }));
        return { outside, cut, overlaps, legendAbove: legend.bottom <= drawing.top + 0.5, drawingHeight: drawing.height };
      }, column);
      expect(report.overlaps, `labels overlapping at ${width}px`).toEqual([]);
      expect(report.outside).toEqual([]);
      expect(report.cut, `labels cut at ${width}px`).toEqual([]);
      expect(report.legendAbove).toBe(true);
      expect(report.drawingHeight).toBeGreaterThan(80);
    }

    // Each legend sits where nothing is drawn: no box of the 3D view, and no part of the car scene at any time.
    for (const step of ['20', '11', '0']) {
      await painting.locator('.scrub').fill(step);
      expect(await drawnParts(painting), `painting legend at ${width}px, step ${step}`).toBe(0);
    }
    for (const t of ['0', '1.3', '2.6', '3.9', '5.2']) {
      await car.locator('.scrub').fill(t);
      expect(await drawnParts(car), `car legend at ${width}px, ${t} s`).toBe(0);
    }
  }
});

// Every shape element of the replay SVG in Takehi et al.'s post (carjump_scene.svg), as it was first copied here.
// The figure is redrawn for this post, so none of them may remain.
const SOURCE_SHAPES = [
  "<circle r=\"0.0264\" fill=\"#262b31\" />",
  "<circle r=\"0.0274\" fill=\"#262b31\" />",
  "<circle r=\"0.22006\" fill=\"#14a83a\" stroke=\"#262b31\" stroke-width=\"0.009\" />",
  "<circle r=\"0.22853\" fill=\"#a3a8ae\" stroke=\"#262b31\" stroke-width=\"0.009\" />",
  "<line x1=\"0\" y1=\"0\" x2=\"0.1981\" y2=\"0\" stroke=\"#262b31\" stroke-width=\"0.0144\" />",
  "<line x1=\"0\" y1=\"0\" x2=\"0.2057\" y2=\"0\" stroke=\"#262b31\" stroke-width=\"0.0144\" />",
  "<polygon data-part=\"ramp\" points=\"1.98,0.8175 2.5535,0.4074 2.475,0.2975 1.9015,0.7076\" fill=\"#d4d4d8\" />",
  "<polygon data-part=\"strip\" points=\"2.065,0.4525 2.065,0.3525 1.18,0.3525 1.18,0.4525\" fill=\"#dc4242\" />",
  "<polygon points=\"0.2075,0.3825 0.2075,-0.3825 -0.2075,-0.3825 -0.2075,0.3825\" fill=\"#1c6fcf\" stroke=\"#262b31\" stroke-width=\"0.009\" />",
  "<polygon points=\"0.3325,0.11 0.3325,-0.11 -0.3325,-0.11 -0.3325,0.11\" fill=\"#a3a8ae\" stroke=\"#262b31\" stroke-width=\"0.009\" />",
  "<polygon points=\"0.3325,0.11 0.3325,-0.11 -0.3325,-0.11 -0.3325,0.11\" fill=\"#a3a8ae\" stroke=\"#d93a4b\" stroke-width=\"0.018\" />",
  "<rect x=\"-1\" y=\"0.3\" width=\"1\" height=\"2.3499999999999996\" fill=\"#d4d4d8\" />",
  "<rect x=\"0\" y=\"0.09999999999999998\" width=\"5\" height=\"0.30000000000000004\" fill=\"#d4d4d8\" />",
  "<rect x=\"5\" y=\"0.3\" width=\"1\" height=\"2.3499999999999996\" fill=\"#d4d4d8\" />",
  "<rect x=\"8\" y=\"8\" width=\"918\" height=\"243\" />"
];
// sha256 of the 14 recorded tracks (type|dur|keyTimes|values, in order) in that same copy: the motion must stay as recorded.
const RECORDED_MOTION = 'f7507280a7b6a1d45c89dad671678a0967580097661bb23cc1aa588ea44a88d2';

test('the car figure is drawn for this post and keeps the recorded motion', async () => {
  expect(SOURCE_SHAPES.filter((shape) => SCENE.includes(shape))).toEqual([]);
  expect(SCENE).not.toMatch(/carjump_scene/);
  const tracks = [...SCENE.matchAll(/<animateTransform [^>]*>/g)].map(([tag]) =>
    ['type', 'dur', 'keyTimes', 'values'].map((k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) || [])[1]).join('|'));
  expect(tracks).toHaveLength(14);
  expect(require('crypto').createHash('sha256').update(tracks.join('\n')).digest('hex')).toBe(RECORDED_MOTION);
  for (const part of ['ramp', 'strip', 'goal']) expect(SCENE).toContain(`data-part="${part}"`);
});

test('the car caption credits the recorded motion', async ({ page }) => {
  // The car figure is drawn for this post, but its motion is recorded from Takehi et al.'s replay.
  await page.goto(POST, { waitUntil: 'load' });
  const caption = page.locator('#ws-car > figcaption');
  await expect(caption).toContainText('motion recorded from');
  await expect(caption.locator('a[href="https://rikiyat.github.io/blog/weight-space-programming/"]')).toHaveText('Takehi et al.');
});

test('the painting caption says the paintings are drawn by code', async ({ page }) => {
  // The paintings are not the experiment's outputs, so the figure must say so and point to the real ones.
  await page.goto(POST, { waitUntil: 'load' });
  const caption = page.locator('#ws-painting > figcaption');
  await expect(caption).toContainText('drawn by code');
  await expect(caption).toContainText("each step's similarity score");
  await expect(caption.locator('a[href="https://aifrontier.kr/ko/articles/weight-space-programming-lab/"]')).toHaveCount(1);
});

test('no painting image files ship', async ({ page }) => {
  // The paintings are drawn by code in the page, so no image file of them is stored or fetched.
  const root = path.join(__dirname, '../..'), folder = '/img/weight-space-programming/';
  const fetched = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith(folder)) fetched.push(new URL(r.url()).pathname); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${POST}?scene-debug`, { waitUntil: 'load' });
  const figure = page.locator('#ws-painting');
  await expect.poll(() => figure.evaluate((root) => !!(root.wsInspect && root.wsInspect.drawn))).toBe(true);
  await figure.locator('.scrub').fill('13');
  await expect(figure.locator('.tval')).toHaveText('step 13 of 21');
  await page.waitForTimeout(300);
  expect(fetched).toEqual([]);
  expect(PAINTING.steps.filter((s) => 'image' in s || 'source_image' in s).map((s) => s.step)).toEqual([]);
  expect(fs.existsSync(path.join(root, folder))).toBe(false);
});
