// @ts-check
const { test, expect } = require('@playwright/test');

// the Manifest, and a post
const PAGES = ['/manifest/', '/onnx/'];

// the header as drawn, in grey levels (0 black, 255 white): at its right end, just right of the logo,
// and the lightest and darkest inside the nav link
async function header_greys(page) {
  const header = page.locator('body > header');
  const box = await header.boundingBox();
  const logo = await header.locator('.title-main').boundingBox();
  const link = await header.locator('nav a').boundingBox();
  const png = (await page.screenshot({ clip: box })).toString('base64');
  return page.evaluate(async ({ png, box, logo, link }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const scale = image.width / box.width;
    const grey = (x, y) => context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data[0];
    const area = context.getImageData((link.x - box.x) * scale, (link.y - box.y) * scale, link.width * scale, link.height * scale).data;
    const reds = area.filter((_, i) => i % 4 === 0);
    return {
      end: grey(box.width - 4, box.height / 2),
      beside_logo: grey(logo.x - box.x + logo.width + 12, logo.y - box.y + logo.height / 2),
      lightest: Math.max(...reds),
      darkest: Math.min(...reds)
    };
  }, { png, box, logo, link });
}

test('the header is as tall on every screen as on a phone', async ({ page }) => {
  const heights = [];
  for (const width of [360, 390, 820, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/manifest/');
    heights.push(Math.round((await page.locator('body > header').boundingBox()).height));
  }
  expect(heights).toEqual(heights.map(() => 55));
});

for (const path of PAGES) {
  test(`${path}: the header stays at the top while the page scrolls`, async ({ page }) => {
    await page.goto(path);
    // the site scrolls smoothly (basic.sass), which would leave the page near the top when this checks
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    const header = page.locator('body > header');
    await expect(header).toBeInViewport();
    expect((await header.boundingBox()).y).toBe(0);
  });

  test(`${path}: once the page leaves the top, the logo box's black spreads over the header, and shrinks back at the top`, async ({ page }) => {
    await page.goto(path);
    const header = page.locator('body > header');
    await expect(header).toHaveCSS('border-bottom-style', 'none');
    await expect(header).toHaveCSS('box-shadow', 'none');
    let greys = await header_greys(page);
    expect(greys.end).toBeGreaterThan(240);
    // the link in the panels' text colour ($text-dark, 70) on the white bar, white on the black as the logo's words
    expect(greys.darkest).toBeCloseTo(70, -1);

    // halfway through, the black has spread past the logo but not yet to the far end; a fade would be
    // grey everywhere
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await page.waitForFunction(() => document.getAnimations().some((a) => a.transitionProperty === 'clip-path'));
    await page.evaluate(() => {
      const spread = document.getAnimations().find((a) => a.transitionProperty === 'clip-path');
      spread.pause();
      spread.currentTime = spread.effect.getTiming().duration / 2;
    });
    greys = await header_greys(page);
    expect(greys.beside_logo).toBeLessThan(15);
    expect(greys.end).toBeGreaterThan(240);

    // the header's transitions; a Testbed puzzle's shine runs for ever and has no end
    await page.evaluate(() => document.getAnimations().filter((a) => a.transitionProperty).forEach((a) => a.finish()));
    greys = await header_greys(page);
    expect(greys.end).toBeLessThan(15);
    expect(greys.lightest).toBeGreaterThan(245);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(async () => {
      const { end, darkest } = await header_greys(page);
      return end > 240 && Math.abs(darkest - 70) < 5;
    }).toBe(true);
  });
}

for (const width of [820, 1240, 1920]) {
  test(`at ${width}px the header's link ends on the column's right edge, where the Manifest's dates end`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/manifest/');
    const link = await page.locator('body > header nav a').last().boundingBox();
    const date = await page.locator('#note-list .note-date-time').first().boundingBox();
    expect(link.x + link.width).toBeCloseTo(date.x + date.width, 0);
  });
}

test('on a phone the Menu icon is in the links\' colour and folds into an X while the menu is open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/onnx/');
  const button = page.getByRole('button', { name: 'Menu' });
  const link = await page.locator('body > header nav a').evaluate((a) => getComputedStyle(a).color);
  await expect(button).toHaveCSS('color', link);
  // each line's box, from the icon's top left corner, in its 20-unit box
  const lines = () => page.evaluate(() => {
    const icon = document.querySelector('.site-menu-icon').getBoundingClientRect();
    return Array.from(document.querySelectorAll('.site-menu-icon path'), (path) => {
      const box = path.getBoundingClientRect();
      return { left: box.left - icon.left, top: box.top - icon.top, right: box.right - icon.left, bottom: box.bottom - icon.top, opacity: getComputedStyle(path).opacity };
    });
  });
  const closed = await lines();
  expect(closed.map((line) => [line.left, line.right])).toEqual([[3, 17], [3, 17], [3, 17]]);
  await button.click();
  // both outer lines across the square from (5, 5) to (15, 15), once the 0.25s fold is done
  await expect.poll(async () => {
    const [top, middle, bottom] = await lines();
    return [top.left, top.top, top.right, top.bottom, bottom.left, bottom.top, bottom.right, bottom.bottom, middle.opacity].map((v) => Math.round(Number(v)));
  }).toEqual([5, 5, 15, 15, 5, 5, 15, 15, 0]);
});

test('on a phone a post without a table of contents has the Menu button, with the site\'s link in its menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/onnx/');
  const menu = page.locator('#post-menu');
  await expect(page.locator('body > header nav')).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'manifest' })).toBeVisible();
  // in the panel's text colour, as in the header
  await expect(menu.getByRole('link', { name: 'manifest' })).toHaveCSS('color', 'rgb(70, 70, 70)');
  await expect(menu.locator('.section-nav')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('on a phone the X closes the menu, even where the browser closes it as the finger comes down', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/onnx/');
  const menu = page.locator('#post-menu');
  const button = page.getByRole('button', { name: 'Menu' });
  await button.click();
  await expect(menu).toBeVisible();
  await button.click();
  await expect(menu).toBeHidden();
  // a phone browser that treats the finger coming down on the X as a tap outside the menu closes it
  // there, before the X's click
  await button.click();
  await expect(menu).toBeVisible();
  await page.evaluate(() => {
    const menu = document.getElementById('post-menu');
    document.querySelector('.site-menu-button').addEventListener('pointerdown', () => menu.hidePopover());
  });
  await button.click();
  await page.waitForTimeout(300);
  await expect(menu).toBeHidden();
});

// a tap just beside the 20px X comes down on the header, which closes the menu, and Safari then moves
// the click onto the button, which would open it again
test('in Safari\'s engine, on a phone a tap just beside the X closes the menu', async ({ playwright, baseURL }) => {
  const browser = await playwright.webkit.launch();
  const context = await browser.newContext({ ...playwright.devices['iPhone 13'], baseURL });
  const page = await context.newPage();
  for (const path of ['/manifest/', '/onnx/']) {
    await page.goto(path);
    const menu = page.locator('.site-menu');
    const button = await page.getByRole('button', { name: 'Menu' }).boundingBox();
    await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    await expect(menu).toBeVisible();
    await page.touchscreen.tap(button.x - 8, button.y + button.height / 2);
    await page.waitForTimeout(400);
    await expect(menu).toBeHidden();
  }
  await browser.close();
});

test('with the menu open, a tap on the list beside it only closes the menu, in Chrome\'s and Safari\'s engines', async ({ playwright, baseURL }) => {
  for (const type of ['chromium', 'webkit']) {
    const browser = await playwright[type].launch();
    const page = await browser.newPage({ baseURL, viewport: { width: 600, height: 900 }, hasTouch: true });
    await page.goto('/manifest/');
    const menu = page.locator('.site-menu');
    await page.getByRole('button', { name: 'Menu' }).tap();
    await expect(menu).toBeVisible();
    // the row's left end, which the menu leaves uncovered
    const row = await page.locator('#note-list .clickable').nth(3).boundingBox();
    expect(row.x + 10).toBeLessThan((await menu.boundingBox()).x);
    await page.touchscreen.tap(row.x + 10, row.y + row.height / 2);
    await page.waitForTimeout(400);
    await expect(menu).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/manifest/');
    // with the menu closed, the same tap opens the post
    await page.touchscreen.tap(row.x + 10, row.y + row.height / 2);
    await page.waitForURL((url) => url.pathname !== '/manifest/');
    await browser.close();
  }
});

test('with the menu open, the list beside it does not answer the mouse, the menu does, and the page still scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/manifest/');
  const menu = page.locator('.site-menu');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(menu).toBeVisible();
  const row = page.locator('#note-list .clickable').nth(3);
  const box = await row.boundingBox();
  const point = { x: box.x + 10, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  // past the 0.5s fade
  await page.waitForTimeout(600);
  await expect(row).toHaveCSS('opacity', '1');
  expect(await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, point)).not.toBe('pointer');
  const link = menu.getByRole('link', { name: 'manifest' });
  await link.hover();
  await expect(link).toHaveCSS('opacity', '0.5');
  const top = await page.evaluate(() => window.scrollY);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top);
  await expect(menu).toBeVisible();
});

for (const path of ['/manifest/', '/image-to-3d-scene/']) {
  test(`${path}: in the phone menu each dotted line has as much space above it as below`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('.site-menu')).toBeVisible();
    // the white between the line and the nearest words, box or icon on each side
    const gaps = await page.evaluate(() => {
      const menu = document.querySelector('.site-menu');
      const boxes = [];
      const walker = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        boxes.push(range.getBoundingClientRect());
      }
      menu.querySelectorAll('input, img, svg').forEach((element) => boxes.push(element.getBoundingClientRect()));
      const shown = boxes.filter((box) => box.height > 0);
      // a line's top edge: the menu's links end with theirs, each later section starts with its own
      const lines = [menu.querySelector('nav').getBoundingClientRect().bottom - 1, ...Array.from(menu.querySelectorAll('details + details'), (details) => details.getBoundingClientRect().top)];
      return lines.map((y) => [
        y - Math.max(...shown.filter((box) => box.bottom <= y).map((box) => box.bottom)),
        Math.min(...shown.filter((box) => box.top >= y + 1).map((box) => box.top)) - (y + 1)
      ]);
    });
    expect(gaps.length).toBe(2);
    for (const [above, below] of gaps) {
      expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    }
  });
}

// Safari kept a closed menu drawn just off the screen, where the keyboard's Tab still reached its controls
test('in Safari\'s engine, on a phone the closed menu is not drawn off the screen, before or after it opens', async ({ playwright, baseURL }) => {
  const browser = await playwright.webkit.launch();
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } });
  for (const path of ['/manifest/', '/image-to-3d-scene/']) {
    await page.goto(path);
    const menu = page.locator('.site-menu');
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  await browser.close();
});

test('on a phone a post\'s table of contents is in its menu, and a link in it closes the menu with its heading below the header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/attention-attention/');
  const menu = page.locator('#post-menu');
  const header = page.locator('body > header');
  await expect(page.locator('article #toc')).toBeHidden();

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(menu.getByRole('link', { name: 'manifest' })).toBeVisible();
  const link = menu.locator('.section-nav a').nth(2);
  await expect(link).toBeVisible();
  const id = (await link.getAttribute('href')).slice(1);
  await link.click();
  await expect(menu).toBeHidden();
  // the page scrolls smoothly to the heading, which ends just below the header
  await expect.poll(async () => {
    const heading = await page.locator(`[id="${id}"]`).boundingBox();
    const bar = await header.boundingBox();
    return heading.y >= bar.height - 1 && heading.y < bar.height + 40;
  }).toBe(true);
});

test('from 768px a post keeps its table of contents in the post and its link in the header', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1024 });
  await page.goto('/attention-attention/');
  // in the post's side panel (setup_post_panel)
  await expect(page.locator('article #post-side .section-nav')).toBeVisible();
  await expect(page.locator('#post-menu')).toBeHidden();
  await expect(page.locator('body > header nav')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
});

// the width the site's links move into the header and a side panel beside its list is one design decision
// (DESIGN.md: tokens in _sass/index.sass), so the partials' media queries name the token instead of 768px
test('the panel breakpoint is one token: from 768px the header keeps its links, below it the menu has them', async ({ page }) => {
  for (const [width, in_header] of [[767, false], [768, true]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/manifest/');
    expect(await page.locator('body > header nav').isVisible()).toBe(in_header);
  }

  const fs = require('fs');
  const path = require('path');
  const sass_dir = path.join(__dirname, '..', '..', '_sass');
  const written = fs.readdirSync(sass_dir).filter((name) => name.endsWith('.sass'))
    .flatMap((name) => fs.readFileSync(path.join(sass_dir, name), 'utf8').split('\n'))
    .filter((line) => !line.trim().startsWith('//') && /\b(768|767\.98)px\b/.test(line));
  expect(written.length).toBeLessThanOrEqual(1);
});
