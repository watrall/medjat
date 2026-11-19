import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW_SIZE,
  aggregateKey,
  aggregateSearch,
  decadeRows,
  summarizeItems,
  typeID,
  windowURL,
} from '../js/aggregates.js';
import { readQuery } from '../js/data.js';

const work = (overrides = {}) => ({
  DOI: '10.1234/one',
  title: ['A study'],
  type: 'journal-article',
  'container-title': ['Journal of Tests'],
  published: { 'date-parts': [[2020]] },
  abstract: 'Deposited abstract.',
  license: [{ URL: 'https://example.org/license' }],
  author: [{ given: 'Ada', family: 'Researcher', ORCID: 'https://orcid.org/0000-0002-1825-0097' }],
  ...overrides,
});

test('the window keeps membership criteria and drops paging and sorting', () => {
  const q = {
    ...readQuery('?q=Abydos&period=new-kingdom&type=book&from=2000&references=1'),
    container: 'Test journal',
  };
  const url = new URL(windowURL(q));
  assert.equal(url.searchParams.get('rows'), String(WINDOW_SIZE));
  for (const key of ['cursor', 'offset']) assert.equal(url.searchParams.has(key), false);
  assert.equal(url.searchParams.get('sort'), 'score');
  assert.match(url.searchParams.get('filter'), /type:book/);
  assert.match(url.searchParams.get('filter'), /has-references:true/);
  assert.match(url.searchParams.get('filter'), /container-title:Test journal/);
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

test('the summary counts one population, deduplicated, without inventing values', () => {
  const summary = summarizeItems([
    work(),
    work(),
    work({
      DOI: '10.1234/two',
      'container-title': [],
      reference: [{}],
      abstract: '',
      license: [],
      author: [{ given: 'Bo', family: 'Writer' }],
    }),
    work({
      DOI: '10.1234/three',
      type: 'book-chapter',
      published: { 'date-parts': [[2024]] },
      abstract: '',
      license: [],
      author: [{ given: 'Bo', family: 'Writer' }],
    }),
    work({
      DOI: '10.1234/four',
      type: 'dataset',
      published: { 'date-parts': [[999]] },
      abstract: '',
      license: [],
      author: [{ given: 'Bo', family: 'Writer' }],
    }),
    {},
    null,
  ]);
  assert.equal(summary.window, 4);
  assert.deepEqual(summary.types, [
    ['Journal article', 2],
    ['Book chapter', 1],
    ['Dataset', 1],
  ]);
  assert.deepEqual(summary.venues, [['Journal of Tests', 3]]);
  assert.deepEqual(summary.years, [
    ['2020', 2],
    ['2024', 1],
  ]);
  assert.deepEqual(summary.decades, [['2020', 3]]);
  assert.deepEqual(summary.availability, { abstract: 1, references: 1, orcid: 1, license: 1 });
});

test('an empty window is a valid summary', () => {
  assert.deepEqual(summarizeItems([]), {
    window: 0,
    types: [],
    venues: [],
    years: [],
    decades: [],
    availability: { abstract: 0, references: 0, orcid: 0, license: 0 },
  });
});

test('type labels that map to a Crossref filter stay refinable', () => {
  assert.equal(typeID('Book chapter'), 'book-chapter');
  assert.equal(typeID('Journal article'), 'journal-article');
  assert.equal(typeID('Dataset'), 'dataset');
  assert.equal(typeID('Other publication'), null);
});

test('aggregation reads one ranked window and reuses the cached summary', async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(new URL(url));
    return new Response(
      JSON.stringify({
        message: {
          'total-results': 373533,
          items: [work(), work({ DOI: '10.1234/two', type: 'book-chapter' })],
        },
      }),
      { status: 200 },
    );
  };
  const query = readQuery('?q=aggregate-contract');
  const result = await aggregateSearch(query, { fresh: true, fetcher });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('rows'), String(WINDOW_SIZE));
  assert.equal(urls[0].searchParams.has('facet'), false);
  assert.equal(result.total, 373533);
  assert.equal(result.window, 2);
  assert.equal(result.types.length, 2);
  const cached = await aggregateSearch(query, { fetcher });
  assert.equal(urls.length, 1);
  assert.equal(cached, result);
});

test('a failed window request surfaces instead of showing partial charts', async () => {
  await assert.rejects(
    aggregateSearch(readQuery('?q=aggregate-failure'), {
      fresh: true,
      fetcher: async () => new Response('{}', { status: 500 }),
    }),
    /temporarily unavailable/,
  );
});
