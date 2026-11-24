import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { choosePlace, stubPlaceServices } from './fixtures.js';

// Synthetic records are isolated to tests. The application has no fixture mode.
const publication = (i) => ({
  DOI: `10.1234/test-record-${i}`,
  title: [
    i === 0
      ? 'Settlement patterns at Deir el-Medina: "Evidence" and interpretation'
      : `Ancient Egyptian research ${i}`,
  ],
  author: [{ given: 'Ada', family: 'Researcher', ORCID: 'https://orcid.org/0000-0002-1825-0097' }],
  published: { 'date-parts': [[2020]] },
  type: 'book-chapter',
  'container-title': ['Research in ancient Egypt'],
  ISBN: ['9780198845461'],
  publisher: 'Test publisher',
  member: '78',
  page: '23-39',
  abstract: '<jats:p>Evidence from archaeological research in ancient Egypt.</jats:p>',
  reference: [{ DOI: '10.1234/reference-record', unstructured: 'A deposited reference' }],
});
async function fixtures(
  page,
  {
    fail = false,
    empty = false,
    hostile = false,
    referenceCount = 1,
    plainReference = false,
    updated = false,
    inBook = false,
    bare = false,
  } = {},
) {
  const requests = [];
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'medjat-landing-tiles',
      JSON.stringify(['hierakonpolis', 'ostraca', 'amarna', 'coffins', 'blue', 'dating']),
    ),
  );
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://assets.crossref.org/**', (r) => r.abort());
  await page.route('https://covers.openlibrary.org/**', (r) =>
    r.fulfill({ status: 404, body: '' }),
  );
  await page.route('https://api.crossref.org/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (fail) return route.abort();
    if (url.pathname.endsWith('/transform')) {
      const accept = route.request().headers().accept;
      const doi = decodeURIComponent(url.pathname.slice('/works/'.length, -'/transform'.length));
      const body = accept.includes('x-bibliography')
        ? 'Researcher, A. (2020). A "quoted" publication.'
        : accept.includes('bibtex')
          ? `@inbook{duplicate, title={A publication}, doi={${doi}}}`
          : `TY  - GENERIC\nTI  - A publication\nDO  - ${doi}\nER  -`;
      return route.fulfill({ status: 200, body, contentType: 'text/plain' });
    }
    if (url.pathname !== '/works')
      return route.fulfill({
        json: {
          message: {
            ...publication(0),
            DOI: '10.1234/reference-record',
            title: ['A referenced publication'],
          },
        },
      });
    if (
      url.searchParams.get('filter')?.includes('doi:') &&
      url.searchParams.get('select') === 'DOI,updated-by'
    )
      return route.fulfill({
        json: {
          message: {
            items: url.searchParams
              .get('filter')
              .split(',')
              .map((part) => part.replace('doi:', ''))
              .map((DOI) => ({
                DOI,
                ...(DOI === '10.1234/test-record-3' && {
                  'updated-by': [
                    { DOI: '10.1234/notice-record', type: 'retraction', source: 'publisher' },
                  ],
                }),
              })),
          },
        },
      });
    if (url.searchParams.get('filter')?.includes('relation.object:'))
      return route.fulfill({
        json: {
          message: {
            'total-results': 3,
            items: [
              { DOI: '10.1234/test-record-0', title: ['The chapter being read'] },
              { DOI: '10.1234/sibling-a', title: ['Sibling chapter A'], page: '5-9' },
              { DOI: '10.1234/sibling-b', title: ['Sibling chapter B'], page: '1-4' },
            ],
          },
        },
      });
    if (url.searchParams.get('rows') === '3')
      return route.fulfill({
        json: {
          status: 'ok',
          message: {
            items: [0, 1].map((i) => ({
              ...publication(40 + i),
              DOI: `10.1234/candidate-${i}`,
              title: [`Candidate monograph ${i}`],
            })),
            'total-results': 2,
          },
        },
      });
    const next =
      url.searchParams.get('cursor') === 'next' || url.searchParams.get('offset') === '25';
    const items = empty
      ? []
      : Array.from({ length: next ? 3 : 25 }, (_, i) => publication(i + (next ? 25 : 0)));
    if (items.length && referenceCount > 1)
      items[0].reference = Array.from({ length: referenceCount }, (_, i) => ({
        DOI: `10.1234/reference-${i}`,
        unstructured: `Deposited reference ${i + 1}`,
      }));
    if (updated && items.length > 1) {
      items[0]['updated-by'] = [
        {
          DOI: '10.1234/notice-record',
          type: 'retraction',
          label: 'Retraction',
          source: 'publisher',
        },
        {
          DOI: '10.1234/notice-record',
          type: 'retraction',
          label: 'Retraction',
          source: 'retraction-watch',
          updated: { 'date-time': '2021-12-15T00:00:00Z' },
        },
      ];
      items[1]['update-to'] = [
        {
          DOI: '10.1234/test-record-0',
          type: 'retraction',
          label: 'Retraction',
          source: 'publisher',
        },
      ];
    }
    if (bare && items.length) {
      delete items[0].abstract;
      items[0].reference = [];
    }
    if (inBook)
      for (const item of items)
        item.relation = {
          'is-part-of': [{ id: 'https://doi.org/10.1234/test-book', 'id-type': 'doi' }],
        };
    if (plainReference && items.length)
      items[0].reference = [{ unstructured: '1. Cited monograph about boundary stelae, 1998' }];
    if (hostile && items.length)
      Object.assign(items[0], {
        title: ['A "quoted" title <img src=x onerror="window.crossrefInjection=true">'],
        author: [
          {
            name: '<svg onload="window.crossrefInjection=true">Ada Researcher',
            ORCID: 'javascript:alert(1)',
          },
        ],
      });
    return route.fulfill({
      json: {
        status: 'ok',
        message: { items, 'total-results': empty ? 0 : 28, 'next-cursor': next ? 'end' : 'next' },
      },
    });
  });
  return requests;
}

test('sorting and navigation preserve unapplied search choices', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#searchInput').fill('Abydos');
  await page.locator('#periodSelect').selectOption('new-kingdom');
  await page.getByRole('radio', { name: 'Books', exact: true }).check();
  await expect(page.locator('#pendingQuery')).toBeVisible();
  await page.locator('#sortSelect').selectOption('newest');
  await expect(page.locator('#scopeNote')).toContainText('newest first');
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
    .toBe('ancient egypt New Kingdom Egypt');
  await expect(page.locator('#searchInput')).toHaveValue('Abydos');
  await expect(page.locator('#periodSelect')).toHaveValue('new-kingdom');
  await expect(page.getByRole('radio', { name: 'Books', exact: true })).toBeChecked();
  await expect(page.locator('#pendingQuery')).toBeVisible();
  await page.getByRole('button', { name: 'Load 25 more publications' }).click();
  await expect(page.locator('.result-row')).toHaveCount(28);
  await page.locator('#collectionNav').click();
  await page.locator('#exploreNav').click();
  await expect(page.locator('#searchInput')).toHaveValue('Abydos');
  await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#pendingQuery')).toBeHidden();
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
    .toContain('Abydos');
  await expect.poll(() => requests.at(-1).searchParams.get('filter')).toContain('type:book');
});

test('refresh restores collection scope, selected record, and an unfinished search', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.save-button').nth(0).click();
  await page.locator('.save-button').nth(1).click();
  await page.locator('#searchInput').fill('Abydos');
  await page.locator('#collectionNav').click();
  await page.locator('#collectionSearch').fill('  Settlement  ');
  await page.reload();
  await expect(page.locator('#collectionNav')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#collectionSearch')).toHaveValue('  Settlement  ');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await expect(page.locator('.detail-title')).toHaveText(/Settlement/);
  await expect(page.locator('#searchInput')).toHaveValue('Abydos');
});

test('refresh preserves a reference trail and expanded source connections', async ({ page }) => {
  await fixtures(page, { referenceCount: 30 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Show 20 more references', exact: true }).click();
  await page.getByRole('button', { name: 'View reference', exact: true }).nth(24).click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
  await page.reload();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Connections', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'View reference', exact: true })).toHaveCount(30);
  await expect(
    page.getByRole('button', { name: 'View reference', exact: true }).nth(24),
  ).toBeFocused();
});

test('browser back returns from mobile publication detail to its results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.result-open').nth(1).click();
  await expect(page.locator('.results-column')).toBeHidden();
  await page.goBack();
  await expect(page.locator('.results-column')).toBeVisible();
});

for (const [scope, included] of Object.entries({ all: [0, 1, 2], matching: [0], selected: [1] })) {
  test(`export exact membership in every format: ${scope}`, async ({ page }) => {
    await fixtures(page);
    await page.goto('/?q=ancient+egypt');
    await expect(page.locator('.result-row')).toHaveCount(25);
    for (const index of [0, 1, 2]) await page.locator('.save-button').nth(index).click();
    await page.locator('#collectionNav').click();
    await page
      .getByRole('checkbox', {
        name: 'Select publication: Ancient Egyptian research 1',
        exact: true,
      })
      .check();
    await page.locator('#collectionSearch').fill('Settlement');
    await expect(page.locator('#selectionSummary')).toHaveText(
      '1 selected (1 outside this search)',
    );
    await page.getByText('Collection tools', { exact: true }).click();
    await page.getByText(/^Export bibliography/).click();
    await page.locator('#exportScope').selectOption(scope);
    for (const format of ['json', 'csv', 'ris', 'bibtex']) {
      await page.locator('#exportFormat').selectOption(format);
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: /^Export \d+ publications?$/ }).click();
      await expect(page.locator('#exportStatus'), `${scope}/${format}`).toContainText(
        `Exported ${included.length}`,
      );
      const download = await downloaded;
      const text = await readFile(await download.path(), 'utf8');
      for (const index of [0, 1, 2])
        expect(text.includes(`10.1234/test-record-${index}`)).toBe(included.includes(index));
      await expect(page.locator('#exportStatus')).toContainText(`Exported ${included.length}`);
      await expect(page.locator('#exportScope')).toHaveValue(scope);
    }
    await page.locator('#collectionSearch').fill('no matching publication');
    await expect(page.locator('.detail-title')).toHaveCount(0);
    await page.locator('#exportScope').selectOption('matching');
    await expect(
      page.getByRole('button', { name: 'Export 0 publications', exact: true }),
    ).toBeDisabled();
    await page.locator('#exportScope').selectOption('selected');
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Export 0 publications', exact: true }),
    ).toBeDisabled();
  });
}

test('failed and cancelled exports leave the saved list and selection intact', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.save-button').first().click();
  await page.locator('#collectionNav').click();
  await page.getByRole('checkbox', { name: /^Select publication:/ }).check();
  await page.route('https://api.crossref.org/works/**/transform?**', (route) =>
    route.fulfill({ status: 400, body: '{}' }),
  );
  await page.getByText('Collection tools', { exact: true }).click();
  await page.getByText(/^Export bibliography/).click();
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  await expect(page.locator('#exportStatus')).toContainText('Export failed.');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('https://api.crossref.org/works/**/transform?**', async (route) => {
    await gate;
    await route.fulfill({ body: 'TY  - CHAP\nER  -' }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Export 1 publication', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  release();
  await expect(page.locator('#exportStatus')).toContainText('Export cancelled.');
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await expect(page.getByRole('checkbox', { name: /^Select publication:/ })).toBeChecked();
});

test('an export keeps its initial membership while the collection changes', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  for (const index of [0, 1]) await page.locator('.save-button').nth(index).click();
  await page.locator('#collectionNav').click();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('https://api.crossref.org/works/**/transform?**', async (route) => {
    await gate;
    const url = new URL(route.request().url());
    const doi = decodeURIComponent(url.pathname.slice('/works/'.length, -'/transform'.length));
    await route.fulfill({ body: `TY  - CHAP\nDO  - ${doi}\nER  -` });
  });
  await page.getByText('Collection tools', { exact: true }).click();
  await page.getByText(/^Export bibliography/).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 2 publications', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel export', exact: true })).toBeVisible();
  await page.locator('.save-button').nth(1).click();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  release();
  const output = await readFile(await (await downloaded).path(), 'utf8');
  expect(output).toContain('10.1234/test-record-0');
  expect(output).toContain('10.1234/test-record-1');
  await expect(page.locator('#exportStatus')).toContainText('Exported 2 saved publications');
});

test('a slow record restoration never overrides a later publication choice', async ({ page }) => {
  await fixtures(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('https://api.crossref.org/works/10.1234%2Fslow?**', async (route) => {
    await gate;
    await route
      .fulfill({
        json: { message: { ...publication(0), DOI: '10.1234/slow', title: ['Old slow link'] } },
      })
      .catch(() => {});
  });
  await page.goto('/?q=ancient+egypt&record=10.1234%2Fslow', { waitUntil: 'commit' });
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.result-open').nth(1).click();
  release();
  await expect(page.locator('.detail-title')).toHaveText('Ancient Egyptian research 1');
  await expect(page).toHaveURL(/record=10.1234%2Ftest-record-1/);
});

test('cross-field year errors open collapsed refinements and receive keyboard focus', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#refinements').evaluate((element) => {
    element.open = true;
  });
  await page.locator('#yearRefinement > summary').click();
  await page.locator('#yearFrom').fill('2025');
  await page.locator('#yearTo').fill('2000');
  await page.locator('#refinements').evaluate((element) => {
    element.open = false;
  });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#filterError')).toBeVisible();
  await expect(page.locator('#filterError')).toBeFocused();
});

test('search, inspect, save, reload, cite, and export a collection', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(requests.filter((u) => u.pathname === '/works')).toHaveLength(1);
  const save = page.getByRole('button', { name: /^Save to collection: Settlement/ });
  await save.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: /^Remove from collection: Settlement/ }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: 'Collection 1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collection 1', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cite', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Formatted citation' })).toHaveValue(
    /A "quoted" publication/,
  );
  await expect(page.getByRole('tab', { name: 'Cite', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();
  await expect(page.locator('.result-top h2')).toHaveCount(1);
  const rowWidth = await page
    .locator('.result-row')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(rowWidth).toBeGreaterThan(450);
  await page.getByText('Collection tools', { exact: true }).click();
  await page.getByText(/^Export bibliography/).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export \d+ publications?$/ }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.ris$/);
  expect(await readFile(await download.path(), 'utf8')).toMatch(/^TY {2}- CHAP/m);
  await page.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export \d+ publications?$/ }).click();
  const backup = await readFile(await (await backupDownload).path());
  await page.getByRole('button', { name: /^Remove from collection: Settlement/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next bibliography starts here.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.getByRole('button', { name: /^Remove from collection: Settlement/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next bibliography starts here.' }),
  ).toBeVisible();
  await page
    .locator('#importCollection')
    .setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('.result-row')).toHaveCount(1);
});

test('period queries, filters, pagination, and browser back preserve research context', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page
    .getByRole('combobox', { name: 'Historical period', exact: true })
    .selectOption('new-kingdom');
  await expect.poll(() => requests.filter((url) => url.pathname === '/works').length).toBe(2);
  await expect(page).toHaveURL(/period=new-kingdom/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
    .toContain('New Kingdom Egypt');
  await expect.poll(() => requests.at(-1).searchParams.has('filter')).toBe(false);
  await page.locator('#yearRefinement > summary').click();
  await page.getByLabel('From', { exact: true }).fill('2000');
  await page.getByLabel('To', { exact: true }).fill('2025');
  await page
    .locator('.filter-section > summary')
    .filter({ hasText: /^Metadata available$/ })
    .click();
  await page.getByRole('checkbox', { name: 'Abstract', exact: true }).check();
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page).toHaveURL(/from=2000/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect
    .poll(() => requests.at(-1).searchParams.get('filter'))
    .toContain('has-abstract:true');
  await page.getByRole('button', { name: 'Load 25 more publications' }).click();
  await expect(page.locator('.result-row')).toHaveCount(28);
  await page.goBack();
  await expect(page).not.toHaveURL(/from=2000/);
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
});

test('period refinements apply immediately and clear while retaining the query', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=Deir+el-Medina');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const period = page.getByRole('combobox', { name: 'Historical period', exact: true });
  await expect(page.locator('#filterForm')).toContainText('Historical period');
  await expect(page.locator('#periodButtons')).toHaveCount(0);
  await period.selectOption('new-kingdom');
  await expect(page.locator('#periodDates')).toHaveText('c. 1550–1069 BCE');
  await expect(page).toHaveURL(/period=new-kingdom/);
  await expect.poll(() => requests.filter((url) => url.pathname === '/works').length).toBe(2);

  await page
    .getByRole('searchbox', { name: 'Search publications', exact: true })
    .fill('Hierakonpolis');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/period=new-kingdom/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
    .toContain('Hierakonpolis');
  await expect(page.locator('#activeQuery')).toContainText('Period keywords: New Kingdom');

  await period.selectOption('old-kingdom');
  await page.getByRole('radio', { name: 'Books', exact: true }).check();
  await expect(page).toHaveURL(/period=old-kingdom/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect.poll(() => requests.at(-1).searchParams.get('filter')).toContain('type:book');

  await page.getByRole('button', { name: 'Clear refinements', exact: true }).click();
  await expect(page).not.toHaveURL(/period=|type=/);
  await expect(period).toHaveValue('');
  await expect(page.locator('#periodDates')).toBeHidden();
  await expect(
    page.getByRole('searchbox', { name: 'Search publications', exact: true }),
  ).toHaveValue('Hierakonpolis');
});

test('mobile detail navigation and long metadata reflow without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.result-open').first().click();
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('.results-column')).toBeHidden();
  await page.getByRole('button', { name: 'Back to publications', exact: true }).click();
  await expect(page.locator('.result-open').first()).toBeFocused();
  await page.getByRole('button', { name: 'Collection 0', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next bibliography starts here.' }),
  ).toBeVisible();
});

test('network errors remain visible and never become demonstration records', async ({ page }) => {
  await fixtures(page, { fail: true });
  await page.goto('/?q=ancient+egypt');
  await expect(
    page.getByText('We could not reach Crossref. Check your connection and retry.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry search' })).toBeVisible();
  await expect(page.locator('.result-row')).toHaveCount(0);
});

test('reference navigation retains its source publication', async ({ page }) => {
  await fixtures(page, { referenceCount: 30 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Show 20 more references', exact: true }).click();
  const reference = page.getByRole('button', { name: 'View reference', exact: true }).nth(24);
  await reference.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A referenced publication', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail-title')).toBeFocused();
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await expect(page.locator('.detail-title')).toHaveText(/Settlement patterns/);
  await expect(page.getByRole('tab', { name: 'Connections', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'View reference', exact: true })).toHaveCount(30);
  await expect(reference).toBeFocused();
});
test('empty search responses provide a useful recovery state', async ({ page }) => {
  await fixtures(page, { empty: true });
  await page.goto('/?q=ancient+egypt');
  await expect(
    page.getByRole('heading', { name: 'No publications found.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.result-row')).toHaveCount(0);
});
test('search and collection views have no detected WCAG AA violations', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const measurements = { widths: [], targets: [], scans: [] };
  const measureTarget = async (label, locator) =>
    measurements.targets.push({ label, box: await locator.boundingBox() });
  await measureTarget('Desktop result title', page.locator('.result-open').first());
  await measureTarget('Desktop Cite', page.getByRole('tab', { name: 'Cite', exact: true }));
  const check = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    measurements.scans.push({ violations: result.violations });
  };
  await check();
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await measureTarget('Reference DOI', page.locator('.reference-list small a').first());
  await check();
  await page.getByRole('tab', { name: 'Cite', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Formatted citation' })).toBeVisible();
  await check();
  await page.getByRole('button', { name: /^Save to collection: Settlement/ }).click();
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();
  await check();
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    measurements.widths.push({ width, documentWidth });
  }
  await check();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  measurements.widths.push({
    width: 320,
    documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    textScale: 2,
    view: 'collection',
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.locator('.result-open').first().click();
  await measureTarget('Mobile Cite', page.getByRole('tab', { name: 'Cite', exact: true }));
  await check();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  measurements.widths.push({
    width: 320,
    documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    textScale: 2,
  });
  const evidencePath = test.info().outputPath('audit-measurements.json');
  await writeFile(evidencePath, JSON.stringify(measurements, null, 2));
  await test
    .info()
    .attach('audit-measurements', { path: evidencePath, contentType: 'application/json' });
  expect(measurements.scans.flatMap((scan) => scan.violations)).toEqual([]);
  for (const target of measurements.targets) {
    expect(target.box.width, target.label).toBeGreaterThanOrEqual(44);
    expect(target.box.height, target.label).toBeGreaterThanOrEqual(44);
  }
  for (const measure of measurements.widths)
    expect(measure.documentWidth).toBeLessThanOrEqual(measure.width);
});
test('the main and Places inspectors keep citation controls uniquely identified', async ({
  page,
}) => {
  await fixtures(page);
  await stubPlaceServices(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#inspector').getByRole('tab', { name: 'Cite', exact: true }).click();
  await page.locator('#placesNav').click();
  await choosePlace(page, '756512');
  await page.locator('.other-place-candidates > summary').click();
  await expect(page.locator('.place-publication-title').first()).toBeVisible();
  await page.locator('.place-publication-title').first().click();
  await page.locator('.places-inspector').getByRole('tab', { name: 'Cite', exact: true }).click();
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicates).toEqual([]);
});

test('untrusted metadata remains text instead of executable markup', async ({ page }) => {
  await fixtures(page, { hostile: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.locator('.result-open').first()).toHaveText('A "quoted" title');
  await expect(page.locator('.result-row img')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.crossrefInjection)).toBeUndefined();
});

test('simultaneous saves and removals stay consistent across research tabs', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await fixtures(page);
  await fixtures(other);
  await Promise.all([page.goto('/?q=ancient+egypt'), other.goto('/?q=ancient+egypt')]);
  await Promise.all([
    expect(page.locator('.result-row')).toHaveCount(25),
    expect(other.locator('.result-row')).toHaveCount(25),
  ]);
  await Promise.all([
    page.locator('.save-button').nth(0).click(),
    other.locator('.save-button').nth(1).click(),
  ]);
  await expect(page.locator('#collectionCount')).toHaveText('2');
  await expect(other.locator('#collectionCount')).toHaveText('2');
  await Promise.all([
    page.locator('.save-button').nth(0).click(),
    other.locator('.save-button').nth(2).click(),
  ]);
  await expect(page.locator('#collectionCount')).toHaveText('2');
  await expect(other.locator('.save-button').nth(0)).toHaveAttribute('aria-pressed', 'false');
  await other.reload();
  await expect(other.locator('#collectionCount')).toHaveText('2');
  await expect(other.locator('.save-button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(other.locator('.save-button').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await other.locator('#collectionNav').click();
  await Promise.all([
    page.locator('.save-button').nth(1).click(),
    other.locator('#importCollection').setInputFiles({
      name: 'additional-publication.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, records: [{ raw: publication(3) }] })),
    }),
  ]);
  await expect(page.locator('#collectionCount')).toHaveText('2');
  await expect(page.locator('.save-button').nth(1)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.save-button').nth(3)).toHaveAttribute('aria-pressed', 'true');
});

test('legacy collection migrates once and cannot resurrect a removed publication', async ({
  page,
}) => {
  await fixtures(page);
  await page.addInitScript(
    (raw) =>
      localStorage.setItem(
        'ancient-egypt-research-collection-v1',
        JSON.stringify({ version: 1, records: [{ raw, savedAt: '2026-11-18T12:00:00Z' }] }),
      ),
    publication(0),
  );
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await page.locator('.save-button').first().click();
  await expect(page.locator('#collectionCount')).toHaveText('0');
  await page.reload();
  await expect(page.locator('#collectionCount')).toHaveText('0');
});

test('unavailable persistent storage keeps an explicit session collection', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.save-button').first().click();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await page.locator('#collectionNav').click();
  await expect(page.locator('#requestNotice')).toContainText('for this visit only');
});

test('date sorts browse subsequent pages with supported pagination', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  for (const sort of ['newest', 'oldest']) {
    await page.locator('#sortSelect').selectOption(sort);
    await expect(page.locator('#scopeNote')).toContainText('Sorted by publication date');
    await expect(page.locator('#resultCount')).toContainText(/25( of [\d,+]+)? results loaded/);
    await expect.poll(() => requests.at(-1).searchParams.get('offset')).toBe('0');
    await expect.poll(() => requests.at(-1).searchParams.has('cursor')).toBe(false);
    await page.getByRole('button', { name: 'Load 25 more publications' }).click();
    await expect(page.locator('.result-row')).toHaveCount(28);
    await expect.poll(() => requests.at(-1).searchParams.get('offset')).toBe('25');
  }
});
test('a rejected changed search preserves clearly identified previous results', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.route('https://api.crossref.org/works?**', (route) =>
    route.fulfill({ status: 400, json: { message: 'invalid request' } }),
  );
  await page.locator('#searchInput').fill('a changed search');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit search', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry search' })).toHaveCount(0);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.locator('#resultCount')).toContainText('Previous results:');
  await expect(page.locator('#scopeNote')).toContainText(
    'last successful search for “ancient egypt”',
  );
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.locator('#searchInput')).toHaveValue('ancient egypt');
  await expect(page.locator('#requestNotice')).toBeHidden();
  await expect(page.locator('#resultCount')).not.toContainText('Previous results');
  await expect(page).not.toHaveURL(/a\+changed\+search/);
});

test('added context is removable without applying drafts and survives refresh and history', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=Hatshepsut');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.locator('#resultCount')).toHaveText(/^25( of [\d,+]+)? results loaded$/);
  await expect(page.locator('#effectiveQuery')).toContainText('Hatshepsut ancient Egypt');
  await page.locator('#searchInput').fill('Unfinished topic');
  await page.getByRole('button', { name: 'Remove added ancient Egypt terms', exact: true }).click();
  await expect(page).toHaveURL(/context=0/);
  await expect(page.locator('#effectiveQuery')).toHaveText(
    'Ranking context sent to Crossref: Hatshepsut',
  );
  await expect(page.locator('#searchInput')).toHaveValue('Unfinished topic');
  await expect(page.locator('#addEgyptContext')).not.toBeChecked();
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toBe('Hatshepsut');
  await page.reload();
  await expect(page.locator('#effectiveQuery')).toHaveText(
    'Ranking context sent to Crossref: Hatshepsut',
  );
  await expect(page.locator('#addEgyptContext')).not.toBeChecked();
  await page.goBack();
  await expect(page.locator('#effectiveQuery')).toContainText('Hatshepsut ancient Egypt');
  await expect(page.locator('#addEgyptContext')).toBeChecked();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`sticky search hands off without overflow or layout shifts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixtures(page);
    await page.goto('/?q=ancient+egypt');
    await expect(page.locator('.result-row')).toHaveCount(25);
    const nav = page.locator('#navSearchForm');
    await expect(nav).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#searchInput').fill('Abydos draft');
    await expect(page.locator('#navSearchInput')).toHaveValue('Abydos draft');
    const height = await page
      .locator('.masthead')
      .evaluate((e) => e.getBoundingClientRect().height);
    const tabs = await page
      .locator('.main-nav')
      .evaluate((e) => e.getBoundingClientRect().toJSON());
    await page.evaluate(() => window.scrollTo(0, 650));
    await expect(nav).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.masthead')).toHaveCSS('position', 'sticky');
    const bounds = await nav.boundingBox();
    const headerBounds = await page.locator('.masthead').boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(headerBounds.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(headerBounds.y + headerBounds.height);
    if (width >= 1000) {
      const navBounds = await page.locator('.main-nav').boundingBox();
      const attribution = await page.locator('.header-attribution').boundingBox();
      expect(bounds.x).toBeGreaterThan(navBounds.x + navBounds.width);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(attribution.x);
      await expect(page.locator('.main-nav')).toHaveCSS('gap', '24px');
      expect(attribution.x + attribution.width).toBe(width - (width >= 1300 ? 40 : 24));
    }
    await expect(page.locator('#aboutToggle')).toHaveCount(0);
    expect(await page.locator('.masthead').evaluate((e) => e.getBoundingClientRect().height)).toBe(
      height,
    );
    const stickyTabs = await page
      .locator('.main-nav')
      .evaluate((e) => e.getBoundingClientRect().toJSON());
    expect(stickyTabs).toEqual(tabs);
    await expect(page.locator('.brand-name')).toHaveCSS(
      'visibility',
      width >= 1000 ? 'visible' : 'hidden',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#navSearchInput').fill('Hierakonpolis draft');
    await expect(page.locator('#searchInput')).toHaveValue('Hierakonpolis draft');
    await page.evaluate(() => window.scrollTo(0, 0));
    // A focused input stays usable until the user leaves it.
    await expect(nav).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#searchInput').focus();
    await expect(nav).toHaveAttribute('aria-hidden', 'true');
    expect(await nav.evaluate((e) => e.inert)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(nav).toHaveCSS('transition-duration', '0s');
  });
}

test('global navigation search opens Explore and preserves synchronized text', async ({ page }) => {
  const requests = await fixtures(page);
  await stubPlaceServices(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  for (const id of ['collectionNav', 'visualizeNav', 'placesNav']) {
    await page.locator(`#${id}`).click();
    if (id === 'visualizeNav')
      await expect(
        page.getByRole('button', { name: 'Refresh summaries', exact: true }),
      ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 650));
    await expect(page.locator('#navSearchForm')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#navSearchInput').fill(`Search from ${id}`);
    await page.locator('#navSearchForm').getByRole('button').click();
    await expect(page.locator('#exploreNav')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
      .toContain(`Search from ${id}`);
    await expect(page.locator('#searchInput')).toHaveValue(`Search from ${id}`);
  }
});

test('immediate filters retain pending text and dates, and every filter can be removed', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=Abydos&context=0');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#searchInput').fill('Unsubmitted topic');
  await page.locator('#yearRefinement > summary').click();
  await page.locator('#yearFrom').fill('2000');
  await page.getByRole('radio', { name: 'Books', exact: true }).check();
  await expect.poll(() => requests.at(-1).searchParams.get('filter')).toBe('type:book');
  await expect(page.locator('#searchInput')).toHaveValue('Unsubmitted topic');
  await expect(page.locator('#yearFrom')).toHaveValue('2000');
  await expect(page.locator('#yearPending')).toBeVisible();
  await expect(page).not.toHaveURL(/from=2000/);
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect
    .poll(() => requests.at(-1).searchParams.get('filter'))
    .toContain('from-pub-date:2000');
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toBe('Abydos');
  await page.getByRole('button', { name: 'Remove filter: Book', exact: true }).click();
  await expect(page).not.toHaveURL(/type=book/);
  await expect(page.getByRole('button', { name: 'Clear refinements', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Clear refinements', exact: true }).click();
  await expect(page).not.toHaveURL(/from=|type=/);
  await expect(page.locator('#searchInput')).toHaveValue('Unsubmitted topic');
});

test('search options use supported author search and validate exact DOI entry', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt&context=0');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#searchField').selectOption('author');
  await page.locator('#searchInput').fill('Ada Researcher');
  await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => requests.at(-1).searchParams.get('query.author')).toBe('Ada Researcher');
  expect(requests.at(-1).searchParams.has('query.bibliographic')).toBe(false);
  await page.reload();
  await expect(page.locator('#searchField')).toHaveValue('author');
  await page.locator('#searchField').selectOption('doi');
  await page.locator('#searchInput').fill('not a DOI');
  await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#searchError')).toContainText('Enter a complete DOI');
  await page.locator('#searchInput').fill('10.1234/reference-record');
  await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#scopeNote')).toContainText('one exact Crossref record');
});

test('compact search switches at the primary search edge in both scroll directions', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const edge = await page.evaluate(
    () =>
      document.getElementById('primarySearchRow').getBoundingClientRect().bottom -
      document.querySelector('.masthead').getBoundingClientRect().height,
  );
  await page.evaluate((y) => window.scrollTo(0, y), edge + 1);
  await expect(page.locator('#navSearchForm')).toHaveAttribute('aria-hidden', 'false');
  await page.evaluate((y) => window.scrollTo(0, y), edge - 1);
  await expect(page.locator('#navSearchForm')).toHaveAttribute('aria-hidden', 'true');
});

test('removing the final refinement and clearing all retain meaningful keyboard focus', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=Abydos&context=0&type=book');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const summary = page.locator('.current-filters > summary');
  await page.getByRole('button', { name: 'Remove filter: Book', exact: true }).click();
  await expect(summary).toBeFocused();
  await page.getByRole('radio', { name: 'Books', exact: true }).check();
  await page.getByRole('button', { name: 'Clear refinements', exact: true }).click();
  await expect(summary).toBeFocused();
});

test('search help from Visualize opens a visible explanation and preserves the draft', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#searchInput').fill('An unfinished topic');
  await page.locator('#visualizeNav').click();
  await page.getByRole('link', { name: 'Search help', exact: true }).click();
  await expect(page.locator('#exploreNav')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#searchExplanation')).toBeVisible();
  await expect(page.locator('#searchExplanation > summary')).toBeFocused();
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished topic');
});

test('the masthead reflows enlarged text and hands off at a fractional header height', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const geometry = await page.evaluate(() => ({
    header: document.querySelector('.masthead').getBoundingClientRect().toJSON(),
    nav: document.querySelector('.main-nav').getBoundingClientRect().toJSON(),
    width: document.documentElement.scrollWidth,
  }));
  expect(geometry.width).toBe(320);
  expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.header.bottom);
  const before = geometry.header.height;
  const enlargedEdge = await page.evaluate(
    () =>
      document.getElementById('primarySearchRow').getBoundingClientRect().bottom -
      document.querySelector('.masthead').getBoundingClientRect().height,
  );
  await page.evaluate((y) => window.scrollTo(0, y), enlargedEdge + 2);
  await expect(page.locator('#navSearchForm')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.locator('.masthead').evaluate((e) => e.getBoundingClientRect().height)).toBe(
    before,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '17.1px';
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          parseFloat(document.documentElement.style.getPropertyValue('--masthead-height')) ===
          document.querySelector('.masthead').getBoundingClientRect().height,
      ),
    )
    .toBe(true);
  expect(
    await page.locator('.masthead').evaluate((e) => e.getBoundingClientRect().height % 1),
  ).not.toBe(0);
  const edge = await page.evaluate(
    () =>
      document.getElementById('primarySearchRow').getBoundingClientRect().bottom -
      document.querySelector('.masthead').getBoundingClientRect().height,
  );
  await page.evaluate((y) => window.scrollTo(0, y), edge + 1);
  await expect(page.locator('#navSearchForm')).toHaveAttribute('aria-hidden', 'false');
});

test('workspace tabs restore each reading position and Collection can map its saved records', async ({
  page,
}) => {
  await fixtures(page);
  await stubPlaceServices(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-open')).toHaveCount(25);
  await page.locator('.save-button').nth(0).click();
  await page.locator('.save-button').nth(1).click();
  await page.locator('.result-open').nth(8).click();
  await page.locator('#inspector').getByRole('tab', { name: 'Connections', exact: true }).click();
  const { x, y, width, height } = await page.locator('#collectionNav').boundingBox();
  const exploreScroll = await page.evaluate(() => window.scrollY);
  expect(exploreScroll).toBeGreaterThan(0);

  // Click the sticky control in place so the driver does not scroll it into view first.
  await page.mouse.click(x + width / 2, y + height / 2);
  await expect(page.locator('.collection-actions-menu')).not.toHaveAttribute('open', '');
  await expect(page.locator('.result-open').first()).toBeInViewport();
  await page.locator('.result-open').nth(1).click();
  const collectionTitle = await page.locator('.detail-title').innerText();
  await page
    .getByRole('checkbox', { name: /^Select publication:/ })
    .nth(1)
    .check();
  await page.getByText('Collection tools', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Discover references from 1 selected publication' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Map saved publications' }).click();
  await expect(page.locator('#places h1')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Your collection', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.place-collection-coverage')).toContainText('2 saved publications');
  await page.getByRole('button', { name: 'Back to collection' }).click();
  await expect(page.getByRole('button', { name: 'Map saved publications' })).toBeFocused();
  await expect(page.locator('.detail-title')).toHaveText(collectionTitle);

  await page.locator('#exploreNav').click();
  await expect(page.locator('.detail-title')).toHaveText('Ancient Egyptian research 8');
  await expect(
    page.locator('#inspector').getByRole('tab', { name: 'Connections', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(exploreScroll, -1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.result-open').nth(5).click();
  await expect(page.locator('.results-column')).toBeHidden();
  await page.locator('#collectionNav').click();
  await expect(page.locator('.results-column')).toBeVisible();
  await page.locator('#exploreNav').click();
  await expect(page.locator('.results-column')).toBeHidden();
  await expect(page.locator('.detail-title')).toHaveText('Ancient Egyptian research 5');
});

test('the landing stays idle and thematic tiles submit their exact titles', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/');
  const tiles = page.getByRole('link').and(page.locator('.research-tile'));
  const search = page.locator('#searchInput');
  const results = page.locator('#research');
  await expect(tiles).toHaveCount(6);
  await expect(search).toHaveValue('');
  await expect(results).toBeHidden();
  await expect(page.locator('.intro h1')).toHaveText('Follow the research.');
  await page.locator('#primarySearchSubmit').click();
  await expect(search).toBeFocused();
  expect(requests).toHaveLength(0);

  await page.locator('#visualizeNav').click();
  await expect(page.getByText('Search Explore to visualize results.')).toBeVisible();
  await page.getByRole('button', { name: 'Search Explore', exact: true }).click();
  await expect(tiles.first()).toBeVisible();
  expect(requests).toHaveLength(0);

  await page.locator('.tile-photo').last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('.tile-photo')
        .evaluateAll((photos) => photos.every((photo) => photo.complete && photo.naturalWidth > 0)),
    )
    .toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('landing-desktop.png'), fullPage: true });
  const tileColor = await tiles.nth(1).evaluate((tile) => getComputedStyle(tile).color);
  await page.mouse.move(0, 0);
  for (const arrow of await page.locator('.tile-arrow').all())
    await expect(arrow).toHaveCSS('opacity', '1');
  await tiles.first().hover();
  await expect(tiles.first()).toHaveCSS('color', tileColor);
  await expect(tiles.first().locator('.tile-photo')).toHaveCSS(
    'transform',
    'matrix(1.04, 0, 0, 1.04, 0, 0)',
  );
  await expect(tiles.first().locator('.tile-arrow')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 4, 0)',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(tiles.first().locator('.tile-photo')).toHaveCSS('transform', 'none');
  await expect(tiles.first().locator('.tile-arrow')).toHaveCSS('transform', 'none');

  for (const [width, columns] of [
    [1440, 3],
    [768, 2],
    [390, 1],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.research-tiles').evaluate((grid) => ({
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.columns).toBe(columns);
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
  }
  const links = await tiles.evaluateAll((anchors) =>
    anchors.map((link) => ({
      title: link.querySelector('.tile-title').textContent.trim(),
      q: new URL(link.href).searchParams.get('q'),
    })),
  );
  expect(links.every(({ title, q }) => title === q)).toBe(true);

  const first = tiles.first();
  await search.fill('Petrie');
  await page.locator('#searchField').selectOption('author');
  expect(requests).toHaveLength(0);
  await page.mouse.move(0, 0);
  await page.locator('#landingPlaces').focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await expect(first.locator('.tile-arrow')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('Hierakonpolis and the Predynastic elite cemetery');
  await expect(page.locator('#resultsTitle')).toBeFocused();
  await expect(page.locator('.result-row')).toHaveCount(25);
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get('query.bibliographic')).toBe(
    'Hierakonpolis and the Predynastic elite cemetery',
  );
  const narrower = page.getByRole('button', { name: 'Search just Hierakonpolis' });
  await expect(narrower).toBeInViewport();
  expect((await narrower.boundingBox()).y).toBeLessThan(
    (await page.locator('.result-row').first().boundingBox()).y,
  );
  await narrower.click();
  await expect(page).toHaveURL(/q=Hierakonpolis&/);
  await expect(page.locator('#scopeNote')).toContainText('Results for “Hierakonpolis”');
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toBe('Hierakonpolis');
  await page.goBack();
  await expect(page.locator('#scopeNote')).toContainText(
    'Results for “Hierakonpolis and the Predynastic elite cemetery”',
  );
  await expect(narrower).toBeVisible();
  const beforeLanding = requests.length;
  await page.goBack();
  await expect(first).toBeFocused();
  await expect(results).toBeHidden();
  await expect(search).toHaveValue('Petrie');
  await expect(page.locator('#searchField')).toHaveValue('author');
  expect(requests).toHaveLength(beforeLanding);
});

test('a direct record URL retrieves only the requested DOI', async ({ page }) => {
  const calls = [];
  await page.route('https://api.crossref.org/**', (route) => {
    calls.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { message: publication(1) } });
  });
  await page.goto('/?record=10.1234%2Ftest-record-1');
  await expect(page.locator('.result-open')).toHaveText('Ancient Egyptian research 1');
  await expect(page.locator('#landing')).toBeHidden();
  expect(calls).toEqual(['/works/10.1234%2Ftest-record-1']);
});

test('a missing landing photograph leaves its tile visible and usable', async ({ page }) => {
  const requests = await fixtures(page);
  await page.route('**/assets/landing/hierakonpolis*.webp', (route) => route.abort());
  await page.goto('/');
  const tile = page.getByRole('link', { name: 'Hierakonpolis and the Predynastic elite cemetery' });
  await expect(tile).toBeVisible();
  await expect(tile.locator('img')).toHaveJSProperty('naturalWidth', 0);
  expect((await tile.boundingBox()).height).toBeGreaterThan(44);
  expect(requests).toHaveLength(0);
  await tile.click();
  await expect(page.locator('.result-row')).toHaveCount(25);
});

test('the local server enforces the production policy for application assets', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  await expect(page.locator('#collectionNav')).toBeEnabled();
  await expect(page.locator('.research-tile img').first()).toHaveJSProperty('complete', true);
});

test('import previews conflicts before optionally replacing existing work', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await page.locator('.save-button').nth(1).click();
  await page.locator('#collectionNav').click();
  await expect(page.locator('.result-open')).toHaveText('Ancient Egyptian research 1');

  const decisionKey = 'egypt-research-review:place-scope:10.1234/test-record-1';
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ decision: 'place-specific' })),
    decisionKey,
  );
  const backup = {
    version: 2,
    records: [{ raw: { ...publication(1), title: ['Imported draft'] } }, { raw: publication(2) }],
    research: {
      'place-scope:10.1234/test-record-1': { decision: 'not-place-specific' },
      'place-scope:10.1234/test-record-2': { decision: 'invalid' },
    },
  };
  const preview = () =>
    page.locator('#importCollection').setInputFiles({
      name: 'collection.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page.getByText('Collection tools', { exact: true }).click();
  await preview();
  await expect(
    page.getByText('This backup matches 1 saved publication and 1 research decision.'),
  ).toBeVisible();
  await expect(page.locator('.result-open')).toHaveCount(1);
  await page.getByRole('button', { name: 'Keep existing and import new' }).click();
  await expect(page.locator('.import-status')).toContainText(
    'Skipped 1 invalid research decision.',
  );
  await expect(page.locator('.result-open')).toHaveText([
    'Ancient Egyptian research 2',
    'Ancient Egyptian research 1',
  ]);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).decision, decisionKey),
  ).toBe('place-specific');

  await preview();
  await page.getByRole('button', { name: 'Replace matching entries and import new' }).click();
  await expect(page.locator('.result-open')).toHaveText([
    'Imported draft',
    'Ancient Egyptian research 2',
  ]);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).decision, decisionKey),
  ).toBe('not-place-specific');
});

test('references without a DOI can be searched in Crossref from the inspector', async ({
  page,
}) => {
  const requests = await fixtures(page, { plainReference: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await expect(page.getByText('Cited monograph about boundary stelae, 1998')).toBeVisible();
  await expect(page.getByText('1. Cited monograph')).toHaveCount(0);
  const before = requests.length;
  await page.getByRole('button', { name: 'Find in Crossref', exact: true }).click();
  await expect(page.getByText('Possible matches only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View possible match' })).toHaveCount(2);
  expect(requests.length).toBe(before + 1);
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toContain('Cited monograph');
  await page.getByRole('button', { name: 'View possible match' }).first().click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
});

test('saved publications take notes and tags that filter, sort, and export', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('.save-button').nth(0).click();
  await page.locator('.save-button').nth(1).click();
  await page.locator('#collectionNav').click();
  await expect(page.locator('.result-row')).toHaveCount(2);
  await expect(page.locator('#collectionTag')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Check saved publications for metadata changes' }),
  ).toBeVisible();

  await page.locator('.result-open').first().click();
  await page.getByLabel('Note', { exact: true }).fill('Compare with the Naqada chronology.');
  await page.getByLabel(/^Tags/).fill('chronology, Predynastic, chronology');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Notes saved in this browser.')).toBeVisible();
  await expect(page.locator('.tag-badge')).toHaveText(['#chronology', '#Predynastic']);
  await expect(page.locator('#collectionTag option')).toHaveText([
    'All tags',
    'chronology (1)',
    'Predynastic (1)',
  ]);

  await page.locator('#collectionTag').selectOption('chronology');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('#collectionTag').selectOption('');
  await page.locator('#collectionSearch').fill('naqada chronology');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('#collectionSearch').fill('');
  await page.locator('#collectionSort').selectOption('title');
  await expect(page.locator('.result-open').first()).toHaveText('Ancient Egyptian research 1');
  await page.locator('#collectionSort').selectOption('saved-new');
  const newest = await page.locator('.result-open').first().innerText();
  await page.locator('#collectionSort').selectOption('saved-old');
  expect(await page.locator('.result-open').first().innerText()).not.toBe(newest);

  await page.reload();
  await page.locator('#collectionNav').click();
  await expect(page.locator('.tag-badge')).toHaveText(['#chronology', '#Predynastic']);
  await page.getByText('Collection tools', { exact: true }).click();
  await page.getByText(/^Export bibliography/).click();
  await page.locator('#exportFormat').selectOption('csv');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export 2 publications/ }).click();
  const csv = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of csv) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  expect(text).toContain('"Tags","Notes"');
  expect(text).toContain('"chronology; Predynastic","Compare with the Naqada chronology."');
});

test('recent searches return to the landing page and can be kept or removed', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('#searchHistory')).toBeHidden();
  await page.locator('#searchInput').fill('Hatshepsut');
  await page.locator('#primarySearchSubmit').click();
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.goto('/');
  await expect(page.locator('#searchHistory')).toBeVisible();
  await expect(page.locator('.history-query')).toHaveText('Hatshepsut');
  await page.getByRole('button', { name: 'Keep search: Hatshepsut' }).click();
  await expect(page.getByRole('button', { name: 'Stop keeping search: Hatshepsut' })).toHaveText(
    'Kept',
  );
  await page.reload();
  await expect(page.locator('.history-query')).toHaveText('Hatshepsut');
  await page.locator('.history-link').click();
  await expect(page.locator('#searchInput')).toHaveValue('Hatshepsut');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.goto('/');
  await page.getByRole('button', { name: 'Remove search: Hatshepsut' }).click();
  await expect(page.locator('#searchHistory')).toBeHidden();
});

test('results offer searches beyond Crossref with the applied search words', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=Hierakonpolis+temple');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const summary = page.getByText('Search beyond Crossref', { exact: true });
  await summary.click();
  const scholar = page.getByRole('link', { name: 'Google Scholar' });
  await expect(scholar).toHaveAttribute(
    'href',
    /scholar\.google\.com\/scholar\?q=Hierakonpolis%20temple/,
  );
  await expect(scholar).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('link', { name: /^Internet Archive Scholar/ })).toHaveAttribute(
    'href',
    /scholar\.archive\.org\/search\?q=Hierakonpolis%20temple/,
  );
});

test('inspector views follow the tab pattern with arrow-key navigation', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.getByRole('tablist', { name: 'Publication detail views' })).toBeVisible();
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  const connections = page.getByRole('tab', { name: 'Connections', exact: true });
  await expect(connections).toBeFocused();
  await expect(connections).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Follow connections');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Cite', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute('tabindex', '0');
  await expect(connections).toHaveAttribute('tabindex', '-1');
});

test('Most cited reorders loaded results without asking Crossref to sort by citations', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#sortSelect').selectOption('cited');
  await expect(page.locator('#scopeNote')).toContainText('ordered by citation count');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const last = requests.at(-1).searchParams;
  expect(last.get('sort')).toBe('score');
  expect(last.has('offset')).toBe(false);
});

test('retractions and notices are flagged in results and the inspector', async ({ page }) => {
  await fixtures(page, { updated: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const rows = page.locator('.result-row');
  await expect(rows.nth(0).locator('.metadata-badge', { hasText: 'Retracted' })).toBeVisible();
  await expect(
    rows.nth(1).locator('.metadata-badge', { hasText: 'Retraction notice' }),
  ).toBeVisible();
  await expect(rows.nth(2).locator('.metadata-badge', { hasText: /Retract/ })).toHaveCount(0);

  const banner = page.getByRole('region', { name: 'Update notices' });
  await expect(banner).toContainText('Retracted');
  await expect(banner).toContainText(
    'Recorded by the publisher and Retraction Watch, December 15, 2021',
  );
  const axe = await new AxeBuilder({ page })
    .include('.update-banner')
    .include('.result-row')
    .analyze();
  expect(axe.violations).toEqual([]);

  await banner.getByRole('button', { name: 'View the notice' }).click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await rows.nth(1).locator('.result-open').click();
  await expect(banner).toContainText('This record is a retraction notice.');
  await expect(
    banner.getByRole('button', { name: 'View the publication it concerns' }),
  ).toBeVisible();
});

test('opening Collection checks saved publications for update notices once', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page
    .getByRole('button', { name: /^Save to collection: Ancient Egyptian research 3$/ })
    .click();
  await page
    .getByRole('button', { name: /^Save to collection: Ancient Egyptian research 4$/ })
    .click();
  await expect(page.getByRole('button', { name: 'Collection 2', exact: true })).toBeVisible();

  await page.locator('#collectionNav').click();
  await expect(
    page.getByText('1 saved publication has update notices listed by Crossref.'),
  ).toBeVisible();
  const checks = () =>
    requests.filter((url) => url.searchParams.get('select') === 'DOI,updated-by');
  expect(checks()).toHaveLength(1);
  expect(checks()[0].searchParams.get('filter')).toBe(
    'doi:10.1234/test-record-3,doi:10.1234/test-record-4',
  );
  const flagged = page.locator('.result-row', { hasText: 'Ancient Egyptian research 3' });
  await expect(flagged.locator('.metadata-badge', { hasText: 'Retracted' })).toBeVisible();
  await expect(
    page
      .locator('.result-row', { hasText: 'Ancient Egyptian research 4' })
      .locator('.badge-serious'),
  ).toHaveCount(0);
  await flagged.locator('.result-open').click();
  await expect(page.getByRole('region', { name: 'Update notices' })).toContainText('Retracted');

  await page.locator('#exploreNav').click();
  await page.locator('#collectionNav').click();
  await page.waitForTimeout(300);
  expect(checks()).toHaveLength(1);
});

test('the inspector links the registering publisher to its Participation Report', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const link = page.getByRole('link', { name: 'Crossref Participation Report for Test publisher' });
  await expect(link).toHaveText('Participation Report');
  await expect(link).toHaveAttribute('href', 'https://www.crossref.org/members/prep/78/');
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('Visualize shows how widely the ranked results are spread across publishers', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#visualizeNav').click();
  const panel = page.locator('.chart-panel', { hasText: 'Leading publishers' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('1 distinct publisher across 25 records');
  await expect(panel).toContainText('Test publisher');
  await expect(panel).toContainText('25');
});

test('a chapter offers to open the book it is part of', async ({ page }) => {
  await fixtures(page, { inBook: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const book = page.locator('.detail-section', {
    has: page.getByRole('heading', { name: 'Part of a book' }),
  });
  await expect(book).toContainText('A referenced publication');
  await expect(book).toContainText('Ada Researcher');
  await expect(book).toContainText('2020 · Test publisher · Book chapter');
  await book.getByRole('button', { name: 'View the book' }).click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await expect(book).toBeVisible();
});

test('a chapter lists the other chapters of its book', async ({ page }) => {
  const requests = await fixtures(page, { inBook: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'Show other chapters in this book' }).click();
  const items = page.locator('.detail-section', {
    has: page.getByRole('heading', { name: 'Part of a book' }),
  });
  await expect(items.locator('li')).toHaveCount(2);
  await expect(items.locator('li').nth(0)).toContainText('Sibling chapter B');
  await expect(items.locator('li').nth(0)).toContainText('pp. 1-4');
  await expect(items.getByText('The chapter being read')).toHaveCount(0);
  const query = requests.find((url) =>
    url.searchParams.get('filter')?.includes('relation.object:'),
  );
  expect(query.searchParams.get('filter')).toBe(
    'relation.type:is-part-of,relation.object:https://doi.org/10.1234/test-book',
  );
  await items.getByRole('button', { name: 'View chapter' }).first().click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
});

test('the publication type list says edited volumes, not edited books', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: /Show more types/ }).click();
  await expect(page.getByRole('radio', { name: 'Edited volumes' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Edited books' })).toHaveCount(0);
});

test('the selected result is marked neutrally, never in the error red', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const selected = page.locator('.result-row.is-selected');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute('aria-current', 'true');
  const [row, neutral, red] = await page.evaluate(() => {
    const paint = (name) => {
      const probe = document.createElement('div');
      probe.style.background = `var(${name})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    const rowStyle = getComputedStyle(document.querySelector('.result-row.is-selected'));
    return [rowStyle.backgroundColor, paint('--color-current'), paint('--color-selected')];
  });
  expect(row).toBe(neutral);
  expect(row).not.toBe(red);
});

test('a place mention shows only the place, plus the name it matched when that differs', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const place = page.getByRole('button', { name: /^Explore Deir el-Medina in Places$/ });
  await expect(place).toBeVisible();
  await expect(place).not.toContainText('title');
  await expect(place).not.toContainText('abstract');
});

test('missing abstracts and references say not available, without the word deposited', async ({
  page,
}) => {
  await fixtures(page, { bare: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const panel = page.locator('#inspector');
  await expect(panel).toContainText(
    'No abstract available. Open the publication for more information.',
  );
  await expect(panel).not.toContainText(/deposit/i);
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await expect(panel).toContainText('No reference list available.');
  await expect(panel).not.toContainText(/deposit/i);
  await page.getByRole('tab', { name: 'Cite', exact: true }).click();
  await expect(panel).not.toContainText(/deposit/i);
});

test('a visit picks its landing tiles once, keeps them on reload, and credits only those', async ({
  page,
}) => {
  await page.goto('/');
  const tiles = page.locator('.research-tile');
  await expect(tiles).toHaveCount(6);
  const titles = await page.locator('.tile-title').allTextContents();
  expect(new Set(titles).size).toBe(6);
  await page.getByText('About the images', { exact: true }).click();
  await expect(page.locator('#landingCredits li')).toHaveCount(6);
  await expect(page.locator('#landingCredits li').first()).toContainText('Cropped and resized.');
  await page.reload();
  expect(await page.locator('.tile-title').allTextContents()).toEqual(titles);
  const stored = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('medjat-landing-tiles')),
  );
  expect(stored).toHaveLength(6);
});
