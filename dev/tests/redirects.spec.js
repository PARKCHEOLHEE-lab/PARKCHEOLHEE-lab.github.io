// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// files that moved under assets/ keep working at their old URLs: the site's 404 page sends a visitor on (404.html)

const SITE = path.join(__dirname, '..', '..', '_site');
// where each moved folder used to be; the docs used to sit at the site's root
const OLD = { docs: '/', models: '/model/', notebooks: '/notebooks/', js: '/js/', data: '/data/', emoji: '/emoji/' };
// a file whose old URL was not in its folder's old place: wall.ifc came from the realbuilding submodule
const ORIGIN = { '/assets/models/wall.ifc': '/realbuilding/wall.ifc' };

function moved_files() {
  const pairs = [];
  for (const [folder, old_prefix] of Object.entries(OLD)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        const rest = path.relative(path.join(SITE, 'assets', folder), full).split(path.sep).join('/');
        const new_url = `/assets/${folder}/${rest}`;
        pairs.push([ORIGIN[new_url] || old_prefix + rest, new_url]);
      }
    };
    walk(path.join(SITE, 'assets', folder));
  }
  // the resume was cv.* before it was resume.*
  pairs.push(['/cv.pdf', '/assets/docs/resume.pdf'], ['/cv.docx', '/assets/docs/resume.docx']);
  return pairs;
}

test('every moved file\'s old URL lands on its new URL', async ({ page }) => {
  // answer the new URLs with plain text, so a PDF or a model opens as a page instead of a download
  const moved_folder = new RegExp(`^/assets/(${Object.keys(OLD).join('|')})/`);
  await page.route((url) => moved_folder.test(url.pathname),
    (route) => route.fulfill({ body: 'moved', contentType: 'text/plain' }));

  const pairs = moved_files();
  expect(pairs.length).toBeGreaterThan(20);
  for (const [old_url, new_url] of pairs) {
    await page.goto(old_url + '?q=1#top');
    await page.waitForURL((url) => url.pathname === new_url);
    expect(page.url()).toContain('?q=1#top');
  }
});

test('a path that never existed still shows the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response && response.status()).toBe(404);
  await expect(page.locator('article h2')).toHaveText('404');
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/no-such-page/');
});
