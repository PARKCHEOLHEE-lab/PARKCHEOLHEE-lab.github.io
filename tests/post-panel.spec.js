// @ts-check
const { test, expect } = require('@playwright/test');

// a post's side panel (post.html, setup_post_panel): Contents and Related, beside the post from 768px as
// the Manifest's panel is beside its list, in the menu on phones

// a post with a table of contents and seven related posts, two of them with long titles
const POST = '/image-to-3d-scene/';

async function scroll_to(page, top) {
  // instant, as the site scrolls smoothly (scroll-behavior) and the panel is measured right after
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), top);
}

for (const width of [820, 1280]) {
  test(`at ${width}px the panel takes the left of the page's column, under the logo, and the post the rest`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(POST);
    const panel = page.locator('#post-side');
    await expect(panel.locator('.post-contents')).toBeVisible();
    await expect(panel.locator('.post-related')).toBeVisible();
    const box = await panel.boundingBox();
    const logo = await page.locator('body > header .title-main').boundingBox();
    const title = await page.locator('article h1').boundingBox();
    const text = await page.locator('article h3').first().boundingBox();
    const em = await panel.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(box.x).toBeCloseTo(logo.x, 0);
    expect(title.x - (box.x + box.width)).toBeCloseTo(2.5 * em, 0);
    expect(text.x).toBeCloseTo(title.x, 0);
    // "Contents" sits on the title's line
    const centres = await page.evaluate(() => [document.querySelector('#post-side summary').firstChild, document.querySelector('article h1')].map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }));
    expect(Math.abs(centres[0] - centres[1])).toBeLessThanOrEqual(2);
  });
}

for (const width of [820, 1240, 1920]) {
  test(`at ${width}px the post panel's first heading is at the height of the Manifest panel's`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    // the middle of a node's words, from the top of the page
    const centre = (selector) => page.evaluate((selector) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(selector));
      const rect = range.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }, selector);
    await page.goto(POST);
    const post = await centre('#post-side summary');
    await page.goto('/manifest/');
    const manifest = await centre('.note-filter summary');
    const search = await page.locator('#note-search').boundingBox();
    expect(Math.abs(post - manifest)).toBeLessThanOrEqual(1);
    // on the search box's line, as the post's is on its title's
    expect(Math.abs(manifest - (search.y + search.height / 2))).toBeLessThanOrEqual(1);
  });
}

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

test('Related starts folded, under its heading, and opens on a click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const related = page.locator('#post-side .post-related');
  await expect(related.locator('summary')).toBeVisible();
  await expect(related.locator('a').first()).toBeHidden();
  await related.locator('summary').click();
  await expect(related.locator('a').first()).toBeVisible();
});

test('each Related title stays on one line, a long one cut and shown whole on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  await page.locator('#post-side .post-related summary').click();
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

test('each Contents entry stays on one line too, a long one cut and shown whole on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(POST);
  const items = page.locator('#post-side .post-contents a');
  const line = await items.first().evaluate((link) => link.getBoundingClientRect().height);
  for (const item of await items.all()) {
    expect((await item.boundingBox()).height).toBeCloseTo(line, 0);
  }
  const long = items.filter({ hasText: 'Post-Processing for Alignment Correction' });
  expect(await long.evaluate((link) => link.scrollWidth > link.clientWidth)).toBe(true);
  await expect(long).toHaveAttribute('title', 'Post-Processing for Alignment Correction');
});

test('a post without a table of contents has Related only, and one with neither has no panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/onnx/');
  await expect(page.locator('#post-side .post-contents')).toHaveCount(0);
  await expect(page.locator('#post-side .post-related')).toBeVisible();
  await page.goto('/cprofile/');
  await expect(page.locator('#post-side')).toHaveCount(0);
});

test('on a phone the panel is in the menu only, as one copy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(POST);
  await expect(page.locator('#post-side')).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.locator('#post-menu');
  await expect(menu.locator('.post-contents a').first()).toBeVisible();
  await expect(menu.locator('.post-related a')).toHaveCount(7);
  await expect(page.locator('[id="post-side"]')).toHaveCount(1);
});
