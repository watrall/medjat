import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReferences } from '../js/references.js';
test('reference overlap deduplicates each source and distinguishes missing and unresolved references', () => {
  const result = analyzeReferences(
    [
      {
        id: '10.1234/a',
        title: 'A',
        references: [
          { DOI: '10.1234/shared' },
          { DOI: '10.1234/shared' },
          { unstructured: 'An older book' },
        ],
        relations: {},
      },
      {
        id: '10.1234/b',
        title: 'B',
        references: [{ DOI: '10.1234/shared' }, { DOI: '10.1234/a' }],
        relations: { 'is-version-of': [{ id: '10.1234/version' }] },
      },
      { id: '10.1234/c', title: 'C', references: [], relations: {} },
    ],
    ['10.1234/a'],
  );
  assert.equal(result.shared.length, 1);
  assert.equal(result.shared[0].sources.length, 2);
  assert.equal(result.missing.length, 1);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.missingReferenceLists, 1);
  assert.ok(result.edges.some((edge) => edge.type === 'is-version-of'));
});
