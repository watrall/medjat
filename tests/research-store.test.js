import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchStore } from '../js/research-store.js';

const PREFIX = 'egypt-research-review:';
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    values: data,
  };
}

test('session-only decisions win over an older persisted copy', () => {
  const backend = storage({ [`${PREFIX}demo`]: JSON.stringify({ decision: 'persisted-old' }) });
  backend.setItem = () => {
    throw new Error('quota');
  };
  const store = createResearchStore({ storage: backend });
  assert.equal(store.reviewDecision('demo', { decision: 'session-new' }), false);
  assert.equal(store.researchData().demo.decision, 'session-new');
});

test('one corrupt key does not hide later decisions', () => {
  const backend = storage({
    [`${PREFIX}a`]: JSON.stringify({ decision: 'first' }),
    [`${PREFIX}broken`]: '{',
    [`${PREFIX}z`]: JSON.stringify({ decision: 'last' }),
  });
  const store = createResearchStore({ storage: backend });
  const data = store.researchData();
  assert.equal(data.a.decision, 'first');
  assert.equal(data.z.decision, 'last');
  assert.equal('broken' in data, false);
});

test('successful decisions persist without leaving a session copy', () => {
  const backend = storage();
  const store = createResearchStore({ storage: backend });
  assert.equal(store.reviewDecision('demo', { decision: 'confirmed' }), true);
  assert.equal(store.researchData().demo.decision, 'confirmed');
  assert.equal(backend.values.has(`${PREFIX}demo`), true);
});

test('unavailable storage keeps decisions in memory', () => {
  const store = createResearchStore({ storage: null });
  assert.equal(store.reviewDecision('demo', { decision: 'deferred' }), false);
  assert.equal(store.researchData().demo.decision, 'deferred');
});

test('backup imports validate decisions and keep any conflict that was not reviewed or has changed', () => {
  const store = createResearchStore({ storage: storage() });
  const key = 'citation:10.1234/source:Older book';
  const incoming = {
    [key]: { decision: 'confirmed', doi: '10.1234/book' },
    'place-scope:10.1234/source': { decision: 'confirmed' },
    'citation:10.1234/source:Another book': { decision: 'confirmed', doi: 'not a DOI' },
  };
  store.reviewDecision(key, { decision: 'deferred' });

  assert.deepEqual(store.importResearch(incoming), { kept: 1, skipped: 2, sessionOnly: false });
  const snapshot = new Map([[key, store.researchData()[key]]]);
  store.reviewDecision(key, { decision: 'dismissed' });
  assert.equal(store.importResearch(incoming, snapshot).kept, 1);
  assert.equal(store.researchData()[key].decision, 'dismissed');
  snapshot.set(key, store.researchData()[key]);
  assert.equal(store.importResearch(incoming, snapshot).kept, 0);
  assert.equal(store.researchData()[key].doi, '10.1234/book');
  assert.deepEqual(Object.keys(store.researchData()), [key]);
});
