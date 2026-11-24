import { API, CONTACT, PAGE_SIZE, request } from './crossref.js';
import { normalizeWork } from './data.js';
let gazetteer;
const matchers = new WeakMap();
const preparedText = new WeakMap();
const GAPS = /[\s\u2010-\u2015-]+/g;
const WORDS = /[^\p{L}\p{N}\p{M}]+/u;
export function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
const comparable = (text) => text.normalize('NFC').toLowerCase().replace(GAPS, ' ');
const firstWord = (text) => text.split(WORDS).find(Boolean) ?? '';
export const placeSource = (id) => `https://pleiades.stoa.org/places/${id}`;
export const primaryName = (place) => place.name.split('/')[0].trim();
export const searchNames = (place) =>
  [...new Set([...place.name.split('/').map((part) => part.trim()), ...place.aliases])].filter(
    (name) => name.length >= 4 && name.length <= 60,
  );
export function preparePlaces(data) {
  return {
    ...data,
    sites: data.places.map((place) => ({
      ...place,
      source: placeSource(place.id),
      foldedName: fold(place.name),
      searchText: fold([place.name, ...place.aliases, ...place.otherNames].join(' | ')),
    })),
  };
}
export async function loadGazetteer() {
  if (!gazetteer)
    gazetteer = fetch(new URL('../data/places.json', import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error('The place index could not be loaded.');
        return response.json();
      })
      .then(preparePlaces)
      .catch((error) => {
        gazetteer = null;
        throw error;
      });
  return gazetteer;
}
function wholeName(alias) {
  const escaped = alias
    .normalize('NFC')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[\s\u2010-\u2015-]+/g, '[\\s\\u2010-\\u2015-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escaped}(?![\\p{L}\\p{N}\\p{M}])`, 'iu');
}
function matcherFor(place) {
  let expressions = matchers.get(place);
  if (!expressions) {
    expressions = [...new Set(place.aliases)]
      .filter((name) => name.length >= 4)
      .map((alias) => ({
        alias,
        needle: comparable(alias),
        word: firstWord(comparable(alias)),
        expression: null,
      }));
    matchers.set(place, expressions);
  }
  return expressions;
}
function textsOf(work) {
  let texts = preparedText.get(work);
  if (!texts) {
    texts = [
      ['title', work.title || ''],
      ['abstract', work.abstract || ''],
    ].map(([field, source]) => {
      const text = source.normalize('NFC');
      const lower = comparable(text);
      return { field, text, lower, words: new Set(lower.split(WORDS)) };
    });
    preparedText.set(work, texts);
  }
  return texts;
}
export function placeEvidence(work, place) {
  const candidates = matcherFor(place);
  for (const { field, text, lower, words } of textsOf(work))
    for (const candidate of candidates) {
      if (!words.has(candidate.word) || !lower.includes(candidate.needle)) continue;
      candidate.expression ??= wholeName(candidate.alias);
      const match = candidate.expression.exec(text);
      if (match)
        return {
          field,
          alias: match[0],
          text: `${match.index > 70 ? '…' : ''}${text.slice(Math.max(0, match.index - 70), match.index + match[0].length + 110)}${text.length > match.index + match[0].length + 110 ? '…' : ''}`,
        };
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
