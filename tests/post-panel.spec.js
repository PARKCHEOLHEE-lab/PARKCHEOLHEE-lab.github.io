// @ts-check
const { test, expect } = require('@playwright/test');

// a post's side panel (post.html, setup_post_panel): Contents and Related, beside the post on wide
// screens, at its top and end on tablets, in the menu on phones

// a post with a table of contents and seven related posts, two of them with long titles
const POST = '/image-to-3d-scene/';

async function scroll_to(page, top) {
  // instant, as the site scrolls smoothly (scroll-behavior) and the panel is measured right after
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), top);
}

test('on a wide screen the panel sits in the margin left of the post, with Contents and Related', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const panel = page.locator('#post-side');
  await expect(panel.locator('.post-contents')).toBeVisible();
  await expect(panel.locator('.post-related')).toBeVisible();
  await expect(page.locator('.post-end')).toBeHidden();
  const box = await panel.boundingBox();
  const title = await page.locator('article h1').boundingBox();
  const text = await page.locator('article h3').first().boundingBox();
  // left of the post's column, which keeps its place beside it, and on the screen
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThan(title.x - 20);
  expect(text.x).toBeCloseTo(title.x, 0);
});

test('on a wide screen the panel stays below the header while the post scrolls, and ends inside the post', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const panel = page.locator('#post-side');
  const header = await page.locator('body > header').boundingBox();
  const em = await panel.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await scroll_to(page, 3000);
  expect((await panel.boundingBox()).y).toBeCloseTo(header.height + 1.5 * em, 0);
  await scroll_to(page, 1e6);
  const article = await page.locator('body > article').boundingBox();
  const box = await panel.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(article.y + article.height);
});

test('a table of contents taller than the screen scrolls inside the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/mathematics-for-machine-learning/');
  const panel = page.locator('#post-side');
  // once it stays below the header; at the top of the page it starts lower, under the post's title
  await scroll_to(page, 3000);
  const box = await panel.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  expect(await panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
});

test('Contents marks the section being read, one entry at a time, and follows a link to a section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const links = page.locator('#post-side .post-contents a');
  await expect(links.first()).toHaveAttribute('aria-current', 'location');
  await links.nth(3).click();
  await expect(links.nth(3)).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('#post-side [aria-current]')).toHaveCount(1);
});

test('each Related title stays on one line, a long one cut and shown whole on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const items = page.locator('#post-side .post-related a');
  await expect(items).toHaveCount(7);
  const line = await items.first().evaluate((link) => link.getBoundingClientRect().height);
  for (const item of await items.all()) {
    expect((await item.boundingBox()).height).toBeCloseTo(line, 0);
  }
  const long = items.filter({ hasText: 'DeepSDF' });
  expect(await long.locator('span').evaluate((span) => span.scrollWidth > span.clientWidth)).toBe(true);
  await expect(long).toHaveAttribute('title', 'DeepSDF: Learning Continuous Signed Distance Functions for Shape Representation');
});

test('a post without a table of contents has Related only, and one with neither has no panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/onnx/');
  await expect(page.locator('#post-side .post-contents')).toHaveCount(0);
  await expect(page.locator('#post-side .post-related')).toBeVisible();
  await page.goto('/cprofile/');
  await expect(page.locator('#post-side')).toHaveCount(0);
  await expect(page.locator('.post-end')).toHaveCount(0);
});

test('on a tablet Contents is at the top of the post and Related at its end', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(POST);
  const contents = page.locator('#post-side .post-contents');
  await expect(contents).toBeVisible();
  await expect(page.locator('#post-side .post-related')).toBeHidden();
  const related = page.locator('.post-end .post-related');
  await expect(related).toBeVisible();
  const first = await page.locator('article h3').first().boundingBox();
  const last = await page.locator('article h3').last().boundingBox();
  expect((await contents.boundingBox()).y).toBeLessThan(first.y);
  expect((await related.boundingBox()).y).toBeGreaterThan(last.y);
});

test('on a phone the panel is in the menu only, as one copy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(POST);
  await expect(page.locator('article .post-side-panel')).toHaveCount(2);
  for (const panel of await page.locator('article .post-side-panel').all()) {
    await expect(panel).toBeHidden();
  }
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.locator('#post-menu');
  await expect(menu.locator('.post-contents a').first()).toBeVisible();
  await expect(menu.locator('.post-related a')).toHaveCount(7);
  await expect(page.locator('[id="post-side"]')).toHaveCount(1);
});
