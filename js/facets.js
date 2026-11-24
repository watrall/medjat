import { decadeRows } from './aggregates.js';
import { buildSearchURL, request } from './crossref.js';
import { FACET_TYPE_IDS, TYPES } from './data.js';

// The counts describe the search without its type and date choices, so every alternative shows
// what choosing it would give, not just the one already chosen.
export function facetURL(query) {
  const url = new URL(
    buildSearchURL({ ...query, type: '', from: '', to: '', access: '', sort: 'relevance' }),
  );
  for (const key of ['cursor', 'offset', 'sort', 'order']) url.searchParams.delete(key);
  url.searchParams.set('rows', '0');
  url.searchParams.set('facet', 'type-name:*,published:*');
  return url.toString();
}

export async function getFacets(query, options) {
  const response = await request(facetURL(query), options);
  const facets = response.body?.message?.facets;
  if (!facets?.['type-name'] || !facets.published) return null;
  const types = Object.entries(facets['type-name'].values ?? {})
    .flatMap(([name, count]) => {
      const id = FACET_TYPE_IDS.get(name);
      return id && Number.isFinite(count) ? [{ id, label: TYPES.get(id) ?? name, count }] : [];
    })
    .sort((a, b) => b.count - a.count);
  const latest = new Date().getFullYear() + 1;
  const years = Object.entries(facets.published.values ?? {}).filter(
    ([year, count]) => /^\d{4}$/.test(year) && Number(year) <= latest && Number.isFinite(count),
  );
  const decades = decadeRows(years)
    .reverse()
    .map(([decade, count]) => ({ from: decade, to: String(Number(decade) + 9), count }));
  return { types, decades };
}
