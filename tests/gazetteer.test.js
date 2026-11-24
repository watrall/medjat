import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeEvidence, placesForWork } from '../js/place-data.js';
import { searchPlaces } from '../js/place-search.js';
import { fold } from '../js/place-data.js';
const data = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url)));
const policy = JSON.parse(readFileSync(new URL('../data/place-name-policy.json', import.meta.url)));
const sites = data.places.map((place) => ({
  ...place,
  aliases: place.match,
  searchText: fold([place.name, ...place.match, ...place.otherNames].join(' | ')),
}));
const named = (name) => sites.find((site) => site.name === name);

test('the index holds attributed Pleiades places inside Egypt with stable identifiers', () => {
  assert.equal(data.places.length, data.count);
  assert.ok(data.count > 1000);
  assert.equal(new Set(data.places.map((place) => place.id)).size, data.count);
  assert.equal(data.places.filter((place) => place.featured).length, 25);
  for (const place of data.places) {
    assert.ok(place.latitude >= 22 && place.latitude <= 31.7, place.name);
    assert.ok(place.longitude >= 25 && place.longitude <= 36.9, place.name);
    assert.ok(place.types.length > 0 || place.featured, place.name);
    assert.ok(
      place.types.every((type) => type in data.types),
      place.name,
    );
    assert.ok(
      (place.periods || []).every((period) => period in data.periods),
      place.name,
    );
  }
  assert.equal(data.license, 'CC BY 3.0');
  assert.match(data.sourceSHA256, /^[0-9a-f]{64}$/);
});

test('no place outside Egypt or in the Negev or Petra is included', () => {
  for (const name of ['Petra', 'Eilat', 'Avdat', 'Shivta', 'Nizana', 'Wadi Rum'])
    assert.equal(
      sites.some((site) => [site.name, ...site.match].some((alias) => alias === name)),
      false,
      name,
    );
});

test('place evidence respects word boundaries and does not mistake essais for Sais', () => {
  const site = { name: 'Sais', aliases: ['Sais'] };
  assert.equal(placeEvidence({ title: 'Essais sur la religion', abstract: '' }, site), null);
  assert.match(placeEvidence({ title: 'Excavations at Sais', abstract: '' }, site).text, /Sais/);
});

test('reviewed Pleiades variants match without conflating constituent places', () => {
  const thebes = named('Thebes');
  for (const name of ['Luxor', 'Waset', 'Thebai', 'Thēbai'])
    assert.ok(placeEvidence({ title: `Research at ${name.normalize('NFD')}` }, thebes), name);
  for (const title of [
    'Karnak temple',
    'Niwt and religion',
    'Diospolis religion',
    'Luxor2 catalogue',
  ])
    assert.equal(placeEvidence({ title }, thebes), null);
  assert.equal(placeEvidence({ title: 'Abu Simbel' }, named('Elephantine')), null);
});

test('every reviewed alias is in the index and names that mean something else never match', () => {
  for (const place of data.places.filter((place) => place.featured))
    for (const alias of policy.sites[place.id]) assert.ok(place.match.includes(alias), alias);
  const excluded = new Set(policy.notPlaceNames.map(fold));
  for (const place of data.places.filter((place) => !place.featured))
    for (const alias of place.match) {
      assert.ok(alias.length >= 5, alias);
      assert.equal(excluded.has(fold(alias)), false, alias);
    }
  const owners = new Map();
  for (const place of data.places.filter((place) => !place.featured))
    for (const alias of place.match)
      owners.set(fold(alias), (owners.get(fold(alias)) || new Set()).add(place.id));
  assert.equal([...owners.values()].filter((ids) => ids.size > 1).length, 0);
  for (const title of ['The Rosetta Stone', 'Cairo in 1900', 'Ramesses II and the Nile Delta'])
    assert.deepEqual(placesForWork({ title }, sites), [], title);
});

test('places are found in a title or abstract with the title match first', () => {
  const found = placesForWork(
    { title: 'Burials at Hierakonpolis', abstract: 'Compared with Abydos and Tell el-Dab\u2019a.' },
    sites,
  );
  assert.deepEqual(found.map(({ place }) => place.name).slice(0, 2), ['Hierakonpolis', 'Abydos']);
});

test('searching ranks exact names first, matches any attested name, and filters', () => {
  assert.equal(searchPlaces(sites, { query: 'Abydos' })[0].name, 'Abydos');
  assert.equal(searchPlaces(sites, { query: 'ebot' })[0].name, 'Abydos');
  assert.equal(
    searchPlaces(sites, { query: 'abydos ' }).length,
    searchPlaces(sites, { query: 'ABYDOS' }).length,
  );
  assert.ok(searchPlaces(sites, { query: 'Tell el-Dab' }).length > 0);
  const temples = searchPlaces(sites, { type: 'sacred' });
  assert.ok(temples.length > 50 && temples.every((place) => place.types.includes('sacred')));
  const predynastic = searchPlaces(sites, { period: 'pharaonic', query: 'Hierakonpolis' });
  assert.equal(predynastic[0].name, 'Hierakonpolis');
  assert.equal(searchPlaces(sites, { query: 'zzzzzz' }).length, 0);
  assert.equal(searchPlaces(sites, {}).length, sites.length);
});

test('matching 200 saved publications against every place stays fast', () => {
  const works = Array.from({ length: 200 }, (_, index) => ({
    title: `Excavations at site ${index} near Abydos`,
    abstract: 'A long abstract about pottery, burials and settlement patterns. '.repeat(30),
  }));
  const started = performance.now();
  for (const work of works) placesForWork(work, sites);
  assert.ok(performance.now() - started < 500);
});
