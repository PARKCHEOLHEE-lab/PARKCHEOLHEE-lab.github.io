// @ts-check
const { test, expect } = require('@playwright/test');

// a post's comments (post.html): giscus, found by the post's path, and no longer utterances

test('a post loads giscus for its comments, by the sha1 of its path, and not utterances', async ({ page }) => {
  // giscus itself is not under test, so its frame stays offline
  await page.route('https://giscus.app/**', (route) => route.abort());
  await page.goto('/mmm/');
  const giscus = page.locator('script[src="https://giscus.app/client.js"]');
  await expect(giscus).toHaveCount(1);
  await expect(giscus).toHaveAttribute('data-repo', 'PARKCHEOLHEE-lab/PARKCHEOLHEE-lab.github.io');
  await expect(giscus).toHaveAttribute('data-repo-id', /\S/);
  await expect(giscus).toHaveAttribute('data-category-id', /\S/);
  await expect(giscus).toHaveAttribute('data-mapping', 'pathname');
  await expect(giscus).toHaveAttribute('data-strict', '1');
  await expect(page.locator('script[src*="utteranc.es"]')).toHaveCount(0);
});
