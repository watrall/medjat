import { API, CONTACT, PAGE_SIZE, request } from './crossref.js';
import { normalizeWork } from './data.js';
let gazetteer;
const matchers = new WeakMap();
const normalizedText = new WeakMap();
const GAPS = /[\s\u2010-\u2015-]+/g;
const comparable = (text) => text.normalize('NFC').toLowerCase().replace(GAPS, ' ');
const WORDS = /[^\p{L}\p{N}\p{M}]+/u;
const firstWord = (text) => text.split(WORDS).find(Boolean) ?? '';
export const placeSource = (id) => `https://pleiades.stoa.org/places/${id}`;
function prepare(data) {
  const sites = data.places.map((place) => ({
    ...place,
    aliases: place.match,
    source: placeSource(place.id),
    searchText: fold([place.name, ...place.match, ...place.otherNames].join(' | ')),
  }));
  return { ...data, sites };
}
export async function loadGazetteer() {
  if (!gazetteer)
    gazetteer = fetch(new URL('../data/places.json', import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error('The place index could not be loaded.');
        return response.json();
      })
      .then(prepare)
      .catch((error) => {
        gazetteer = null;
        throw error;
      });
  return gazetteer;
}
export const primaryName = (place) => place.name.split('/')[0].trim();
export const searchNames = (place) =>
  [...new Set([...place.name.split('/').map((part) => part.trim()), ...place.aliases])].filter(
    (name) => name.length >= 4 && name.length <= 60,
  );
export const isSharedName = (place) => place.shared === true;
export function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
function matcherFor(place) {
  let expressions = matchers.get(place);
  if (!expressions) {
    expressions = [...new Set(place.aliases)]
      .filter((name) => name.length >= 4)
      .map((alias) => {
        const escaped = alias
          .normalize('NFC')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/[\s\u2010-\u2015-]+/g, '[\\s\\u2010-\\u2015-]+');
        return {
          needle: comparable(alias),
          word: firstWord(comparable(alias)),
          expression: new RegExp(
            `(?<![\\p{L}\\p{N}\\p{M}])${escaped}(?![\\p{L}\\p{N}\\p{M}])`,
            'iu',
          ),
        };
      });
    matchers.set(place, expressions);
  }
  return expressions;
}
export function placeEvidence(work, place) {
  const expressions = matcherFor(place);
  let haystack = normalizedText.get(work);
  if (!haystack) {
    haystack = [work.title || '', work.abstract || ''].map((text) => {
      const lower = comparable(text);
      return { lower, words: new Set(lower.split(WORDS)) };
    });
    normalizedText.set(work, haystack);
  }
  for (const [index, [field, sourceText]] of [
    ['title', work.title || ''],
    ['abstract', work.abstract || ''],
  ].entries()) {
    const text = sourceText.normalize('NFC');
    for (const { needle, word, expression } of expressions) {
      if (!haystack[index].words.has(word) || !haystack[index].lower.includes(needle)) continue;
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
    .filter((match) => match.evidence)
    .sort(
      (a, b) =>
        Number(b.evidence.field === 'title') - Number(a.evidence.field === 'title') ||
        Number(Boolean(b.place.featured)) - Number(Boolean(a.place.featured)),
    );
}
const records = new Map();
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const year = (value) => (Number.isFinite(value) ? value : null);
export function summarizePleiades(raw) {
  const spans = (Array.isArray(raw?.locations) ? raw.locations : []).flatMap((location) => {
    const start = year(location?.start),
      end = year(location?.end);
    return start === null && end === null ? [] : [[start, end]];
  });
  const starts = spans.map(([start]) => start).filter((value) => value !== null);
  const ends = spans.map(([, end]) => end).filter((value) => value !== null);
  return {
    description: text(raw?.description),
    types: (Array.isArray(raw?.placeTypes) ? raw.placeTypes : []).map(text).filter(Boolean),
    start: starts.length ? Math.min(...starts) : null,
    end: ends.length ? Math.max(...ends) : null,
    names: Array.isArray(raw?.names) ? raw.names.length : 0,
    connections: Array.isArray(raw?.connections) ? raw.connections.length : 0,
    creators: (Array.isArray(raw?.creators) ? raw.creators : [])
      .map((creator) => text(creator?.name))
      .filter(Boolean),
  };
}
export function fetchPleiadesRecord(id, { signal } = {}) {
  if (!records.has(id))
    records.set(
      id,
      fetch(`${placeSource(id)}/json`, { signal, headers: { Accept: 'application/json' } })
        .then((response) => {
          if (!response.ok) throw new Error('Pleiades did not return this record.');
          return response.json();
        })
        .then(summarizePleiades)
        .catch((error) => {
          records.delete(id);
          throw error;
        }),
    );
  return records.get(id);
}
export function placeSearchURL(
  place,
  { term = primaryName(place), topic = '', cursor = '*' } = {},
) {
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
