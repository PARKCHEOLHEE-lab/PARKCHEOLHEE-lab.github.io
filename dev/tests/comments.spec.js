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
  // giscus's own design, untouched
  await expect(giscus).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('script[src*="utteranc.es"]')).toHaveCount(0);
});

test('a skeleton of the comment box stands in for giscus until giscus draws the comment box', async ({ page }) => {
  // giscus stays offline: its script only adds its frame, as giscus's does, and the frame says what giscus
  // says for a post with no comments yet, in the order it says it, once the test lets it: its loading
  // screen's height, "Discussion not found" while that screen still shows, then the empty box's height
  await page.route('https://giscus.app/client.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const frame = document.createElement('iframe');
      frame.className = 'giscus-frame';
      frame.src = 'https://giscus.app/widget';
      const box = document.createElement('div');
      box.className = 'giscus';
      box.append(frame);
      document.currentScript.after(box);`,
  }));
  let answer;
  const answered = new Promise((resolve) => (answer = resolve));
  await page.route('https://giscus.app/widget', async (route) => {
    await answered;
    await route.fulfill({
      contentType: 'text/html',
      body: `<script>
        parent.postMessage({ giscus: { resizeHeight: 84 } }, "*");
        parent.postMessage({ giscus: { error: "Discussion not found" } }, "*");
        addEventListener("message", (event) => event.data === "draw" && parent.postMessage({ giscus: { resizeHeight: 282 } }, "*"));
      </script>`,
    });
  });
  // the held frame holds back the page's load event
  await page.goto('/mmm/', { waitUntil: 'domcontentloaded' });
  const comments = page.locator('.comments');
  await expect(comments).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.comments-skeleton')).toBeVisible();
  // out of sight but still drawn, so giscus can measure itself
  await expect(page.locator('.giscus')).toHaveCSS('opacity', '0');
  answer();
  // "Discussion not found" comes while giscus's loading screen still shows, so the skeleton stays
  await page.waitForTimeout(500);
  await expect(comments).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => document.querySelector('iframe.giscus-frame').contentWindow.postMessage('draw', '*'));
  await expect(comments).not.toHaveAttribute('aria-busy');
  await expect(page.locator('.comments-skeleton')).toBeHidden();
  await expect(page.locator('.giscus')).toHaveCSS('opacity', '1');
  // nothing here sizes the frame to the height it reports, as giscus's script sometimes does only after the
  // swap: the area keeps the skeleton's height, so a reader at the page's very bottom is not scrolled up
  expect((await comments.boundingBox()).height).toBe(282);
});
