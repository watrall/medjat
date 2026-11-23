import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWork,
  normalizeDOI,
  orcidURL,
  plainText,
  readQuery,
  queryString,
} from '../js/data.js';
import { buildSearchURL, searchWorks, request } from '../js/crossref.js';

const raw = {
  DOI: '10.1234/Example',
  title: ['A "title" &amp; scholarship'],
  author: [{ family: 'Smith', given: 'Ada', ORCID: 'https://orcid.org/0000-0002-1825-0097' }],
  'published-online': { 'date-parts': [[2020, 2]] },
};

test('normalization retains source metadata and never invents identities', () => {
  const copy = structuredClone(raw);
  const work = normalizeWork(copy);
  assert.equal(work.authors[0].orcid, raw.author[0].ORCID);
  assert.deepEqual(copy, raw);
  assert.equal(work.year, 2020);
  assert.equal(work.title, 'A "title" & scholarship');
  assert.equal(normalizeWork({ ...raw, author: [{ name: 'Organization' }] }).authors[0].orcid, '');
  assert.equal(orcidURL('0000-0003-1234-5678'), '');
});
test('metadata URLs reject executable schemes and attribute injection', () => {
  assert.equal(normalizeDOI('javascript:alert(1)'), '');
  assert.equal(orcidURL('0000-0002-1825-0097" onmouseover="alert(1)'), '');
  assert.equal(normalizeDOI('https://doi.org/10.1234/Example'), '10.1234/example');
  assert.equal(
    plainText('<jats:p>Evidence <jats:italic>from</jats:italic> Egypt.</jats:p>'),
    'Evidence from Egypt.',
  );
});
test('uncommon and absent publication types have readable labels without changing deposited data', () => {
  assert.equal(normalizeWork({ ...raw, type: 'other' }).typeLabel, 'Other publication');
  assert.equal(normalizeWork({ ...raw, type: 'peer-review' }).typeLabel, 'Peer review');
  const missing = normalizeWork(raw);
  assert.equal(missing.typeLabel, 'Publication type not supplied');
  assert.equal(missing.raw.type, undefined);
  assert.equal(normalizeWork({ ...raw, type: 'other' }).raw.type, 'other');
});
test('query state round-trips and period queries do not become BCE publication filters', () => {
  const query = readQuery('?q=Deir+el-Medina&period=new-kingdom&from=2000&abstract=1');
  assert.deepEqual(readQuery(queryString(query)), query);
  const params = new URL(buildSearchURL(query)).searchParams;
  assert.match(params.get('query.bibliographic'), /New Kingdom Egypt/);
  assert.match(params.get('filter'), /from-pub-date:2000-01-01/);
  assert.doesNotMatch(params.get('filter'), /1550/);
  assert.equal(params.get('mailto'), 'admin@wunderkammer.dev');
});
test('added search context can be removed and restored through shared URLs', () => {
  const query = readQuery('?q=Hatshepsut');
  const terms = (query) => new URL(buildSearchURL(query)).searchParams.get('query.bibliographic');
  assert.equal(terms(query), 'Hatshepsut ancient Egypt');
  const withoutContext = { ...query, context: false };
  assert.deepEqual(readQuery(queryString(withoutContext)), withoutContext);
  assert.equal(terms(withoutContext), 'Hatshepsut');
  assert.equal(terms(readQuery('?q=Egyptian+religion')), 'Egyptian religion');
  assert.equal(
    terms(readQuery('?q=Hatshepsut&period=new-kingdom&context=0')),
    'Hatshepsut New Kingdom Egypt',
  );
});
test('search validates the response, normalizes records, and carries a usable cursor', async () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ ...raw, DOI: `10.1234/item${i}` }));
  const result = await searchWorks(readQuery('?q=test-cursor'), {
    fetcher: async () =>
      new Response(
        JSON.stringify({ message: { items, 'total-results': 70, 'next-cursor': 'next' } }),
      ),
  });
  assert.equal(result.items.length, 25);
  assert.equal(result.total, 70);
  assert.equal(result.nextCursor, 'next');
  await assert.rejects(
    searchWorks(readQuery('?q=test-invalid'), {
      fetcher: async () => new Response('{"message":{}}'),
    }),
    /unexpected response/,
  );
});
test('DOI lookup uses the single-record endpoint', async () => {
  let requested = '';
  const result = await searchWorks(readQuery('?q=10.1234%2Fdirect'), {
    fetcher: async (url) => {
      requested = url;
      return new Response(JSON.stringify({ message: { ...raw, DOI: '10.1234/direct' } }));
    },
  });
  assert.match(requested, /\/works\/10.1234%2Fdirect\?/);
  assert.equal(result.doiLookup, true);
  assert.equal(result.nextCursor, null);
});

test('publication-date sorts use bounded offset pages rather than an incompatible cursor', async () => {
  for (const sort of ['newest', 'oldest']) {
    const query = readQuery(`?q=date-contract-${sort}&sort=${sort}`);
    const params = new URL(buildSearchURL(query, '25')).searchParams;
    assert.equal(params.get('offset'), '25');
    assert.equal(params.has('cursor'), false);
    assert.equal(params.get('sort'), 'published');
    assert.equal(params.get('order'), sort === 'oldest' ? 'asc' : 'desc');
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          message: {
            items: Array.from({ length: 25 }, (_, i) => ({ ...raw, DOI: `10.1234/date${i}` })),
            'total-results': 20000,
          },
        }),
      );
    const first = await searchWorks(query, { fetcher });
    assert.equal(first.nextCursor, '25');
    const last = await searchWorks(query, { cursor: '9975', fetcher });
    assert.equal(last.nextCursor, null);
    assert.equal(last.browseLimited, true);
    assert.throws(() => buildSearchURL(query, '10000'), /Narrow your search/);
  }
});
test('invalid requests are distinguished from retryable service failures', async () => {
  await assert.rejects(
    request('https://api.crossref.org/works?invalid-contract', {
      fetcher: async () => new Response('{}', { status: 400 }),
    }),
    (error) => error.retryable === false && /Change your search/.test(error.message),
  );
});
test('transient network failures are retried and aborted requests never fetch', async () => {
  let attempts = 0;
  const result = await request('https://api.crossref.org/works?network-recovery-contract', {
    fetcher: async () => {
      if (++attempts === 1) throw new TypeError('Failed to fetch');
      return new Response('{"message":{"recovered":true}}');
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.body.message.recovered, true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    request('https://api.crossref.org/works?aborted-contract', {
      signal: controller.signal,
      fetcher: async () => {
        throw new Error('An aborted request must never fetch');
      },
    }),
    (error) => error.name === 'AbortError',
  );
});

test('author search keeps names separate from bibliographic refinements and persists its mode', () => {
  const query = readQuery('?q=Ada+Researcher&field=author&period=new-kingdom');
  assert.deepEqual(readQuery(queryString(query)), query);
  const params = new URL(buildSearchURL(query)).searchParams;
  assert.equal(params.get('query.author'), 'Ada Researcher');
  assert.equal(params.get('query.bibliographic'), 'New Kingdom Egypt');
  const plain = new URL(buildSearchURL(readQuery('?q=Ada&field=author&context=0'))).searchParams;
  assert.equal(plain.has('query.bibliographic'), false);
  assert.equal(readQuery('?field=title').field, undefined);
});

test('explicit DOI mode rejects incomplete values before making a request', async () => {
  await assert.rejects(
    searchWorks(readQuery('?q=incomplete&field=doi'), {
      fetcher: async () => {
        throw new Error('No request should be sent');
      },
    }),
    (error) => error.retryable === false && /Enter a complete DOI/.test(error.message),
  );
});

test('all-capital deposited titles display in title case without altering the record', async () => {
  const { displayTitle, normalizeWork, authorLine } = await import('../js/data.js');
  assert.equal(
    displayTitle('THE BOUNDARY STELAE AS OFFICIAL AND HISTORICAL DOCUMENTS'),
    'The Boundary Stelae as Official and Historical Documents',
  );
  assert.equal(displayTitle('RAMESSES II AT KADESH'), 'Ramesses II at Kadesh');
  assert.equal(displayTitle('Already Mixed Case'), 'Already Mixed Case');
  assert.equal(displayTitle('ΑΙΓΥΠΤΟΣ'), 'Αιγυπτος');
  assert.equal(displayTitle('1234 5678'), '1234 5678');
  const work = normalizeWork({
    DOI: '10.1234/caps',
    title: ['SHOUTING TITLE'],
    editor: [{ given: 'Ada', family: 'Lovelace' }],
  });
  assert.equal(work.title, 'SHOUTING TITLE');
  assert.equal(authorLine(work), 'Ada Lovelace (ed.)');
});

test('Most cited keeps Crossref relevance paging and orders loaded results locally', async () => {
  const { buildSearchURL } = await import('../js/crossref.js');
  const { readQuery } = await import('../js/data.js');
  const params = new URL(buildSearchURL(readQuery('?q=amarna&sort=cited'), '25')).searchParams;
  assert.equal(params.get('sort'), 'score');
  assert.equal(params.get('cursor'), '25');
  assert.equal(params.has('offset'), false);
});
