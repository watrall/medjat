import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCollection,
  serializeCollection,
  readCollection,
  mergeCollections,
} from '../js/collection.js';
import { normalizeWork } from '../js/data.js';
const work = normalizeWork({
  DOI: '10.1234/saved',
  title: ['Saved publication'],
  author: [{ name: 'An institution' }],
});
const records = new Map([[work.id, { work, savedAt: '2026-11-18T12:00:00Z' }]]);
test('collection export round-trips source metadata and save time', () => {
  const restored = parseCollection(serializeCollection(records));
  assert.deepEqual(restored.records.get(work.id), records.get(work.id));
  assert.deepEqual(restored.research, {});
  assert.equal(mergeCollections(records, restored.records).size, 1);
});
test('storage errors are explicit', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.ok(readCollection(storage).warning);
});
test('invalid imports are rejected before replacing the collection', () => {
  assert.throws(() => parseCollection('not json'), /valid JSON/);
  assert.throws(
    () => parseCollection('{"version":1,"records":[{"raw":{"DOI":"javascript:bad"}}]}'),
    /valid DOI/,
  );
  assert.throws(() => parseCollection('{"records":[]}'), /not a supported/);
  assert.equal(records.size, 1);
});

test('collection imports keep existing records and replace only unchanged, reviewed conflicts', () => {
  const current = new Map([
    ['a', { title: 'Original' }],
    ['c', { title: 'Added in another tab' }],
  ]);
  const incoming = new Map([
    ['a', { title: 'Imported' }],
    ['b', { title: 'New' }],
    ['c', { title: 'Other copy' }],
  ]);
  assert.deepEqual(
    [...mergeCollections(current, incoming).values()].map(({ title }) => title),
    ['Original', 'Added in another tab', 'New'],
  );

  const reviewed = new Map([
    ['a', { title: 'Original' }],
    ['c', { title: 'Previously reviewed' }],
  ]);
  assert.deepEqual(
    [...mergeCollections(current, incoming, reviewed).values()].map(({ title }) => title),
    ['Imported', 'Added in another tab', 'New'],
  );
});
