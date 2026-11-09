// @ts-check
const { test, expect } = require('@playwright/test');

// the footer every page shares (default.html): the site's external links, as icons (_config.yml)

test('the footer links the mail address, GitHub, the resume and the architectural portfolio', async ({ page }) => {
  await page.goto('/onnx/');
  const nav = page.locator('body > footer nav');
  const links = [
    ['Mail', 'mailto:park112368@gmail.com'],
    ['Github', 'https://github.com/PARKCHEOLHEE-lab'],
    ['resume', '/resume.pdf'],
    ['Architectural portfolio', '/portfolio-architectural.pdf']
  ];
  for (const [label, href] of links) {
    await expect(nav.locator(`a[href="${href}"] svg[aria-label="${label}"]`)).toBeVisible();
  }
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
