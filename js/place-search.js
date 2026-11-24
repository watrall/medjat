import { fold } from './place-data.js';

const rank = (place, query) => {
  const name = fold(place.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (
    new RegExp(`(^|[^\\p{L}\\p{N}])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(name)
  )
    return 2;
  return 3;
};

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
        Number(Boolean(b.place.featured)) - Number(Boolean(a.place.featured)) ||
        Number(Boolean(b.place.major)) - Number(Boolean(a.place.major)) ||
        a.place.name.localeCompare(b.place.name),
    )
    .map(({ place }) => place);
}
