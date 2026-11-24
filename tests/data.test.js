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

test('search history dedupes, keeps, and trims searches in storage', async () => {
  const { createSearchHistory, describeSearch, MAX_RECENT } =
    await import('../js/search-history.js');
  const { readQuery } = await import('../js/data.js');
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const history = createSearchHistory({ storage });
  history.record(readQuery('?q=amarna&period=new-kingdom&sort=cited'));
  history.record(readQuery('?q=amarna&period=new-kingdom&sort=cited'));
  assert.equal(history.recent().length, 1);
  assert.equal(history.recent()[0].detail, 'New Kingdom · Most cited');
  assert.equal(history.toggleKept(history.recent()[0].qs), true);
  for (let i = 0; i < MAX_RECENT + 4; i++) history.record(readQuery(`?q=topic${i}`));
  assert.equal(history.kept().length, 1);
  assert.equal(history.recent().length, MAX_RECENT);
  assert.equal(createSearchHistory({ storage }).kept().length, 1);
  history.clearRecent();
  assert.equal(history.recent().length, 0);
  assert.equal(history.kept().length, 1);
  assert.equal(describeSearch(readQuery('?q=x&field=author')), 'Author search');
  assert.equal(createSearchHistory({ storage: { getItem: () => '{bad' } }).kept().length, 0);
});

test('notes and tags validate as research backup entries', async () => {
  const { validateResearchBackup } = await import('../js/research-store.js');
  const { entries, skipped } = validateResearchBackup({
    'notes:10.1234/a': {
      decision: 'noted',
      note: 'Check plate 4',
      tags: ['Naqada', 'naqada', ' '],
    },
    'notes:not-a-doi': { decision: 'noted', note: 'x', tags: [] },
    'notes:10.1234/b': { decision: 'other', note: 'x', tags: [] },
  });
  assert.equal(skipped, 2);
  assert.deepEqual(entries.get('notes:10.1234/a').tags, ['Naqada']);
  assert.equal(entries.get('notes:10.1234/a').note, 'Check plate 4');
});

test('open licenses are recognized only when deposited and already in force', async () => {
  const { openLicenseURL } = await import('../js/data.js');
  const cc = 'https://creativecommons.org/licenses/by/4.0/';
  assert.equal(openLicenseURL({ licenses: [{ URL: cc }] }), cc);
  assert.equal(
    openLicenseURL({ licenses: [{ URL: cc, start: { 'date-time': '2999-01-01T00:00:00Z' } }] }),
    '',
  );
  assert.equal(openLicenseURL({ licenses: [{ URL: 'https://publisher.example/terms' }] }), '');
  assert.equal(openLicenseURL({ licenses: [{ URL: 'javascript:alert(1)' }] }), '');
  assert.equal(openLicenseURL({ licenses: [] }), '');
});

test('every citation style maps to a distinct Crossref style name', async () => {
  const { CITATION_STYLES } = await import('../js/crossref.js');
  const keys = CITATION_STYLES.map(([key]) => key);
  const names = CITATION_STYLES.map(([, , name]) => name);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('american-journal-of-archaeology'));
});

test('update notices merge duplicate sources and sort the most serious first', async () => {
  const { normalizeWork } = await import('../js/data.js');
  const { updateSeverity, updateLabel, noticeLabel, reportableUpdates } =
    await import('../js/updates.js');
  const work = normalizeWork({
    DOI: '10.1234/target',
    'updated-by': [
      { DOI: '10.1234/fix', type: 'correction', label: 'Correction', source: 'publisher' },
      { DOI: '10.1234/gone', type: 'retraction', label: 'Retraction', source: 'publisher' },
      {
        DOI: '10.1234/gone',
        type: 'retraction',
        label: 'Retraction',
        source: 'retraction-watch',
        updated: { 'date-time': '2021-12-15T00:00:00Z' },
      },
      { DOI: 'not a doi', type: 'retraction' },
      { DOI: '10.1234/v2', type: 'new_version', source: 'publisher' },
    ],
  });
  assert.deepEqual(
    work.updates.map(({ type, sources }) => [type, sources]),
    [
      ['retraction', ['publisher', 'retraction-watch']],
      ['correction', ['publisher']],
      ['new_version', ['publisher']],
    ],
  );
  assert.equal(work.updates[0].date, '2021-12-15T00:00:00Z');
  assert.equal(updateSeverity('retraction'), 'serious');
  assert.equal(updateSeverity('erratum'), 'minor');
  assert.equal(updateSeverity('something_new'), 'neutral');
  assert.equal(updateLabel(work.updates[0]), 'Retracted');
  assert.equal(reportableUpdates(work.updates).length, 2);
  assert.equal(noticeLabel({ type: 'expression_of_concern' }), 'Expression of concern notice');
  const notice = normalizeWork({
    DOI: '10.1234/gone',
    'update-to': [{ DOI: '10.1234/target', type: 'retraction', source: 'publisher' }],
  });
  assert.deepEqual(
    notice.updateTo.map((entry) => entry.doi),
    ['10.1234/target'],
  );
  assert.deepEqual(normalizeWork({ DOI: '10.1234/plain' }).updates, []);
});

test('saved records are checked for update notices in batches of 40', async () => {
  const { checkUpdates, UPDATE_BATCH } = await import('../js/crossref.js');
  const dois = Array.from({ length: 85 }, (_, i) => `10.1234/saved-${i}`);
  const requested = [];
  const fetcher = async (url) => {
    const params = new URL(url).searchParams;
    const batch = params
      .get('filter')
      .split(',')
      .map((part) => part.replace('doi:', ''));
    requested.push(batch.length);
    assert.equal(params.get('select'), 'DOI,updated-by');
    assert.equal(params.get('rows'), String(batch.length));
    const items = batch
      .filter((doi) => doi !== 'unknown')
      .map((DOI) => ({
        DOI,
        ...(DOI.endsWith('-3') && {
          'updated-by': [{ DOI: '10.1234/notice', type: 'retraction', source: 'publisher' }],
        }),
      }));
    return new Response(JSON.stringify({ message: { items } }));
  };
  const seen = new Map();
  await checkUpdates(dois, {
    fetcher,
    onBatch: (found) => found.forEach((v, k) => seen.set(k, v)),
  });
  assert.deepEqual(requested, [UPDATE_BATCH, UPDATE_BATCH, 5]);
  assert.equal(seen.size, 85);
  assert.equal(seen.get('10.1234/saved-3')[0].type, 'retraction');
  assert.deepEqual(seen.get('10.1234/saved-4'), []);
  await assert.rejects(
    checkUpdates(['10.1234/x'], { fetcher: async () => new Response('{"message":{}}') }),
    /unexpected response/,
  );
});

test('records imported without a save date share one timestamp', async () => {
  const { parseCollection } = await import('../js/collection.js');
  const record = (n) => ({ raw: { DOI: `10.1234/undated-${n}`, title: [`Undated ${n}`] } });
  const { records } = parseCollection(
    JSON.stringify({ version: 1, records: [record(1), record(2), record(3)] }),
  );
  assert.equal(new Set([...records.values()].map((entry) => entry.savedAt)).size, 1);
});

test('the registering member links to its Crossref Participation Report', async () => {
  const { normalizeWork, participationReportURL } = await import('../js/data.js');
  const work = normalizeWork({ DOI: '10.1234/prep', member: '78' });
  assert.equal(work.member, '78');
  assert.equal(participationReportURL(work), 'https://www.crossref.org/members/prep/78/');
  for (const member of [undefined, '', 'abc', '78/../x', 78.5]) {
    const other = normalizeWork({ DOI: '10.1234/prep', member });
    assert.equal(other.member, '');
    assert.equal(participationReportURL(other), '');
  }
});

test('a chapter keeps the DOI of the book Crossref says it is part of', async () => {
  const { normalizeWork } = await import('../js/data.js');
  const chapter = normalizeWork({
    DOI: '10.1234/chapter',
    relation: { 'is-part-of': [{ id: 'https://doi.org/10.1234/Book', 'id-type': 'doi' }] },
  });
  assert.equal(chapter.partOf, '10.1234/book');
  assert.equal(chapter.partOfID, 'https://doi.org/10.1234/Book');
  assert.equal(
    normalizeWork({ DOI: '10.1234/x', relation: { 'is-part-of': [{ id: 'nope' }] } }).partOf,
    '',
  );
  assert.equal(normalizeWork({ DOI: '10.1234/x' }).partOf, '');
});

test('other chapters of a book come back in page order from one relation query', async () => {
  const { getBookChapters, BOOK_CHAPTER_LIMIT } = await import('../js/crossref.js');
  let requested;
  const fetcher = async (url) => {
    requested = new URL(url).searchParams;
    return new Response(
      JSON.stringify({
        message: {
          'total-results': 3,
          items: [
            { DOI: '10.1234/c3', title: ['Third'], page: '40-50' },
            { DOI: '10.1234/c1', title: ['First'], page: '2-10' },
            { DOI: '10.1234/c0', title: ['No pages'] },
          ],
        },
      }),
    );
  };
  const { works, total } = await getBookChapters('https://doi.org/10.1234/book', { fetcher });
  assert.equal(
    requested.get('filter'),
    'relation.type:is-part-of,relation.object:https://doi.org/10.1234/book',
  );
  assert.equal(requested.get('rows'), String(BOOK_CHAPTER_LIMIT));
  assert.deepEqual(
    works.map((work) => work.title),
    ['First', 'Third', 'No pages'],
  );
  assert.equal(total, 3);
  await assert.rejects(
    getBookChapters('10.1234/broken', { fetcher: async () => new Response('{"message":{}}') }),
    /unexpected response/,
  );
});

test('book types use the terms scholars use', async () => {
  const { normalizeWork, TYPES } = await import('../js/data.js');
  assert.equal(normalizeWork({ DOI: '10.1234/a', type: 'edited-book' }).typeLabel, 'Edited volume');
  assert.equal(
    normalizeWork({ DOI: '10.1234/b', type: 'reference-book' }).typeLabel,
    'Reference work',
  );
  assert.equal(TYPES.get('edited-book'), 'Edited volume');
});

test('a visit shows one tile per group first, never repeats, and stays stable', async () => {
  const { LANDING_TILES, TILES_PER_VISIT, pickTiles, chooseTiles } =
    await import('../js/landing-tiles.js');
  const seeded = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const wide = Array.from({ length: 18 }, (_, i) => ({ id: `t${i}`, group: `g${i % 6}` }));
  for (let seed = 1; seed <= 40; seed++) {
    const picked = pickTiles(wide, { random: seeded(seed) });
    assert.equal(picked.length, TILES_PER_VISIT);
    assert.equal(new Set(picked).size, TILES_PER_VISIT);
    assert.equal(new Set(picked.map((tile) => tile.group)).size, 6, 'one tile from each group');
  }
  const orders = new Set(
    Array.from({ length: 30 }, (_, i) =>
      pickTiles(wide, { random: seeded(i + 1) })
        .map((t) => t.id)
        .join(),
    ),
  );
  assert.ok(orders.size > 10, 'different visits see different tiles');
  const few = [...LANDING_TILES].slice(0, 4);
  assert.equal(pickTiles(few, { random: seeded(3) }).length, 4);

  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const first = chooseTiles({ storage, random: seeded(7) });
  assert.equal(first.length, Math.min(TILES_PER_VISIT, LANDING_TILES.length));
  assert.deepEqual(chooseTiles({ storage, random: seeded(99) }), first, 'kept within a visit');
  store.set('medjat-landing-tiles', '["nope"]');
  assert.equal(chooseTiles({ storage, random: seeded(5) }).length, first.length);
  store.set('medjat-landing-tiles', '{bad');
  assert.equal(chooseTiles({ storage, random: seeded(5) }).length, first.length);
  assert.equal(chooseTiles({ storage: undefined, random: seeded(5) }).length, first.length);
});

test('every landing tile has a unique id, a known period, and a licensed credit', async () => {
  const { LANDING_TILES } = await import('../js/landing-tiles.js');
  const { PERIODS } = await import('../js/data.js');
  assert.equal(new Set(LANDING_TILES.map((tile) => tile.id)).size, LANDING_TILES.length);
  assert.equal(new Set(LANDING_TILES.map((tile) => tile.title)).size, LANDING_TILES.length);
  for (const tile of LANDING_TILES) {
    assert.ok(!tile.period || PERIODS.some((period) => period.id === tile.period), tile.id);
    assert.ok(
      tile.credit.text && tile.credit.url.startsWith('https://') && tile.credit.license,
      tile.id,
    );
  }
});

test('the real tile pool gives every visit six different kinds of scholarship', async () => {
  const { LANDING_TILES, pickTiles } = await import('../js/landing-tiles.js');
  assert.equal(LANDING_TILES.length, 18);
  const groups = new Map();
  for (const tile of LANDING_TILES) groups.set(tile.group, (groups.get(tile.group) ?? 0) + 1);
  assert.equal(groups.size, 6);
  assert.deepEqual([...groups.values()], [3, 3, 3, 3, 3, 3]);
  for (let i = 0; i < 200; i++) {
    const picked = pickTiles(LANDING_TILES);
    assert.equal(new Set(picked.map((tile) => tile.group)).size, 6);
    assert.equal(new Set(picked.map((tile) => tile.id)).size, 6);
  }
});

test('every landing tile has both photo sizes on disk and a license link when it has one', async () => {
  const { existsSync } = await import('node:fs');
  const { LANDING_TILES } = await import('../js/landing-tiles.js');
  const spdx = /^(CC BY(-SA)? \d\.\d|CC0)$/;
  for (const tile of LANDING_TILES) {
    for (const file of [`${tile.image}.webp`, `${tile.image}-small.webp`])
      assert.ok(existsSync(new URL(`../assets/landing/${file}`, import.meta.url)), file);
    assert.ok(spdx.test(tile.credit.license) || tile.credit.license === 'Public domain', tile.id);
  }
  const images = LANDING_TILES.map((tile) => tile.image);
  assert.equal(new Set(images).size, images.length, 'each tile has its own photo');
});
