import test from 'node:test';
import assert from 'node:assert/strict';
import { changesKey, citationKey, doiKey, placeKey, placeScopeKey } from '../js/decision-keys.js';

test('persisted decision keys keep their established formats', () => {
  assert.equal(placeScopeKey('10.1234/work'), 'place-scope:10.1234/work');
  assert.equal(placeKey('10.1234/work', '756512'), 'place:10.1234/work:756512');
  assert.equal(citationKey('10.1234/work', 'A cited book'), 'citation:10.1234/work:A cited book');
  assert.equal(changesKey('10.1234/work'), 'changes:10.1234/work');
  assert.equal(doiKey('10.1234/work'), 'doi:10.1234/work');
});
