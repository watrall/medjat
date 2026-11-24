import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const windowItem = (i, year, extra = {}) => ({
  DOI: `10.1234/window${i}`,
  title: [`Egypt research ${i}`],
  type: i % 2 ? 'journal-article' : 'book-chapter',
  'container-title': ['Test journal'],
  publisher: 'Test publisher',
  published: { 'date-parts': [[year, 3]] },
  created: { 'date-parts': [[year + (i % 3)]] },
  'is-referenced-by-count': i % 4,
  abstract: 'Deposited abstract.',
  ...extra,
});

async function stub(page) {
  const windows = [];
  let releaseRefinement;
  const refinement = new Promise((resolve) => {
    releaseRefinement = resolve;
  });
  await page.route('https://api.crossref.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/works/'))
      return route.fulfill({
        json: { message: windowItem(7, 2022, { DOI: decodeURIComponent(url.pathname.slice(7)) }) },
      });
    const window = url.searchParams.get('rows') === '250';
    if (window) windows.push(url);
    if (!window && url.searchParams.get('filter')?.includes('from-pub-date')) await refinement;
    return route.fulfill({
      json: {
        message: {
          'total-results': 12000000,
          items: window
            ? Array.from({ length: 40 }, (_, i) => windowItem(i, 2024 - (i % 6)))
            : Array.from({ length: 25 }, (_, i) => windowItem(i, 2024)),
        },
      },
    });
  });
  return { windows, releaseRefinement };
}

test('Visualize draws its charts from one ranked window and says how much of it each covers', async ({
  page,
}) => {
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  const { windows } = await stub(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  await expect(page.locator('#visualize')).toContainText('first 40 relevance-ranked matches');
  await expect(page.locator('#visualize')).toContainText('12,000,000 keyword matches');
  await expect(page.locator('#visualize h2')).toHaveText(
    'Analyzing Crossref results for “ancient egypt”',
  );
  await expect(page.locator('.viz-canvas svg')).toHaveCount(5);
  for (const title of [
    'Publication types',
    'Publishers and venues',
    'Publication years',
    'When DOIs were registered',
    'Citations',
  ])
    await expect(page.locator('.viz-chart', { hasText: title }).first()).toBeVisible();
  await expect(page.locator('.viz-coverage').first()).toHaveText('40 of 40 records');
  await expect(page.locator('.viz-nav button')).toHaveText(['What', 'When', 'How cited']);
  await expect(page.locator('.viz-nav button').first()).toHaveAttribute('aria-current', 'true');
  expect(windows).toHaveLength(1);
  expect(windows[0].searchParams.has('facet')).toBe(false);
  expect(errors).toEqual([]);
});

test('the section nav stays in view and follows the reader down the page', async ({ page }) => {
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(5);
  const nav = page.locator('.viz-nav');
  await page.getByRole('button', { name: 'How cited' }).click();
  await expect(page.getByRole('button', { name: 'How cited' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(nav).toBeInViewport();
  await expect(page.locator('#viz-cited')).toBeInViewport();
});

test('a chart is also a data table, and its rows can start a real Crossref search', async ({
  page,
}) => {
  const { windows, releaseRefinement } = await stub(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  await page.locator('#searchInput').fill('An unfinished topic');
  await expect(page.locator('#pendingQuery')).toBeVisible();
  const years = page.locator('.viz-chart', { hasText: 'Publication years' });
  await years.getByText('View data table').click();
  await years.getByRole('button', { name: 'Search 2024' }).click();
  await expect(page.getByRole('heading', { name: 'Publications', exact: true })).toBeFocused();
  await expect(page.locator('#resultCount')).toHaveText('Searching Crossref…');
  releaseRefinement();
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page).toHaveURL(/from=2024/);
  expect(new URL(page.url()).searchParams.get('to')).toBe('2024');
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished topic');
  await expect(page.locator('#yearFrom')).toHaveValue('2024');
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(years.getByRole('button', { name: 'Search 2024' })).toBeFocused();
  expect(windows).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#visualizeNav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#exploreNav').click();
  await expect(page.locator('.result-row')).toHaveCount(25);
});

test('selecting a record in the data table opens it in Explore', async ({ page }) => {
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(5);
  const cited = page.locator('.viz-chart', { hasText: 'Citations' });
  await cited.getByText('View data table').click();
  await cited.locator('.viz-table button').first().click();
  await expect(page.getByRole('heading', { name: 'Publications', exact: true })).toBeFocused();
  await expect(page.locator('#searchInput')).toHaveValue(/10\.1234\/window/);
  await expect(page.locator('.result-row')).toHaveCount(1);
});

test('the Visualize page has no accessibility violations with its charts drawn', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(5);
  const axe = await new AxeBuilder({ page }).include('#visualize').analyze();
  expect(axe.violations).toEqual([]);
});

test('if the charts cannot load the data tables still say everything', async ({ page }) => {
  await stub(page);
  await page.route('**/assets/vendor/echarts/echarts.js', (route) => route.abort());
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.getByRole('alert')).toContainText('The charts could not be drawn');
  await expect(page.locator('.viz-chart', { hasText: 'Publication types' })).toBeVisible();
});
