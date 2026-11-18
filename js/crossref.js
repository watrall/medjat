import { PERIODS, normalizeDOI, normalizeWork } from './data.js';

export const API = 'https://api.crossref.org';
export const CONTACT = 'ethan.watrall@gmail.com';
export const PAGE_SIZE = 25;
export const DATE_BROWSE_LIMIT = 10000;
const cache = new Map();
const TTL = 5 * 60 * 1000;

export function buildSearchURL(query, cursor = '*') {
  const period = PERIODS.find((p) => p.id === query.period);
  const text = query.q.trim();
  const terms = [text || 'ancient egypt'];
  if (period) terms.push(period.query);
  if (!/\begypt(?:ian)?\b/i.test(text) && !period) terms.push('ancient Egypt');
  const params = new URLSearchParams({
    'query.bibliographic': terms.join(' '),
    rows: String(PAGE_SIZE),
    mailto: CONTACT,
  });
  if (query.sort === 'relevance') params.set('cursor', cursor);
  else {
    const offset = cursor === '*' ? 0 : Number(cursor);
    if (!Number.isInteger(offset) || offset < 0 || offset >= DATE_BROWSE_LIMIT)
      throw new Error('Narrow your search to continue browsing by publication date.');
    params.set('offset', String(offset));
  }
  const filters = [];
  if (query.type) filters.push(`type:${query.type}`);
  if (query.from) filters.push(`from-pub-date:${query.from}-01-01`);
  if (query.to) filters.push(`until-pub-date:${query.to}-12-31`);
  if (query.abstract) filters.push('has-abstract:true');
  if (query.orcid) filters.push('has-orcid:true');
  if (query.references) filters.push('has-references:true');
  if (filters.length) params.set('filter', filters.join(','));
  params.set('sort', query.sort === 'relevance' ? 'score' : 'published');
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

export async function request(
  url,
  { signal, format = 'json', headers = {}, fetcher = fetch } = {},
) {
  const key = `${format}:${url}:${JSON.stringify(headers)}`;
  const found = cache.get(key);
  if (found && Date.now() - found.time < TTL) return { ...found.result, cached: true };
  const timeout = AbortSignal.timeout(25000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(url, {
      signal: combined,
      headers: { Accept: format === 'json' ? 'application/json' : 'text/plain', ...headers },
    });
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
    const body = format === 'json' ? await response.json() : await response.text();
    const result = { body, retrievedAt: new Date().toISOString(), cached: false };
    cache.set(key, { time: Date.now(), result });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return result;
  }
}

export async function searchWorks(query, { cursor = '*', signal, fetcher } = {}) {
  const doi = normalizeDOI(query.q);
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
  const dateSorted = query.sort !== 'relevance';
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

export async function getWork(doi, options = {}) {
  const normalized = normalizeDOI(doi);
  if (!normalized) throw new Error('This reference does not have a valid DOI.');
  const response = await request(
    `${API}/works/${encodeURIComponent(normalized)}?mailto=${encodeURIComponent(CONTACT)}`,
    options,
  );
  return normalizeWork(response.body.message);
}

export async function getCitation(doi, style = 'apa', options = {}) {
  const normalized = normalizeDOI(doi);
  const styles = { apa: 'apa', mla: 'modern-language-association', chicago: 'chicago-author-date' };
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
