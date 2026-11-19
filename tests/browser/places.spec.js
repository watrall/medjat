import { test, expect } from '@playwright/test';
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
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
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
    '2 candidates loaded · 1 mention this place in title or abstract',
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
test('publication place links retain evidence and return to the search draft after refresh', async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
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
