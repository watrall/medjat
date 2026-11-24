import { fold } from './place-data.js';

const WORD_START = /[^\p{L}\p{N}]+/gu;

// 0 exact, 1 starts with the query, 2 a word starts with it, 3 found only in another name.
function rank(place, query) {
  if (place.foldedName === query) return 0;
  if (place.foldedName.startsWith(query)) return 1;
  return ` ${place.foldedName.replace(WORD_START, ' ')}`.includes(` ${query}`) ? 2 : 3;
}

export function searchPlaces(sites, { query = '', type = '', period = '' } = {}) {
  const words = fold(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  const phrase = words.join(' ');
  return sites
    .filter(
      (place) =>
        (!type || place.types.includes(type)) &&
        (!period || place.periods?.includes(period)) &&
        words.every((word) => place.searchText.includes(word)),
    )
    .map((place) => ({ place, rank: phrase ? rank(place, phrase) : 0 }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(!!b.place.featured) - Number(!!a.place.featured) ||
        Number(!!b.place.major) - Number(!!a.place.major) ||
        a.place.name.localeCompare(b.place.name),
    )
    .map(({ place }) => place);
}
