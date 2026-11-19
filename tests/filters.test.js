import test from 'node:test';
import assert from 'node:assert/strict';
import { filterChips, filterDescription, queryFilters } from '../js/filters.js';

const query = {
  period: 'new-kingdom',
  container: 'The Journal of Egyptian Archaeology',
  type: 'book',
  from: '2000',
  to: '2020',
  abstract: true,
  orcid: false,
  references: true,
};

test('query filters keep their established order and values', () => {
  assert.deepEqual(queryFilters(query), [
    'container-title:The Journal of Egyptian Archaeology',
    'type:book',
    'from-pub-date:2000-01-01',
    'until-pub-date:2020-12-31',
    'has-abstract:true',
    'has-references:true',
  ]);
  assert.deepEqual(queryFilters({}), []);
});

test('applied query chips retain their labels', () => {
  assert.deepEqual(filterChips(query), [
    'Period keywords: New Kingdom',
    'Book',
    'Venue: The Journal of Egyptian Archaeology',
    'From 2000',
    'To 2020',
    'Has abstract',
    'Has references',
  ]);
  assert.deepEqual(
    filterChips({
      period: '',
      type: '',
      container: '',
      from: '',
      to: '',
      abstract: false,
      orcid: false,
      references: false,
    }),
    [],
  );
});

test('filter descriptions retain their labels and fallback', () => {
  assert.equal(
    filterDescription(query),
    'Publication years: 2000 to 2020 · Type: Book · Venue: The Journal of Egyptian Archaeology · Abstract required · References required',
  );
  assert.equal(filterDescription({}), 'No additional publication filters');
});
