import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeEvidence } from '../js/atlas.js';
const data = JSON.parse(readFileSync(new URL('../data/sites.json', import.meta.url)));
test('atlas bundles 25 attributed, geographically validated site records', () => {
  assert.equal(data.sites.length, 25);
  assert.equal(new Set(data.sites.map((site) => site.id)).size, 25);
  for (const site of data.sites) {
    assert.ok(site.latitude >= 23 && site.latitude <= 33);
    assert.match(site.source, /^https:\/\/pleiades.stoa.org\/places\/\d+$/);
  }
});
test('place evidence respects word boundaries and does not mistake essais for Sais', () => {
  const site = { name: 'Sais', aliases: [] };
  assert.equal(placeEvidence({ title: 'Essais sur la religion', abstract: '' }, site), null);
  assert.match(placeEvidence({ title: 'Excavations at Sais', abstract: '' }, site), /Sais/);
});
