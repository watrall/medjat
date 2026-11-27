import { stubCitations } from './fixtures.js';
import { test, expect } from '@playwright/test';
test('reference discovery explains overlap, records decisions, and preserves them on reload', async ({
  page,
}) => {
  await stubCitations(page);
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    const work = (i) => ({
      DOI: `10.1234/source${i}`,
      title: [`Egypt source ${i}`],
      reference: [
        { DOI: '10.1234/shared', unstructured: 'A common source' },
        { unstructured: 'An older book without a DOI' },
      ],
    });
    return route.fulfill({
      json: {
        message:
          url.pathname === '/works'
            ? { items: [work(1), work(2)], 'total-results': 2 }
            : { DOI: '10.1234/shared', title: ['A common source'] },
      },
    });
  });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.locator('.save-button').nth(0).click();
  await page.locator('.save-button').nth(1).click();
  await page.locator('#collectionNav').click();
  await page.getByText('Collection tools', { exact: true }).click();
  await page
    .getByRole('button', { name: /Discover references from \d+ saved publications?/ })
    .click();
  await expect(page.locator('#researchTools')).toContainText('Shared foundations (1)');
  await page.locator('#researchTools summary').filter({ hasText: 'Shared foundations' }).click();
  await expect(page.locator('#researchTools')).toContainText('Referenced by 2:');
  await page.getByRole('button', { name: 'Defer', exact: true }).first().click();
  await expect(page.locator('#researchTools')).toContainText('Review: deferred');
  await page.reload();
  await page.getByText('Collection tools', { exact: true }).click();
  await page
    .getByRole('button', { name: /Discover references from \d+ saved publications?/ })
    .click();
  await expect(page.locator('#researchTools')).toContainText('Review: deferred');
});
test('unresolved citations require confirmation and can be undone after rebuilding discovery', async ({
  page,
}) => {
  await stubCitations(page);
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    const matching = url.searchParams.get('query.bibliographic') === 'An older book';
    return route.fulfill({
      json: {
        message: {
          'total-results': 1,
          items: [
            matching
              ? { DOI: '10.1234/matched', title: ['A possible older book'] }
              : {
                  DOI: '10.1234/source',
                  title: ['Abydos research'],
                  reference: [{ unstructured: 'An older book' }],
                },
          ],
        },
      },
    });
  });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('.save-button').click();
  await page.locator('#collectionNav').click();
  await page.getByText('Collection tools', { exact: true }).click();
  await page
    .getByRole('button', { name: /Discover references from \d+ saved publications?/ })
    .click();
  await page.locator('#researchTools summary').filter({ hasText: 'Unresolved citations' }).click();
  await page.getByRole('button', { name: 'Find possible matches' }).click();
  await expect(page.locator('#researchTools')).toContainText('Candidates are suggestions');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('egypt-research-review:citation:10.1234/source:An older book'),
    ),
  ).toBeNull();
  await page.getByRole('button', { name: 'Confirm this match' }).click();
  await page.getByRole('button', { name: 'Rebuild from current selection' }).click();
  await expect(page.locator('#researchTools')).toContainText('Unresolved citations (0)');
  await page.locator('#researchTools summary').filter({ hasText: 'Missing from' }).click();
  await expect(page.locator('#researchTools')).toContainText('[researcher-confirmed match]');
  await page.getByRole('button', { name: 'Undo citation match from Abydos research' }).click();
  await expect(page.locator('#researchTools')).toContainText('Unresolved citations (1)');
});

test('opening every Collection accordion on a phone never widens the page', async ({ page }) => {
  await stubCitations(page);
  await page.route('https://api.crossref.org/**', (route) => {
    const url = new URL(route.request().url());
    const work = (i) => ({
      DOI: `10.1234/source${i}`,
      title: [`The Sixth Satrapy: The Archaeology of Egypt Under Achaemenid Rule ${i}`],
      reference: [
        { DOI: '10.1234/shared', unstructured: 'A common source' },
        { unstructured: 'An older book without a DOI, in a series with a very long title' },
      ],
    });
    return route.fulfill({
      json: {
        message:
          url.pathname === '/works'
            ? { items: [work(1), work(2)], 'total-results': 2 }
            : { DOI: '10.1234/shared', title: ['A common source'] },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?q=ancient+egypt');
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.locator('.save-button').nth(0).click();
  await page.locator('.save-button').nth(1).click();
  await page.locator('#collectionNav').click();
  await page.getByText('Collection tools', { exact: true }).click();
  await page
    .getByRole('button', { name: /Discover references from \d+ saved publications?/ })
    .click();
  await expect(page.locator('#researchTools')).toContainText('Shared foundations');
  const accordions = page.locator('#research details');
  for (let i = 0; i < (await accordions.count()); i++) {
    const accordion = accordions.nth(i);
    if (!(await accordion.isVisible())) continue;
    if (!(await accordion.evaluate((node) => node.open)))
      await accordion.locator('summary').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  // The wide network scrolls inside its own box instead.
  const network = page.locator('.reference-network');
  expect(await network.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
});
