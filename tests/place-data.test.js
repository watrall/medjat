import test from 'node:test';
import assert from 'node:assert/strict';
import { placeEvidence, placesForWork, placeSearchURL } from '../js/place-data.js';
test('place mentions expose the actual field and tolerate hyphen variants without substring false positives', () => {
  const site = { name: 'Deir el-Medina', aliases: ['Deir el-Medina'] };
  const evidence = placeEvidence({ title: 'Writing at Deir-el-Medina', abstract: '' }, site);
  assert.equal(evidence.field, 'title');
  assert.equal(evidence.alias, 'Deir-el-Medina');
  assert.equal(
    placeEvidence({ title: 'Essais sur la religion' }, { name: 'Sais', aliases: ['Sais'] }),
    null,
  );
  assert.equal(
    placesForWork({ title: 'Abydos and Thebes' }, [
      { name: 'Abydos', aliases: ['Abydos'] },
      { name: 'Thebes', aliases: ['Thebes'] },
    ]).length,
    2,
  );
});
test('place discovery retrieves Crossref candidates with explicit query and cursor rather than inventing geographic filters', () => {
  const url = new URL(
    placeSearchURL({ name: 'Abydos' }, { topic: 'burial', cursor: 'next+cursor' }),
  );
  assert.equal(url.origin, 'https://api.crossref.org');
  assert.equal(url.searchParams.get('query.bibliographic'), 'Abydos Egypt burial');
  assert.equal(url.searchParams.get('cursor'), 'next+cursor');
  assert.equal(url.searchParams.get('sort'), 'score');
  assert.equal(url.searchParams.has('filter'), false);
});
