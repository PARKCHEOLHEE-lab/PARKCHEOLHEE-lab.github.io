// @ts-check
const { test, expect } = require('@playwright/test');

// the footer every page shares (default.html): the site's external links, as icons (_config.yml)

test('the footer links GitHub, the resume, the architectural portfolio and, last, the mail address', async ({ page }) => {
  await page.goto('/onnx/');
  const nav = page.locator('body > footer nav');
  const links = [
    ['Github', 'https://github.com/PARKCHEOLHEE-lab'],
    ['resume', '/assets/docs/resume.pdf'],
    ['Architectural portfolio', '/assets/docs/portfolio-architectural.pdf'],
    ['Mail', 'mailto:park112368@gmail.com']
  ];
  for (const [label, href] of links) {
    await expect(nav.locator(`a[href="${href}"] svg[aria-label="${label}"]`)).toBeVisible();
  }
  await expect(nav.locator('a')).toHaveCount(links.length);
  expect(await nav.locator('a').evaluateAll((items) => items.map((a) => a.getAttribute('href')))).toEqual(links.map(([, href]) => href));
});

for (const width of [390, 1240]) {
  test(`at ${width}px the footer's first icon starts on the column's left edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/onnx/');
    const footer = page.locator('body > footer');
    const left = await footer.evaluate((element) => element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft));
    const icon = await footer.locator('nav a').first().boundingBox();
    expect(icon.x).toBeCloseTo(left, 0);
  });
}

for (const width of [390, 820, 1240, 1920]) {
  test(`at ${width}px the footer is as tall as the header`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/onnx/');
    const header = await page.locator('body > header').boundingBox();
    const footer = await page.locator('body > footer').boundingBox();
    expect(footer.height).toBeCloseTo(header.height, 0);
  });
}
