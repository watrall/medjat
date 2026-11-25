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
    openAccess = false,
    cited = false,
    noFacets = false,
    related = false,
    inBook = false,
    bare = false,
  } = {},
) {
  const requests = [];
  // A fixed sequence of random numbers makes the landing draw the same every time, with
  // Hierakonpolis first.
  await page.addInitScript(() => {
    let seed = 18;
    Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  });
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
    if (url.searchParams.has('facet'))
      return route.fulfill({
        json: {
          message: {
            items: [],
            'total-results': 209703,
            ...(!noFacets && {
              facets: {
                'type-name': {
                  'value-count': 12,
                  values: {
                    'Journal Article': 173538,
                    Chapter: 25723,
                    Other: 2032,
                    'Conference Paper': 1961,
                    Dataset: 1651,
                    'Posted Content': 1445,
                    Monograph: 805,
                    Entry: 711,
                    'Edited Book': 405,
                    'Peer Review': 271,
                    Book: 246,
                    Dissertation: 238,
                  },
                },
                published: {
                  'value-count': 7,
                  values: {
                    2025: 16034,
                    2024: 14214,
                    2015: 7000,
                    2009: 3000,
                    1999: 1200,
                    1905: 40,
                    2100: 1,
                  },
                },
              },
            }),
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
    if (url.searchParams.get('filter')?.includes('doi:10.1234/preprint'))
      return route.fulfill({
        json: {
          message: {
            items: [
              {
                ...publication(60),
                DOI: '10.1234/preprint',
                title: ['A preprint of the chapter'],
                type: 'posted-content',
                'container-title': [],
                page: undefined,
              },
            ],
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
    if (cited && items.length > 1) {
      items[0]['is-referenced-by-count'] = 7;
      items[1]['is-referenced-by-count'] = 0;
    }
    if (related && items.length) {
      items[0].relation = {
        'has-preprint': [{ 'id-type': 'doi', id: 'https://doi.org/10.1234/preprint' }],
        'is-supplemented-by': [{ 'id-type': 'doi', id: 'https://doi.org/10.1234/not-in-crossref' }],
      };
    }
    if (openAccess && items.length > 1) {
      items[0].license = [
        {
          URL: 'http://creativecommons.org/licenses/by/4.0',
          'content-version': 'vor',
          start: { 'date-time': '2018-12-31T00:00:00Z' },
        },
      ];
      items[1].license = [
        { URL: 'https://publisher.example/tdm', 'content-version': 'tdm' },
        { URL: 'https://creativecommons.org/licenses/by/4.0/', 'content-version': 'tdm' },
      ];
    }
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
  await page.getByRole('radio', { name: 'Book', exact: true }).check();
  await expect(page.locator('#pendingQuery')).toBeVisible();
  await page.locator('#sortSelect').selectOption('newest');
  await expect(page.locator('#scopeNote')).toContainText('newest first');
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.bibliographic'))
    .toBe('ancient egypt New Kingdom Egypt');
  await expect(page.locator('#searchInput')).toHaveValue('Abydos');
  await expect(page.locator('#periodSelect')).toHaveValue('new-kingdom');
  await expect(page.getByRole('radio', { name: 'Book', exact: true })).toBeChecked();
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
  await expect
    .poll(() =>
      requests
        .filter((url) => !url.searchParams.has('facet'))
        .at(-1)
        .searchParams.get('filter'),
    )
    .toContain('type:book');
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
  await page.locator('.filter-section > summary').filter({ hasText: 'Metadata available' }).click();
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
  await page.getByRole('radio', { name: 'Book', exact: true }).check();
  await expect(page).toHaveURL(/period=old-kingdom/);
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect
    .poll(() =>
      requests
        .filter((url) => !url.searchParams.has('facet'))
        .at(-1)
        .searchParams.get('filter'),
    )
    .toContain('type:book');

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
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
  await expect(page.locator('#effectiveQuery')).toContainText('Hatshepsut ancient Egypt Egyptian');
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
  await expect(page.locator('#effectiveQuery')).toContainText('Hatshepsut ancient Egypt Egyptian');
  await expect(page.locator('#addEgyptContext')).toBeChecked();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`sticky search hands off without overflow or layout shifts at ${width}px`, async ({
    page,
  }) => {
    // Phones use the navigation bar's search button instead (see the phone header test).
    test.skip(width < 640, 'phone header');
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
    await expect(page.locator('.masthead .brand-name')).toHaveCSS(
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

test('the phone header is a logo bar over a pinned navigation bar with a search toggle', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('#searchToggle');
  const area = page.locator('#searchArea');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#searchInput')).toBeVisible();
  await expect(page.locator('.header-attribution')).toBeHidden();
  const logo = await page.locator('a.brand').boundingBox();
  const nav = await page.locator('.main-nav').boundingBox();
  expect(nav.y).toBeGreaterThanOrEqual(logo.y + logo.height);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(area).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('#searchInput')).toBeHidden();
  await toggle.click();
  await expect(page.locator('#searchInput')).toBeVisible();
  await expect(page.locator('#searchInput')).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 600));
  expect((await page.locator('.main-nav').boundingBox()).y).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#placesNav').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#exploreNav')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#searchInput')).toBeFocused();
});

test('phone filters are a Show / Hide button under the search fields', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const summary = page.locator('#refinements > summary');
  await expect(summary).toHaveAccessibleName(/Show search filters/);
  const search = await page.locator('#searchArea').boundingBox();
  const button = await summary.boundingBox();
  expect(button.y).toBeGreaterThan(search.y + search.height);
  expect(button.width).toBeGreaterThan(330);
  await expect(page.locator('#refinements')).not.toHaveAttribute('open', '');
  await summary.click();
  await expect(summary).toHaveAccessibleName(/Hide search filters/);
  await expect(page.locator('#currentFilters')).toBeVisible();
  await summary.click();
  await expect(page.locator('#currentFilters')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('tab icons appear only where the header has room, and never rename a tab', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  const icons = page.locator('.main-nav .nav-icon');
  await expect(icons).toHaveCount(4);
  for (const [width, visible] of [
    [1440, true],
    [1300, true],
    [1299, false],
    [768, false],
    [390, false],
  ]) {
    await page.setViewportSize({ width, height: 800 });
    for (const icon of await icons.all()) expect(await icon.isVisible()).toBe(visible);
  }
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Places', exact: true })).toBeVisible();
});

test('every search field sends its words to its own Crossref parameter', async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  expect(await page.locator('#searchField option').allTextContents()).toEqual([
    'All metadata',
    'Title',
    'Author',
    'Editor',
    'Journal or book',
    'Publisher',
    'Institution',
    'Funder',
    'DOI',
  ]);
  for (const [value, label, param] of [
    ['title', 'Title', 'query.title'],
    ['author', 'Author', 'query.author'],
    ['editor', 'Editor', 'query.editor'],
    ['journal', 'Journal or book', 'query.container-title'],
    ['publisher', 'Publisher', 'query.publisher-name'],
    ['affiliation', 'Institution', 'query.affiliation'],
    ['funder', 'Funder', 'query.funder-name'],
  ]) {
    await page.locator('#searchField').selectOption(value);
    await expect(page.locator('#searchInput')).toHaveAttribute('placeholder', /^Search /);
    await page.locator('#searchInput').fill('Petrie');
    await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
    await expect
      .poll(() => requests.at(-1).searchParams.get(param), { message: label })
      .toBe('Petrie');
    expect(requests.at(-1).searchParams.get('query.bibliographic')).toBe('ancient Egypt Egyptian');
    await expect(page.locator('.current-search')).toHaveText(`${label}: Petrie`);
    await expect(page.locator('#searchField')).toHaveValue(value);
  }
});

test('a search started from the landing page carries the Egypt context, with Egyptian', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await page.locator('#searchField').selectOption('funder');
  await page.locator('#searchInput').fill('European Research Council');
  await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect
    .poll(() => requests.at(-1).searchParams.get('query.funder-name'))
    .toBe('European Research Council');
  expect(requests.at(-1).searchParams.get('query.bibliographic')).toBe('ancient Egypt Egyptian');
  await expect(page).not.toHaveURL(/context/);
  await expect(page.locator('#addEgyptContext')).toBeChecked();
  await page.getByRole('button', { name: 'Remove added ancient Egypt terms', exact: true }).click();
  await expect(page).toHaveURL(/context=0/);
  await expect.poll(() => requests.at(-1).searchParams.has('query.bibliographic')).toBe(false);
});

test('the field menu and its longest label fit a phone', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#searchField').selectOption('journal');
  const fits = await page
    .locator('#searchField')
    .evaluate((select) => select.scrollWidth <= select.clientWidth);
  expect(fits).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('global navigation search opens Explore and preserves synchronized text', async ({ page }) => {
  const requests = await fixtures(page);
  await stubPlaceServices(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  for (const id of ['collectionNav', 'visualizeNav', 'placesNav']) {
    await page.locator(`#${id}`).click();
    if (id === 'visualizeNav')
      await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
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
  await page.getByRole('radio', { name: 'Book', exact: true }).check();
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
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
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
  await page.getByRole('radio', { name: 'Book', exact: true }).check();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(summary).toBeFocused();
});

test('search help opens as a dialog from any view and preserves the draft', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#searchInput').fill('An unfinished topic');
  await page.locator('#visualizeNav').click();
  const trigger = page.getByRole('button', { name: 'Search help', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search help' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#visualizeNav')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#searchInput')).toHaveValue('An unfinished topic');
});

test('the search help dialog has tabs, branding, live limits and a contained focus', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  await page.locator('.search-help-link').click();
  const dialog = page.getByRole('dialog', { name: 'Search help' });
  await expect(dialog.locator('.brand-name')).toContainText('Medjat');
  await expect(dialog.locator('.brand-mark')).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'How to search' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(dialog.getByRole('heading', { name: 'What you can search for' })).toBeVisible();
  // Keyboard: arrows move between tabs.
  await dialog.getByRole('tab', { name: 'How to search' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Limitations' })).toBeFocused();
  await expect(dialog.getByRole('tab', { name: 'Limitations' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(dialog.getByRole('heading', { name: 'How Crossref returns results' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'What the metadata contains' })).toBeVisible();
  // The numbers come from the same constants the application enforces.
  const limits = await page.evaluate(async () => {
    const [crossref, aggregates] = await Promise.all([
      import('/js/crossref.js'),
      import('/js/aggregates.js'),
    ]);
    return {
      pageSize: crossref.PAGE_SIZE.toLocaleString(),
      maxRows: crossref.MAX_ROWS.toLocaleString(),
      dateLimit: crossref.DATE_BROWSE_LIMIT.toLocaleString(),
      windowSize: aggregates.WINDOW_SIZE.toLocaleString(),
      largeWindowSize: aggregates.LARGE_WINDOW_SIZE.toLocaleString(),
    };
  });
  for (const [key, value] of Object.entries(limits))
    await expect(dialog.locator(`[data-help="${key}"]`)).toHaveText(value);
  // Focus stays inside, and the page behind is not reachable.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.getElementById('searchHelp').contains(document.activeElement),
    ),
  ).toBe(true);
  await page.locator('#searchHelpClose').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.search-help-link')).toBeFocused();
  await page.locator('.search-help-link').click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(page.locator('.search-help-link')).toBeFocused();
});

test('the search help dialog passes an accessibility scan on both tabs', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await page.locator('.search-help-link').click();
  for (const tab of ['How to search', 'Limitations']) {
    await page.getByRole('tab', { name: tab }).click();
    const result = await new AxeBuilder({ page })
      .include('#searchHelp')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test('contextual notes open Search help on the matching limitation', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.locator('#facetNote .inline-help').click();
  const dialog = page.getByRole('dialog', { name: 'Search help' });
  await expect(dialog.getByRole('tab', { name: 'Limitations' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const target = await page.locator('#help-totals').boundingBox();
  const body = await page.locator('.help-body').boundingBox();
  expect(target.y).toBeGreaterThanOrEqual(body.y);
  expect(target.y).toBeLessThan(body.y + body.height / 2);
});

test('the phone search help dialog fills the screen without horizontal scroll', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.search-help-link').click();
  const box = await page.locator('#searchHelp').boundingBox();
  expect(box.width).toBe(390);
  expect(box.height).toBeCloseTo(844, 0);
  await page.getByRole('tab', { name: 'Limitations' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('.help-body').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
});

test('the masthead reflows enlarged text and hands off at a fractional header height', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 768, height: 844 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const geometry = await page.evaluate(() => ({
    header: document.querySelector('.masthead').getBoundingClientRect().toJSON(),
    nav: document.querySelector('.main-nav').getBoundingClientRect().toJSON(),
    width: document.documentElement.scrollWidth,
  }));
  expect(geometry.width).toBe(768);
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
  // Layout is still settling after the row and tab clicks, so record the position once it holds.
  let exploreScroll = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY);
      const steady = y === exploreScroll;
      exploreScroll = y;
      return steady;
    })
    .toBe(true);
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
  await page.locator('.search-help-link').focus();
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
  const searches = () => requests.filter((url) => !url.searchParams.has('facet'));
  const before = searches().length;
  await page.getByRole('button', { name: 'Find in Crossref', exact: true }).click();
  await expect(page.getByText('Possible matches only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View possible match' })).toHaveCount(2);
  expect(searches().length).toBe(before + 1);
  expect(searches().at(-1).searchParams.get('query.bibliographic')).toContain('Cited monograph');
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
  const summary = page.locator('summary', { hasText: 'Search beyond Crossref' });
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
  const chart = page.locator('.viz-chart', { hasText: 'Publishers and venues' });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText('One publisher accounts for 100% of these records');
  await chart.getByText('View data table').click();
  await expect(chart.locator('td', { hasText: 'Test publisher' }).first()).toBeVisible();
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
  await expect(book.locator('.book-citation')).toHaveText(
    'Ada Researcher, 2020, in Research in ancient Egypt, 23–39',
  );
  await book.getByRole('button', { name: 'View the book' }).click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
  await page.getByRole('button', { name: 'Back to previous publication', exact: true }).click();
  await expect(book).toBeVisible();
});

test('a chapter lists the other chapters of its book', async ({ page }) => {
  const requests = await fixtures(page, { inBook: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const toggle = page.getByRole('button', { name: /^Other chapters/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const items = page.locator('.detail-section', {
    has: page.getByRole('heading', { name: 'Part of a book' }),
  });
  await expect(items.locator('.chapter-list li')).toHaveCount(2);
  await expect(toggle).toContainText('Other chapters (2)');
  await expect(items.locator('.chapter-list li').nth(0)).toContainText('Sibling chapter B');
  await expect(items.locator('.chapter-list li').nth(0)).toContainText('1–4');
  await expect(items.getByRole('button', { name: 'View chapter' })).toHaveCount(0);
  await expect(items.getByText('The chapter being read')).toHaveCount(0);
  const query = requests.find((url) =>
    url.searchParams.get('filter')?.includes('relation.object:'),
  );
  expect(query.searchParams.get('filter')).toBe(
    'relation.type:is-part-of,relation.object:https://doi.org/10.1234/test-book',
  );
  await items.getByRole('button', { name: 'Sibling chapter B' }).click();
  await expect(page.locator('.detail-title')).toHaveText('A referenced publication');
});

test('the publication type list says edited volumes, not edited books', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('button', { name: /^Show all \d+ Publication type filters$/ }).click();
  await expect(page.getByRole('radio', { name: 'Edited volume', exact: true })).toBeVisible();
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

test('every page load draws its own six landing tiles and credits only those', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.research-tile')).toHaveCount(6);
  const draws = new Set();
  for (let load = 0; load < 6; load++) {
    const titles = await page.locator('.tile-title').allTextContents();
    expect(new Set(titles).size).toBe(6);
    draws.add(titles.join('|'));
    await page.reload();
  }
  expect(draws.size).toBeGreaterThan(1);
  await page.getByText('About the images', { exact: true }).click();
  const credits = page.locator('#landingCredits');
  await expect(credits.locator('a[href^="http"]:not([href*="creativecommons"])')).toHaveCount(6);
  expect(((await credits.textContent()) ?? '').split('; ')).toHaveLength(6);
  await expect(credits).toContainText('Images are cropped and resized.');
});
test('a result and its detail read as a citation, with commas and a distinct style for each part', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  const meta = page.locator('.result-row').first().locator('.result-meta');
  await expect(meta).toHaveText('Ada Researcher, 2020, in Research in ancient Egypt, 23–39');
  await expect(meta).not.toContainText('·');
  const style = (selector) =>
    meta.locator(selector).evaluate((node) => {
      const { fontWeight, fontStyle } = getComputedStyle(node);
      return { fontWeight, fontStyle };
    });
  expect(await style('.cite-authors')).toEqual({ fontWeight: '600', fontStyle: 'normal' });
  expect(await style('.cite-container')).toEqual({ fontWeight: '400', fontStyle: 'italic' });
  expect((await style('.cite-year')).fontWeight).toBe('500');
  await expect(page.locator('.detail-authors')).toContainText('Ada Researcher');
  await expect(page.locator('.detail-meta')).toHaveText(
    '2020, in Research in ancient Egypt, 23–39',
  );
  await expect(page.locator('.detail-kind')).toHaveText('Book chapter, Test publisher');
});
test('open access publications carry an Open access badge in the list and at the top of the detail pane', async ({
  page,
}) => {
  await fixtures(page, { openAccess: true });
  await page.goto('/?q=ancient+egypt');
  const rows = page.locator('.result-row');
  await expect(rows.first().locator('.badge-open')).toHaveText('Open access');
  await expect(rows.nth(1).locator('.badge-open')).toHaveCount(0);
  await expect(page.locator('.badge-open')).toHaveCount(2);
  const open = page.locator('.detail-open');
  await expect(open).toContainText('Open access');
  await expect(open.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'http://creativecommons.org/licenses/by/4.0',
  );
  await rows.nth(1).locator('.result-open').click();
  await expect(page.locator('.detail-open')).toHaveCount(0);
});

test('the book section keeps its two actions apart and lets the chapter list fold away', async ({
  page,
}) => {
  await fixtures(page, { inBook: true });
  await page.goto('/?q=ancient+egypt');
  const view = page.getByRole('button', { name: 'View the book' });
  const chapters = page.getByRole('button', { name: /^Other chapters/ });
  await expect(view).toBeVisible();
  const [a, b] = [await view.boundingBox(), await chapters.boundingBox()];
  expect(a.height).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(8);
  await chapters.click();
  await expect(page.locator('.chapter-list li')).toHaveCount(2);
  await chapters.click();
  await expect(chapters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.chapter-list')).toBeHidden();
  await expect(page.locator('#book-chapters')).toBeAttached();
});

test('a place mention names Pleiades as its source, with a link', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  const places = page.locator('.detail-section', {
    has: page.getByRole('heading', { name: 'Places mentioned' }),
  });
  await expect(places).toContainText(
    'Names in the title or abstract match place records in Pleiades. Open a place',
  );
  await expect(places.getByRole('link', { name: 'Pleiades' })).toHaveAttribute(
    'href',
    'https://pleiades.stoa.org/',
  );
});

test('the citation count sits under the title, with what it counts one click away', async ({
  page,
}) => {
  await fixtures(page, { cited: true });
  await page.goto('/?q=ancient+egypt');
  const cited = page.locator('.detail-cited');
  await expect(cited.locator('summary')).toHaveText('Cited by 7 in Crossref');
  await expect(cited.getByText('does not list the citing works')).toBeHidden();
  await cited.locator('summary').click();
  await expect(cited.getByText('does not list the citing works')).toBeVisible();
  await page.getByRole('tab', { name: 'Connections' }).click();
  const first = page.locator('.detail-section').first();
  await expect(first.getByRole('heading', { name: 'Cited by' })).toBeVisible();
  await expect(first).toContainText('7 citations recorded in Crossref');
  await page.locator('.result-open').nth(1).click();
  await expect(page.locator('.detail-cited summary')).toHaveText('Cited by 0 in Crossref');
});

test('related records are shown as citations with the DOI last, and unknown ones by DOI alone', async ({
  page,
}) => {
  await fixtures(page, { related: true });
  await page.goto('/?q=ancient+egypt');
  await page.getByRole('tab', { name: 'Connections' }).click();
  const list = page.locator('.related-list');
  await expect(list.locator('li')).toHaveCount(2);
  const known = list.locator('li').nth(0);
  await expect(known.locator('.related-kind')).toHaveText('Has preprint');
  await expect(known.getByRole('button', { name: 'A preprint of the chapter' })).toBeVisible();
  await expect(known.locator('.record-citation')).toContainText('Ada Researcher, 2020');
  await expect(known.locator('.record-citation')).toContainText('10.1234/preprint');
  const unknown = list.locator('li').nth(1);
  await expect(unknown.locator('.related-kind')).toHaveText('Supplemented by');
  await expect(unknown).toContainText('Details not available from Crossref');
  await expect(unknown.getByRole('button')).toHaveCount(0);
  await known.getByRole('button').click();
  await expect(page.getByRole('button', { name: 'Back to previous publication' })).toBeVisible();
});

test('the license section says what each license covers and from when', async ({ page }) => {
  await fixtures(page, { openAccess: true });
  await page.goto('/?q=ancient+egypt');
  const licenses = page.locator('.detail-section', {
    has: page.getByRole('heading', { name: 'License of this publication' }),
  });
  await expect(licenses.locator('.license-list li')).toHaveText(
    'CC BY 4.0, version of record, from 2018-12-31',
  );
  await expect(licenses).toContainText('Crossref, which makes all its metadata open for reuse');
  await page.locator('.result-open').nth(1).click();
  const tdm = page.locator('.license-list li');
  await expect(tdm.nth(0)).toContainText('text and data mining only');
  await expect(page.locator('.detail-section', { hasText: 'Open access under' })).toHaveCount(0);
});

const seedSearches = (page, count) =>
  page.addInitScript((total) => {
    const entries = Array.from({ length: total }, (_, i) => ({
      qs: `q=topic+${i}&context=0`,
      kept: i < 2,
      at: new Date().toISOString(),
    }));
    localStorage.setItem('medjat-search-history-v1', JSON.stringify(entries));
  }, count);

test('your searches fill the width on the same three columns as the tiles below', async ({
  page,
}) => {
  await seedSearches(page, 6);
  await page.goto('/');
  const rows = page.locator('.history-row');
  await expect(rows).toHaveCount(6);
  const tiles = page.locator('.research-tile');
  const edges = async (locator, count) =>
    Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const box = await locator.nth(i).boundingBox();
        return [Math.round(box.x), Math.round(box.x + box.width)];
      }),
    );
  expect(await edges(rows, 3)).toEqual(await edges(tiles, 3));
  await expect(
    page
      .locator('.history-row')
      .first()
      .getByRole('button', { name: /^Stop keeping search/ }),
  ).toBeVisible();
  await expect(
    page
      .locator('.history-row')
      .nth(2)
      .getByRole('button', { name: /^Keep search/ }),
  ).toBeVisible();
});

test('your searches show six and fold the rest behind a count', async ({ page }) => {
  await seedSearches(page, 9);
  await page.goto('/');
  await expect(page.locator('.history-row')).toHaveCount(6);
  const more = page.getByRole('button', { name: 'Show all 9 searches' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(page.locator('.history-row')).toHaveCount(9);
  await page.getByRole('button', { name: 'Show fewer searches' }).click();
  await expect(page.locator('.history-row')).toHaveCount(6);
});

test('keeping or removing a search leaves keyboard focus where the reader was', async ({
  page,
}) => {
  await seedSearches(page, 4);
  await page.goto('/');
  await page.getByRole('button', { name: 'Keep search: topic 2' }).click();
  await expect(page.getByRole('button', { name: 'Stop keeping search: topic 2' })).toBeFocused();
  await page.getByRole('button', { name: 'Remove search: topic 1' }).click();
  await expect(page.locator('.history-row')).toHaveCount(3);
  await expect(page.locator('.history-link').nth(1)).toBeFocused();
});

test('each saved search is its own unit, apart from its neighbours, with a red bookmark when kept', async ({
  page,
}) => {
  await seedSearches(page, 6);
  await page.goto('/');
  const rows = page.locator('.history-row');
  const [first, second] = [await rows.nth(0).boundingBox(), await rows.nth(1).boundingBox()];
  expect(second.x - (first.x + first.width)).toBeGreaterThanOrEqual(12);
  const background = (locator) =>
    locator.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(await background(rows.first())).not.toBe(await background(page.locator('body')));
  const color = (locator) => locator.evaluate((node) => getComputedStyle(node).color);
  const accent = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--color-accent)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await color(rows.nth(0).locator('[aria-pressed="true"] .icon'))).toBe(accent);
  expect(await color(rows.nth(3).locator('[aria-pressed="false"] .icon'))).not.toBe(accent);
});

test('the landing page keeps its kicker above the headline, and a search tucks both away', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  const kicker = page.locator('.intro-eyebrow');
  await expect(kicker).toHaveText('Ancient worlds. New questions.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Follow the research.');
  expect((await kicker.boundingBox()).y).toBeLessThan(
    (await page.getByRole('heading', { level: 1 }).boundingBox()).y,
  );
  await page.locator('#searchInput').fill('Hatshepsut');
  await page.locator('#primarySearchSubmit').click();
  await expect(page.locator('.result-row').first()).toBeVisible();
  await expect(kicker).not.toBeInViewport();
});

test('a record with no license and no citation count shows no stray text in its header', async ({
  page,
}) => {
  await fixtures(page, { bare: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.detail-kind')).toBeVisible();
  const strays = await page.locator('.detail-kind').evaluate((node) =>
    [...node.parentElement.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent.trim())
      .filter(Boolean),
  );
  expect(strays).toEqual([]);
  await expect(page.locator('.detail-open')).toHaveCount(0);
  await expect(page.locator('.detail-cited')).toHaveCount(0);
});

test('the type and date filters show Crossref counts, newest decade first, with the rest behind Show all', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const types = page.locator('#publicationTypeRows .facet-option');
  await expect(types).toHaveCount(9);
  await expect(types.nth(0)).toContainText('All publications');
  await expect(types.nth(0)).toContainText('209,026');
  await expect(types.nth(1)).toContainText('Journal article');
  await expect(types.nth(1)).toContainText('173,538');
  await expect(types.nth(2)).toContainText('Book chapter');
  await expect(page.getByRole('radio', { name: 'Book chapter' })).toHaveAccessibleDescription(
    '25,723',
  );
  await expect(page.locator('#facetNote')).toContainText('matched on any of your words');
  const showAll = page.getByRole('button', { name: 'Show all 12 Publication type filters' });
  await showAll.click();
  await expect(page.locator('#morePublicationTypes .facet-option')).toHaveCount(4);
  await page.locator('#yearRefinement > summary').click();
  const decades = page.locator('#decadeRows .facet-option');
  await expect(decades).toHaveCount(5);
  await expect(decades.nth(0)).toContainText('2020–2029');
  await expect(decades.nth(0)).toContainText('30,248');
  await expect(decades.nth(1)).toContainText('2010–2019');
  await expect(page.locator('#decadeRows')).not.toContainText('2100');
});

test('choosing a type or a decade fills its row in dark ink and applies the filter', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await page.getByRole('radio', { name: 'Book chapter', exact: true }).check();
  await expect(page).toHaveURL(/type=book-chapter/);
  const row = page.locator('.facet-option', { hasText: 'Book chapter' }).first();
  const fill = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#publicationTypeRows .facet-option').first()).toContainText('209,026');
  await page.locator('#yearRefinement > summary').click();
  await page
    .locator('#decadeRows')
    .getByRole('button', { name: /2010–2019/ })
    .click();
  await expect(page).toHaveURL(/from=2010/);
  await expect(page).toHaveURL(/to=2019/);
  await expect(
    page.locator('#decadeRows').getByRole('button', { name: /2010–2019/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .locator('#decadeRows')
    .getByRole('button', { name: /2010–2019/ })
    .click();
  await expect(page).not.toHaveURL(/from=2010/);
  const counts = requests.filter((url) => url.searchParams.has('facet'));
  expect(counts).toHaveLength(1);
  expect(counts[0].searchParams.get('filter') || '').not.toMatch(/type:|pub-date/);
  expect(counts[0].searchParams.get('rows')).toBe('0');
});

test('without counts from Crossref the filters still work and no count note is shown', async ({
  page,
}) => {
  await fixtures(page, { noFacets: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page.locator('#facetNote')).toBeHidden();
  await expect(page.locator('#publicationTypeRows .facet-count')).toHaveCount(0);
  await expect(page.locator('#decadeFilter')).toBeHidden();
  await page.getByRole('radio', { name: 'Journal article', exact: true }).check();
  await expect(page).toHaveURL(/type=journal-article/);
});

test('the Access filter narrows the loaded records to open access ones without a new search', async ({
  page,
}) => {
  const requests = await fixtures(page, { openAccess: true });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(25);
  const rows = page.locator('#accessRows .facet-option');
  await expect(rows.nth(0)).toContainText('All records');
  await expect(rows.nth(0)).toContainText('25');
  await expect(rows.nth(1)).toContainText('Open access');
  await expect(rows.nth(1)).toContainText('1');
  await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#facetNote')).toBeVisible();
  const before = requests.length;
  await rows.nth(1).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
  await expect(page).toHaveURL(/access=open/);
  await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#resultCount')).toContainText('1 open access');
  await expect(page.locator('#currentFilters')).toContainText('Open access (loaded results)');
  expect(requests.length).toBe(before);
  await page.getByRole('button', { name: 'Remove filter: Open access (loaded results)' }).click();
  await expect(page.locator('.result-row')).toHaveCount(25);
  await expect(page).not.toHaveURL(/access=open/);
  expect(requests.length).toBe(before);
});

test('an open access filter with nothing to show says so and offers all records', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?q=ancient+egypt&access=open');
  await expect(page.getByText('No open access records yet.')).toBeVisible();
  await expect(page.getByText('None of the 25 loaded records is open access')).toBeVisible();
  await page.getByRole('button', { name: 'Show all records' }).click();
  await expect(page.locator('.result-row')).toHaveCount(25);
});

test('a saved search does not remember the open access view of its results', async ({ page }) => {
  await fixtures(page);
  await page.goto('/?q=Hatshepsut&access=open');
  await expect(page.getByText('No open access records yet.')).toBeVisible();
  await page.goto('/');
  const link = page.locator('.history-link').first();
  await expect(link).toContainText('Hatshepsut');
  expect(await link.getAttribute('href')).not.toContain('access');
});
