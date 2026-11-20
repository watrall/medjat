import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { blockTiles } from './fixtures.js';

const work = {
  DOI: '10.1234/abydos-qa',
  title: ['Abydos scholarship'],
  type: 'journal-article',
  author: [{ family: 'Ahmed' }],
  published: { 'date-parts': [[2020]] },
};
test('history restores actual results for different topics at the same place', async ({ page }) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('query.bibliographic') || '';
    const topic = q.includes('burial') ? 'burial' : q.includes('pottery') ? 'pottery' : 'initial';
    return r.fulfill({
      json: {
        message: {
          items: [{ ...work, DOI: `10.1234/${topic}`, title: [`Abydos ${topic}`] }],
          'total-results': 1,
        },
      },
    });
  });
  await page.goto('/?view=places&place=756512');
  await expect(page.locator('.place-results-status')).toBeVisible();
  await page.locator('#placeTopic').fill('burial');
  await page.getByRole('button', { name: 'Search this place', exact: true }).click();
  await expect(page.locator('.place-publication-title')).toHaveText('Abydos burial');
  await page.locator('#placeTopic').fill('pottery');
  await page.getByRole('button', { name: 'Search this place', exact: true }).click();
  await expect(page.locator('.place-publication-title')).toHaveText('Abydos pottery');
  await page.goBack();
  await expect(page.locator('#placeTopic')).toHaveValue('burial');
  await expect(page.locator('.place-publication-title')).toHaveText('Abydos burial');
  await page.goForward();
  await expect(page.locator('.place-publication-title')).toHaveText('Abydos pottery');
});

for (const format of ['csv', 'json', 'ris', 'bibtex'])
  test(`place evidence scope exports exact membership as ${format}`, async ({ page }) => {
    await blockTiles(page);
    await page.route('https://api.crossref.org/**', (r) => {
      const url = new URL(r.request().url());
      if (url.pathname.endsWith('/transform')) {
        const doi = decodeURIComponent(url.pathname.split('/')[2]);
        return r.fulfill({
          body:
            format === 'ris' ? `TY  - JOUR\nDO  - ${doi}\nER  -` : `@article{item, doi={${doi}}}`,
        });
      }
      return r.fulfill({
        json: {
          message: {
            items: [
              work,
              { DOI: '10.1234/abydos-other', title: ['Abydos ceramics'] },
              { DOI: '10.1234/thebes-other', title: ['Thebes ceramics'] },
            ],
            'total-results': 3,
          },
        },
      });
    });
    await page.goto('/');
    for (const b of await page.locator('.save-button').all()) await b.click();
    await page.locator('#placesNav').click();
    await page.getByRole('button', { name: 'Your collection', exact: true }).click();
    await page.locator('#placeSelect').selectOption('756512');
    await page
      .locator(`[data-place-work="${work.DOI}"]`)
      .getByRole('button', { name: 'Confirm association', exact: true })
      .click();
    await page.locator('#placeAssociationStatus').selectOption('confirmed');
    await page.locator('#placeExportFormat').selectOption(format);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
    const file = await download;
    const text = await readFile(await file.path(), 'utf8');
    expect(text).toContain(work.DOI);
    expect(text).not.toContain('10.1234/abydos-other');
    expect(text).not.toContain('10.1234/thebes-other');
    expect(file.suggestedFilename()).toContain('place-756512-confirmed-1-');
  });

test('failed and cancelled place exports retain scope and recover with CSV', async ({ page }) => {
  await blockTiles(page);
  let slow = false;
  await page.route('https://api.crossref.org/**', async (r) => {
    if (r.request().url().includes('/transform')) {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 500));
      return r.fulfill({ body: 'Invalid citation format' }).catch(() => {});
    }
    return r.fulfill({ json: { message: { items: [work], 'total-results': 1 } } });
  });
  await page.goto('/');
  await page.locator('.save-button').click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.locator('#placeSelect').selectOption('756512');
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  await expect(page.locator('[data-export-status]')).toContainText(
    'No bibliography was downloaded',
  );
  slow = true;
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.locator('[data-export-status]')).toContainText('cancelled');
  await expect(page.locator('#placeSelect')).toHaveValue('756512');
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await page.locator('#placeExportFormat').selectOption('csv');
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  expect(await readFile(await (await file).path(), 'utf8')).toContain(work.DOI);
});

test('500 saved works remain searchable and accessible at narrow widths and enlarged text', async ({
  page,
}) => {
  test.setTimeout(60000);
  await blockTiles(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'ancient-egypt-research-collection-v1',
      JSON.stringify({
        version: 1,
        records: Array.from({ length: 500 }, (_, i) => ({
          raw: {
            DOI: `10.1234/large-${i}`,
            title: [`Abydos ${i} ${'Long scholarly title '.repeat(8)}`],
            author: [{ family: `Researcher${i}` }],
            published: { 'date-parts': [[2000 + (i % 25)]] },
          },
        })),
      }),
    ),
  );
  await page.goto('/?view=places&placesMode=collection&place=756512');
  await expect(page.locator('#collectionCount')).toHaveText('500');
  await page.getByRole('button', { name: 'Assign a publication', exact: true }).click();
  await expect(page.locator('#assignPlaceSearch')).toBeFocused();
  await expect(page.locator('#assignPlaceSearch')).toBeInViewport();
  await page.locator('#assignPlaceSearch').fill('Researcher499');
  await expect(page.locator('#assignPlaceWork option')).toHaveCount(3); // placeholder, one match, retained selection
  await page.locator('#assignPlaceWork').selectOption('10.1234/large-499');
  await expect(page.locator('.place-assignment-preview')).toContainText('Researcher499');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      await page
        .locator('#assignPlaceWork')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width,
        ),
    ).toBe(true);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const audit = await new AxeBuilder({ page })
    .include('#places')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test('return from a publication place link restores a nonzero page position and focus after reload', async ({
  page,
}) => {
  await blockTiles(page);
  const source = { ...work, abstract: 'Research on burial in ancient Egypt. '.repeat(100) };
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({
      json: {
        message:
          new URL(r.request().url()).pathname === '/works'
            ? { items: [source], 'total-results': 1 }
            : source,
      },
    }),
  );
  await page.goto('/?q=burial');
  await page.locator('#searchInput').fill('An unfinished chronology');
  const link = page.getByRole('button', { name: 'Explore Abydos in Places', exact: true });
  await link.waitFor();
  await page.evaluate(() => window.scrollTo(0, 240));
  await link.click();
  await expect(page.locator('.place-results-status')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Back to publication', exact: true }).click();
  await expect(link).toBeFocused();
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished chronology');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(240);
});

test('unsupported place URL values fall back to an explicit valid scope', async ({ page }) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: [work], 'total-results': 1 } } }),
  );
  await page.goto(
    '/?view=places&place=756512&placeName=NotAnIndexedAlias&placeEvidence=unknown&placesMode=unknown',
  );
  await expect(page.locator('.place-results-status')).toBeVisible();
  await expect(page.locator('#placeSearchName')).toHaveValue('Abydos');
  await expect(page.locator('#placePublications')).toContainText('Applied search: Abydos');
  await expect(page.locator('#toast')).toContainText('Using the primary place name');
  await expect(page).not.toHaveURL(/NotAnIndexedAlias/);
});

test('Places drafts survive leaving the view and refreshing elsewhere in the app', async ({
  page,
}) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: [work], 'total-results': 1 } } }),
  );
  await page.goto('/?view=places&place=756512&placeTopic=burial');
  await expect(page.locator('.place-results-status')).toBeVisible();
  await page.locator('#placeTopic').fill('Unfinished pottery question');
  await page.locator('#exploreNav').click();
  await page.reload();
  await page.locator('#placesNav').click();
  await expect(page.locator('#placeSelect')).toHaveValue('756512');
  await expect(page.locator('#placeTopic')).toHaveValue('Unfinished pottery question');
  await expect(page.locator('#placePublications')).toContainText('Applied search: Abydos · burial');
});
