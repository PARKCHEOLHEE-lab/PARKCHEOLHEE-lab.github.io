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
