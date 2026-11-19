import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeEvidence } from '../js/place-data.js';
const data = JSON.parse(readFileSync(new URL('../data/sites.json', import.meta.url)));
test('gazetteer bundles 25 attributed, geographically validated site records', () => {
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
  assert.match(placeEvidence({ title: 'Excavations at Sais', abstract: '' }, site).text, /Sais/);
});
test('reviewed Pleiades variants match with provenance without conflating constituent places', () => {
  const thebes = data.sites.find((s) => s.name === 'Thebes');
  for (const name of ['Luxor', 'Waset', 'Thebai', 'Thēbai']) {
    assert.ok(placeEvidence({ title: `Research at ${name.normalize('NFD')}` }, thebes));
    assert.ok(
      thebes.nameVariants
        .find((n) => n.name === name)
        .attestations.some((a) => a.source.startsWith(thebes.source)),
    );
  }
  for (const title of [
    'Karnak temple',
    'Niwt and religion',
    'Diospolis religion',
    'Luxor2 catalogue',
  ])
    assert.equal(placeEvidence({ title }, thebes), null);
  assert.equal(
    placeEvidence(
      { title: 'Abu Simbel' },
      data.sites.find((s) => s.name === 'Elephantine'),
    ),
    null,
  );
  assert.equal(data.sites.filter((s) => s.nameVariants.length).length, 25);
});
