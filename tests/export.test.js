import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCollection, metadataCSV, csvCell } from '../js/export.js';
import { normalizeWork } from '../js/data.js';
const work = normalizeWork({
  DOI: '10.1234/export-test',
  title: ['A title, with "quotes"'],
  author: [{ name: 'An organization' }],
});
const records = new Map([[work.id, { work, savedAt: '2026-11-18' }]]);
test('CSV preserves quoting and protects spreadsheet formula cells', () => {
  assert.match(metadataCSV(records), /"A title, with ""quotes"""/);
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
});
test('bibliography export requests the format through content negotiation', async () => {
  let accept;
  const progress = [];
  const output = await exportCollection(records, 'bibtex', {
    fetcher: async (url, options) => {
      accept = options.headers.Accept;
      return new Response('@book{Shaw_2021, title={A book}}');
    },
    onProgress: (n) => progress.push(n),
  });
  assert.equal(accept, 'application/x-bibtex');
  assert.match(output, /@book\{record1,/);
  assert.deepEqual(progress, [1]);
});
test('a failed bibliography export does not silently drop records', async () => {
  await assert.rejects(
    exportCollection(records, 'ris', { fetcher: async () => new Response('not RIS') }),
    /could not format/,
  );
  assert.equal(records.size, 1);
});
test('export cancellation stops before making a request', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    exportCollection(records, 'ris', {
      signal: controller.signal,
      fetcher: async () => {
        called = true;
        return new Response('');
      },
    }),
  );
  assert.equal(called, false);
});
test('generic RIS chapters retain their deposited publication type', async () => {
  const chapter = normalizeWork({
    DOI: '10.1234/chapter-ris',
    type: 'book-chapter',
    title: ['A chapter'],
  });
  const result = await exportCollection(new Map([[chapter.id, { work: chapter }]]), 'ris', {
    fetcher: async () => new Response('TY  - GENERIC\nTI  - A chapter\nER  -'),
  });
  assert.match(result, /^TY  - CHAP/m);
});
