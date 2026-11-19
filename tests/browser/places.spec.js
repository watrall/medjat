import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blockTiles } from './fixtures.js';
const source = {
  DOI: '10.1234/abydos',
  title: ['Excavations at Abydos'],
  type: 'journal-article',
  abstract: 'Archaeology at Abydos, Egypt.',
};
test('Places discovers Crossref works from a Pleiades place without a saved collection', async ({
  page,
}) => {
  const requests = [],
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        message: {
          items: [source, { DOI: '10.1234/other', title: ['Egyptian religion'] }],
          'total-results': 50000,
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.locator('#placesNav').click();
  await expect(page.locator('#placeMap .leaflet-control-zoom-in')).toBeVisible();
  await page.locator('#placeSelect').selectOption('756512');
  await expect(page.locator('.place-results-status')).toHaveText(
    '2 candidates loaded · 1 with a place-name mention',
  );
  await expect(page.locator('.place-evidence-label')).toContainText('mentioned in title');
  expect(
    requests.some((url) => url.searchParams.get('query.bibliographic') === 'Abydos Egypt'),
  ).toBe(true);
  await page.locator('.place-publication-title').first().click();
  await expect(page.locator('.places-inspector .detail-title')).toHaveText(source.title[0]);
  await page
    .locator('.places-inspector')
    .getByRole('button', { name: 'Save to collection', exact: true })
    .click();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await page
    .locator('.places-inspector')
    .getByRole('button', { name: 'Back to publications', exact: true })
    .click();
  await expect(page.locator('.place-results-status')).toBeVisible();
  await expect(page.locator('.places-map-tools')).toBeVisible();
  await expect(page.locator('#places')).toContainText('Map tiles could not be fully loaded');
  expect(errors).toEqual([]);
});
test('place bibliographies export their exact saved scope and retain manual research decisions', async ({
  page,
}) => {
  const records = [
    source,
    { DOI: '10.1234/religion', title: ['Religion in ancient Egypt'] },
    { DOI: '10.1234/grammar', title: ['An Egyptian grammar'] },
  ];
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (route) =>
    route.fulfill({ json: { message: { items: records, 'total-results': 3 } } }),
  );
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(3);
  for (let index = 0; index < 3; index++) await page.locator('.save-button').nth(index).click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.locator('#placeSelect').selectOption('756512');
  await expect(page.locator('.place-collection-coverage')).toContainText(
    '3 saved publications · 1 with place associations · 2 with no place assigned',
  );
  await page.locator('#placeExportFormat').selectOption('csv');
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  expect(csv).toContain('10.1234/abydos');
  expect(csv).not.toContain('10.1234/religion');
  await page.getByRole('button', { name: 'Confirm association', exact: true }).click();
  await expect(page.locator('.place-association')).toContainText('Researcher-confirmed');
  await page.locator('.place-assignment > summary').click();
  await page.locator('#assignPlaceWork').selectOption('10.1234/religion');
  await page.locator('#assignPlaceTarget').selectOption('786017');
  await page.getByRole('button', { name: 'Assign place', exact: true }).click();
  await expect(page.locator('#placeSelect')).toHaveValue('786017');
  await expect(page.locator('.place-association')).toContainText('assigned manually');
  await page.getByText('No place assigned (1)', { exact: true }).click();
  await page
    .locator('.place-review-works')
    .getByRole('button', { name: 'Not place-specific', exact: true })
    .click();
  await expect(page.locator('.place-collection-coverage')).toContainText(
    '0 with no place assigned · 1 marked not place-specific',
  );
  await page.locator('#placeExportFormat').selectOption('json');
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(backup.records.map((entry) => entry.raw.DOI)).toEqual(['10.1234/religion']);
  expect(backup.research['place:10.1234/religion:786017'].method).toBe('researcher');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Your collection', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.place-association')).toContainText('assigned manually');
  await page.getByRole('button', { name: 'Reject association', exact: true }).click();
  await page.getByText('Rejected associations (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore association', exact: true }).click();
  await expect(page.locator('.place-association')).toContainText('assigned manually');
});
test('publication place links retain evidence and return to the search draft after refresh', async ({
  page,
}) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (route) =>
    route.fulfill({
      json: {
        message: { items: [{ ...source, abstract: 'A study of Thebes.' }], 'total-results': 1 },
      },
    }),
  );
  await page.goto('/?q=burial');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('#searchInput').fill('An unfinished research topic');
  const abydos = page.getByRole('button', { name: 'Explore Abydos in Places', exact: true });
  await expect(abydos).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Explore Thebes in Places', exact: true }),
  ).toBeVisible();
  await abydos.click();
  await expect(page.locator('#placeSelect')).toHaveValue('756512');
  await expect(page.locator('.place-origin')).toContainText('“Abydos” appears in the title');
  await page.reload();
  await expect(page.locator('.place-origin')).toContainText(source.title[0]);
  await page.getByRole('button', { name: 'Back to publication', exact: true }).click();
  await expect(page.locator('#exploreNav')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished research topic');
  await expect(page.locator('#inspector .detail-title')).toHaveText(source.title[0]);
  await expect(page.locator('.result-row')).toHaveCount(1);
  await expect(abydos).toBeFocused();
});
test('place pagination keeps its applied query while preserving unfinished topic edits', async ({
  page,
}) => {
  const requested = [];
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url);
    const second = url.searchParams.get('cursor') === 'page-two';
    return route.fulfill({
      json: {
        message: {
          items: Array.from({ length: 25 }, (_, i) => ({
            DOI: `10.1234/abydos-${second ? 25 + i : i}`,
            title: [`Abydos research ${second ? 25 + i : i}`],
          })),
          'total-results': 500,
          'next-cursor': second ? 'page-three' : 'page-two',
        },
      },
    });
  });
  await page.goto('/?view=places&place=756512');
  await expect(page.locator('.place-results-status')).toContainText('25 candidates loaded');
  await page.locator('#placeTopic').fill('An unfinished burial topic');
  await page.getByRole('button', { name: 'Load 25 more candidates', exact: true }).click();
  await expect(page.locator('.place-results-status')).toContainText('50 candidates loaded');
  await expect(page.locator('#placeTopic')).toHaveValue('An unfinished burial topic');
  expect(requested.at(-1).searchParams.get('query.bibliographic')).toBe('Abydos Egypt');
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.getByRole('button', { name: 'Discover in Crossref', exact: true }).click();
  await expect(page.locator('#placeTopic')).toHaveValue('An unfinished burial topic');
});
test('Places restores applied query, drafts, evidence scope and direct-entry collection count', async ({
  page,
}) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: [source], 'total-results': 1 } } }),
  );
  await page.goto('/?view=places&place=756512&placeTopic=burial');
  await expect(page.locator('.place-results-status')).toBeVisible();
  await expect(page.locator('#placeTopic')).toHaveValue('burial');
  await page.locator('#placeTopic').fill('unfinished pottery');
  await page.reload();
  await expect(page.locator('#placeTopic')).toHaveValue('unfinished pottery');
  await expect(page.locator('#placePublications')).toContainText('Applied search: Abydos · burial');
  await page.getByRole('button', { name: 'Save to collection', exact: true }).click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm association', exact: true }).click();
  await page.locator('#placeAssociationStatus').selectOption('confirmed');
  await page.reload();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await expect(page.locator('#placeAssociationStatus')).toHaveValue('confirmed');
  await expect(
    page.getByRole('button', { name: 'Export 1 publication', exact: true }),
  ).toBeVisible();
});
test('an export keeps its original place identity while another place is selected', async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', async (r) => {
    if (r.request().url().includes('/transform')) {
      await gate;
      return r.fulfill({ body: 'TY  - JOUR\nDO  - 10.1234/abydos\nER  -' });
    }
    return r.fulfill({ json: { message: { items: [source], 'total-results': 1 } } });
  });
  await page.goto('/');
  await page.locator('.save-button').click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.locator('#placeSelect').selectOption('756512');
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  await page.locator('#placeSelect').selectOption('786017');
  const pending = page.waitForEvent('download');
  release();
  const file = await pending;
  expect(file.suggestedFilename()).toContain('place-756512-all-1-');
  expect(await readFile(await file.path(), 'utf8')).toContain('10.1234/abydos');
  await expect(page.locator('[data-export-status]')).toContainText('for Abydos');
});
test('assignment identifies duplicate titles, searches without changing selection and fits its column', async ({
  page,
}) => {
  const records = [
    {
      DOI: '10.1234/intro-a',
      title: ['Introduction'],
      author: [{ family: 'Ahmed' }],
      published: { 'date-parts': [[2001]] },
      'container-title': ['Abydos studies'],
    },
    {
      DOI: '10.1234/intro-b',
      title: ['Introduction'],
      author: [{ family: 'Brown' }],
      published: { 'date-parts': [[2020]] },
      'container-title': ['Thebes studies'],
    },
  ];
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: records, 'total-results': 2 } } }),
  );
  await page.goto('/');
  for (const button of await page.locator('.save-button').all()) await button.click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.locator('.place-assignment > summary').click();
  await expect(page.locator('#assignPlaceWork option[value="10.1234/intro-a"]')).toContainText(
    'Ahmed',
  );
  await expect(page.locator('#assignPlaceWork option[value="10.1234/intro-b"]')).toContainText(
    '2020',
  );
  await page.locator('#assignPlaceWork').selectOption('10.1234/intro-b');
  await page.locator('#assignPlaceSearch').fill('Ahmed');
  await expect(page.locator('#assignPlaceWork')).toHaveValue('10.1234/intro-b');
  await expect(page.locator('.place-assignment-preview')).toContainText('Brown');
  const fits = await page
    .locator('#assignPlaceWork')
    .evaluate(
      (el) => el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width,
    );
  expect(fits).toBe(true);
  await page.reload();
  await expect(page.locator('#assignPlaceSearch')).toHaveValue('Ahmed');
  await expect(page.locator('#assignPlaceWork')).toHaveValue('10.1234/intro-b');
});
test('Places reverses classification and removal without losing association reviews', async ({
  page,
}) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: [source], 'total-results': 1 } } }),
  );
  await page.goto('/');
  await page.locator('.save-button').click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm association', exact: true }).click();
  await page.getByRole('button', { name: 'Not place-specific', exact: true }).click();
  await expect(page.locator('.place-collection-coverage')).toContainText(
    '1 marked not place-specific',
  );
  await page.getByRole('button', { name: 'Undo classification', exact: true }).click();
  await expect(page.locator('.place-association')).toContainText('Researcher-confirmed');
  await page.getByRole('button', { name: 'Remove from collection', exact: true }).click();
  await expect(page.locator('.place-undo')).toContainText('Removed');
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await expect(page.locator('.place-association')).toContainText('Researcher-confirmed');
  await expect(page.locator('#collectionCount')).toHaveText('1');
});
test('Fit map changes only the camera while All places changes bibliography scope', async ({
  page,
}) => {
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({
      json: {
        message: {
          items: [source, { DOI: '10.1234/thebes', title: ['Studies at Thebes'] }],
          'total-results': 2,
        },
      },
    }),
  );
  await page.goto('/');
  for (const b of await page.locator('.save-button').all()) await b.click();
  await page.locator('#placesNav').click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.locator('#placeSelect').selectOption('756512');
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(page.locator('#placeSelect')).toHaveValue('756512');
  await expect(
    page.getByRole('button', { name: 'Export 1 publication', exact: true }),
  ).toBeVisible();
  await page.locator('#placeSelect').selectOption({ label: 'All places' });
  await expect(
    page.getByRole('button', { name: 'Export 2 publications', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#places')).toContainText(
    'Numbers group nearby places, not publications',
  );
});
test('search and review updates preserve keyboard position without stealing background focus', async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await blockTiles(page);
  await page.route('https://api.crossref.org/**', async (r) => {
    if (new URL(r.request().url()).searchParams.get('query.bibliographic')?.includes('focus-test'))
      await gate;
    return r.fulfill({ json: { message: { items: [source], 'total-results': 1 } } });
  });
  await page.goto('/?view=places&place=756512');
  await expect(page.locator('.place-results-status')).toBeVisible();
  await page.locator('#placeTopic').fill('focus-test');
  await page.locator('#placeTopic').press('Enter');
  await expect(page.locator('#placeTopic')).toBeFocused();
  await page.locator('#placeSelect').focus();
  release();
  await expect(page.locator('.place-results-status')).toBeVisible();
  await expect(page.locator('#placeSelect')).toBeFocused();
  await page.getByRole('button', { name: 'Save to collection', exact: true }).click();
  await page.getByRole('button', { name: 'Your collection', exact: true }).click();
  await page.getByRole('button', { name: 'Not place-specific', exact: true }).click();
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BODY');
  await page.getByRole('button', { name: 'Undo classification', exact: true }).click();
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BODY');
  await page.getByRole('button', { name: 'Remove from collection', exact: true }).click();
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  // Undo awaits browser storage before rebuilding the list and restoring focus.
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await expect(
    page.getByRole('heading', { name: 'Abydos in your collection', exact: true }),
  ).toBeFocused();
});
test('mobile Places compacts geography, retains expansion choice and brings publications forward', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('https://api.crossref.org/**', (r) =>
    r.fulfill({ json: { message: { items: [source], 'total-results': 1 } } }),
  );
  await page.goto('/?view=places&place=756512');
  await expect(page.locator('.place-results-status')).toBeVisible();
  expect((await page.locator('#placeMap').boundingBox()).height).toBe(160);
  const firstY = await page
    .locator('.place-publication')
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(firstY).toBeLessThan(1266);
  await page.screenshot({ path: test.info().outputPath('places-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compact map', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Compact map', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect((await page.locator('#placeMap').boundingBox()).height).toBe(352);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
