import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

// Synthetic records are isolated to tests. The application has no fixture mode.
const publication = (i) => ({
  DOI: `10.1234/test-record-${i}`,
  title: [
    i === 0
      ? 'Settlement patterns at Deir el-Medina: "Evidence" and interpretation'
      : `Ancient Egyptian research ${i}`,
  ],
  author: [{ given: 'Ada', family: 'Researcher', ORCID: 'https://orcid.org/0000-0002-1825-0097' }],
  published: { 'date-parts': [[2020]] },
  type: 'book-chapter',
  'container-title': ['Research in ancient Egypt'],
  ISBN: ['9780198845461'],
  publisher: 'Test publisher',
  page: '23-39',
  abstract: '<jats:p>Evidence from archaeological research in ancient Egypt.</jats:p>',
  reference: [{ DOI: '10.1234/reference-record', unstructured: 'A deposited reference' }],
});
async function fixtures(page, { fail = false, empty = false, hostile = false } = {}) {
  const requests = [];
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://assets.crossref.org/**', (r) => r.abort());
  await page.route('https://covers.openlibrary.org/**', (r) =>
    r.fulfill({ status: 404, body: '' }),
  );
  await page.route('https://api.crossref.org/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (fail) return route.abort();
    if (url.pathname.endsWith('/transform')) {
      const accept = route.request().headers().accept;
      const body = accept.includes('x-bibliography')
        ? 'Researcher, A. (2020). A "quoted" publication.'
        : accept.includes('bibtex')
          ? '@inbook{duplicate, title={A publication}}'
          : 'TY  - GENERIC\nTI  - A publication\nER  -';
      return route.fulfill({ status: 200, body, contentType: 'text/plain' });
    }
    if (url.pathname !== '/works')
      return route.fulfill({
        json: {
          message: {
            ...publication(0),
            DOI: '10.1234/reference-record',
            title: ['A referenced publication'],
          },
        },
      });
    const next = url.searchParams.get('cursor') === 'next';
    const items = empty
      ? []
      : Array.from({ length: next ? 3 : 25 }, (_, i) => publication(i + (next ? 25 : 0)));
    if (hostile && items.length)
      Object.assign(items[0], {
        title: ['A "quoted" title <img src=x onerror="window.crossrefInjection=true">'],
        author: [
          {
            name: '<svg onload="window.crossrefInjection=true">Ada Researcher',
            ORCID: 'javascript:alert(1)',
          },
        ],
      });
    return route.fulfill({
      json: {
        status: 'ok',
        message: { items, 'total-results': empty ? 0 : 28, 'next-cursor': next ? 'end' : 'next' },
      },
    });
  });
  return requests;
}

test('search, inspect, save, reload, cite, and export a collection', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(requests.filter((u) => u.pathname === '/works')).toHaveLength(1);
  const save = page.getByRole('button', { name: /^Save to collection: Settlement/ });
  await save.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: /^Remove from collection: Settlement/ }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: 'Collection 1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collection 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Formatted citation' })).toHaveValue(
    /A "quoted" publication/,
  );
  await expect(page.getByRole('button', { name: 'Cite', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();
  const rowWidth = await page
    .locator('.result-row')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(rowWidth).toBeGreaterThan(450);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export collection', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.ris$/);
  expect(await readFile(await download.path(), 'utf8')).toMatch(/^TY  - CHAP/m);
  await page.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export collection', exact: true }).click();
  const backup = await readFile(await (await backupDownload).path());
  await page.getByRole('button', { name: /^Remove from collection: Settlement/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next bibliography starts here.' }),
  ).toBeVisible();
  await page
    .locator('#importCollection')
    .setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('.result-row')).toHaveCount(1);
});

test('period queries, filters, pagination, and browser back preserve research context', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'New Kingdom', exact: true }).click();
  await expect(page).toHaveURL(/period=new-kingdom/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toContain('New Kingdom Egypt');
  expect(requests.at(-1).searchParams.has('filter')).toBe(false);
  await page.getByLabel('From', { exact: true }).fill('2000');
  await page.getByLabel('To', { exact: true }).fill('2025');
  await page.getByRole('checkbox', { name: 'Abstract', exact: true }).check();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/from=2000/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(requests.at(-1).searchParams.get('filter')).toContain('has-abstract:true');
  await page.getByRole('button', { name: 'Load 25 more publications' }).click();
  await expect(page.locator('.result-row')).toHaveCount(28);
  await page.goBack();
  await expect(page).not.toHaveURL(/from=2000/);
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
});

test('mobile detail navigation and long metadata reflow without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.result-open').first().click();
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('.results-column')).toBeHidden();
  await page.getByRole('button', { name: 'Back to publications', exact: true }).click();
  await expect(page.locator('.result-open').first()).toBeFocused();
  await page.getByRole('button', { name: 'Collection 0', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next bibliography starts here.' }),
  ).toBeVisible();
});

test('network errors remain visible and never become demonstration records', async ({ page }) => {
  await fixtures(page, { fail: true });
  await page.goto('/');
  await expect(
    page.getByText('We could not reach Crossref. Check your connection and retry.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry search' })).toBeVisible();
  await expect(page.locator('.result-row')).toHaveCount(0);
});

test('reference navigation retains its source publication', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect reference', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A referenced publication', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await expect(page.locator('.detail-title')).toHaveText(/Settlement patterns/);
});
test('empty search responses provide a useful recovery state', async ({ page }) => {
  await fixtures(page, { empty: true });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No publications found.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.result-row')).toHaveCount(0);
});
test('search and collection views have no detected WCAG AA violations', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const check = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  };
  await check();
  await page.getByRole('button', { name: /^Save to collection: Settlement/ }).click();
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();
  await check();
});
test('untrusted metadata remains text instead of executable markup', async ({ page }) => {
  await fixtures(page, { hostile: true });
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.locator('.result-open').first()).toHaveText('A "quoted" title');
  await expect(page.locator('.result-row img')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.crossrefInjection)).toBeUndefined();
});
