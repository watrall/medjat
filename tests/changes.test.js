import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataChanges } from '../js/changes.js';
import { createCollectionStore } from '../js/collection-store.js';
import { normalizeWork } from '../js/data.js';
test('change review tracks references and notices but ignores incidental indexing timestamps', () => {
  assert.deepEqual(metadataChanges({ indexed: { a: 1 } }, { indexed: { a: 2 } }), []);
  const result = metadataChanges(
    { title: ['Old'] },
    { title: ['New'], 'update-to': [{ DOI: '10.1234/a', type: 'correction' }] },
  );
  assert.deepEqual(
    result.map((change) => change.field),
    ['title', 'update-to'],
  );
});
test('metadata acceptance cannot resurrect a deleted record or overwrite a newer version', async () => {
  const store = createCollectionStore({ storage: { getItem: () => null }, database: null });
  const work = normalizeWork({ DOI: '10.1234/example', title: ['Original'] });
  const next = normalizeWork({ DOI: work.id, title: ['Updated'] });
  try {
    await store.change({ add: { work, savedAt: '2026-11-19' } });
    await store.change({ update: { work: next, savedAt: '2026-11-19' }, expectedRaw: work.raw });
    await assert.rejects(
      store.change({ update: { work, savedAt: '2026-11-19' }, expectedRaw: work.raw }),
      /changed in another tab/,
    );
    await store.change({ remove: work.id });
    await assert.rejects(
      store.change({ update: { work: next, savedAt: '2026-11-19' } }),
      /removed from the collection/,
    );
  } finally {
    store.close();
  }
});
