import { buildSearchURL, getWork, request } from './crossref.js';
import { normalizeDOI, TYPES } from './data.js';
const cache = new Map();
export function aggregateURL(query, extraFilter = '', facet = '') {
  const url = new URL(buildSearchURL({ ...query, sort: 'relevance' }));
  for (const key of ['cursor', 'offset', 'sort', 'order']) url.searchParams.delete(key);
  url.searchParams.set('rows', '0');
  if (facet) url.searchParams.set('facet', facet);
  if (extraFilter)
    url.searchParams.set(
      'filter',
      [url.searchParams.get('filter'), extraFilter].filter(Boolean).join(','),
    );
  return url.toString();
}
export function aggregateKey(query) {
  return aggregateURL(query);
}
export async function aggregateSearch(
  query,
  { signal, fresh = false, fetcher, onPart = () => {} } = {},
) {
  if (normalizeDOI(query.q))
    return { doi: await getWork(query.q, { signal, fresh, fetcher }), query: { ...query } };
  const key = aggregateKey(query),
    previous = cache.get(key);
  if (!fresh && previous && Date.now() - previous.time < 900000) return previous.result;
  const result = {
    query: { ...query },
    total: null,
    facets: {},
    availability: {},
    errors: {},
    startedAt: new Date().toISOString(),
  };
  const tasks = [
    ['facets', 'type-name:1000,published:1000,container-title:10', ''],
    ...[
      ['abstract', 'has-abstract:true'],
      ['references', 'has-references:true'],
      ['orcid', 'has-orcid:true'],
      ['license', 'has-license:true'],
    ].map(([name, filter]) => [name, '', filter]),
  ];
  async function worker() {
    while (tasks.length) {
      signal?.throwIfAborted();
      const [name, facet, filter] = tasks.shift();
      try {
        const response = await request(aggregateURL(query, filter, facet), {
          signal,
          fetcher,
          fresh,
        });
        const message = response.body?.message;
        if (!Number.isFinite(message?.['total-results']))
          throw new Error('Crossref returned an invalid count.');
        if (name === 'facets') {
          result.total = message['total-results'];
          result.facets = message.facets || {};
        } else result.availability[name] = message['total-results'];
      } catch (error) {
        if (signal?.aborted) throw error;
        result.errors[name] = error.message;
      }
      onPart(result);
    }
  }
  await Promise.all([worker(), worker()]);
  result.finishedAt = new Date().toISOString();
  if (!Object.keys(result.errors).length) cache.set(key, { time: Date.now(), result });
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return result;
}
export function facetRows(facet, chronological = false) {
  return Object.entries(facet?.values || {})
    .filter(([, count]) => Number.isFinite(count) && count >= 0)
    .sort(
      chronological
        ? ([a], [b]) => Number(a) - Number(b)
        : ([a, x], [b, y]) => y - x || a.localeCompare(b),
    );
}
export function typeID(label) {
  return (
    [...TYPES].find(([, value]) => value.toLowerCase() === label.toLowerCase())?.[0] ||
    {
      'Journal Article': 'journal-article',
      Chapter: 'book-chapter',
      'Conference Paper': 'proceedings-article',
      Entry: 'reference-entry',
    }[label] ||
    null
  );
}
