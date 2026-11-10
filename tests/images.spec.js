// @ts-check
const { test, expect } = require('@playwright/test');

// a post's content images (_plugins/image_sizes.py, basic.sass): each loads only near the screen, and until
// it arrives a gray, shimmering skeleton holds the exact box it will fill

// holds an image's response until the test lets it go
async function hold(page, pattern) {
  let release;
  const released = new Promise((resolve) => (release = resolve));
  await page.route(pattern, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

test('a content image keeps its own box under a skeleton until it arrives, and the box stays put', async ({ page }) => {
  const release = await hold(page, '**/img/two-points-perspective.jpg');
  await page.goto('/two-points-perspective/', { waitUntil: 'domcontentloaded' });
  const image = page.locator('img[src="/img/two-points-perspective.jpg"]');
  await expect(image).toHaveAttribute('data-skeleton', '');
  // the post's first image loads at once, as the one a reader sees first
  await expect(image).not.toHaveAttribute('loading');
  // the comments skeleton's gray ($skeleton), with the shimmer sweeping over it
  await expect(image).toHaveCSS('background-color', 'rgb(236, 236, 236)');
  await expect(image).toHaveCSS('animation-name', 'image-shimmer');
  // the post's 60% width, at the image's own 1762 x 668
  const waiting = await image.boundingBox();
  expect(waiting.height).toBeGreaterThan(0);
  expect(waiting.width / waiting.height).toBeCloseTo(1762 / 668, 2);

  release();
  await expect(image).not.toHaveAttribute('data-skeleton');
  await expect(image).toHaveCSS('animation-name', 'none');
  expect(await image.evaluate((img) => img.naturalWidth)).toBe(1762);
  const arrived = await image.boundingBox();
  expect(Math.abs(arrived.height - waiting.height)).toBeLessThan(0.5);
  expect(Math.abs(arrived.width - waiting.width)).toBeLessThan(0.5);
});

test('an image far down a post is not fetched until the reader scrolls to it', async ({ page }) => {
  const fetched = new Set();
  page.on('request', (request) => fetched.add(new URL(request.url()).pathname));
  await page.goto('/apartment/');
  const last = page.locator('img[data-skeleton], img[loading="lazy"]').last();
  const src = await last.getAttribute('src');
  expect(fetched.has(src)).toBe(false);

  await last.scrollIntoViewIfNeeded();
  await expect(last).not.toHaveAttribute('data-skeleton');
  expect(fetched.has(src)).toBe(true);
});

test('when every copy of an image fails, its skeleton stops promising it', async ({ page }) => {
  // the image's own address and both fallback copies (handle_image_error: main, then dev) all fail
  await page.route('**/img/layout-vlm/layout-vlm-1.gif', (route) => route.fulfill({ status: 404 }));
  await page.route('https://media.githubusercontent.com/**', (route) => route.fulfill({ status: 404 }));
  await page.goto('/layout-vlm/', { waitUntil: 'domcontentloaded' });
  const image = page.locator('img[alt^="LayoutVLM"]').first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('data-fallback_tried', 'dev');
  await expect(image).not.toHaveAttribute('data-skeleton');
});

test('the skeleton rests for a reader who asks for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await hold(page, '**/img/two-points-perspective.jpg');
  await page.goto('/two-points-perspective/', { waitUntil: 'domcontentloaded' });
  const image = page.locator('img[src="/img/two-points-perspective.jpg"]');
  await expect(image).toHaveAttribute('data-skeleton', '');
  await expect(image).toHaveCSS('background-color', 'rgb(236, 236, 236)');
  await expect(image).toHaveCSS('animation-name', 'none');
});
