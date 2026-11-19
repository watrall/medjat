import { test, expect } from '@playwright/test';

const windowItem = (i, year) => ({
  DOI: `10.1234/window${i}`,
  title: [`Egypt research ${i}`],
  type: 'journal-article',
  'container-title': ['Test journal'],
  published: { 'date-parts': [[year]] },
  abstract: 'Deposited abstract.',
});

test('Visualize summarizes its ranked window rather than the loaded page', async ({ page }) => {
  const windows = [];
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    const window = url.searchParams.get('rows') === '250';
    if (window) windows.push(url);
    return route.fulfill({
      json: {
        message: {
          'total-results': 12000000,
          items: window
            ? [windowItem(1, 2024), windowItem(2, 2024), windowItem(3, 2020), windowItem(4, 2020)]
            : Array.from({ length: 25 }, (_, i) => windowItem(i, 2024)),
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  await expect(page.locator('#visualize')).toContainText('first 4 relevance-ranked matches');
  await expect(page.locator('#visualize')).toContainText('12,000,000 keyword matches');
  await expect(page.locator('#visualize')).toContainText('Test journal');
  expect(windows).toHaveLength(1);
  expect(windows[0].searchParams.has('cursor')).toBe(false);
  expect(windows[0].searchParams.has('facet')).toBe(false);
  await page.locator('#searchInput').fill('An unfinished topic');
  await page.getByRole('button', { name: /2024 2/ }).click();
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
