import assert from 'node:assert/strict';
import { searchWorks, getCitation, getWork } from '../js/crossref.js';
import { readQuery } from '../js/data.js';
import { exportCollection } from '../js/export.js';
import { aggregateSearch } from '../js/aggregates.js';
const query = readQuery('?q=Deir+el-Medina&period=new-kingdom&type=journal-article');
const first = await searchWorks(query);
assert.ok(first.items.length > 0);
assert.ok(first.items.every((work) => work.type === 'journal-article'));
const report = {
  firstPage: first.items.length,
  totalMatches: first.total,
  firstTitle: first.items[0].title,
};
if (first.nextCursor) {
  const next = await searchWorks(query, { cursor: first.nextCursor });
  report.secondPage = next.items.length;
  report.nextCursorChanged = first.nextCursor !== next.nextCursor;
  assert.ok(
    next.items.some((work) => !first.items.some((a) => a.id === work.id)),
    'Second page must contain new records',
  );
}
const work = await getWork('10.1093/actrade/9780198845461.003.0002');
report.dateSorts = {};
for (const sort of ['newest', 'oldest']) {
  const sortedQuery = { ...query, sort };
  const sorted = await searchWorks(sortedQuery);
  assert.ok(sorted.items.length > 0, `${sort} must return publications`);
  assert.equal(sorted.nextCursor, '25');
  const next = await searchWorks(sortedQuery, { cursor: sorted.nextCursor });
  assert.ok(next.items.length > 0, `${sort} second page must return publications`);
  assert.ok(next.items.some((item) => !sorted.items.some((first) => first.id === item.id)));
  report.dateSorts[sort] = { firstPage: sorted.items.length, secondPage: next.items.length };
}
const citation = await getCitation(work.doi, 'apa');
assert.match(citation, /Shaw/);
report.citation = citation;
const records = new Map([[work.id, { work, savedAt: new Date().toISOString() }]]);
report.ris = (await exportCollection(records, 'ris')).slice(0, 80);
report.bibtex = (await exportCollection(records, 'bibtex')).slice(0, 80);
const summary = await aggregateSearch(query, { fresh: true });
assert.ok(summary.window > 0, 'The ranked window must contain records');
assert.ok(summary.total >= summary.window, 'Ranked matches cannot be fewer than the window');
assert.ok(summary.types.length > 0, 'The ranked window must report publication types');
assert.ok(summary.venues.length > 0, 'The ranked window must report venues');
const container = summary.venues.map(([name]) => name).find((name) => !name.includes(','));
assert.ok(container, 'The ranked window must supply a refinable venue');
const venue = await searchWorks({ ...query, container });
assert.ok(venue.items.length > 0);
assert.ok(venue.items.every((item) => item.raw['container-title'].includes(container)));
report.rankedWindow = {
  total: summary.total,
  window: summary.window,
  types: summary.types.length,
  venues: summary.venues.length,
  availability: summary.availability,
  venueRefinement: container,
};
console.log(JSON.stringify(report, null, 2));
