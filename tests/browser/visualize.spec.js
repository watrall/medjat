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
  let releaseRefinement, releaseLarge;
  const large = new Promise((resolve) => {
    releaseLarge = resolve;
  });
  const refinement = new Promise((resolve) => {
    releaseRefinement = resolve;
  });
  await page.route('https://api.crossref.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/works/'))
      return route.fulfill({
        json: { message: windowItem(7, 2022, { DOI: decodeURIComponent(url.pathname.slice(7)) }) },
      });
    const rows = url.searchParams.get('rows');
    const window = rows === '250' || rows === '1000';
    if (rows === '1000') await large;
    if (window) windows.push(url);
    if (!window && url.searchParams.get('filter')?.includes('from-pub-date')) await refinement;
    return route.fulfill({
      json: {
        message: {
          'total-results': 12000000,
          items: window
            ? Array.from({ length: rows === '1000' ? 120 : 40 }, (_, i) =>
                windowItem(i, 2024 - (i % 6)),
              )
            : Array.from({ length: 25 }, (_, i) => windowItem(i, 2024)),
        },
      },
    });
  });
  return { windows, releaseRefinement, releaseLarge };
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
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  for (const title of [
    'Publication types',
    'Publishers and venues',
    'Publication years',
    'When DOIs were registered',
    'Citations',
    'Which fields Crossref holds',
  ])
    await expect(page.locator('.viz-chart', { hasText: title }).first()).toBeVisible();
  await expect(page.locator('.viz-coverage').first()).toHaveText('40 of 40 records');
  await expect(page.locator('.viz-coverage').filter({ hasText: 'undefined' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: /How the publication mix has changed/ }),
  ).toBeVisible();
  await expect(page.locator('.viz-nav button')).toHaveText([
    'What',
    'When',
    'How cited',
    'How complete',
  ]);
  await expect(page.locator('.viz-nav button').first()).toHaveAttribute('aria-current', 'true');
  expect(windows).toHaveLength(1);
  expect(windows[0].searchParams.has('facet')).toBe(false);
  expect(errors).toEqual([]);
});

test('the section nav stays in view and follows the reader down the page', async ({ page }) => {
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
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
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
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
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
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

test('the charts are still drawn when you come back to them from Explore', async ({ page }) => {
  const { releaseRefinement } = await stub(page);
  releaseRefinement();
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  const drawn = () =>
    page
      .locator('.viz-canvas svg')
      .evaluateAll((all) => all.map((svg) => svg.querySelectorAll('path, circle, rect').length));
  expect((await drawn()).every((marks) => marks > 0)).toBe(true);
  const years = page.locator('.viz-chart', { hasText: 'Publication years' });
  await years.getByText('View data table').click();
  await years.getByRole('button', { name: 'Search 2024' }).click();
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  expect((await drawn()).every((marks) => marks > 0)).toBe(true);
  const box = await page.locator('.viz-canvas').first().boundingBox();
  expect(box.width).toBeGreaterThan(300);
});

test('a window with no records says so instead of failing', async ({ page }) => {
  await page.route('https://api.crossref.org/**', (route) =>
    route.fulfill({ json: { message: { 'total-results': 0, items: [] } } }),
  );
  await page.goto('/?q=nothing+here&view=visualize');
  await expect(page.locator('#visualize')).toContainText('Crossref returned no records');
  await expect(page.locator('.notice-error')).toHaveCount(0);
  await expect(page.locator('.viz-chart')).toHaveCount(0);
});

test('the page explains why it does not analyze every record', async ({ page }) => {
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  await expect(page.locator('.viz-why')).toContainText('Why not all records?');
  await expect(page.locator('.viz-why')).toContainText('drift off topic');
  await expect(page.locator('.viz-why')).toContainText('at most 1,000 records per request');
  await expect(page.locator('.viz-why')).toContainText('12,000 requests');
});

test('the window can be widened to 1,000 records, with a spinner while it loads', async ({
  page,
}) => {
  const { windows, releaseLarge } = await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  const group = page.getByRole('group', { name: 'Records analyzed' });
  await expect(group.getByRole('button', { name: '250' })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: '1,000' }).click();
  await expect(page.locator('.viz-size .viz-spinner')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Retrieving 1,000 ranked records');
  await expect(group).toBeVisible();
  await expect(group.getByRole('button', { name: '250' })).toBeDisabled();
  await expect(page.locator('.viz-body')).toHaveAttribute('aria-busy', '');
  releaseLarge();
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  await expect(page.locator('#visualize')).toContainText('first 120 relevance-ranked matches');
  await expect(page.locator('.viz-coverage').first()).toHaveText('120 of 120 records');
  const wide = page.getByRole('button', { name: '1,000' });
  await expect(wide).toHaveAttribute('aria-pressed', 'true');
  await expect(wide).toBeFocused();
  expect(windows.map((url) => url.searchParams.get('rows'))).toEqual(['250', '1000']);
});

test('the header sits on the chart columns, with the switch directly above its explanation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  const box = (selector) => page.locator(selector).first().boundingBox();
  const [size, why, chart, lead, actions] = await Promise.all([
    box('.viz-size'),
    box('.viz-why'),
    box('.viz-pair > :nth-child(2)'),
    box('.viz-head-lead'),
    box('.viz-actions'),
  ]);
  expect(size.x).toBe(chart.x);
  expect(why.x).toBe(chart.x);
  expect(why.y).toBeGreaterThan(size.y + size.height);
  expect(why.y - (size.y + size.height)).toBeLessThan(24);
  expect(Math.abs(actions.x + actions.width - (chart.x + chart.width))).toBeLessThanOrEqual(2);
  expect(lead.x).toBeLessThan(size.x);
  const segment = await box('.viz-segments button');
  expect(segment.height).toBeLessThanOrEqual(32);
  expect(segment.width).toBeLessThan(80);
  await expect(page.locator('.viz-facts')).toHaveCount(0);
  await expect(page.locator('.viz-scope')).toContainText('Ranked on ancient egypt');
  await expect(page.locator('.viz-scope')).toContainText('No publication filters.');
});

test('hovering a metadata bar fades the others, and the fade follows the pointer and clears', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await stub(page);
  await page.goto('/?q=ancient+egypt&view=visualize');
  const canvas = page.locator('#viz-complete .viz-canvas');
  await expect(canvas.locator('svg')).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const left = Math.min(230, box.width * 0.3);
  const pitch = (box.width - left - 8) / 7;
  const cell = (column, row) => [
    box.x + left + pitch * (column + 0.5),
    box.y + 6 + 40 + 62 * (row + 0.4),
  ];
  const fadedCount = () =>
    canvas.locator('svg [opacity="0.28"], svg [fill-opacity="0.28"]').count();
  expect(await fadedCount()).toBe(0);
  await page.mouse.move(...cell(1, 0));
  await expect(page.getByText(/records have an abstract/).first()).toBeVisible();
  await expect.poll(fadedCount).toBeGreaterThan(0);
  const whileOver = await fadedCount();
  await page.mouse.move(...cell(3, 1), { steps: 6 });
  await expect(page.getByText(/records have a license/).first()).toBeVisible();
  await expect.poll(fadedCount).toBe(whileOver);
  await page.mouse.move(box.x + 4, box.y + 4);
  await expect.poll(fadedCount).toBe(0);
});

test('the scope line names the ranking terms and each filter, with the values in bold', async ({
  page,
}) => {
  await stub(page);
  await page.goto('/?q=hierakonpolis&view=visualize&from=2000&type=book&abstract=1');
  await expect(page.locator('.viz-canvas svg')).toHaveCount(7);
  const scope = page.locator('.viz-scope');
  await expect(scope).toContainText(
    'Ranked on hierakonpolis ancient Egypt. Filtered by Publication years 2000 onward',
  );
  await expect(scope.locator('strong')).toContainText([
    'hierakonpolis ancient Egypt',
    '2000 onward',
    'Book',
    'Abstract required',
  ]);
  const weights = await scope
    .locator('strong')
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).fontWeight));
  expect(new Set(weights)).toEqual(new Set(['700']));
});

test('the one bright metadata bar is always the one under the pointer, however you move', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://api.crossref.org/**', (route) =>
    route.fulfill({
      json: {
        message: {
          'total-results': 900,
          items: Array.from({ length: 60 }, (_, i) =>
            windowItem(i, 2024 - (i % 6), { publisher: `Publisher ${i % 5}` }),
          ),
        },
      },
    }),
  );
  await page.goto('/?q=ancient+egypt&view=visualize');
  const canvas = page.locator('#viz-complete .viz-canvas');
  await expect(canvas.locator('svg')).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const left = Math.min(230, box.width * 0.3);
  const pitch = (box.width - left - 8) / 7;
  const centre = (column, row) => [
    box.x + left + pitch * (column + 0.5),
    box.y + 6 + 40 + 62 * (row + 0.4),
  ];
  // Which cells hold a faded bar, read from where the faded shapes actually are on screen.
  const fadedCells = () =>
    canvas.evaluate(
      (node, grid) => {
        const found = new Set();
        for (const shape of node.querySelectorAll(
          'svg [opacity="0.28"], svg [fill-opacity="0.28"]',
        )) {
          const rect = shape.getBoundingClientRect();
          if (!rect.width || rect.height > 14) continue;
          const column = Math.floor((rect.left + rect.width / 2 - grid.x - grid.left) / grid.pitch);
          const row = Math.floor((rect.top + rect.height / 2 - grid.y - 6 - 40) / 62);
          if (column >= 0 && column < 7 && row >= 0) found.add(row * 7 + column);
        }
        return [...found];
      },
      { x: box.x, y: box.y, left, pitch },
    );
  const rows = 6;
  const path = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [6, 4],
    [5, 4],
    [5, 3],
    [1, 5],
    [0, 5],
    [3, 2],
    [4, 2],
    [3, 3],
  ];
  for (const [column, row] of path) {
    await page.mouse.move(...centre(column, row), { steps: 8 });
    await page.waitForTimeout(250);
    const faded = await fadedCells();
    expect(faded, `cell ${column},${row}`).toHaveLength(7 * rows - 1);
    expect(faded).not.toContain(row * 7 + column);
    // Slide into the gap beside the bar: everything goes back to normal at once.
    await page.mouse.move(box.x + left + pitch * (column + 1), centre(column, row)[1], {
      steps: 4,
    });
    await expect
      .poll(async () => (await fadedCells()).length, `gap beside ${column},${row}`)
      .toBe(0);
    // And the gap between this bar and the next row.
    await page.mouse.move(...centre(column, row), { steps: 4 });
    await page.mouse.move(centre(column, row)[0], centre(column, row)[1] + 30, { steps: 4 });
    await expect
      .poll(async () => (await fadedCells()).length, `gap below ${column},${row}`)
      .toBe(0);
  }
  await page.mouse.move(box.x + 4, box.y + box.height + 40, { steps: 5 });
  await expect.poll(async () => (await fadedCells()).length).toBe(0);
});
