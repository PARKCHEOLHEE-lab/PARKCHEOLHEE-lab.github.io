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

test('the panel\'s checkboxes and radio buttons are in the colour of a post\'s marked Contents entry', async ({ page }) => {
  await page.goto('/image-to-3d-scene/');
  const marked = await page.locator('#post-side [aria-current]').evaluate((link) => getComputedStyle(link).color);
  await page.goto('/manifest/');
  // a chosen box is a white square, its edge and its thin mark in that colour: a type's a tick (its
  // right side and bottom, turned), the sort's a short line (its top)
  for (const [box, side] of [[page.locator('#note-type-filter input').first(), 'Right'], [page.locator('#note-sort input:checked'), 'Top']]) {
    await expect(box).toBeChecked();
    await expect(box).toHaveCSS('border-radius', '0px');
    await expect(box).toHaveCSS('border-top-color', marked);
    await expect(box).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const mark = await box.evaluate((input, side) => {
      const style = getComputedStyle(input, '::after');
      return [style[`border${side}Color`], style[`border${side}Width`]];
    }, side);
    expect(mark).toEqual([marked, '1px']);
  }
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

const row_titled = (page, title) => page.locator('#note-list .note-post-item', { has: page.locator('.post-title', { hasText: title }) });

test('the search finds posts by their text, with a piece of it beside each title on one line, and the count is a number', async ({ page }) => {
  await page.goto('/manifest/');
  const one_line = (await page.locator('.note-post-item .post-row').first().boundingBox()).height;
  // neither word is in this post's title, only in its text
  await page.locator('#note-search').fill('masked attention');
  const fancy = row_titled(page, 'Fancy Indexing Cheat Sheet');
  await expect(fancy).toBeVisible();
  await expect(fancy.locator('.note-snippet mark')).toHaveText(['Masked', 'Attention']);
  // the row keeps its height, and the first word found shows inside the piece
  expect(Math.abs((await fancy.locator('.post-row').boundingBox()).height - one_line)).toBeLessThan(0.5);
  const piece = await fancy.locator('.note-snippet').boundingBox();
  const word = await fancy.locator('.note-snippet mark').first().boundingBox();
  expect(word.x + word.width).toBeLessThanOrEqual(piece.x + piece.width);
  const shown = await shown_rows(page).count();
  expect(shown).toBeGreaterThan(0);
  await expect(page.locator('.note-search-count')).toHaveText(String(shown));
  await expect(page).toHaveURL(/\/manifest\/\?q=masked%20attention$/);

  await page.locator('#note-search').fill('언어');
  await expect(row_titled(page, 'verbalization loss')).toBeVisible();
  await expect(row_titled(page, 'verbalization loss').locator('.note-snippet mark').first()).toHaveText('언어');
});

test('the address brings a search back, it keeps the type filter, and Escape clears it', async ({ page }) => {
  await page.goto('/manifest/?q=attention&type=note');
  await expect(page.locator('#note-search')).toHaveValue('attention');
  await expect.poll(() => shown_rows(page).count()).toBeGreaterThan(0);
  for (const icon of await shown_rows(page).locator('.emoji-image').evaluateAll((images) => images.map((image) => image.getAttribute('src')))) {
    expect(['/emoji/default.png', '/emoji/default-empty.png']).toContain(icon);
  }
  const total = await page.locator('#note-list .note-post-item').count();
  const notes = Number((await page.locator('#note-type-filter label', { hasText: 'Note' }).locator('.note-filter-count').textContent()));
  expect(await shown_rows(page).count()).toBeLessThan(notes);

  await page.locator('#note-search').press('Escape');
  await expect(page.locator('#note-search')).toHaveValue('');
  await expect(page.locator('.note-snippet')).toHaveCount(0);
  await expect(page.locator('.note-search-count')).toHaveText('');
  await expect(shown_rows(page)).toHaveCount(notes);
  await expect(page).toHaveURL(/\/manifest\/\?type=note$/);
  expect(total).toBeGreaterThan(notes);

  // the clear button shows with words in the box, and empties it
  const clear = page.getByRole('button', { name: 'Clear search' });
  await expect(clear).toBeHidden();
  await page.locator('#note-search').fill('attention');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(page.locator('#note-search')).toHaveValue('');
  await expect(page.locator('#note-search')).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(shown_rows(page)).toHaveCount(notes);
});

test('"/" goes to the search box', async ({ page }) => {
  await page.goto('/manifest/');
  await page.keyboard.press('/');
  await expect(page.locator('#note-search')).toBeFocused();
});

for (const width of [390, 1280]) {
  test(`at ${width}px the search box sits over the list, as wide as it, and not in the panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/manifest/');
    const box = await page.locator('.note-search').boundingBox();
    const list = await page.locator('#note-list').boundingBox();
    expect(Math.round(box.x)).toBe(Math.round(list.x));
    expect(Math.round(box.width)).toBe(Math.round(list.width));
    expect(Math.round(box.y + box.height)).toBe(Math.round(list.y));
    expect(await page.locator('#note-menu .note-search').count()).toBe(0);
  });
}

for (const width of [360, 1280, 1920]) {
  test(`at ${width}px the search box is as tall as a row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/manifest/');
    const box = (await page.locator('.note-search').boundingBox()).height;
    const row = (await page.locator('.note-post-item .post-row').first().boundingBox()).height;
    expect(Math.abs(box - row)).toBeLessThan(0.5);
  });
}

test('the search box keeps its height while typing, between the rows\' dotted lines', async ({ page }) => {
  await page.goto('/manifest/');
  const box = page.locator('.note-search');
  const empty = (await box.boundingBox()).height;
  await page.locator('#note-search').fill('attention');
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  expect((await box.boundingBox()).height).toBe(empty);

  const top = await box.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopStyle, style.borderTopWidth, style.borderTopColor];
  });
  const row = await page.locator('.note-post-item .post-row').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderBottomStyle, style.borderBottomWidth, style.borderBottomColor];
  });
  expect(top).toEqual(row);
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

// on an iPhone a fade on hover kept a swipe from sliding a cut-off title until its row had been tapped, so
// rows and links fade only where a pointer hovers
test('a row and a link fade on hover with a mouse, and never on a touch screen', async ({ browser, baseURL }) => {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    await page.goto('/manifest/');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(touch);
    for (const item of [page.locator('#note-list .clickable').first(), page.locator('body > header a').first()]) {
      await item.hover();
      // past the 0.5s fade
      await page.waitForTimeout(600);
      await expect(item).toHaveCSS('opacity', touch ? '1' : '0.5');
    }
    await context.close();
  }
});

