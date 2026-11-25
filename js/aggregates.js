// @ts-check
import { buildSearchURL, getWork, request } from './crossref.js';
import { FACET_TYPE_IDS, normalizeDOI, normalizeWork, TYPES } from './data.js';

export const WINDOW_SIZE = 250;
export const LARGE_WINDOW_SIZE = 1000;
const TTL = 15 * 60 * 1000;
const cache = new Map();

/**
 * One request reads the first page of the relevance ranking. Crossref keyword
 * totals count every record matching any word, so they cannot describe a
 * discipline; the ranked window is the population the charts report.
 * @param {import('./types.js').Query} query
 * @param {number} [size]
 */
export function windowURL(query, size = WINDOW_SIZE) {
  const url = new URL(buildSearchURL({ ...query, sort: 'relevance' }));
  for (const key of ['cursor', 'offset']) url.searchParams.delete(key);
  url.searchParams.set('rows', String(size));
  return url.toString();
}

/**
 * @param {import('./types.js').Query} query
 * @param {number} [size]
 */
export function aggregateKey(query, size = WINDOW_SIZE) {
  return windowURL(query, size);
}

/**
 * @param {Map<string, number>} counts
 * @param {number} [limit]
 * @returns {[string, number][]}
 */
function ranked(counts, limit = Infinity) {
  return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, limit);
}

/**
 * @param {unknown[]} items
 */
export function summarizeItems(items) {
  const seen = new Set();
  const works = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = /** @type {{ DOI?: unknown }} */ (raw);
    const doi = typeof record.DOI === 'string' ? record.DOI : '';
    if (!doi || seen.has(doi)) continue;
    seen.add(doi);
    try {
      works.push(normalizeWork(record));
    } catch {
      // A malformed record is not a reason to lose the rest of the window.
    }
  }
  const types = new Map(),
    venues = new Map(),
    publishers = new Map(),
    years = new Map();
  const availability = { abstract: 0, references: 0, orcid: 0, license: 0 };
  for (const work of works) {
    types.set(work.typeLabel, (types.get(work.typeLabel) || 0) + 1);
    if (work.publisher) publishers.set(work.publisher, (publishers.get(work.publisher) || 0) + 1);
    if (work.container) venues.set(work.container, (venues.get(work.container) || 0) + 1);
    if (Number.isInteger(work.year) && work.year >= 1000 && work.year <= 2100) {
      const year = String(work.year);
      years.set(year, (years.get(year) || 0) + 1);
    }
    if (work.abstract) availability.abstract++;
    if (work.references.length) availability.references++;
    if (work.authors.some((author) => author.orcid)) availability.orcid++;
    if (work.licenses.length) availability.license++;
  }
  const yearRows = [...years].sort(([a], [b]) => Number(a) - Number(b));
  return {
    works,
    window: works.length,
    types: ranked(types),
    venues: ranked(venues, 10),
    publishers: ranked(publishers, 10),
    publisherTotal: publishers.size,
    years: yearRows,
    decades: decadeRows(yearRows),
    availability,
  };
}

/**
 * @param {[string, number][]} rows
 * @returns {[string, number][]}
 */
export function decadeRows(rows) {
  const bins = new Map();
  for (const [year, count] of rows) {
    if (!/^\d{4}$/.test(year)) continue;
    const decade = String(Math.floor(Number(year) / 10) * 10);
    bins.set(decade, (bins.get(decade) || 0) + count);
  }
  return [...bins].sort(([a], [b]) => Number(a) - Number(b));
}

/**
 * @param {import('./types.js').Query} query
 * @param {{signal?: AbortSignal, fresh?: boolean, size?: number, fetcher?: typeof fetch, onPart?: (result: any) => void}} [options]
 */
export async function aggregateSearch(
  query,
  { signal, fresh = false, size = WINDOW_SIZE, fetcher, onPart = () => {} } = {},
) {
  if (normalizeDOI(query.q))
    return { doi: await getWork(query.q, { signal, fresh, fetcher }), query: { ...query } };
  const key = aggregateKey(query, size),
    previous = cache.get(key);
  if (!fresh && previous && Date.now() - previous.time < TTL) return previous.result;
  const startedAt = new Date().toISOString();
  const response = await request(windowURL(query, size), { signal, fetcher, fresh });
  const message = response.body?.message;
  if (!Array.isArray(message?.items) || !Number.isFinite(message['total-results']))
    throw new Error('Crossref returned an unexpected response. Please retry.');
  const result = {
    query: { ...query },
    total: message['total-results'],
    ...summarizeItems(message.items),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  onPart(result);
  cache.set(key, { time: Date.now(), result });
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return result;
}

/** @param {string} label */
export function typeID(label) {
  return (
    [...TYPES].find(([, value]) => value.toLowerCase() === label.toLowerCase())?.[0] ||
    FACET_TYPE_IDS.get(label) ||
    null
  );
}
