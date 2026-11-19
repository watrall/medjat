import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionPlaces } from '../js/place-collection.js';
const sites = [
  { id: 'abydos', name: 'Abydos', aliases: [] },
  { id: 'thebes', name: 'Thebes', aliases: [] },
];
const records = new Map(
  ['Abydos and Thebes', 'Religion', 'Grammar'].map((title, i) => [
    `10.1234/${i}`,
    { work: { id: `10.1234/${i}`, title } },
  ]),
);
test('collection places distinguish many-to-many mentions, manual assignments, rejection, and nonspatial scholarship', () => {
  let data = collectionPlaces(records, sites, {});
  assert.equal(data.mapped, 1);
  assert.equal(data.associations.length, 2);
  assert.equal(data.unassigned.length, 2);
  const decisions = {
    'place:10.1234/1:thebes': { decision: 'confirmed', method: 'researcher' },
    'place:10.1234/0:abydos': { decision: 'rejected' },
    'place-scope:10.1234/2': { decision: 'not-place-specific' },
  };
  data = collectionPlaces(records, sites, decisions);
  assert.equal(data.mapped, 2);
  assert.equal(data.counts.get('thebes'), 2);
  assert.equal(data.unassigned.length, 0);
  assert.equal(data.notSpecific.length, 1);
  assert.equal(data.rejected.length, 1);
  decisions['place:10.1234/1:thebes'].decision = 'rejected';
  data = collectionPlaces(records, sites, decisions);
  assert.equal(
    data.rejected.length,
    2,
    'Manual rejections remain available to restore even without text matches',
  );
  assert.equal(data.unassigned[0].title, 'Religion');
});
