import { test, expect } from '@playwright/test';
test('metadata changes require explicit acceptance', async ({ page }) => {
  const old = { DOI: '10.1234/abydos', title: ['Excavations at Abydos'], type: 'journal-article' };
  await page.route('https://api.crossref.org/**', (route) =>
    route.fulfill({
      json: {
        message:
          new URL(route.request().url()).pathname === '/works'
            ? { items: [old], 'total-results': 1 }
            : {
                ...old,
                title: ['New excavations at Abydos'],
                abstract: 'A newly supplied abstract',
              },
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.locator('.save-button').click();
  await page.locator('#collectionNav').click();
  await page.getByRole('button', { name: 'Check saved publications for metadata changes' }).click();
  await expect(page.locator('#changeReview')).toContainText('2 changed fields');
  await expect(page.locator('.result-open')).toHaveText('Excavations at Abydos');
  await page.getByRole('button', { name: 'Accept updated metadata', exact: true }).click();
  await expect(page.locator('.result-open')).toHaveText('New excavations at Abydos');
});
