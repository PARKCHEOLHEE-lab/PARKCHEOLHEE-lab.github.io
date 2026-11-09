// @ts-check
const { test, expect } = require('@playwright/test');

const shown_rows = (page) => page.locator('#note-list .note-post-item:visible');
const type_box = (page, icon) => page.locator(`#note-type-filter input[value="/emoji/${icon}.png"]`);

test('type filter: unchecked types hide, and unchecking the last one checks them all again', async ({ page }) => {
  await page.goto('/manifest/');
  const total = await page.locator('#note-list .note-post-item').count();
  const boxes = page.locator('#note-type-filter input');
  for (const box of await boxes.all()) {
    await expect(box).toBeChecked();
  }

  for (const box of await boxes.all()) {
    if ((await box.getAttribute('value')) !== '/emoji/puzzle.png') {
      await box.click();
    }
  }
  const testbed = await shown_rows(page).count();
  expect(testbed).toBeGreaterThan(0);
  expect(testbed).toBeLessThan(total);
  for (const icon of await shown_rows(page).locator('.emoji-image').evaluateAll((images) => images.map((image) => image.getAttribute('src')))) {
    expect(icon).toBe('/emoji/puzzle.png');
  }

  await type_box(page, 'puzzle').click();
  await expect(shown_rows(page)).toHaveCount(total);
  for (const box of await boxes.all()) {
    await expect(box).toBeChecked();
  }
});

test('sort by: pinned rows stay on top, and Oldest puts the oldest post first', async ({ page }) => {
  await page.goto('/manifest/');
  const rows = page.locator('#note-list .note-post-item');
  const sort = (name) => page.locator('#note-sort').getByRole('radio', { name, exact: true });
  const icons = () => rows.locator('.emoji-image').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  const pinned = (await icons()).filter((icon) => icon === '/emoji/pin.png').length;
  expect(pinned).toBeGreaterThan(0);
  await expect(sort('Newest')).toBeChecked();
  for (const name of ['Oldest', 'A–Z', 'Type', 'Newest']) {
    await sort(name).check();
    const order = await icons();
    expect(order.slice(0, pinned).every((icon) => icon === '/emoji/pin.png')).toBe(true);
    expect(order.slice(pinned).includes('/emoji/pin.png')).toBe(false);
  }

  await sort('Oldest').check();
  const times = await rows.evaluateAll((items) => items.map((item) => Date.parse(item.querySelector('time').getAttribute('datetime'))));
  const posts = times.slice(pinned);
  expect(posts).toEqual([...posts].sort((a, b) => a - b));
});

test('on a wide screen the panel and the list share the page column, the panel under the logo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/manifest/');
  const panel = await page.locator('.note-filter').boundingBox();
  const row = await page.locator('#note-list .post-row').first().boundingBox();
  const logo = await page.locator('.title-main').boundingBox();
  // the right edge of the article's content, where the rows ended before the panel
  const column_right = await page.locator('body > article').evaluate((article) => article.getBoundingClientRect().right - parseFloat(getComputedStyle(article).paddingRight));
  expect(Math.round(panel.x)).toBe(Math.round(logo.x));
  expect(panel.x + panel.width).toBeLessThan(row.x);
  expect(Math.round(row.x + row.width)).toBe(Math.round(column_right));
  await expect(page.locator('#note-sort')).toBeVisible();
});

test('Testbed is the first type in the panel', async ({ page }) => {
  await page.goto('/manifest/');
  await expect(page.locator('#note-type-filter input').first()).toHaveAttribute('value', '/emoji/puzzle.png');
});

for (const width of [390, 820]) {
  test(`at ${width}px the menu button opens the panel from the right, over the list`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/manifest/');
    const menu = page.locator('#note-menu');
    const header = page.locator('body > header');
    await expect(menu).toBeHidden();
    await expect(header.locator('nav')).toBeHidden();

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'manifest' })).toBeVisible();
    await expect.poll(async () => {
      const box = await menu.boundingBox();
      return [Math.round(box.x + box.width), Math.round(box.y)];
    }).toEqual([width, Math.round((await header.boundingBox()).height)]);

    const total = await page.locator('#note-list .note-post-item').count();
    await type_box(page, 'puzzle').click();
    const testbed = await page.locator('#note-list .emoji-image[src="/emoji/puzzle.png"]').count();
    await expect(shown_rows(page)).toHaveCount(total - testbed);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });
}
