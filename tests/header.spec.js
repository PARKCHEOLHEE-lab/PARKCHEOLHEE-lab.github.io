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
    expect(greys.darkest).toBeLessThan(60);

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

    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    greys = await header_greys(page);
    expect(greys.end).toBeLessThan(15);
    expect(greys.lightest).toBeGreaterThan(200);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(async () => {
      const { end, darkest } = await header_greys(page);
      return end > 240 && darkest < 60;
    }).toBe(true);
  });
}

test('a page without the side panel keeps its link in the header on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/onnx/');
  await expect(page.locator('body > header nav')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
});
