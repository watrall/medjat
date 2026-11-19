import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('research views retain accessible controls and reflow across desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('.save-button').click();
  for (const view of ['visualize', 'atlas', 'collection']) {
    await page.locator(`#${view}Nav`).click();
    if (view === 'visualize')
      await expect(page.locator('#visualize')).toContainText('9,000,000 Crossref candidates');
    if (view === 'atlas')
      await expect(page.locator('#atlas')).toContainText('Publication-place evidence (2)');
    if (view === 'collection') {
      await page
        .getByRole('button', { name: 'Discover references from selected or saved publications' })
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
