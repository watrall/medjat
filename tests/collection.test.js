import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCollection,
  serializeCollection,
  readCollection,
  writeCollection,
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
  assert.deepEqual(restored.get(work.id), records.get(work.id));
  assert.equal(mergeCollections(records, restored).size, 1);
});
test('storage errors are explicit rather than false save success', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.ok(readCollection(storage).warning);
  assert.equal(writeCollection(records, storage), false);
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
