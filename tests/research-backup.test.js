import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDecision, researchData, importResearch } from '../js/research-store.js';
import { serializeCollection, parseCollection } from '../js/collection.js';
import { normalizeWork } from '../js/data.js';
test('research backups retain decisions, provenance, and review dates alongside source records', () => {
  const work = normalizeWork({ DOI: '10.1234/source', title: ['A source'] });
  reviewDecision('citation:10.1234/source:Older book', {
    decision: 'confirmed',
    doi: '10.1234/book',
  });
  const backup = serializeCollection(
    new Map([[work.id, { work, savedAt: '2026-11-19' }]]),
    researchData(),
  );
  assert.equal(JSON.parse(backup).version, 2);
  const restored = parseCollection(backup);
  const originalDate = restored.research['citation:10.1234/source:Older book'].reviewedAt;
  assert.equal(restored.records.get(work.id).work.title, 'A source');
  importResearch(restored.research);
  assert.equal(researchData()['citation:10.1234/source:Older book'].reviewedAt, originalDate);
  assert.equal(researchData()['citation:10.1234/source:Older book'].doi, '10.1234/book');
});
