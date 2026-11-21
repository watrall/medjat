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
  let releaseRefinement;
  const refinement = new Promise((resolve) => {
    releaseRefinement = resolve;
  });
  await page.route('https://api.crossref.org/**', async (route) => {
    const url = new URL(route.request().url());
    const window = url.searchParams.get('rows') === '250';
    if (window) windows.push(url);
    if (!window && url.searchParams.get('filter')?.includes('from-pub-date')) await refinement;
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
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  await expect(page.locator('#visualize')).toContainText('first 4 relevance-ranked matches');
  await expect(page.locator('#visualize')).toContainText('12,000,000 keyword matches');
  await expect(page.locator('#visualize')).toContainText('Test journal');
  expect(windows).toHaveLength(1);
  expect(windows[0].searchParams.has('cursor')).toBe(false);
  expect(windows[0].searchParams.has('facet')).toBe(false);
  await page.locator('#searchInput').fill('An unfinished topic');
  await expect(page.locator('#pendingQuery')).toBeVisible();
  await expect(page.locator('#visualize h2')).toHaveText(
    'Analyzing Crossref results for “ancient egypt”',
  );
  await page.getByRole('button', { name: /2024 2/ }).click();
  await page.getByRole('button', { name: 'Search by date: 2024' }).click();
  await expect(page.getByRole('heading', { name: 'Publications', exact: true })).toBeFocused();
  await expect(page.locator('#resultCount')).toHaveText('Searching Crossref…');
  await expect(page.locator('.result-row')).toHaveCount(0);
  releaseRefinement();
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page).toHaveURL(/from=2024/);
  expect(new URL(page.url()).searchParams.get('to')).toBe('2024');
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished topic');
  await expect(page.locator('#yearFrom')).toHaveValue('2024');
  await expect(page.getByRole('heading', { name: 'Publications', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(page.getByRole('button', { name: 'Search by date: 2024' })).toBeFocused();
  await expect(page.getByRole('button', { name: /2024 2/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(windows).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#visualizeNav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#exploreNav').click();
  await expect(page.locator('.result-row')).toHaveCount(25);
});
