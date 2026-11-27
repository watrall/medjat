import test from 'node:test';
import assert from 'node:assert/strict';
import { getCitingDOIs } from '../js/opencitations.js';

const reply =
  (body, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('citing DOIs are read from the OpenCitations rows, newest first, without duplicates', async () => {
  const rows = [
    { citing: 'omid:br/1 doi:10.1234/old openalex:W1', creation: '2019-05-01' },
    { citing: 'omid:br/2 doi:10.1234/NEW', creation: '2024-02-10' },
    { citing: 'omid:br/3 doi:10.1234/new', creation: '2024-02-10' },
    { citing: 'omid:br/4 pmid:123', creation: '2022-01-01' },
    { citing: 'omid:br/5 doi:10.1234/self', creation: '2023-01-01' },
  ];
  const result = await getCitingDOIs('10.1234/self', { fetcher: reply(rows), fresh: true });
  assert.deepEqual(result.dois, ['10.1234/new', '10.1234/old']);
});

test('a work with no citations gives an empty list', async () => {
  const result = await getCitingDOIs('10.1234/none', { fetcher: reply([]), fresh: true });
  assert.deepEqual(result, { dois: [] });
});

test('a missing DOI asks nothing', async () => {
  const result = await getCitingDOIs('', {
    fetcher: () => assert.fail('no request expected'),
  });
  assert.deepEqual(result, { dois: [] });
});

test('an unexpected response is an error', async () => {
  await assert.rejects(
    getCitingDOIs('10.1234/odd', { fetcher: reply({ message: 'no' }), fresh: true }),
    /unexpected response/,
  );
});

test('the lookup does not wait in the Crossref request queue', async () => {
  const started = Date.now();
  await Promise.all(
    [1, 2, 3, 4].map((n) => getCitingDOIs(`10.1234/q${n}`, { fetcher: reply([]), fresh: true })),
  );
  assert.ok(Date.now() - started < 300, 'four lookups should not be spaced 400ms apart');
});

test('an OpenCitations failure names OpenCitations, not Crossref', async () => {
  await assert.rejects(
    getCitingDOIs('10.1234/busy', {
      fetcher: async () => new Response('', { status: 503 }),
      fresh: true,
      signal: new AbortController().signal,
    }),
    (error) => /OpenCitations/.test(error.message) && !/Crossref/.test(error.message),
  );
});

test('the lookup stops when its signal is aborted', async () => {
  const controller = new AbortController();
  const pending = getCitingDOIs('10.1234/slow', {
    fetcher: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      ),
    fresh: true,
    signal: controller.signal,
  });
  controller.abort(new Error('record changed'));
  await assert.rejects(pending, /record changed/);
});

test('only the citing DOIs are returned', async () => {
  const result = await getCitingDOIs('10.1234/shape', {
    fetcher: reply([{ citing: 'doi:10.1234/a', creation: '2020-01-01' }]),
    fresh: true,
  });
  assert.deepEqual(Object.keys(result), ['dois']);
});
