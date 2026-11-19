import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateURL,
  aggregateKey,
  aggregateSearch,
  facetRows,
  decadeRows,
} from '../js/aggregates.js';
import { readQuery } from '../js/data.js';
test('whole-search aggregation retains membership criteria and excludes pagination and sorting', () => {
  const q = {
    ...readQuery('?q=Abydos&period=new-kingdom&type=book&from=2000&references=1'),
    container: 'Test journal',
  };
  const url = new URL(aggregateURL(q));
  assert.equal(url.searchParams.get('rows'), '0');
  for (const key of ['cursor', 'offset', 'sort', 'order'])
    assert.equal(url.searchParams.has(key), false);
  assert.match(url.searchParams.get('filter'), /type:book/);
  assert.match(url.searchParams.get('filter'), /has-references:true/);
  assert.match(url.searchParams.get('query.bibliographic'), /New Kingdom/);
  assert.equal(aggregateKey(q), aggregateKey({ ...q, sort: 'oldest' }));
});
test('publication decade groups retain every returned year without filling missing years', () => {
  assert.deepEqual(
    decadeRows([
      ['1899', 2],
      ['2020', 100],
      ['2024', 300],
      ['unknown', 7],
    ]),
    [
      ['1890', 2],
      ['2020', 400],
    ],
  );
});
test('aggregation uses server totals for millions of candidates, limits concurrency, and preserves partial failures', async () => {
  let active = 0,
    peak = 0;
  const result = await aggregateSearch(readQuery('?q=aggregate-contract'), {
    fresh: true,
    fetcher: async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (url.includes('has-license')) return new Response('{}', { status: 400 });
      return new Response(
        JSON.stringify({
          message: {
            'total-results': 12000000,
            items: [],
            facets: { published: { values: { 2024: 9000, 2020: 1000 } } },
          },
        }),
      );
    },
  });
  assert.equal(result.total, 12000000);
  assert.ok(peak <= 2);
  assert.equal(result.availability.abstract, 12000000);
  assert.ok(result.errors.license);
  assert.deepEqual(
    facetRows(result.facets.published, true).map(([year]) => year),
    ['2020', '2024'],
  );
});
