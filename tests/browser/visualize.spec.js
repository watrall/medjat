import { test, expect } from '@playwright/test';
test('Visualize summarizes the entire applied search rather than its loaded page', async ({
  page,
}) => {
  const aggregates = [];
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    const summary = url.searchParams.get('rows') === '0';
    if (summary) aggregates.push(url);
    return route.fulfill({
      json: {
        message: {
          'total-results': 12000000,
          items: summary
            ? []
            : Array.from({ length: 25 }, (_, i) => ({
                DOI: `10.1234/viz${i}`,
                title: [`Egypt research ${i}`],
                type: 'journal-article',
              })),
          facets: {
            published: { values: { 2020: 500000, 2024: 600000 } },
            'type-name': { values: { 'Journal Article': 10000000 } },
            'container-title': { values: { 'Test journal': 800000 } },
          },
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  await expect(page.locator('#visualize')).toContainText('12,000,000 Crossref candidates');
  await expect(page.locator('#visualize')).toContainText('500,000');
  expect(aggregates).toHaveLength(5);
  expect(aggregates.every((url) => !url.searchParams.has('cursor'))).toBe(true);
  await page.locator('#searchInput').fill('An unfinished topic');
  await page.getByRole('button', { name: /2024 600,000/ }).click();
  await page.getByRole('button', { name: 'Explore these publications' }).click();
  await expect(page).toHaveURL(/from=2024/);
  expect(new URL(page.url()).searchParams.get('to')).toBe('2024');
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished topic');
  await expect(page.locator('#yearFrom')).toHaveValue('2024');
  await page.locator('#visualizeNav').click();
  await page.reload();
  await expect(page.locator('#visualizeNav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#exploreNav').click();
  await expect(page.locator('.result-row')).toHaveCount(25);
});
