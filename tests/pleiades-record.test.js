import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRange, summarizePleiades } from '../js/pleiades-record.js';

test('a Pleiades record is reduced to plain text facts and tolerates missing fields', async () => {
  const record = summarizePleiades({
    description: ' A city. ',
    placeTypes: ['settlement'],
    locations: [
      { start: -750, end: 640 },
      { start: -3000, end: null },
      { start: null, end: null },
    ],
    names: [{}, {}],
    creators: [{ name: 'T. Wilfong' }, { name: null }],
  });
  assert.deepEqual(record, {
    description: 'A city.',
    types: ['settlement'],
    start: -3000,
    end: 640,
    names: 2,
    creators: ['T. Wilfong'],
  });
  assert.equal(dateRange(record), '3000 BCE to 640 CE');
  assert.equal(dateRange({ start: null, end: 640 }), 'until 640 CE');
  assert.equal(dateRange({ start: null, end: null }), '');
  assert.deepEqual(summarizePleiades(null).types, []);
});
