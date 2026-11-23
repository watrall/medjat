import { PERIODS, normalizeDOI, normalizeWork, parseUpdates } from './data.js';
import { queryFilters } from './filters.js';

export const API = 'https://api.crossref.org';
export const CONTACT = 'admin@wunderkammer.dev';
export const PAGE_SIZE = 25;
export const DATE_BROWSE_LIMIT = 10000;
const cache = new Map();
const TTL = 5 * 60 * 1000;
const pending = [];
let activeRequests = 0,
  lastStarted = 0,
  dispatchTimer;
// Stay below the polite pool's reported 3 requests/second, including retries.
// All features share this queue so a background check cannot crowd out search.
function reserveRequest(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const entry = { resolve, reject, signal };
    entry.abort = () => {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
      reject(signal.reason);
    };
    signal.addEventListener('abort', entry.abort, { once: true });
    pending.push(entry);
    dispatch();
  });
}
function dispatch() {
  if (dispatchTimer || activeRequests >= 2 || !pending.length) return;
  const delay = Math.max(0, lastStarted + 400 - Date.now());
  if (delay) {
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;
      dispatch();
    }, delay);
    return;
  }
  const entry = pending.shift();
  entry.signal.removeEventListener('abort', entry.abort);
  if (entry.signal.aborted) {
    entry.reject(entry.signal.reason);
    dispatch();
    return;
  }
  activeRequests++;
  lastStarted = Date.now();
  let released = false;
  entry.resolve(() => {
    if (released) return;
    released = true;
    activeRequests--;
    dispatch();
  });
  dispatch();
}

export function addedSearchTerms(query) {
  const period = PERIODS.find((p) => p.id === query.period);
  if (period) return period.query;
  return query.context !== false && !/\begypt(?:ian)?\b/i.test(query.q) ? 'ancient Egypt' : '';
}
export function bibliographicTerms(query) {
  return [query.q.trim(), addedSearchTerms(query)].filter(Boolean).join(' ');
}
const byDate = (query) => query.sort === 'newest' || query.sort === 'oldest';
export function buildSearchURL(query, cursor = '*') {
  if (!query.q.trim()) throw new Error('Enter a publication search.');
  const params = new URLSearchParams({
    'query.bibliographic': bibliographicTerms(query),
    rows: String(PAGE_SIZE),
    mailto: CONTACT,
  });
  if (query.field === 'author') {
    params.set('query.author', query.q.trim());
    const context = addedSearchTerms(query);
    if (context) params.set('query.bibliographic', context);
    else params.delete('query.bibliographic');
  }
  if (!byDate(query)) params.set('cursor', cursor);
  else {
    const offset = cursor === '*' ? 0 : Number(cursor);
    if (!Number.isInteger(offset) || offset < 0 || offset >= DATE_BROWSE_LIMIT)
      throw new Error('Narrow your search to continue browsing by publication date.');
    params.set('offset', String(offset));
  }
  const filters = queryFilters(query);
  if (filters.length) params.set('filter', filters.join(','));
  params.set('sort', byDate(query) ? 'published' : 'score');
  params.set('order', query.sort === 'oldest' ? 'asc' : 'desc');
  return `${API}/works?${params}`;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * @param {string} url
 * @param {{signal?: AbortSignal, format?: 'json' | 'text', headers?: Record<string, string>, fetcher?: typeof fetch, fresh?: boolean}} [options]
 */
export async function request(
  url,
  { signal, format = 'json', headers = {}, fetcher = fetch, fresh = false } = {},
) {
  const key = `${format}:${url}:${JSON.stringify(headers)}`;
  const found = cache.get(key);
  if (!fresh && found && Date.now() - found.time < TTL) return { ...found.result, cached: true };
  const timeout = AbortSignal.timeout(25000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response, body;
    const release = await reserveRequest(combined);
    try {
      response = await fetcher(url, {
        signal: combined,
        headers: { Accept: format === 'json' ? 'application/json' : 'text/plain', ...headers },
      });
      if (response.ok) body = format === 'json' ? await response.json() : await response.text();
    } catch (error) {
      release();
      if (error instanceof TypeError && !combined.aborted && attempt < 2) {
        await wait(700 * 2 ** attempt, combined);
        continue;
      }
      throw error;
    } finally {
      release();
    }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      if ([429, 502, 503, 504].includes(response.status) && attempt < 2 && retryAfter <= 8) {
        await wait(Math.max(retryAfter * 1000, 700 * 2 ** attempt), combined);
        continue;
      }
      const message =
        response.status === 429
          ? 'Crossref is receiving too many requests. Wait a moment, then retry.'
          : response.status === 404
            ? 'Crossref has no record for this DOI.'
            : response.status >= 400 && response.status < 500
              ? 'Crossref could not run this search. Change your search terms or refinements and try again.'
              : 'Crossref is temporarily unavailable. Please try again shortly.';
      throw Object.assign(new Error(message), {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const result = { body, retrievedAt: new Date().toISOString(), cached: false };
    cache.set(key, { time: Date.now(), result });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return result;
  }
}

export async function searchWorks(query, { cursor = '*', signal, fetcher } = {}) {
  const doi = normalizeDOI(query.q);
  if (query.field === 'doi' && !doi)
    throw Object.assign(
      new Error('Enter a complete DOI, such as 10.1234/example, or choose All metadata.'),
      { retryable: false },
    );
  if (doi) {
    const response = await request(
      `${API}/works/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(CONTACT)}`,
      { signal, fetcher },
    );
    return {
      ...response,
      items: [normalizeWork(response.body.message)],
      total: 1,
      nextCursor: null,
      doiLookup: true,
    };
  }
  const response = await request(buildSearchURL(query, cursor), { signal, fetcher });
  const message = response.body?.message;
  if (!Array.isArray(message?.items) || !Number.isFinite(message['total-results']))
    throw new Error('Crossref returned an unexpected response. Please retry.');
  const items = message.items.flatMap((raw) => {
    try {
      return [normalizeWork(raw)];
    } catch {
      return [];
    }
  });
  const next = message['next-cursor'];
  const dateSorted = byDate(query);
  const nextOffset = (cursor === '*' ? 0 : Number(cursor)) + message.items.length;
  const moreByDate =
    dateSorted && message.items.length === PAGE_SIZE && nextOffset < message['total-results'];
  return {
    ...response,
    items,
    total: message['total-results'],
    nextCursor: dateSorted
      ? moreByDate && nextOffset < DATE_BROWSE_LIMIT
        ? String(nextOffset)
        : null
      : message.items.length === PAGE_SIZE && typeof next === 'string' && next !== cursor
        ? next
        : null,
    browseLimited: moreByDate && nextOffset >= DATE_BROWSE_LIMIT,
    doiLookup: false,
  };
}

export async function findCitationMatches(label, options = {}) {
  const url = new URL(`${API}/works`);
  url.searchParams.set('query.bibliographic', label.slice(0, 500));
  url.searchParams.set('rows', '3');
  url.searchParams.set('mailto', CONTACT);
  const response = await request(url.toString(), options);
  return (response.body?.message?.items || []).flatMap((raw) => {
    try {
      return [normalizeWork(raw)];
    } catch {
      return [];
    }
  });
}

export const UPDATE_BATCH = 40;

// Looks up update notices for many DOIs at once. Only DOIs Crossref returns appear in each
// batch's map, and an empty list means Crossref knows the work and lists no notices.
export async function checkUpdates(dois, { signal, fetcher, onBatch } = {}) {
  for (let start = 0; start < dois.length; start += UPDATE_BATCH) {
    const batch = dois.slice(start, start + UPDATE_BATCH);
    const params = new URLSearchParams({
      filter: batch.map((doi) => `doi:${doi}`).join(','),
      select: 'DOI,updated-by',
      rows: String(batch.length),
      mailto: CONTACT,
    });
    const response = await request(`${API}/works?${params}`, { signal, fetcher });
    const items = response.body?.message?.items;
    if (!Array.isArray(items)) throw new Error('Crossref returned an unexpected response.');
    const found = new Map();
    for (const item of items) {
      const doi = normalizeDOI(item?.DOI);
      if (doi) found.set(doi, parseUpdates(item['updated-by']));
    }
    onBatch?.(found);
  }
}

export const BOOK_CHAPTER_LIMIT = 100;

// Crossref matches relation.object against the identifier exactly as the member deposited it.
export async function getBookChapters(bookID, options = {}) {
  const params = new URLSearchParams({
    filter: `relation.type:is-part-of,relation.object:${bookID}`,
    select: 'DOI,title,author,issued,published,page,type,container-title',
    rows: String(BOOK_CHAPTER_LIMIT),
    mailto: CONTACT,
  });
  const response = await request(`${API}/works?${params}`, options);
  const message = response.body?.message;
  if (!Array.isArray(message?.items)) throw new Error('Crossref returned an unexpected response.');
  const works = message.items.flatMap((raw) => {
    try {
      return [normalizeWork(raw)];
    } catch {
      return [];
    }
  });
  const start = (work) => Number.parseInt(work.pages, 10);
  works.sort(
    (a, b) => (start(a) || Infinity) - (start(b) || Infinity) || a.title.localeCompare(b.title),
  );
  return { works, total: message['total-results'] };
}

export async function getWork(doi, options = {}) {
  const normalized = normalizeDOI(doi);
  if (!normalized) throw new Error('This reference does not have a valid DOI.');
  const response = await request(
    `${API}/works/${encodeURIComponent(normalized)}?mailto=${encodeURIComponent(CONTACT)}`,
    options,
  );
  return normalizeWork(response.body.message);
}

export const CITATION_STYLES = [
  ['apa', 'APA', 'apa'],
  ['mla', 'MLA', 'modern-language-association'],
  ['chicago', 'Chicago author-date', 'chicago-author-date'],
  ['harvard', 'Harvard (Cite Them Right)', 'harvard-cite-them-right'],
  ['aja', 'American Journal of Archaeology', 'american-journal-of-archaeology'],
  ['antiquity', 'Antiquity', 'antiquity'],
];

export async function getCitation(doi, style = 'apa', options = {}) {
  const normalized = normalizeDOI(doi);
  const styles = Object.fromEntries(CITATION_STYLES.map(([key, , name]) => [key, name]));
  if (!normalized || !styles[style]) throw new Error('Choose a supported citation style.');
  const url = `${API}/works/${encodeURIComponent(normalized)}/transform?mailto=${encodeURIComponent(CONTACT)}`;
  const result = await request(url, {
    ...options,
    format: 'text',
    headers: { Accept: `text/x-bibliography; style=${styles[style]}; locale=en-US` },
  });
  if (!result.body.trim())
    throw new Error(
      'A formatted citation was not returned. You can still export the deposited metadata.',
    );
  return result.body.trim();
}
