import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { blockTiles } from './fixtures.js';

test('research views retain accessible controls and reflow across desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  const source = {
    DOI: '10.1234/abydos',
    title: ['Archaeology at Abydos'],
    type: 'journal-article',
    abstract: 'Research at Abydos and Thebes.',
    reference: [
      { DOI: '10.1234/book', unstructured: 'The archaeology of ancient Egypt' },
      { unstructured: 'An older book' },
    ],
  };
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: {
        message:
          url.pathname === '/works'
            ? {
                items: [source],
                'total-results': 9000000,
                facets: {
                  published: { values: { 2024: 400000, 2023: 300000 } },
                  'type-name': { values: { 'Journal Article': 8000000 } },
                  'container-title': { values: { 'Journal of Egyptian Archaeology': 70000 } },
                },
              }
            : { ...source, title: ['Revised archaeology at Abydos'] },
      },
    });
  });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('.save-button').click();
  await blockTiles(page);
  for (const view of ['visualize', 'places', 'places-collection', 'collection']) {
    await page.locator(`#${view === 'places-collection' ? 'places' : view}Nav`).click();
    if (view === 'places-collection') {
      await page.getByRole('button', { name: 'Your collection', exact: true }).click();
      await expect(page.locator('.place-collection-coverage')).toContainText('1 saved publication');
      await page.locator('.place-assignment > summary').click();
    }
    if (view === 'visualize')
      await expect(page.locator('#visualize')).toContainText('9,000,000 keyword matches');
    if (view === 'places') {
      await expect(page.locator('#placeMap .leaflet-marker-icon').first()).toBeVisible();
      await page.locator('[data-place-id="756512"]').first().click();
      await expect(page.locator('.place-results-status')).toContainText('1 candidate loaded');
    }
    if (view === 'collection') {
      await page.getByText('Collection tools', { exact: true }).click();
      await page
        .getByRole('button', { name: /Discover references from \d+ saved publications?/ })
        .click();
      await expect(page.locator('#researchTools')).toContainText(
        'Missing from your bibliography (1)',
      );
      await page.locator('#researchTools summary').filter({ hasText: 'Missing from' }).click();
      await page
        .getByRole('button', { name: 'Check saved publications for metadata changes' })
        .click();
      await expect(page.locator('#changeReview')).toContainText('1 changed fields');
    }
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${view} at ${width}`,
      ).toBeLessThanOrEqual(width);
    }
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations, `${view} accessibility`).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`${view}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: test.info().outputPath(`${view}-desktop.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
