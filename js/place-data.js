import { API, CONTACT, PAGE_SIZE, request } from './crossref.js';
import { normalizeWork } from './data.js';
let gazetteer;
const matchers = new WeakMap();
export async function loadGazetteer() {
  if (!gazetteer)
    gazetteer = fetch(new URL('../data/sites.json', import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error('The place index could not be loaded.');
        return response.json();
      })
      .catch((error) => {
        gazetteer = null;
        throw error;
      });
  return gazetteer;
}
export function placeEvidence(work, place) {
  let expressions = matchers.get(place);
  if (!expressions) {
    expressions = [...new Set([place.name, ...place.aliases])]
      .filter((name) => name.length >= 4)
      .map((alias) => {
        const escaped = alias
          .normalize('NFC')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/[\s\u2010-\u2015-]+/g, '[\\s\\u2010-\\u2015-]+');
        return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escaped}(?![\\p{L}\\p{N}\\p{M}])`, 'iu');
      });
    matchers.set(place, expressions);
  }
  for (const [field, sourceText] of [
    ['title', work.title || ''],
    ['abstract', work.abstract || ''],
  ]) {
    const text = sourceText.normalize('NFC');
    for (const expression of expressions) {
      const match = expression.exec(text);
      if (match)
        return {
          field,
          alias: match[0],
          text: `${match.index > 70 ? '…' : ''}${text.slice(Math.max(0, match.index - 70), match.index + match[0].length + 110)}${text.length > match.index + match[0].length + 110 ? '…' : ''}`,
        };
    }
  }
  return null;
}
export function placesForWork(work, sites) {
  return sites
    .map((place) => ({ place, evidence: placeEvidence(work, place) }))
    .filter((match) => match.evidence);
}
export function placeSearchURL(place, { term = place.name, topic = '', cursor = '*' } = {}) {
  const params = new URLSearchParams({
    'query.bibliographic': `${term} Egypt ${topic}`.trim(),
    rows: String(PAGE_SIZE),
    cursor,
    sort: 'score',
    order: 'desc',
    mailto: CONTACT,
  });
  return `${API}/works?${params}`;
}
export async function searchPlaceWorks(place, { signal, term, topic, cursor, fresh = false } = {}) {
  const url = placeSearchURL(place, { term, topic, cursor });
  const response = await request(url, { signal, fresh });
  const message = response.body?.message;
  if (!Array.isArray(message?.items) || !Number.isFinite(message['total-results']))
    throw new Error('Crossref returned an unexpected response. Retry the place search.');
  const works = message.items.flatMap((raw) => {
    try {
      return [normalizeWork(raw)];
    } catch {
      return [];
    }
  });
  return {
    works,
    total: message['total-results'],
    retrievedAt: response.retrievedAt,
    next:
      message.items.length === PAGE_SIZE && message['next-cursor'] !== (cursor || '*')
        ? message['next-cursor'] || null
        : null,
    query: new URL(url).searchParams.get('query.bibliographic'),
  };
}
