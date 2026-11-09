// @ts-check
const { test, expect } = require('@playwright/test');

const shown_rows = (page) => page.locator('#note-list .note-post-item:visible');
const type_box = (page, icon) => page.locator(`#note-type-filter input[value="/emoji/${icon}.png"]`);

test('type filter: unchecked types hide, and every type can be unchecked', async ({ page }) => {
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
  await expect(shown_rows(page)).toHaveCount(0);
  for (const box of await boxes.all()) {
    await expect(box).not.toBeChecked();
  }
  await expect(page).toHaveURL(/\/manifest\/\?type=$/);
  await page.reload();
  await expect(shown_rows(page)).toHaveCount(0);
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
  // the rows' dotted line over the first row too
  await expect(page.locator('#note-list')).toHaveCSS('border-top-style', 'dotted');
  // the panel's headings in the header link's size and weight
  const link = await page.locator('body > header nav a').evaluate((a) => [getComputedStyle(a).fontSize, getComputedStyle(a).fontWeight]);
  for (const summary of await page.locator('.note-filter summary').all()) {
    expect(await summary.evaluate((s) => [getComputedStyle(s).fontSize, getComputedStyle(s).fontWeight])).toEqual(link);
  }
});

test('a hidden post (Reading List) is not listed, and its page still opens', async ({ page }) => {
  await page.goto('/manifest/');
  await expect(page.locator('#note-list .post-title', { hasText: 'Reading List' })).toHaveCount(0);
  await expect(page.locator('#note-list .post-title', { hasText: 'latentspace.' })).toHaveCount(1);
  const response = await page.goto('/reading-list/');
  expect(response.status()).toBe(200);
  await expect(page.locator('body > article')).toContainText('Reading List');
});

test('Testbed is the first type in the panel', async ({ page }) => {
  await page.goto('/manifest/');
  await expect(page.locator('#note-type-filter input').first()).toHaveAttribute('value', '/emoji/puzzle.png');
});

test('dragging the mouse over types gives them all the first one\'s new state, and a click still flips one', async ({ page }) => {
  await page.goto('/manifest/');
  const labels = page.locator('#note-type-filter label');
  const boxes = page.locator('#note-type-filter input');
  const first = await labels.nth(0).boundingBox();
  const third = await labels.nth(2).boundingBox();
  await page.mouse.move(first.x + 4, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + 4, third.y + third.height / 2, { steps: 8 });
  await page.mouse.up();
  const checked = await boxes.evaluateAll((items) => items.map((item) => item.checked));
  expect(checked.slice(0, 3)).toEqual([false, false, false]);
  expect(checked.slice(3).every(Boolean)).toBe(true);
  const counts = (await page.locator('.note-filter-count').allTextContents()).map(Number);
  await expect(shown_rows(page)).toHaveCount(counts.slice(3).reduce((sum, count) => sum + count, 0));

  await labels.nth(1).click();
  await expect(boxes.nth(1)).toBeChecked();
  await expect(boxes.nth(0)).not.toBeChecked();
});

test('a choice other than every type and Newest stays in the address, and the address brings it back', async ({ page }) => {
  await page.goto('/manifest/');
  const radio = (name) => page.locator('#note-sort').getByRole('radio', { name, exact: true });
  await type_box(page, 'default').click();
  await radio('Oldest').check();
  await expect(page).toHaveURL(/\/manifest\/\?type=testbed,[a-z,]+&sort=oldest$/);
  expect(page.url()).not.toContain('note');

  await page.goto(page.url());
  await expect(type_box(page, 'default')).not.toBeChecked();
  await expect(type_box(page, 'puzzle')).toBeChecked();
  await expect(radio('Oldest')).toBeChecked();

  await type_box(page, 'default').click();
  await radio('Newest').check();
  await expect(page).toHaveURL(/\/manifest\/$/);

  // names and sorts that do not exist are left out
  await page.goto('/manifest/?type=nothing,testbed&sort=sideways');
  await expect(page.locator('#note-type-filter input:checked')).toHaveCount(1);
  await expect(type_box(page, 'puzzle')).toBeChecked();
  await expect(radio('Newest')).toBeChecked();
  await expect(page).toHaveURL(/\/manifest\/\?type=testbed$/);
});

for (const width of [360, 390]) {
  test(`on a ${width}px phone the menu button opens the panel from the right, over the list`, async ({ page }) => {
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

for (const width of [768, 820]) {
  test(`on a ${width}px tablet the panel sits beside the list and the header keeps its link`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto('/manifest/');
    const panel = await page.locator('#note-menu').boundingBox();
    const row = await page.locator('#note-list .post-row').first().boundingBox();
    expect(panel.x + panel.width).toBeLessThan(row.x);
    await expect(page.locator('#note-sort')).toBeVisible();
    await expect(page.locator('body > header nav')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
  });
}
